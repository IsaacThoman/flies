// The comparison harness the tests drive (tests/compare.ts writes the same
// lines from the TypeScript). Every number goes out as the hex of its bits,
// so equal lines mean bit-identical results.
//
//   fly-brain-harness brain <connectome.bin> <seed>   ticks from stdin, one per line:
//       <dt, f64 bits> <loomLeft> <loomRight> <touch> <bumpLeft> <bumpRight> <wind> <sweet>  (f32 bits)  <grounded 0|1>
//     prints "ready <neurons> <connections> <rate names, |-separated>" or "error <message>", then per tick
//       <spikes> <active> <simMs> | <command, f64 ×7> | <rates, f64> | <command as the C interface gives it, f32 ×7> | <rates, f32>
//       | <arousal> <scene left> <scene right> (f64) | <digest of every neuron's v, g and a every 50th tick, else ->
//     or "error <message>".
//   fly-brain-harness engine                           a Simulation from a JSON spec on stdin (see tests/engine.test.ts);
//     prints each step's spikes, then each neuron's v, g and a (f32 bits).
//   fly-brain-harness math                             f64 bits from stdin, one per line; prints exp, log, log1p, expm1, sin, cos of each.

#include <cinttypes>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iostream>
#include <iterator>
#include <sstream>
#include <string>
#include <vector>

#include "fdlibm.hpp"
#include "fly_brain.h"
#include "fly_brain_internal.hpp"
#include "io.hpp"
#include "json.hpp"
#include "sim.hpp"

