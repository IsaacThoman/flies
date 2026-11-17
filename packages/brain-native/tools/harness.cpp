// The comparison harness the tests drive (tests/compare.ts writes the same
// lines from the TypeScript). Every number goes out as the hex of its bits,
// so equal lines mean bit-identical results.
//
//   fly-brain-harness brain <connectome.bin> <seed> [--light <frames>] [--columns <columns>]
//     ticks from stdin, one per line:
//       <dt, f64 bits> <loomLeft> <loomRight> <touch> <bumpLeft> <bumpRight> <wind> <sweet> <maleTaste> <wingbeat>  (f32 bits)  <grounded 0|1>
//       <clockMorning> <clockEvening> <clockSleep> <sleepPressure> <sleepDepth>  (f32 bits)  [<light> [<hunger>]]
//     where <light> is - (the eyes shut) or <left>,<right>, each the index of a frame in the frames file or x for an eye left out,
//     and <hunger> f32 bits (1 when left out).
//     The frames file is the frames one after another, each a u32 count and that many f32 (little-endian). Light the C
//     interface can express goes through fly_brain_tick; the rest (a wrong length, both eyes left out) through fly::tick.
//     The columns file replaces eye-columns.ts's table, a line per column: <left|right> <hex1> <hex2> <kind> <L1> <L2> <L3>.
//     Prints "ready <neurons> <connections> <rate names, |-separated>" or "error <message>", then per tick
//       <spikes> <active> <simMs> | <command, f64 ×8> | <rates, f64> | <command as the C interface gives it, f32 ×8> | <rates, f32>
//       | <arousal> <scene left> <scene right> <sleep term> (f64) | <digest of both retinas' rates, or - without eyes>
//       | <digest of every neuron's v, g and a every 50th tick, else ->
//     or "error <message>".
//   fly-brain-harness eyes <connectome.bin> [--columns <columns>]
//     prints "ready", the facets of each eye and the acceptance (f32 bits) through the C interface, then a line per facet,
//     left eye first: <direction x y z, f32 bits, from fly_brain_eye_directions> <L1> <L2> <L3> (neuron indices, -1 for none);
//     or "error <message>".
//   fly-brain-harness engine                           a Simulation from a JSON spec on stdin (see tests/engine.test.ts);
//     prints each step's spikes, then each neuron's v, g and a (f32 bits).
//   fly-brain-harness math                             f64 bits from stdin, one per line; prints exp, log, log1p, expm1, sin, cos of each.
//   fly-brain-harness hypot                            two f64 bits a line; prints Math.hypot of them.
//   fly-brain-harness patterns                         a cell type a line; prints 0|1 for params.ts's columnar classes, then the
//     T4/T5 and lobula patterns of vision.ts.
//   fly-brain-harness regions <connectome.bin>         prints "ready <region ids, |-separated>", then each neuron's region
//     (an index into them) on one line; or "error <message>".

#include <cinttypes>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iostream>
#include <iterator>
#include <optional>
#include <sstream>
#include <string>
#include <vector>

#include "eyes.hpp"
#include "fdlibm.hpp"
#include "fly_brain.h"
#include "fly_brain_internal.hpp"
#include "io.hpp"
#include "json.hpp"
#include "params.hpp"
#include "regions.hpp"
#include "sim.hpp"
#include "vision.hpp"

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

// FNV-1a over the bits of both retinas' rates, then their withdrawals, as doubles (tests/compare.ts has the same).
std::string retina_digest(const fly::Brain& brain) {
  if (brain.retinas().empty()) return "-";
  uint32_t h = 2166136261u;
  for (const fly::vision::Retina& retina : brain.retinas()) {
    for (const std::vector<double>* list : {&retina.rates(), &retina.withdrawals()}) {
      for (double x : *list) {
        uint32_t words[2];
        std::memcpy(words, &x, 8);
        for (uint32_t bits : words) h = (h ^ bits) * 16777619u;
      }
    }
  }
  char buffer[12];
  std::snprintf(buffer, sizeof buffer, "%08" PRIx32, h);
  return buffer;
}

std::vector<std::vector<float>> read_frames(const char* path) {
  const std::vector<uint8_t> bytes = read_file(path);
  std::vector<std::vector<float>> frames;
  for (size_t at = 0; at + 4 <= bytes.size();) {
    uint32_t count;
    std::memcpy(&count, bytes.data() + at, 4);
    at += 4;
    std::vector<float> frame(count);
    if (count > 0) std::memcpy(frame.data(), bytes.data() + at, 4 * static_cast<size_t>(count));
    at += 4 * static_cast<size_t>(count);
    frames.push_back(std::move(frame));
  }
  return frames;
}

// The columns a file gives, kept alive for the brain to read while it is built.
struct ColumnTable {
  std::vector<fly::eyes::EyeColumn> left, right;
  fly::eyes::Columns columns() const { return {left, right}; }
};

