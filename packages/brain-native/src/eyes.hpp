// The eyes, eyes.ts in C++: a facet for every column of each optic lobe
// (eye_columns.cpp, generated from eye-columns.ts), the way each facet looks
// out, and the lamina monopolar cells L1, L2 and L3 that carry what it sees
// into the brain. eyes.ts's opening comment and packages/brain/README.md (The
// eyes) say how the columns are oriented and why the directions are what they
// are.

#ifndef FLY_EYES_HPP
#define FLY_EYES_HPP

#include "exact.hpp"

#include <array>
#include <cstdint>
#include <optional>
#include <span>
#include <vector>

#include "connectome.hpp"
#include "io.hpp"

namespace fly::eyes {

/** One column: its hex coordinates, kind (eye-columns.ts's COLUMN_KINDS) and the body IDs of its L1, L2 and L3 (0 for none). */
struct EyeColumn {
  uint8_t hex1, hex2, kind;
  uint32_t l1, l2, l3;
};

/** Both eyes' columns, in facet order. */
struct Columns {
  std::span<const EyeColumn> left;
  std::span<const EyeColumn> right;
};

/** eye-columns.ts's EYE_COLUMNS. */
extern const Columns kEyeColumns;

/** eyes.ts's EYE_GEOMETRY: degrees between neighbouring facets, the lattice's centre column, and its direction (azimuth, elevation). */
constexpr double kSpacing = 5;
constexpr double kCentre[2] = {18, 19};
constexpr double kAzimuth = 68;
constexpr double kElevation = 0;

/** A facet's cone, half-angle in radians: the radius of the hexagon each facet covers, spacing / √3. */
double acceptance();

/** Where the facet at [hex1, hex2] of one eye looks: a unit vector, x toward the fly's right, y ahead, z up. */
std::array<double, 3> facet_direction(io::Side side, double hex1, double hex2);

/** One eye: per facet, the neuron index of its L1, L2 and L3 (-1 for none), and its direction (x y z) as eyes.ts stores it, in single precision. */
struct Eye {
  std::vector<int32_t> l1, l2, l3;
  std::vector<float> directions;
  uint32_t facets() const { return static_cast<uint32_t>(l1.size()); }
};

/** Indexed by io::Side. */
using Eyes = std::array<Eye, 2>;

/**
 * The eyes of this connectome, each column's cells resolved to neuron
 * indices; nothing when none of the columns' L1s are in it. Throws
 * std::runtime_error if a body ID belongs to a neuron of another type or
 * side, which means the table and the connectome don't match.
 */
std::optional<Eyes> build(const Connectome& connectome, const Columns& columns = kEyeColumns);

}  // namespace fly::eyes

#endif
