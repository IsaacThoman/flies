// What the brain is wired to, io.ts in C++: which neurons each sense drives,
// which neurons each command is read from, and the arithmetic between firing
// rates and the body's 0..1 values. io.ts and packages/brain/README.md say why
// each group is what it is.

#ifndef FLY_IO_HPP
#define FLY_IO_HPP

#include "exact.hpp"

#include <cstdint>
#include <string>
#include <vector>

#include "connectome.hpp"

namespace fly::io {

/** The senses that are one intensity each (types.ts's BrainSenses less light). */
enum Sense : uint8_t { kLoomLeft, kLoomRight, kTouch, kBumpLeft, kBumpRight, kWind, kSweet, kGrounded, kSenseCount };

struct Senses {
  double loom_left = 0, loom_right = 0, touch = 0, bump_left = 0, bump_right = 0, wind = 0, sweet = 0;
  bool grounded = false;
};

struct Command {
  double walk = 0, turn = 0, back = 0, escape = 0, wings = 0, groom = 0, feed = 0;
};

enum Side : uint8_t { kLeft, kRight };

struct InputSpec {
  /** Name of the Poisson input in the simulation. */
  std::string name;
  std::string description;
  NeuronQuery select;
  /** Firing rate per neuron, Hz, at full strength. */
  double max_rate;
  /**
   * For one side of a left/right pair: the input group of the other side. The
   * side whose neurons have more output synapses has its rate lowered so that,
   * at full strength, both deliver the same synapse-spikes per second.
   */
  std::string balance;
  /** The sense that sets its rate (for a sense), or the eye (for the background). */
  Sense sense;
  Side side;
};

struct ReadoutSpec {
  /** Name in the tick's rates. */
  std::string name;
  std::string description;
  NeuronQuery select;
  /** Time constant of the exponential smoothing of the group's mean rate, ms. */
  double tau;
};

/** io.ts's SENSES, BACKGROUND and READOUTS, in their order. */
std::vector<InputSpec> senses();
std::vector<InputSpec> background();
std::vector<ReadoutSpec> readouts();

/** decode() reads the readouts by these positions in readouts(). */
enum Readout : uint8_t { kDNg100, kDNa02Left, kDNa02Right, kMDN, kDNp01, kFlight, kDNg12, kMN9 };

struct Group {
  InputSpec spec;
  std::vector<uint32_t> neurons;
  double max_rate;
};

struct ReadoutGroup {
  ReadoutSpec spec;
  std::vector<uint32_t> neurons;
};

struct Wiring {
  std::vector<Group> senses;
  std::vector<Group> background;
  std::vector<ReadoutGroup> readouts;
};

/** Resolves every group against a connectome; throws std::runtime_error if a group is empty or an input is also read. */
Wiring wire(const Connectome& connectome);

/** Each sense's intensity, 0..1 (grounded as 0 or 1). */
double intensity(const Senses& senses, Sense sense);

/** Commands from the smoothed readout rates, Hz. */
Command decode(const std::vector<double>& rates);

/** Exponential smoothing of a rate toward sample over dt ms with time constant tau ms. */
double smooth(double previous, double sample, double dt, double tau);

}  // namespace fly::io

#endif