ColumnTable read_columns(const char* path) {
  std::ifstream file(path);
  if (!file) {
    std::fprintf(stderr, "cannot read %s\n", path);
    std::exit(2);
  }
  ColumnTable table;
  std::string side;
  unsigned hex1, hex2, kind;
  uint32_t l1, l2, l3;
  while (file >> side >> hex1 >> hex2 >> kind >> l1 >> l2 >> l3) {
    (side == "left" ? table.left : table.right)
        .push_back({static_cast<uint8_t>(hex1), static_cast<uint8_t>(hex2), static_cast<uint8_t>(kind), l1, l2, l3});
  }
  return table;
}

// The brain on a connectome, through fly_brain_create, or with other columns through fly::Brain (the C interface has no way to give them).
fly_brain* create(const char* path, uint32_t seed, const std::optional<ColumnTable>& columns, char* error, size_t error_size) {
  const std::vector<uint8_t> data = read_file(path);
  if (!columns) return fly_brain_create(data.data(), data.size(), seed, error, error_size);
  try {
    const fly::Connectome connectome(data.data(), data.size());
    return new fly_brain{fly::Brain(connectome, seed, columns->columns())};
  } catch (const std::exception& e) {
    std::snprintf(error, error_size, "%s", e.what());
    return nullptr;
  }
}

struct Options {
  const char* light = nullptr;
  std::optional<ColumnTable> columns;
};

Options options(int argc, char** argv, int from) {
  Options out;
  for (int k = from; k + 1 < argc; k += 2) {
    const std::string flag = argv[k];
    if (flag == "--light") out.light = argv[k + 1];
    else if (flag == "--columns") out.columns = read_columns(argv[k + 1]);
  }
  return out;
}

int brain(const char* path, uint32_t seed, const Options& options) {
  char error[512];
  fly_brain* b = create(path, seed, options.columns, error, sizeof error);
  if (b == nullptr) {
    std::printf("error %s\n", error);
    return 0;
  }
  const std::vector<std::vector<float>> frames = options.light != nullptr ? read_frames(options.light) : std::vector<std::vector<float>>{};
  std::string names;
  const uint32_t rate_count = fly_brain_rate_count(b);
  for (uint32_t r = 0; r < rate_count; r++) names += (r > 0 ? "|" : "") + std::string(fly_brain_rate_name(b, r));
  std::printf("ready %u %u %s\n", fly_brain_neurons(b), fly_brain_connections(b), names.c_str());
  std::vector<float> rates(rate_count);
  std::string line;
  uint32_t tick = 0;
  while (std::getline(std::cin, line)) {
    std::istringstream in(line);
    std::string dt, v[9], s[5], light = "-", hunger = "3f800000";
    int grounded = 0;
    in >> dt >> v[0] >> v[1] >> v[2] >> v[3] >> v[4] >> v[5] >> v[6] >> v[7] >> v[8] >> grounded >> s[0] >> s[1] >> s[2] >> s[3] >> s[4] >> light >> hunger;
    fly_senses senses{f32(v[0]), f32(v[1]), f32(v[2]), f32(v[3]), f32(v[4]), f32(v[5]), f32(v[6]), grounded, nullptr, nullptr,
                      f32(v[7]),  f32(hunger), f32(v[8]), f32(s[0]), f32(s[1]),  f32(s[2]),  f32(s[3]), f32(s[4])};
    fly_command command;
    fly_stats stats;
    int failed;
    if (light == "-") {
      failed = fly_brain_tick(b, f64(dt), &senses, &command, &stats, rates.data(), error, sizeof error);
    } else {
      const size_t comma = light.find(',');
      const std::string side[2] = {light.substr(0, comma), light.substr(comma + 1)};
      const std::vector<float>* frame[2] = {nullptr, nullptr};
      bool expressible = true;
      for (int s = 0; s < 2; s++) {
        if (side[s] != "x") frame[s] = &frames.at(std::stoul(side[s]));
        if (frame[s] != nullptr && (frame[s]->empty() || frame[s]->size() != fly_brain_facets(b, s))) expressible = false;
      }
      if (frame[0] == nullptr && frame[1] == nullptr) expressible = false;
      if (expressible) {
        senses.light_left = frame[0] != nullptr ? frame[0]->data() : nullptr;
        senses.light_right = frame[1] != nullptr ? frame[1]->data() : nullptr;
        failed = fly_brain_tick(b, f64(dt), &senses, &command, &stats, rates.data(), error, sizeof error);
      } else {
        fly::Light given;
        given.open = true;
        if (frame[0] != nullptr) given.left = std::span<const float>(*frame[0]);
        if (frame[1] != nullptr) given.right = std::span<const float>(*frame[1]);
        failed = fly::tick(b, f64(dt), &senses, given, &command, &stats, rates.data(), error, sizeof error);
      }
    }
    if (failed != 0) {
      std::printf("error %s\n", error);
      continue;
    }
    const fly::io::Command c = fly::io::decode(b->brain.rates());
    std::string out = std::to_string(stats.spikes) + " " + std::to_string(stats.active) + " " + hex64(stats.sim_ms) + " |";
    for (double x : {c.walk, c.turn, c.back, c.escape, c.wings, c.groom, c.feed, c.sing}) out += " " + hex64(x);
    out += " |";
    for (double x : b->brain.rates()) out += " " + hex64(x);
    out += " |";
    for (float x : {command.walk, command.turn, command.back, command.escape, command.wings, command.groom, command.feed, command.sing}) out += " " + hex32(x);
    out += " |";
    for (float x : rates) out += " " + hex32(x);
    const fly::InternalState& state = b->brain.state();
    out += " | " + hex64(state.arousal()) + " " + hex64(state.scene(fly::io::kLeft)) + " " + hex64(state.scene(fly::io::kRight)) + " " + hex64(state.sleep()) + " | ";
    out += retina_digest(b->brain) + " | ";
    out += tick++ % 50 == 49 ? digest(b->brain.sim()) : "-";
    std::puts(out.c_str());
  }
  fly_brain_destroy(b);
  return 0;
}

