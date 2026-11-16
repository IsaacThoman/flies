#include "state.hpp"

#include <cmath>
#include <numbers>

#include "fdlibm.hpp"

namespace fly {

double Normals::next() {
  if (has_spare_) {
    has_spare_ = false;
    return spare_;
  }
  const double u = 1 - uniform_.next();
  const double v = uniform_.next();
  const double r = std::sqrt(-2 * fdlibm::log(u));
  spare_ = r * fdlibm::sin(2 * std::numbers::pi * v);
  has_spare_ = true;
  return r * fdlibm::cos(2 * std::numbers::pi * v);
}

void Wander::step(double dt, Normals& normal) {
  const double keep = fdlibm::exp(-dt / tau);
  value = value * keep + std::sqrt(1 - keep * keep) * normal.next();
}

void InternalState::step(double dt) {
  arousal_.step(dt, normal_);
  scene_[io::kLeft].step(dt, normal_);
  scene_[io::kRight].step(dt, normal_);
}

double InternalState::level(io::Side eye) const {
  const double x = kArousalWeight * arousal_.value + kSceneWeight * scene_[eye].value + kBias + kHungerWeight * (hunger_ - 1);
  return 1 / (1 + fdlibm::exp(-x));
}

}  // namespace fly
