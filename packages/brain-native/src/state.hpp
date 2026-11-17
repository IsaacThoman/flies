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
//            + hunger.weight × (hunger - 1) + sleep)
//
// from 0 to 1, multiplying that eye's maximum background rate. The hunger
// term stands in for starvation-induced hyperactivity; state.ts says why and
// where its weight comes from.
//
// Sleep adds a term of its own inside the logistic: the daily clock's
// oscillators raise arousal, its push toward sleep, the homeostatic sleep
// pressure and sleep depth lower it, a made-up stand-in for the clock's and
// the homeostat's outputs the connectome lacks (state.ts says more).

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
  static constexpr double kHungerWeight = 0.9;
  // How far the clock's oscillators raise arousal, and its push toward sleep, sleep pressure and sleep depth lower it, at 1.
  static constexpr double kSleepWake = 1, kSleepClock = 3.5, kSleepPressure = 4, kSleepDepth = 4;

  explicit InternalState(uint32_t seed) : normal_(seed) {}

  /** Advances by dt seconds. */
  void step(double dt);
  /** Sets the sleep term from the clock's oscillators (the higher of the two), its push toward sleep, sleep pressure and sleep depth, each 0 to 1. */
  void rest(double wake, double clock_sleep, double pressure, double depth) {
    sleep_ = kSleepWake * wake - (kSleepClock * clock_sleep + kSleepPressure * pressure + kSleepDepth * depth);
  }
  /** The sleep term (above 0 at the clock's peaks). */
  double sleep() const { return sleep_; }
  /** How sleepy the term makes it, 0 to 1: 1 at the clock's full push toward sleep. */
  double sleepiness() const { return js::min(1, js::max(0, -sleep_ / kSleepClock)); }
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
  double sleep_ = 0;
};

}  // namespace fly

#endif