int eyes(const char* path, const Options& options) {
  char error[512];
  fly_brain* b = create(path, 1, options.columns, error, sizeof error);
  if (b == nullptr) {
    std::printf("error %s\n", error);
    return 0;
  }
  std::printf("ready %u %u %s\n", fly_brain_facets(b, 0), fly_brain_facets(b, 1), hex32(fly_brain_eye_acceptance(b)).c_str());
  for (int side = 0; side < 2; side++) {
    const float* d = fly_brain_eye_directions(b, side);
    for (uint32_t k = 0; k < fly_brain_facets(b, side); k++) {
      const fly::eyes::Eye& eye = (*b->brain.eyes())[static_cast<size_t>(side)];
      std::printf("%s %s %s %d %d %d\n", hex32(d[3 * k]).c_str(), hex32(d[3 * k + 1]).c_str(), hex32(d[3 * k + 2]).c_str(), eye.l1[k], eye.l2[k], eye.l3[k]);
    }
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
  // Rated inputs follow the group inputs, so their indices do too.
  const fly::json::Value* rated = doc.member(spec, "rated");
  for (uint32_t k = 0; k < rated->items.size(); k++) {
    const fly::json::Value& input = doc.at(rated->items[k]);
    sim.add_rated_input("rated " + std::to_string(k), indices(doc.member(input, "neurons")), doc.member(input, "withdraw")->type == fly::json::Type::True);
  }
  // Changes, each applied just before its step: {step, input, rate}, {step, rated, rates} or {step, bias}.
  const fly::json::Value* changes = doc.member(spec, "changes");
  size_t next = 0;
  const auto steps = static_cast<uint32_t>(number(spec, "steps"));
  std::string out;
  for (uint32_t s = 0; s < steps; s++) {
    while (next < changes->items.size() && number(doc.at(changes->items[next]), "step") == s) {
      const fly::json::Value& change = doc.at(changes->items[next++]);
      if (doc.member(change, "rate") != nullptr) {
        sim.set_rate(static_cast<uint32_t>(number(change, "input")), number(change, "rate"));
      } else if (doc.member(change, "rates") != nullptr) {
        sim.set_rates(static_cast<uint32_t>(inputs->items.size() + number(change, "rated")), numbers(doc.member(change, "rates")));
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

int hypot() {
  std::string x, y;
  while (std::cin >> x >> y) std::printf("%s\n", hex64(fly::js::hypot(f64(x), f64(y))).c_str());
  return 0;
}

int patterns() {
  std::string type;
  while (std::getline(std::cin, type)) {
    std::printf("%d %d %d\n", fly::params::columnar_class(type) ? 1 : 0, fly::vision::t4_t5(type) ? 1 : 0, fly::vision::lobula_columnar(type) ? 1 : 0);
  }
  return 0;
}

int regions(const char* path) {
  const std::vector<uint8_t> data = read_file(path);
  std::vector<uint8_t> regions;
  try {
    regions = fly::regions::of(fly::Connectome(data.data(), data.size()));
  } catch (const std::exception& e) {
    std::printf("error %s\n", e.what());
    return 0;
  }
  std::string out = "ready ";
  for (size_t k = 0; k < fly::regions::ids().size(); k++) out += (k > 0 ? "|" : "") + fly::regions::ids()[k];
  std::puts(out.c_str());
  out.clear();
  for (size_t i = 0; i < regions.size(); i++) out += (i > 0 ? " " : "") + std::to_string(regions[i]);
  std::puts(out.c_str());
  return 0;
}

}  // namespace

int main(int argc, char** argv) {
  const std::string mode = argc > 1 ? argv[1] : "";
  if (mode == "brain" && argc >= 4) return brain(argv[2], static_cast<uint32_t>(std::strtoul(argv[3], nullptr, 10)), options(argc, argv, 4));
  if (mode == "eyes" && argc >= 3) return eyes(argv[2], options(argc, argv, 3));
  if (mode == "engine") return engine();
  if (mode == "math") return math();
  if (mode == "hypot") return hypot();
  if (mode == "patterns") return patterns();
  if (mode == "regions" && argc >= 3) return regions(argv[2]);
  std::fputs("usage: fly-brain-harness brain <connectome.bin> <seed> [--light <frames>] [--columns <columns>] | eyes <connectome.bin> [--columns <columns>]"
             " | engine | math | hypot | patterns | regions <connectome.bin>\n", stderr);
  return 2;
}
