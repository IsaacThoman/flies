#include "params.hpp"

#include <memory>

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

std::vector<std::string> transmitters(const Connectome& c) {
  const uint32_t n = c.neurons();
  const auto starts = [](const std::string& s, const char* prefix) { return s.rfind(prefix, 0) == 0; };
  std::vector<std::string> out(n);
  for (uint32_t i = 0; i < n; i++) {
    const std::string& predicted = c.value(kNt, i);
    const std::string& super_class = c.value(kSuperClass, i);
    const std::string& type = c.value(kType, i);
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
        {starts(type, "KC"), "ACH"},
        // Photoreceptors are histaminergic; the prediction is blank for most of them.
        {super_class == "ol_sensory" && predicted.empty(), "HIST"},
        // Mechanosensory, gustatory, olfactory and other primary sensory
        // neurons outside the eye are cholinergic; the prediction is blank for
        // about 2,100 of them, most head bristle neurons among them.
        {super_class.find("sensory") != std::string::npos && super_class != "ol_sensory" && predicted.empty(), "ACH"},
        // Antennal lobe local neurons are overwhelmingly GABAergic (Chou et al.
        // 2010). The prediction makes 75 lateral LNs (lLN1, lLN2T, lLN2X and
        // others) cholinergic; wired densely to each other, they then lock the
        // antennal lobe into saturated firing after any olfactory input. The
        // least certain fix.
        {starts(type, "lLN") && predicted == "ACH", "GABA"},
    };
    out[i] = predicted;
    for (const Fix& fix : fixes) {
      if (out[i] != fix.nt && fix.applies) out[i] = fix.nt;
    }
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
