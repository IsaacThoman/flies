// The antennae's thermoreceptors, thermo.ts in C++: how the air's
// temperature at each arista becomes firing of its heating and cooling
// cells. thermo.ts says where each number comes from.

#ifndef FLY_THERMO_HPP
#define FLY_THERMO_HPP

#include "exact.hpp"

#include <array>
#include <limits>

#include "io.hpp"

namespace fly::thermo {

/** thermo.ts's temperatureOf: °C within kFeltMin to kFeltMax, or NaN when not a number. */
double temperature_of(const io::Senses& senses, io::Side side);

/** A heating cell's rate, Hz per neuron, at temperature t having adapted to `adapted` (°C). */
double heating_rate(double t, double adapted);

/** A cooling cell's rate, Hz per neuron, at temperature t having adapted to `adapted` (°C). */
double cooling_rate(double t, double adapted);

/** thermo.ts's Thermoreceptors: what each antenna's thermoreceptors have adapted to, NaN until felt. */
class Thermoreceptors {
 public:
  struct Rates {
    double heating = 0, cooling = 0;
  };
  /** That antenna's rates over the next `ms` (0 when it feels no temperature), after which it has adapted that much further toward t. */
  Rates step(io::Side side, double t, double ms);
  double adapted(io::Side side) const { return adapted_[side]; }

 private:
  std::array<double, 2> adapted_{std::numeric_limits<double>::quiet_NaN(), std::numeric_limits<double>::quiet_NaN()};
};

}  // namespace fly::thermo

#endif
