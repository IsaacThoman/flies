#include "olfaction.hpp"
#include <algorithm>
#include <cmath>
#include <unordered_set>

namespace fly::olfaction {
std::vector<Group> wire(const Connectome& c) {
  NeuronQuery query;
  query[kSuperClass] = [](std::string_view s) { return s == "cb_sensory"; };
  query[kClass] = [](std::string_view s) { return s == "olfactory"; };
  const auto olfactory = c.find(query);
  std::vector<Group> groups;
  const auto add = [&](const std::string& g, const std::string& type, double spontaneous, const std::array<double, kOdorants>& answers) {
    std::vector<uint32_t> all;
    for (uint32_t i : olfactory) if (c.value(kType, i) == type) all.push_back(i);
    for (const char* side : {"left", "right", "unknown"}) {
      std::vector<uint32_t> neurons;
      for (uint32_t i : all) {
        const auto& given = c.value(kSide, i);
        if ((given.empty() ? "unknown" : given) == side) neurons.push_back(i);
      }
      if (!neurons.empty()) groups.push_back({"smell " + (g.empty() ? "untyped" : g) + " " + side, g, side, std::move(neurons), spontaneous, answers});
    }
  };
  std::vector<double> rates;
  for (const Row& row : kTable) {
    add(row.glomerulus, std::string("ORN_") + row.glomerulus, row.spontaneous, row.answers);
    rates.push_back(row.spontaneous);
  }
  std::sort(rates.begin(), rates.end());
  const size_t n = rates.size();
  const double median = n % 2 ? rates[(n - 1) / 2] : (rates[n / 2 - 1] + rates[n / 2]) / 2;
  add("", "", median, {});
  return groups;
}

bool corrected(std::string_view type) {
  static const std::unordered_set<std::string_view> types = [] {
    std::unordered_set<std::string_view> out;
    for (const Row& row : kTable) {
      const std::string_view g = row.glomerulus;
      if (g != "DA3" && g != "VA1v" && g != "VM6l") out.insert(g);
    }
    return out;
  }();
  return type.starts_with("ORN_") && types.count(type.substr(4)) != 0;
}

std::array<double, 2 * kOdorants> odor_of(const io::Senses& senses) {
  std::array<double, 2 * kOdorants> odor{};
  const auto strength = [](double x) { return std::isfinite(x) ? js::min(1, js::max(0, x)) : 0; };
  for (size_t k = 0; k < kOdorants; k++) {
    odor[k] = strength(senses.odor_left[k]);
    odor[kOdorants + k] = strength(senses.odor_right[k]);
  }
  return odor;
}

double rate(const Group& group, const std::array<double, 2 * kOdorants>& odor) {
  // Only the reference's default is exposed here: no restingSmell experiment.
  double rate = 0;
  for (size_t k = 0; k < kOdorants; k++) {
    const double strength = group.side == "left" ? odor[k] : group.side == "right" ? odor[kOdorants + k] : (odor[k] + odor[kOdorants + k]) / 2;
    rate += group.answers[k] * strength;
  }
  return js::max(0, rate);
}
}  // namespace fly::olfaction
