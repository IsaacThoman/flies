#include "eyes.hpp"

#include <cmath>
#include <numbers>
#include <stdexcept>
#include <string>

#include "fdlibm.hpp"

namespace fly::eyes {

namespace {

double radians(double degrees) { return (degrees * std::numbers::pi) / 180; }

}  // namespace

double acceptance() { return ((kSpacing / std::sqrt(3.0)) * std::numbers::pi) / 180; }

std::array<double, 3> facet_direction(io::Side side, double hex1, double hex2) {
  const double q = hex1 - kCentre[0];
  const double p = hex2 - kCentre[1];
  // On the lattice: forward (toward the front of the eye) and up, in radians.
  const double forward = radians(((q - p) * std::sqrt(3.0) * kSpacing) / 2);
  const double up = radians(((q + p) * kSpacing) / 2);
  // The right eye's centre direction, and unit vectors toward the front and up there.
  const double a = radians(kAzimuth);
  const double e = radians(kElevation);
  const double c[3] = {fdlibm::sin(a) * fdlibm::cos(e), fdlibm::cos(a) * fdlibm::cos(e), fdlibm::sin(e)};
  const double front[3] = {-fdlibm::cos(a), fdlibm::sin(a), 0};
  const double top[3] = {-fdlibm::sin(a) * fdlibm::sin(e), -fdlibm::cos(a) * fdlibm::sin(e), fdlibm::cos(e)};
  const double r = js::hypot(forward, up);
  const double along = r == 0 ? 0 : fdlibm::sin(r) / r;
  double d[3];
  for (int k = 0; k < 3; k++) d[k] = fdlibm::cos(r) * c[k] + along * (forward * front[k] + up * top[k]);
  return {side == io::kRight ? d[0] : -d[0], d[1], d[2]};
}

std::optional<Eyes> build(const Connectome& connectome, const Columns& columns) {
  const auto resolve = [&](io::Side side, const char* type, uint32_t id) -> int32_t {
    if (id == 0) return -1;
    const int64_t i = connectome.index_of(id);
    if (i < 0) return -1;
    const auto at = static_cast<uint32_t>(i);
    const std::string& found_type = connectome.value(kType, at);
    const std::string& found_side = connectome.value(kSide, at);
    const char* side_name = side == io::kLeft ? "left" : "right";
    if (found_type != type || found_side != side_name) {
      throw std::runtime_error("Eye column cell " + std::to_string(id) + " should be " + type + " " + side_name + " but is " + found_type + " " + found_side);
    }
    return static_cast<int32_t>(at);
  };
  Eyes eyes;
  bool any = false;
  // Left, then right, and within an eye every L1, then every L2, then every L3, as eyes.ts resolves them (which decides the error reported).
  for (io::Side side : {io::kLeft, io::kRight}) {
    const std::span<const EyeColumn> rows = side == io::kLeft ? columns.left : columns.right;
    Eye& eye = eyes[side];
    for (const EyeColumn& row : rows) eye.l1.push_back(resolve(side, "L1", row.l1));
    for (const EyeColumn& row : rows) eye.l2.push_back(resolve(side, "L2", row.l2));
    for (const EyeColumn& row : rows) eye.l3.push_back(resolve(side, "L3", row.l3));
    for (const EyeColumn& row : rows) {
      for (double x : facet_direction(side, row.hex1, row.hex2)) eye.directions.push_back(static_cast<float>(x));
    }
    for (int32_t i : eye.l1) any = any || i >= 0;
  }
  if (!any) return std::nullopt;
  return eyes;
}

}  // namespace fly::eyes
