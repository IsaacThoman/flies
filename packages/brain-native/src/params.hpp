// The operating point, params.ts in C++: how the connectome's synapse counts
// and predicted transmitters become signed connection strengths, and the
// neuron model's constants. Every departure from "synapse count × transmitter
// sign" is here; packages/brain/README.md explains each.

#ifndef FLY_PARAMS_HPP
#define FLY_PARAMS_HPP

#include "exact.hpp"

#include <array>
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

#include "connectome.hpp"
#include "sim.hpp"

namespace fly::params {

/** mV per synapse: Shiu et al. 2024's w_syn for both signs; the slow modulators and unknown transmitters muted. */
constexpr double kExcitatory = 0.275;
constexpr double kInhibitory = 0.275;
constexpr double kModulatory = 0;
constexpr double kUnknown = 0;
/**
 * Factor on the strength of every synapse made by a columnar neuron of the
 * optic lobe (see columnar()): graded, non-spiking relays whose synapses
 * release continuously, which one spike per synapse understates. A spike of
 * the main columnar relay, L2 to Tm1 and Tm2 (124 and 130 synapses, 61 and 62
 * after saturation), brings its target from rest to threshold: 7 mV / (0.177
 * × 0.275 mV × 61.5), where 0.177 is the peak of the membrane's response to a
 * unit step of drive at these time constants.
 */
constexpr double kGraded = 2.3;
/** Fewer cells of a type on a side than this, and each cell pools many columns: not a column's relay. */
constexpr uint32_t kColumnarMinCells = 100;
/**
 * Synaptic saturation: a connection of n synapses acts as
 * saturation × (1 - exp(-n / saturation)) synapses (rounded), so one
 * presynaptic spike can't push its target arbitrarily far.
 */
constexpr double kSaturation = 75;

/** The neuron model at the operating point (params.ts's OPERATING_POINT.neuron). */
SimulationOptions neuron(uint32_t seed);

/** Each neuron's transmitter after params.ts's TRANSMITTER_FIXES, applied in order. */
std::vector<std::string> transmitters(const Connectome& connectome);

/** params.ts's COLUMNAR_CLASSES, /^(L[1-5]|C[23]|T[1-5][a-d]?|Tm\d+[a-zA-Z]*|TmY\d+[a-z]*|Y\d+|Mi\d+)$/, on a cell type. */
bool columnar_class(std::string_view type);

/**
 * Optic lobe intrinsic neurons of a columnar type, 1 per neuron: one of the
 * columnar classes (Fischbach and Dittrich 1989) with at least
 * kColumnarMinCells cells on its side, the column-by-column relays from the
 * lamina to the lobula and lobula plate. params.ts says what is left out and
 * why.
 */
std::vector<uint8_t> columnar(const Connectome& connectome);

/** mV per synapse for a transmitter. */
float transmitter_gain(const std::string& transmitter);

/** Synapse count after saturation, for every u16 count. */
std::array<uint16_t, 65536> saturated_counts();

/** The Simulation's wiring and weights at the operating point. */
Simulation build(const Connectome& connectome, uint32_t seed);

}  // namespace fly::params

#endif
