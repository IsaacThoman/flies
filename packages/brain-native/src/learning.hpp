// Learning in the mushroom body, learning.ts in C++: dopamine-gated
// plasticity of the Kenyon cell to MBON synapses, compartment by
// compartment. learning.ts and packages/brain/README.md (Learning) say why
// each part is what it is.

#ifndef FLY_LEARNING_HPP
#define FLY_LEARNING_HPP

#include "exact.hpp"

#include <cstdint>
#include <span>
#include <string>
#include <vector>

#include "connectome.hpp"
#include "sim.hpp"

namespace fly::learning {

/** learning.ts's LearningParameters and LEARNING. */
struct Parameters {
  double tau = 2000;
  double window = 14000;
  double depression = 0.3;
  double potentiation = 0.1;
};

/** learning.ts's EMPTY_LAYOUT_HASH: the layout hash of a brain with no learning synapses. */
constexpr uint32_t kEmptyLayoutHash = 2166136261u;

/** learning.ts's memory format (MEMORY) for a brain of this layout and these factors. */
std::vector<uint8_t> write_memory(uint32_t hash, uint32_t count, const std::vector<double>& factors);

/** learning.ts's readMemory: the entries of a memory for a brain of this layout, or std::invalid_argument saying why it isn't one. */
struct MemoryEntries {
  std::vector<uint32_t> index;
  std::vector<double> factor;
};
MemoryEntries read_memory(std::span<const uint8_t> memory, uint32_t hash, uint32_t count);

/** learning.ts's MushroomBody: which KC -> MBON edges learn, the DANs that teach them, and the traces and factors. */
class MushroomBody {
 public:
  MushroomBody(const Connectome& connectome, const Parameters& parameters = {});

  /** The learning edges' indices in the connectome, in order. */
  const std::vector<uint32_t>& edges() const { return edges_; }
  /** Each learning edge's factor on its weight in the wiring. */
  const std::vector<double>& factors() const { return factors_; }
  /** The neurons whose spikes it needs: the KCs, then the DANs. */
  std::vector<uint32_t> watched() const;

  /** learning.ts's layoutHash. */
  uint32_t layout_hash() const { return layout_hash_; }
  /** What it has learned, as bytes to keep. */
  std::vector<uint8_t> memory() const { return write_memory(layout_hash_, static_cast<uint32_t>(edges_.size()), factors_); }
  /** Takes back a memory and sets the simulation's weights to it; throws std::invalid_argument, changing nothing, if it isn't one of this layout. */
  void remember(std::span<const uint8_t> memory, Simulation& sim);

  /** Learns from the spikes the simulation logged since the last call and sets the changed edges' weights in it; now is its time, ms. */
  void learn(Simulation& sim, double now);

 private:
  double dopamine(uint32_t c, double t) const;
  double eligibility(uint32_t k, double t) const;
  void mark(uint32_t p);

  Parameters parameters_;
  uint32_t layout_hash_ = kEmptyLayoutHash;
  uint32_t compartments_ = 0;
  std::vector<uint32_t> kcs_;
  std::vector<uint32_t> dans_;
  std::vector<uint32_t> edges_;
  std::vector<uint32_t> edge_gate_;
  std::vector<uint32_t> gate_ptr_;
  std::vector<uint32_t> gate_compartments_;
  std::vector<uint8_t> gate_has_;
  std::vector<uint32_t> kc_ptr_;
  std::vector<uint8_t> kc_place_;
  std::vector<uint8_t> compartment_place_;
  std::vector<uint32_t> dan_ptr_;
  std::vector<uint32_t> dan_compartment_;
  std::vector<double> dan_amount_;
  std::vector<int32_t> kc_of_;
  std::vector<int32_t> dan_of_;
  std::vector<double> factors_;
  std::vector<double> fired_;
  std::vector<uint32_t> eligible_;
  std::vector<uint8_t> is_eligible_;
  std::vector<double> dopamine_;
  std::vector<double> dopamine_at_;
  std::vector<uint32_t> dirty_;
  std::vector<uint8_t> is_dirty_;
};

}  // namespace fly::learning

#endif
