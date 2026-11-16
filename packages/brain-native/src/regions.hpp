// The nervous system by region, regions.ts in C++: which anatomical region
// each neuron is in, for the region.<id> rates the brain reports for display
// (no command reads them). regions.ts and packages/brain/README.md (Regions)
// say what each region is and why its rules are what they are; the names,
// descriptions and display scales live there only.

#ifndef FLY_REGIONS_HPP
#define FLY_REGIONS_HPP

#include "exact.hpp"

#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

#include "connectome.hpp"

namespace fly::regions {

/** Smoothing time constant, ms, of the region rates (regions.ts's REGION_TAU). */
constexpr double kTau = 100;

/** regions.ts's REGIONS by id, in their order. */
const std::vector<std::string>& ids();

/** A region's name in the rates (regions.ts's regionName). */
std::string rate_name(std::string_view id);

/** A neuron's annotations, as the rules read them. */
struct Annotations {
  std::string_view super_class, klass, sub_class, type, side;
};

/** The id of the region a neuron is in (regions.ts's regionIdOf). */
std::string id_of(const Annotations& n);

/** Each neuron's region, an index into ids() (regions.ts's regionOf). */
std::vector<uint8_t> of(const Connectome& connectome);

}  // namespace fly::regions

#endif
