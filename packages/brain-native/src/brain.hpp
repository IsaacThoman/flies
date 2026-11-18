// The running brain, runtime.ts's FlyBrain in C++: the connectome at the
// operating point (params.hpp), driven by the senses and the internal state
// (io.hpp, state.hpp), read out as commands.

#ifndef FLY_BRAIN_HPP
#define FLY_BRAIN_HPP

#include "exact.hpp"

#include <array>
#include <cstdint>
#include <optional>
#include <span>
#include <string>
#include <vector>

#include "connectome.hpp"
#include "eyes.hpp"
#include "io.hpp"
#include "modulation.hpp"
#include "learning.hpp"
#include "sim.hpp"
#include "state.hpp"
#include "thermo.hpp"
#include "vision.hpp"

namespace fly {

/**
 * What the eyes see (types.ts's BrainSenses.light): luminance 0 to 1 per
 * facet, in the order of the eyes' facets. Not open: the eyes are shut. Open,
 * each eye needs its facets' worth; an eye left out, or a wrong length, is
 * refused as runtime.ts refuses it.
 */
struct Light {
  bool open = false;
  std::optional<std::span<const float>> left;
  std::optional<std::span<const float>> right;
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

  /**
   * Throws FormatError or std::runtime_error when the connectome lacks a
   * group the brain needs. The eyes' columns are eye-columns.ts's unless the
   * tests give their own (runtime.ts's eyeColumns option).
   */
  Brain(const Connectome& connectome, uint32_t seed, const eyes::Columns& columns = eyes::kEyeColumns);

  uint32_t neurons() const { return neurons_; }
  uint32_t connections() const { return connections_; }

  /**
   * Advances the simulation by dt_ms of fly time under these senses; throws
   * std::invalid_argument for a dt outside 0 to kMaxTickMs or light that
   * doesn't fit the eyes, before anything moves. Without eyes, light is
   * ignored.
   */
  io::Command tick(double dt_ms, const io::Senses& senses, const Light& light, TickStats& stats);

  /** Smoothed mean rate of each readout group, Hz, in the order of rate_names(). */
  const std::vector<double>& rates() const { return rates_; }
  const std::vector<std::string>& rate_names() const { return rate_names_; }

  /** The eyes, when this connectome has them. */
  const std::optional<eyes::Eyes>& eyes() const { return eyes_; }
  /** Facets of an eye; 0 without eyes. */
  uint32_t facets(io::Side side) const { return eyes_ ? (*eyes_)[side].facets() : 0; }
  /** Each eye's input stage; empty without eyes. */
  const std::vector<vision::Retina>& retinas() const { return retinas_; }

  const Simulation& sim() const { return sim_; }
  const InternalState& state() const { return state_; }
  /** What that antenna's thermoreceptors have adapted to, °C; NaN while it feels no temperature. */
  double adapted(io::Side side) const { return thermoreceptors_.adapted(side); }
  const Modulation& modulation() const { return modulation_; }
  /** What the mushroom body has learned (runtime.ts's learning); empty when the connectome has no Kenyon cell. */
  const std::optional<learning::MushroomBody>& learning() const { return learning_; }
  /** runtime.ts's memory and remember: what the mushroom body has learned, as bytes; remember throws std::invalid_argument, changing nothing, for bytes it can't take. */
  std::vector<uint8_t> memory() const;
  void remember(std::span<const uint8_t> memory);

 private:
  void modulate();
  uint32_t neurons_;
  uint32_t connections_;
  io::Wiring wiring_;
  Simulation sim_;
  InternalState state_;
  Modulation modulation_;
  std::vector<uint32_t> sense_inputs_;
  // For each group of touch regions (by its place in wiring_.senses): each neuron's rate, and each region's last set.
  struct Regional {
    size_t group;
    std::vector<double> rates;
    std::vector<double> felt;
  };
  std::vector<Regional> regional_;
  void touch(Regional& regional, const io::Senses& senses);
  std::vector<uint32_t> background_inputs_;
  // The water neurons' output gain, which thirst sets (io::water_output_gain).
  uint32_t water_gain_ = 0;
  std::vector<std::pair<uint32_t, uint32_t>> release_;
  uint32_t modulated_ = 0;
  std::vector<uint32_t> state_inputs_;
  // Each antenna's heating and cooling cells, in wiring_.thermo's order, and what they have adapted to.
  std::vector<uint32_t> thermo_inputs_;
  thermo::Thermoreceptors thermoreceptors_;
  std::vector<uint32_t> reinforcement_inputs_;
  std::optional<learning::MushroomBody> learning_;
  std::vector<double> rates_;
  std::vector<std::string> rate_names_;
  std::vector<uint32_t> counts_;
  std::optional<eyes::Eyes> eyes_;
  // Indexed by io::Side, as are their rated inputs.
  std::vector<vision::Retina> retinas_;
  std::array<uint32_t, 2> eye_inputs_{};
  std::array<uint32_t, 2> withdrawn_inputs_{};
  /** The eyes' gain last set (io::kSleepEyes), and each eye's rates and L1's withdrawals scaled by it. */
  double eye_gain_ = 1;
  std::array<std::vector<double>, 2> gained_;
  std::array<std::vector<double>, 2> gained_withdrawals_;
  // The regions, which follow the readouts in rates(): each one's size and its spikes in a chunk.
  std::vector<double> region_sizes_;
  std::vector<uint32_t> region_counts_;
  // The vision.<stage> readouts, which follow the regions in rates(): each one's size.
  std::vector<double> vision_sizes_;
};

}  // namespace fly

#endif
