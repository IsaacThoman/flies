// Internal state the connectome doesn't contain, state.ts in C++: how aroused
// the fly is, and how much there is to see on each side. Neither is a neuron
// in the data; both are stand-ins, and both act only by setting the
// background firing rate of the visual projection neurons of each eye
// (io.hpp, background()). Nothing here touches a neuron that is read out.
//
// Each is an Ornstein-Uhlenbeck process: it wanders around 0 with standard
// deviation 1 and forgets its past over tau seconds. An eye's background level
// is
//
//   logistic(arousal.weight × arousal + scene.weight × scene[eye] + bias
//            + hunger.weight × (hunger - 1))
//
// from 0 to 1, multiplying that eye's maximum background rate. The hunger
// term stands in for starvation-induced hyperactivity; state.ts says why and
// where its weight comes from.

#ifndef FLY_STATE_HPP
#define FLY_STATE_HPP

#include "exact.hpp"

#include <cstdint>

#include "io.hpp"

namespace fly {

/** Standard normal numbers from a seeded uniform generator (Box-Muller), as state.ts's normals(). */
class Normals {
 public:
  explicit Normals(uint32_t seed) : uniform_(seed) {}
  double next();

 private:
  js::Mulberry32 uniform_;
  bool has_spare_ = false;
  double spare_ = 0;
};

/** A zero-mean, unit-variance Ornstein-Uhlenbeck process with time constant tau (s). */
struct Wander {
  double tau;
  double value = 0;
  /** Advances by dt seconds, exactly (the update is the process's own transition). */
  void step(double dt, Normals& normal);
};

class InternalState {
 public:
  static constexpr double kArousalTau = 10, kArousalWeight = 1.6;
  static constexpr double kSceneTau = 4, kSceneWeight = 1.5;
  static constexpr double kBias = -1;
  static constexpr double kHungerWeight = 0.8;

  explicit InternalState(uint32_t seed) : normal_(seed) {}

  /** Advances by dt seconds. */
  void step(double dt);
  /** The background level of one eye, 0 to 1. */
  double level(io::Side eye) const;
  /** How hungry the fly is, 0..1 (io::hunger_of); set by the brain each tick. */
  void set_hunger(double hunger) { hunger_ = hunger; }
  double arousal() const { return arousal_.value; }
  double scene(io::Side eye) const { return scene_[eye].value; }

 private:
  Normals normal_;
  Wander arousal_{kArousalTau};
  Wander scene_[2] = {{kSceneTau}, {kSceneTau}};
  double hunger_ = 1;
};

}  // namespace fly

#endif
