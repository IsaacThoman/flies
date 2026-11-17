#include "vision.hpp"

#include <algorithm>
#include <string_view>

#include "fdlibm.hpp"

namespace fly::vision {

Retina::Retina(const eyes::Eye& eye, const RetinaParameters& parameters) : parameters_(parameters), facets_(eye.facets()) {
  for (const auto& [list, is_transient] : {std::pair{&eye.l1, 1}, std::pair{&eye.l2, 1}, std::pair{&eye.l3, 0}}) {
    for (uint32_t k = 0; k < list->size(); k++) {
      const int32_t i = (*list)[k];
      if (i < 0) continue;
      neurons_.push_back(static_cast<uint32_t>(i));
      facet_.push_back(k);
      transient_.push_back(static_cast<uint8_t>(is_transient));
    }
  }
  rates_.assign(neurons_.size(), 0);
  for (int32_t i : eye.l1) {
    if (i >= 0) l1_.push_back(static_cast<uint32_t>(i));
  }
  withdrawals_.assign(l1_.size(), 0);
  ambient_.assign(facets_, 0);
  recent_.assign(facets_, 0);
  seen_.assign(facets_, 0);
}

bool Retina::step(double dt, const std::span<const float>* light) {
  const double tau_ambient = parameters_.ambient;
  const double tau_transient = parameters_.transient;
  const double floor = parameters_.floor;
  const double max_rate = parameters_.max_rate;
  const double tonic = parameters_.tonic;
  const double withdraw = parameters_.withdraw;
  const bool was = firing_;
  if (light == nullptr) {
    open_ = false;
    firing_ = false;
    if (was) {
      std::fill(rates_.begin(), rates_.end(), 0);
      std::fill(withdrawals_.begin(), withdrawals_.end(), 0);
    }
    return was;
  }
  double* const ambient = ambient_.data();
  double* const recent = recent_.data();
  double* const seen = seen_.data();
  // NaN reads as 0, as `x > 0 ? Math.min(1, x) : 0` has it.
  const float* const luminance = light->data();
  const auto lum = [luminance](uint32_t k) {
    const double x = luminance[k];
    return x > 0 ? js::min(1, x) : 0;
  };
  if (!open_) {
    open_ = true;
    idle_ = 0;
    for (uint32_t k = 0; k < facets_; k++) ambient[k] = recent[k] = seen[k] = lum(k);
  } else {
    bool same = true;
    for (uint32_t k = 0; k < facets_ && same; k++) same = lum(k) == seen[k];
    // With the light constant, each level only moves toward it, so a
    // contrast of 0 or less stays so and every rate stays 0.
    if (same && !was && tonic == 0) {
      idle_ += dt;
      return false;
    }
    const double idle_ambient = fdlibm::exp(-idle_ / tau_ambient);
    const double idle_recent = fdlibm::exp(-idle_ / tau_transient);
    const double keep_ambient = fdlibm::exp(-dt / tau_ambient);
    const double keep_recent = fdlibm::exp(-dt / tau_transient);
    for (uint32_t k = 0; k < facets_; k++) {
      const double before = seen[k];
      const double x = lum(k);
      // A level a step no longer moves is the light (vision.ts says why).
      const double next_ambient = x + (before + (ambient[k] - before) * idle_ambient - x) * keep_ambient;
      const double next_recent = x + (before + (recent[k] - before) * idle_recent - x) * keep_recent;
      ambient[k] = next_ambient == ambient[k] ? x : next_ambient;
      recent[k] = next_recent == recent[k] ? x : next_recent;
      seen[k] = x;
    }
    idle_ = 0;
  }
  bool firing = false;
  for (size_t n = 0; n < rates_.size(); n++) {
    const uint32_t k = facet_[n];
    const double contrast = ((transient_[n] != 0 ? recent[k] : ambient[k]) - seen[k]) / (ambient[k] + floor);
    const double rate = js::min(max_rate, js::max(0, tonic + max_rate * contrast));
    rates_[n] = rate;
    if (rate > 0) firing = true;
  }
  for (size_t n = 0; n < withdrawals_.size(); n++) {
    const uint32_t k = facet_[n];
    const double rate = js::min(max_rate, js::max(0, withdraw * max_rate * ((seen[k] - recent[k]) / (ambient[k] + floor))));
    withdrawals_[n] = rate;
    if (rate > 0) firing = true;
  }
  firing_ = firing;
  return firing || was;
}

namespace {

using Condition = std::function<bool(std::string_view)>;

bool digit(char c) { return c >= '0' && c <= '9'; }

Condition one_of(std::vector<std::string> values) {
  return [values = std::move(values)](std::string_view s) { return std::find(values.begin(), values.end(), s) != values.end(); };
}

}  // namespace

bool t4_t5(std::string_view s) { return s.size() == 3 && s[0] == 'T' && (s[1] == '4' || s[1] == '5') && s[2] >= 'a' && s[2] <= 'd'; }

bool lobula_columnar(std::string_view s) {
  for (std::string_view prefix : {"LC", "LPLC", "LLPC", "LPC"}) {
    if (s.substr(0, prefix.size()) == prefix && s.size() > prefix.size() && digit(s[prefix.size()])) return true;
  }
  return false;
}

std::vector<Stage> stages() {
  const auto query = [](std::initializer_list<std::pair<Category, Condition>> conditions) {
    NeuronQuery q;
    for (const auto& [column, condition] : conditions) q[column] = condition;
    return q;
  };
  return {
      // L1, L2 and L3, driven by the input stage.
      {"lamina", true, {}},
      // The columnar relays of the ON (Mi1, Tm3, Mi4, Mi9) and OFF (Tm1, Tm2, Tm4, Tm9) pathways.
      {"medulla", false, query({{kType, one_of({"Mi1", "Tm3", "Mi4", "Mi9", "Tm1", "Tm2", "Tm4", "Tm9"})}})},
      // The direction-selective T4 (ON) and T5 (OFF) cells, all four subtypes.
      {"T4/T5", false, query({{kType, t4_t5}})},
      // Lobula and lobula plate columnar projection neurons (LC, LPLC, LLPC, LPC types) but the looming detectors.
      {"lobula", false,
       query({{kSuperClass, [](std::string_view s) { return s == "visual_projection"; }},
              {kType, [](std::string_view t) { return lobula_columnar(t) && t != "LPLC2" && t != "LC4"; }}})},
      // The looming detectors LPLC2 and LC4.
      {"looming", false, query({{kType, one_of({"LPLC2", "LC4"})}})},
      // Lobula plate tangential cells HS and VS (wide-field horizontal and vertical motion).
      {"tangential", false, query({{kType, one_of({"HSE", "HSN", "HSS", "VS"})}})},
  };
}

std::string stage_name(const Stage& stage, io::Side side) { return std::string("vision.") + stage.name + (side == io::kLeft ? " left" : " right"); }

}  // namespace fly::vision
