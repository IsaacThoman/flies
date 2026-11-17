#include "thermo.hpp"

#include <cmath>

#include "fdlibm.hpp"

namespace fly::thermo {

namespace {

// thermo.ts's THERMO, in its order and arithmetic.
constexpr double kCellsPerArista = 3;
constexpr double kCoolingRate = 97 / kCellsPerArista;
constexpr double kCoolingGain = 10;
constexpr double kHeatingRate25 = 37 / kCellsPerArista;
constexpr double kHeatingQ10 = 4.4;
constexpr double kTonicMin = 20, kTonicMax = 30;
constexpr double kHeatingGain = 2 / 2.75;
constexpr double kCeiling = 3;
constexpr double kAdaptMs = 1000;
constexpr double kFeltMin = 0, kFeltMax = 50;

double heating_log_q10() {
  static const double value = fdlibm::log(kHeatingQ10);
  return value;
}

}  // namespace

double temperature_of(const io::Senses& s, io::Side side) {
  const double t = side == io::kLeft ? s.temperature_left : s.temperature_right;
  return std::isnan(t) ? t : js::min(kFeltMax, js::max(kFeltMin, t));
}

double heating_rate(double t, double adapted) {
  const double steady = js::min(kTonicMax, js::max(kTonicMin, t));
  const double tonic = kHeatingRate25 * fdlibm::exp((heating_log_q10() * (steady - 25)) / 10);
  return tonic * js::min(kCeiling, js::max(0, 1 + kHeatingGain * (t - adapted)));
}

double cooling_rate(double t, double adapted) { return kCoolingRate * js::min(kCeiling, js::max(0, 1 + kCoolingGain * (adapted - t))); }

Thermoreceptors::Rates Thermoreceptors::step(io::Side side, double t, double ms) {
  if (std::isnan(t)) {
    adapted_[side] = t;
    return {};
  }
  const double adapted = std::isnan(adapted_[side]) ? t : adapted_[side];
  const Rates rates{heating_rate(t, adapted), cooling_rate(t, adapted)};
  adapted_[side] = adapted + (t - adapted) * -fdlibm::expm1(-ms / kAdaptMs);
  return rates;
}

}  // namespace fly::thermo
