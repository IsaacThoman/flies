#include "params.hpp"

#include <memory>
#include <string_view>
#include <unordered_map>

#include "fdlibm.hpp"

namespace fly::params {

SimulationOptions neuron(uint32_t seed) {
  SimulationOptions options;
  // Shiu et al. 2024: rest -52 mV, threshold -45 mV, tauMem 20 ms, tauSyn 5 ms,
  // refractory 2.2 ms, delay 1.8 ms, and a spike resets g as well as v. They
  // stepped at 0.1 ms; at 1 ms the refractory period and delay round to 2 ms.
  options.dt = 1;
  options.tau_mem = 20;
  options.tau_syn = 5;
  options.threshold = 7;
  options.refractory = 2.2;
  options.delay = 1.8;
  options.reset_drive = true;
  // Not in Shiu et al.: weak, slow adaptation, which stops self-sustaining loops.
  options.adaptation = SimulationOptions::Adaptation{0.1, 1000};
  options.epsilon = 0.01;
  options.seed = seed;
  return options;
}

bool octopaminergic(std::string_view t) {
  return (t.starts_with("OA-") && t.size() > 3 && t.find_first_of("\n\r") == std::string_view::npos &&
          t.find("\xe2\x80\xa8") == std::string_view::npos && t.find("\xe2\x80\xa9") == std::string_view::npos) ||
         t == "DNd02" || t == "DNd03" || t == "DNg34" || t == "DNge138" || t == "DNge149" ||
         t == "DNge150" || t == "DNge152" || t == "DNg66";
}

bool dfb_dopaminergic(std::string_view t) { return t == "FB5H" || t == "FB6H" || t == "FB7B"; }

std::vector<std::string> transmitters(const Connectome& c) {
  const uint32_t n = c.neurons();
  const auto starts = [](const std::string& s, const char* prefix) { return s.rfind(prefix, 0) == 0; };
  // The fixes read a neuron's predicted transmitter, super class and type
  // alone, so each condition is judged once per table entry, not per neuron.
  const auto judged = [&](Category column, auto condition) {
    std::vector<uint8_t> out;
    out.reserve(c.table(column).size());
    for (const std::string& s : c.table(column)) out.push_back(condition(s) ? 1 : 0);
    return out;
  };
  const auto blank = judged(kNt, [](const std::string& s) { return s.empty(); });
  const auto monoamine = judged(kNt, [](const std::string& s) { return s == "DA" || s == "SER" || s == "OCT"; });
  const auto cholinergic = judged(kNt, [](const std::string& s) { return s == "ACH"; });
  const auto eye_sensory = judged(kSuperClass, [](const std::string& s) { return s == "ol_sensory"; });
  const auto other_sensory = judged(kSuperClass, [](const std::string& s) { return s.find("sensory") != std::string::npos && s != "ol_sensory"; });
  const auto head_sensory = judged(kSuperClass, [](const std::string& s) { return s == "cb_sensory"; });
  const auto kenyon = judged(kType, [&](const std::string& s) { return starts(s, "KC"); });
  const auto head_mechanosensory = judged(kType, [&](const std::string& s) { return starts(s, "BM") || starts(s, "JO-"); });
  const auto lateral_ln = judged(kType, [&](const std::string& s) { return starts(s, "lLN"); });
  const auto oa = judged(kType, [](const std::string& s) { return octopaminergic(s); });
  const auto dfb = judged(kType, [](const std::string& s) { return dfb_dopaminergic(s); });
  std::vector<std::string> out(n);
  for (uint32_t i = 0; i < n; i++) {
    const uint32_t predicted = c.code(kNt, i);
    const uint32_t super_class = c.code(kSuperClass, i);
    const uint32_t type = c.code(kType, i);
    // Each fix is judged on the predicted transmitter, before any fix, and
    // applied unless the neuron already has the fix's transmitter.
    struct Fix {
      bool applies;
      const char* nt;
    };
    const Fix fixes[] = {
        // Kenyon cells are cholinergic (Barnstedt et al. 2016). This dataset
        // predicts them as dopaminergic, and dopamine is muted here, which
        // would cut the mushroom body's output.
        {kenyon[type] != 0, "ACH"},
        // Photoreceptors are histaminergic; the prediction is blank for most of them.
        {eye_sensory[super_class] != 0 && blank[predicted] != 0, "HIST"},
        // Mechanosensory, gustatory, olfactory and other primary sensory
        // neurons outside the eye are cholinergic; the prediction is blank for
        // about 2,100 of them, most head bristle neurons among them.
        {other_sensory[super_class] != 0 && blank[predicted] != 0, "ACH"},
        // The head's mechanosensory neurons, its bristles' (BM) and Johnston's
        // organ's (JO), are cholinergic like the rest of their types: the
        // dataset's own type-level transmitter for them is acetylcholine.
        // Eleven are predicted a monoamine one by one, at low confidence, and
        // so were muted, among them the right side's whole route from the
        // head's bristles to grooming.
        {head_sensory[super_class] != 0 && head_mechanosensory[type] != 0 && monoamine[predicted] != 0, "ACH"},
        // Antennal lobe local neurons are overwhelmingly GABAergic (Chou et al.
        // 2010). The prediction makes 75 lateral LNs (lLN1, lLN2T, lLN2X and
        // others) cholinergic; wired densely to each other, they then lock the
        // antennal lobe into saturated firing after any olfactory input. The
        // least certain fix.
        {lateral_ln[type] != 0 && cholinergic[predicted] != 0, "GABA"},
        {oa[type] != 0, "OCT"},
        {dfb[type] != 0, "DA"},
    };
    out[i] = c.table(kNt)[predicted];
    for (const Fix& fix : fixes) {
      if (fix.applies && out[i] != fix.nt) out[i] = fix.nt;
    }
  }
  return out;
}

namespace {

bool digit(char c) { return c >= '0' && c <= '9'; }
bool lower(char c) { return c >= 'a' && c <= 'z'; }
bool letter(char c) { return lower(c) || (c >= 'A' && c <= 'Z'); }

// s from `at` on is one or more digits, then nothing but `tail` characters: \d+[...]*$.
bool digits_then(std::string_view s, size_t at, bool (*tail)(char)) {
  size_t k = at;
  while (k < s.size() && digit(s[k])) k++;
  if (k == at) return false;
  for (; k < s.size(); k++) {
    if (!tail(s[k])) return false;
  }
  return true;
}

}  // namespace

bool columnar_class(std::string_view s) {
  const auto in = [&](size_t k, char lo, char hi) { return k < s.size() && s[k] >= lo && s[k] <= hi; };
  // The alternatives, each matched against the whole string.
  if (s.size() == 2 && s[0] == 'L' && in(1, '1', '5')) return true;
  if (s.size() == 2 && s[0] == 'C' && in(1, '2', '3')) return true;
  if ((s.size() == 2 || (s.size() == 3 && in(2, 'a', 'd'))) && s[0] == 'T' && in(1, '1', '5')) return true;
  if (s.starts_with("Tm") && digits_then(s, 2, letter)) return true;
  if (s.starts_with("TmY") && digits_then(s, 3, lower)) return true;
  if (s.starts_with("Y") && digits_then(s, 1, digit)) return true;
  if (s.starts_with("Mi") && digits_then(s, 2, digit)) return true;
  return false;
}

std::vector<uint8_t> columnar(const Connectome& c) {
  NeuronQuery q;
  q[kSuperClass] = [](std::string_view s) { return s == "ol_intrinsic"; };
  q[kType] = columnar_class;
  const std::vector<uint32_t> candidates = c.find(q);
  // Counted by type and side, each by the first code with its name, as params.ts does, so a table that repeats a name counts it as one.
  const auto named = [&](Category column) {
    std::unordered_map<std::string_view, uint32_t> first;
    std::vector<uint32_t> out;
    for (const std::string& s : c.table(column)) out.push_back(first.try_emplace(s, static_cast<uint32_t>(out.size())).first->second);
    return out;
  };
  const std::vector<uint32_t> types = named(kType);
  const std::vector<uint32_t> sides = named(kSide);
  const size_t stride = sides.size();
  const auto key = [&](uint32_t i) { return types[c.code(kType, i)] * stride + sides[c.code(kSide, i)]; };
  std::vector<uint32_t> counts(types.size() * stride, 0);
  for (uint32_t i : candidates) counts[key(i)]++;
  std::vector<uint8_t> out(c.neurons(), 0);
  for (uint32_t i : candidates) {
    if (counts[key(i)] >= kColumnarMinCells) out[i] = 1;
  }
  return out;
}

std::vector<double> completeness(const Connectome& c) {
  std::vector<double> out(c.neurons(), 1);
  for (const char* zone : {"JO-C", "JO-E", "JO-F"}) {
    const auto side = [&](const char* name) {
      NeuronQuery q;
      q[kSuperClass] = [](std::string_view s) { return s == "cb_sensory"; };
      q[kType] = [zone](std::string_view s) { return s.starts_with(zone); };
      q[kSide] = [name](std::string_view s) { return s == name; };
      return c.find(q);
    };
    const std::vector<uint32_t> left = side("left");
    const std::vector<uint32_t> right = side("right");
    const auto synapses = [&](const std::vector<uint32_t>& neurons) {
      uint64_t total = 0;
      for (uint32_t i : neurons) {
        for (uint32_t e = c.ptr(i); e < c.ptr(i + 1); e++) total += c.count(e);
      }
      return static_cast<double>(total);
    };
    const double l = synapses(left);
    const double r = synapses(right);
    if (l == 0 || r == 0 || l == r) continue;
    const std::vector<uint32_t>& weaker = l < r ? left : right;
    const double factor = l < r ? r / l : l / r;
    for (uint32_t i : weaker) out[i] = factor;
  }
  return out;
}

float transmitter_gain(const std::string& t) {
  if (t == "ACH") return static_cast<float>(kExcitatory);
  if (t == "GABA" || t == "GLUT" || t == "HIST") return static_cast<float>(-kInhibitory);
  if (t == "DA" || t == "SER" || t == "OCT") return static_cast<float>(kModulatory);
  return static_cast<float>(kUnknown);
}

std::array<uint16_t, 65536> saturated_counts() {
  std::array<uint16_t, 65536> lookup{};
  for (uint32_t n = 0; n < 65536; n++) {
    lookup[n] = static_cast<uint16_t>(js::round(kSaturation * -fdlibm::expm1(-static_cast<double>(n) / kSaturation)));
  }
  return lookup;
}

Simulation build(const Connectome& c, uint32_t seed) {
  const uint32_t n = c.neurons();
  std::vector<float> gain(n);
  {
    const std::vector<std::string> nt = transmitters(c);
    for (uint32_t i = 0; i < n; i++) gain[i] = transmitter_gain(nt[i]);
  }
  {
    const std::vector<uint8_t> graded = columnar(c);
    for (uint32_t i = 0; i < n; i++) {
      if (graded[i] != 0) gain[i] = static_cast<float>(static_cast<double>(gain[i]) * kGraded);
    }
  }
  {
    const std::vector<double> factor = completeness(c);
    for (uint32_t i = 0; i < n; i++) {
      if (factor[i] != 1) gain[i] = static_cast<float>(static_cast<double>(gain[i]) * factor[i]);
    }
  }
  const auto saturated = std::make_unique<std::array<uint16_t, 65536>>(saturated_counts());
  std::vector<uint32_t> ptr(static_cast<size_t>(n) + 1);
  std::vector<Simulation::Edge> edges(c.connections());
  for (uint32_t i = 0; i <= n; i++) ptr[i] = c.ptr(i);
  for (uint32_t i = 0; i < n; i++) {
    for (uint32_t e = ptr[i]; e < ptr[i + 1]; e++) edges[e] = {c.post(e), Simulation::weight((*saturated)[c.count(e)], gain[i])};
  }
  return Simulation(std::move(ptr), std::move(edges), neuron(seed));
}

}  // namespace fly::params
