// The running brain, runtime.ts's FlyBrain in C++: the connectome at the
// operating point (params.hpp), driven by the senses and the internal state
// (io.hpp, state.hpp), read out as commands.

#ifndef FLY_BRAIN_HPP
#define FLY_BRAIN_HPP

#include "exact.hpp"

#include <cstdint>
#include <span>
#include <string>
#include <vector>

#include "connectome.hpp"
#include "io.hpp"
#include "sim.hpp"
#include "state.hpp"

namespace fly {

/** What the eyes see, luminance 0 to 1 per facet; empty with the eyes shut. */
struct Light {
  std::span<const float> left;
  std::span<const float> right;
};

struct TickStats {
  /** Simulated and wall-clock time of the tick, ms. */
  double sim_ms = 0;
  double wall_ms = 0;
  /** Spikes fired during the tick, and neurons with any activity at its end. */
  uint64_t spikes = 0;
  uint32_t active = 0;
};

class Brain {
 public:
  /** Longest stretch, ms, simulated with the same input rates and before the readouts are smoothed. */
  static constexpr double kChunkMs = 10;
  /** Longest tick accepted, ms. */
  static constexpr double kMaxTickMs = 1000;

  /** Throws FormatError or std::runtime_error when the connectome lacks a group the brain needs. */
  Brain(const Connectome& connectome, uint32_t seed);

  uint32_t neurons() const { return neurons_; }
  uint32_t connections() const { return connections_; }

  /**
   * Advances the simulation by dt_ms of fly time under these senses; throws
   * std::invalid_argument for a dt outside 0 to kMaxTickMs. The eyes are not
   * wired up yet: light is ignored, as in runtime.ts.
   */
  io::Command tick(double dt_ms, const io::Senses& senses, const Light& light, TickStats& stats);

  /** Smoothed mean rate of each readout group, Hz, in the order of rate_names(). */
  const std::vector<double>& rates() const { return rates_; }
  const std::vector<std::string>& rate_names() const { return rate_names_; }

  const Simulation& sim() const { return sim_; }
  const InternalState& state() const { return state_; }

 private:
  uint32_t neurons_;
  uint32_t connections_;
  io::Wiring wiring_;
  Simulation sim_;
  InternalState state_;
  std::vector<uint32_t> sense_inputs_;
  std::vector<uint32_t> background_inputs_;
  std::vector<double> rates_;
  std::vector<std::string> rate_names_;
  std::vector<uint32_t> counts_;
};

}  // namespace fly

#endif
