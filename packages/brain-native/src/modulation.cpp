#include "modulation.hpp"

#include <algorithm>
#include <limits>
#include <set>

#include "fdlibm.hpp"
#include "params.hpp"

namespace fly {

namespace {
// modulation.ts's MODULATION.tau, STAND_INS and RECEPTORS, which say why each is what it is.
constexpr double kTau = 1000;
// TH-VUM's rate, Hz, just fed and starved.
constexpr double kVumLow = 1, kVumHigh = 25;
// HUNGER_HOURS: the hours over which the body's hunger goes most of the way from fed to starved.
constexpr double kHungerHours = 12;
// sNPF's engagement of its receptor after 0, 1, 2 and 4 hours without food, held after.
const std::vector<std::pair<double, double>> kSnpfHours = {{0, 0}, {1, 0.29 / 0.7}, {2, 0.6 / 0.7}, {4, 1}};
// sNPFR1 on three glomeruli's receptor neurons: fully engaged at 1, release 1.4, 1.28 and 1.2 fold, the weights as wired fully engaged.
constexpr std::pair<const char*, double> kSnpfR1[] = {{"DM1", 0.4}, {"DM4", 0.28}, {"DM2", 0.2}};

double stand_in_level(const Modulation::StandIn& s, double hunger) {
  if (s.hours.empty()) return s.low + (s.high - s.low) * hunger;
  const double hours = hunger >= 1 ? std::numeric_limits<double>::infinity() : -kHungerHours * fdlibm::log1p(-hunger);
  size_t k = 1;
  while (k < s.hours.size() && s.hours[k].first < hours) k++;
  if (k == s.hours.size()) return s.hours[k - 1].second;
  const auto [h0, l0] = s.hours[k - 1];
  const auto [h1, l1] = s.hours[k];
  return l0 + ((l1 - l0) * (hours - h0)) / (h1 - h0);
}
// DopEcR on the sweet neurons: fully engaged at 25 Hz, release 1.4 fold, the weights as wired fully engaged.
constexpr double kDopEcRFull = 25, kDopEcRRelease = 0.4, kDopEcRWired = 1;
// Dop1R2 on the dorsal fan-shaped body's sleep-promoting neurons: fully engaged at 10 Hz, over 5 minutes up and 26 down, -7 mV.
constexpr double kDop1R2Full = 10, kDop1R2Rise = 5 * 60000, kDop1R2Fall = 26 * 60000, kDop1R2Excitability = -7;
}  // namespace

Modulation::Modulation(const Connectome& c, const io::Wiring& wiring) {
  const auto nt = params::transmitters(c);
  source_of_.assign(c.neurons(), -1);
  for (uint32_t i = 0; i < c.neurons(); i++) {
    if (nt[i] != "DA" && nt[i] != "OCT" && nt[i] != "SER") continue;
    source_of_[i] = static_cast<int32_t>(sources.size());
    sources.push_back(i);
  }
  level.assign(sources.size(), 0);
  counts.assign(sources.size(), 0);
  stand_ins.resize(2);
  stand_ins[0].low = kVumLow;
  stand_ins[0].high = kVumHigh;
  stand_ins[1].hours = kSnpfHours;
  Route sweet{};
  sweet.receptor = "DopEcR";
  sweet.release = true;
  sweet.full = kDopEcRFull;
  sweet.effect = kDopEcRRelease;
  sweet.wired = kDopEcRWired;
  sweet.stand_in = 0;
  std::set<uint32_t> wanted;
  for (const auto& group : wiring.senses) if (group.spec.sense == io::kSweet) wanted.insert(group.neurons.begin(), group.neurons.end());
  sweet.carriers.assign(wanted.begin(), wanted.end());
  sweet.engaged.assign(wanted.size(), 1);
  sweet.factors.assign(wanted.size(), 1);
  routes.push_back(std::move(sweet));

  Route sleep{};
  sleep.receptor = "Dop1R2";
  sleep.release = false;
  sleep.full = kDop1R2Full;
  sleep.effect = kDop1R2Excitability;
  sleep.rise = kDop1R2Rise;
  sleep.fall = kDop1R2Fall;
  sleep.stand_in = -1;
  std::vector<std::vector<std::pair<uint32_t, double>>> incoming(c.neurons());
  for (uint32_t i = 0; i < c.neurons(); i++) {
    if (!params::dfb_dopaminergic(c.value(kType, i)) || nt[i] != "DA") continue;
    for (uint32_t e = c.ptr(i); e < c.ptr(i + 1); e++) {
      const uint32_t j = c.post(e);
      if (io::dfb_sleep(c.value(kType, j))) incoming[j].push_back({static_cast<uint32_t>(source_of_[i]), c.count(e)});
    }
  }
  sleep.ptr.push_back(0);
  for (uint32_t j = 0; j < c.neurons(); j++) {
    auto& list = incoming[j];
    if (list.empty()) continue;
    std::stable_sort(list.begin(), list.end(), [](const auto& a, const auto& b) { return a.first < b.first; });
    sleep.carriers.push_back(j);
    double total = 0;
    for (const auto& [from, synapses] : list) {
      sleep.from.push_back(from);
      sleep.synapses.push_back(synapses);
      total += synapses;
    }
    sleep.total.push_back(total);
    sleep.ptr.push_back(static_cast<uint32_t>(sleep.from.size()));
  }
  sleep.engaged.assign(sleep.carriers.size(), 0);
  routes.push_back(std::move(sleep));

  for (const auto& [glomerulus, release] : kSnpfR1) {
    Route orn{};
    orn.receptor = std::string("sNPFR1 ") + glomerulus;
    orn.release = true;
    orn.full = 1;
    orn.effect = release;
    orn.wired = 1;
    orn.stand_in = 1;
    const std::string type = std::string("ORN_") + glomerulus;
    for (uint32_t i = 0; i < c.neurons(); i++) {
      if (c.value(kSuperClass, i) == "cb_sensory" && c.value(kClass, i) == "olfactory" && c.value(kType, i) == type) orn.carriers.push_back(i);
    }
    orn.engaged.assign(orn.carriers.size(), 1);
    orn.factors.assign(orn.carriers.size(), 1);
    routes.push_back(std::move(orn));
  }

  std::set<uint32_t> all;
  for (const auto& each : wiring.excitability) all.insert(each.neurons.begin(), each.neurons.end());
  for (const auto& route : routes) if (!route.release) all.insert(route.carriers.begin(), route.carriers.end());
  excitable.assign(all.begin(), all.end());
  bias.assign(excitable.size(), 0);
  const auto at = [&](uint32_t i) { return static_cast<uint32_t>(std::lower_bound(excitable.begin(), excitable.end(), i) - excitable.begin()); };
  for (const auto& each : wiring.excitability) {
    Excitability entry{each.state, each.mv, 0, {}};
    for (uint32_t i : each.neurons) entry.at.push_back(at(i));
    excitability_.push_back(std::move(entry));
  }
  for (auto& route : routes) if (!route.release) for (uint32_t i : route.carriers) route.at.push_back(at(i));
}

double Modulation::level_of(uint32_t neuron) const {
  const int32_t k = source_of_[neuron];
  return k < 0 ? 0 : level[k];
}

void Modulation::set_state(const io::Senses& senses, double hunger) {
  for (auto& stand_in : stand_ins) {
    stand_in.target = stand_in_level(stand_in, hunger);
    if (!stand_in.started) {
      stand_in.level = stand_in.target;
      stand_in.started = true;
    }
  }
  for (auto& each : excitability_) each.value = io::state_of(senses, each.state);
}

void Modulation::update(double ran) {
  if (ran > 0) {
    for (size_t k = 0; k < level.size(); k++) level[k] = io::smooth(level[k], (counts[k] / ran) * 1000, ran, kTau);
    for (auto& stand_in : stand_ins) stand_in.level = io::smooth(stand_in.level, stand_in.target, ran, kTau);
  }
  std::fill(bias.begin(), bias.end(), 0);
  for (const auto& each : excitability_) {
    const double add = each.mv * each.value;
    for (uint32_t k : each.at) bias[k] += add;
  }
  for (auto& route : routes) {
    for (size_t c = 0; c < route.carriers.size(); c++) {
      double exposed;
      if (route.stand_in >= 0) exposed = stand_ins[route.stand_in].level;
      else {
        double sum = 0;
        for (uint32_t e = route.ptr[c]; e < route.ptr[c + 1]; e++) sum += route.synapses[e] * level[route.from[e]];
        exposed = sum / route.total[c];
      }
      const double target = js::min(1, exposed / route.full);
      if (route.rise > 0) route.engaged[c] = io::smooth(route.engaged[c], target, ran, target > route.engaged[c] ? route.rise : route.fall);
      else route.engaged[c] = target;
    }
    if (route.release) {
      for (size_t c = 0; c < route.factors.size(); c++) route.factors[c] = (1 + route.effect * route.engaged[c]) / (1 + route.effect * route.wired);
    } else {
      for (size_t c = 0; c < route.at.size(); c++) bias[route.at[c]] += route.effect * route.engaged[c];
    }
  }
}

}  // namespace fly