namespace {

std::string hex64(double x) {
  uint64_t bits;
  std::memcpy(&bits, &x, 8);
  char buffer[20];
  std::snprintf(buffer, sizeof buffer, "%016" PRIx64, bits);
  return buffer;
}

std::string hex32(float x) {
  uint32_t bits;
  std::memcpy(&bits, &x, 4);
  char buffer[12];
  std::snprintf(buffer, sizeof buffer, "%08" PRIx32, bits);
  return buffer;
}

double f64(const std::string& hex) {
  const uint64_t bits = std::strtoull(hex.c_str(), nullptr, 16);
  double x;
  std::memcpy(&x, &bits, 8);
  return x;
}

float f32(const std::string& hex) {
  const auto bits = static_cast<uint32_t>(std::strtoul(hex.c_str(), nullptr, 16));
  float x;
  std::memcpy(&x, &bits, 4);
  return x;
}

std::vector<uint8_t> read_file(const char* path) {
  std::ifstream file(path, std::ios::binary);
  if (!file) {
    std::fprintf(stderr, "cannot read %s\n", path);
    std::exit(2);
  }
  return {std::istreambuf_iterator<char>(file), std::istreambuf_iterator<char>()};
}

// FNV-1a over the bits of every neuron's v, g and a (tests/compare.ts has the same).
std::string digest(const fly::Simulation& sim) {
  uint32_t h = 2166136261u;
  for (uint32_t i = 0; i < sim.neurons(); i++) {
    for (float x : {sim.potential(i), sim.drive(i), sim.adaptation(i)}) {
      uint32_t bits;
      std::memcpy(&bits, &x, 4);
      h = (h ^ bits) * 16777619u;
    }
  }
  char buffer[12];
  std::snprintf(buffer, sizeof buffer, "%08" PRIx32, h);
  return buffer;
}

int brain(const char* path, uint32_t seed) {
  const std::vector<uint8_t> data = read_file(path);
  char error[512];
  fly_brain* b = fly_brain_create(data.data(), data.size(), seed, error, sizeof error);
  if (b == nullptr) {
    std::printf("error %s\n", error);
    return 0;
  }
  std::string names;
  const uint32_t rate_count = fly_brain_rate_count(b);
  for (uint32_t r = 0; r < rate_count; r++) names += (r > 0 ? "|" : "") + std::string(fly_brain_rate_name(b, r));
  std::printf("ready %u %u %s\n", fly_brain_neurons(b), fly_brain_connections(b), names.c_str());
  std::vector<float> rates(rate_count);
  std::string line;
  uint32_t tick = 0;
  while (std::getline(std::cin, line)) {
    std::istringstream in(line);
    std::string dt, v[7];
    int grounded = 0;
    in >> dt >> v[0] >> v[1] >> v[2] >> v[3] >> v[4] >> v[5] >> v[6] >> grounded;
    const fly_senses senses{f32(v[0]), f32(v[1]), f32(v[2]), f32(v[3]), f32(v[4]), f32(v[5]), f32(v[6]), grounded, nullptr, nullptr};
    fly_command command;
    fly_stats stats;
    if (fly_brain_tick(b, f64(dt), &senses, &command, &stats, rates.data(), error, sizeof error) != 0) {
      std::printf("error %s\n", error);
      continue;
    }
    const fly::io::Command c = fly::io::decode(b->brain.rates());
    std::string out = std::to_string(stats.spikes) + " " + std::to_string(stats.active) + " " + hex64(stats.sim_ms) + " |";
    for (double x : {c.walk, c.turn, c.back, c.escape, c.wings, c.groom, c.feed}) out += " " + hex64(x);
    out += " |";
    for (double x : b->brain.rates()) out += " " + hex64(x);
    out += " |";
    for (float x : {command.walk, command.turn, command.back, command.escape, command.wings, command.groom, command.feed}) out += " " + hex32(x);
    out += " |";
    for (float x : rates) out += " " + hex32(x);
    const fly::InternalState& state = b->brain.state();
    out += " | " + hex64(state.arousal()) + " " + hex64(state.scene(fly::io::kLeft)) + " " + hex64(state.scene(fly::io::kRight)) + " | ";
    out += tick++ % 50 == 49 ? digest(b->brain.sim()) : "-";
    std::puts(out.c_str());
  }
  fly_brain_destroy(b);
  return 0;
}

// The spec is JSON: numbers as JSON.stringify writes them, which read back
// exactly; floats are given as their (exact) double values.
int engine() {
  const std::string text{std::istreambuf_iterator<char>(std::cin), std::istreambuf_iterator<char>()};
  fly::json::Document doc;
  std::string error;
  if (!doc.parse(text, error)) {
    std::fprintf(stderr, "bad spec: %s\n", error.c_str());
    return 2;
  }
  const fly::json::Value& spec = doc.root();
  const auto number = [&](const fly::json::Value& object, const char* key) { return doc.member(object, key)->number; };
  const auto numbers = [&](const fly::json::Value* array) {
    std::vector<double> out;
    if (array != nullptr && array->type == fly::json::Type::Array) {
      for (uint32_t item : array->items) out.push_back(doc.at(item).number);
    }
    return out;
  };
  const auto floats = [&](const fly::json::Value* array) {
    std::vector<float> out;
    for (double x : numbers(array)) out.push_back(static_cast<float>(x));
    return out;
  };
  const auto indices = [&](const fly::json::Value* array) {
    std::vector<uint32_t> out;
    for (double x : numbers(array)) out.push_back(static_cast<uint32_t>(x));
    return out;
  };

  const std::vector<uint32_t> ptr = indices(doc.member(spec, "ptr"));
  const std::vector<uint32_t> post = indices(doc.member(spec, "post"));
  const std::vector<uint32_t> count = indices(doc.member(spec, "count"));
  const std::vector<float> gain = floats(doc.member(spec, "gain"));
  const std::vector<float> post_scale = floats(doc.member(spec, "postScale"));
  std::vector<fly::Simulation::Edge> edges(post.size());
  for (size_t i = 0; i + 1 < ptr.size(); i++) {
    for (uint32_t e = ptr[i]; e < ptr[i + 1]; e++) {
      const float w = post_scale.empty() ? fly::Simulation::weight(count[e], gain[i]) : fly::Simulation::weight(count[e], gain[i], post_scale[post[e]]);
      edges[e] = {post[e], w};
    }
  }
  fly::SimulationOptions options;
  options.dt = number(spec, "dt");
  options.tau_mem = number(spec, "tauMem");
  options.tau_syn = number(spec, "tauSyn");
  options.threshold = number(spec, "threshold");
  options.refractory = number(spec, "refractory");
  options.delay = number(spec, "delay");
  options.epsilon = number(spec, "epsilon");
  options.cleanup_interval = static_cast<uint32_t>(number(spec, "cleanupInterval"));
  options.seed = static_cast<uint32_t>(number(spec, "seed"));
  options.reset_drive = doc.member(spec, "resetDrive")->type == fly::json::Type::True;
  const fly::json::Value* adaptation = doc.member(spec, "adaptation");
  if (adaptation->type == fly::json::Type::Object) options.adaptation = fly::SimulationOptions::Adaptation{number(*adaptation, "increment"), number(*adaptation, "tau")};
  fly::Simulation sim(ptr, std::move(edges), options);

  const fly::json::Value* inputs = doc.member(spec, "inputs");
  for (uint32_t k = 0; k < inputs->items.size(); k++) {
    const fly::json::Value& input = doc.at(inputs->items[k]);
    sim.add_input("input " + std::to_string(k), indices(doc.member(input, "neurons")), number(input, "rate"));
  }
  // Changes, each applied just before its step: {step, input, rate} or {step, bias}.
  const fly::json::Value* changes = doc.member(spec, "changes");
  size_t next = 0;
  const auto steps = static_cast<uint32_t>(number(spec, "steps"));
  std::string out;
  for (uint32_t s = 0; s < steps; s++) {
    while (next < changes->items.size() && number(doc.at(changes->items[next]), "step") == s) {
      const fly::json::Value& change = doc.at(changes->items[next++]);
      if (doc.member(change, "rate") != nullptr) {
        sim.set_rate(static_cast<uint32_t>(number(change, "input")), number(change, "rate"));
      } else {
        sim.set_bias(floats(doc.member(change, "bias")));
      }
    }
    sim.step();
    out.clear();
    for (uint32_t i : sim.last_spikes()) out += (out.empty() ? "" : " ") + std::to_string(i);
    std::printf("%u %u: %s\n", s, sim.active(), out.c_str());
  }
  for (uint32_t i = 0; i < sim.neurons(); i++) {
    std::printf("%s %s %s\n", hex32(sim.potential(i)).c_str(), hex32(sim.drive(i)).c_str(), hex32(sim.adaptation(i)).c_str());
  }
  return 0;
}

int math() {
  std::string line;
  while (std::getline(std::cin, line)) {
    const double x = f64(line);
    std::printf("%s %s %s %s %s %s\n", hex64(fly::fdlibm::exp(x)).c_str(), hex64(fly::fdlibm::log(x)).c_str(), hex64(fly::fdlibm::log1p(x)).c_str(),
                hex64(fly::fdlibm::expm1(x)).c_str(), hex64(fly::fdlibm::sin(x)).c_str(), hex64(fly::fdlibm::cos(x)).c_str());
  }
  return 0;
}

}  // namespace

int main(int argc, char** argv) {
  const std::string mode = argc > 1 ? argv[1] : "";
  if (mode == "brain" && argc == 4) return brain(argv[2], static_cast<uint32_t>(std::strtoul(argv[3], nullptr, 10)));
  if (mode == "engine") return engine();
  if (mode == "math") return math();
  std::fputs("usage: fly-brain-harness brain <connectome.bin> <seed> | engine | math\n", stderr);
  return 2;
}
