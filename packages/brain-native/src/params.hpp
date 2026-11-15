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
 * Synaptic saturation: a connection of n synapses acts as
 * saturation × (1 - exp(-n / saturation)) synapses (rounded), so one
 * presynaptic spike can't push its target arbitrarily far.
 */
constexpr double kSaturation = 75;

/** The neuron model at the operating point (params.ts's OPERATING_POINT.neuron). */
SimulationOptions neuron(uint32_t seed);

/** Each neuron's transmitter after params.ts's TRANSMITTER_FIXES, applied in order. */
std::vector<std::string> transmitters(const Connectome& connectome);

/** mV per synapse for a transmitter. */
float transmitter_gain(const std::string& transmitter);

/** Synapse count after saturation, for every u16 count. */
std::array<uint16_t, 65536> saturated_counts();

/** The Simulation's wiring and weights at the operating point. */
Simulation build(const Connectome& connectome, uint32_t seed);

}  // namespace fly::params

#endif
