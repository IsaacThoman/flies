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
enum Sense : uint8_t { kLoomLeft, kLoomRight, kTouch, kBumpLeft, kBumpRight, kWind, kSweet, kGrounded, kMaleTaste, kWingbeat, kBitter, kWater, kSenseCount };

/** The internal state that comes with the senses (types.ts's STATE_KEYS), 0 to 1 each. */
enum StateKey : uint8_t { kClockMorning, kClockEvening, kClockSleep, kSleepPressure, kSleepDepth, kStateCount };

struct Senses {
  double loom_left = 0, loom_right = 0, touch = 0, bump_left = 0, bump_right = 0, wind = 0, sweet = 0;
  bool grounded = false;
  double male_taste = 0;
  /** Internal state, not a sense (types.ts's BrainSenses.hunger): 0 just fed to 1 starved; anything not a number counts as 1. */
  double hunger = 1;
  double wingbeat = 0;
  /** In StateKey's order; 0, left out. */
  double state[kStateCount] = {};
  double bitter = 0, water = 0;
  /** Internal state, not a sense (types.ts's BrainSenses.thirst): 0 just drunk to 1 thirsty; anything not a number counts as 1. */
  double thirst = 1;
  /** Odor strengths in ODORANTS order, left then right; absent is zero. */
  double odor_left[5] = {}, odor_right[5] = {};
};

struct Command {
  double walk = 0, turn = 0, back = 0, escape = 0, wings = 0, groom = 0, feed = 0, sing = 0;
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
  /** When not empty, only the neurons among these root IDs (io.ts's Selection.rootIds). */
  std::vector<uint32_t> root_ids = {};
  /** Added to the simulation after the eyes (io.ts's InputSpec.afterEyes). */
  bool after_eyes = false;
  /** Mechanosensory: reaches the brain at less than its strength while the fly sleeps (kSleepGate). */
  bool gated = false;
};

/** io.ts's SLEEP_GATE: how much of a mechanosensory sense's strength is lost at full sleep depth. */
constexpr double kSleepGate = 0.4;

/** io.ts's SLEEP_EYES: how much of the eyes' input is lost at full sleepiness. */
constexpr double kSleepEyes = 0.3;

/** An input that stands for internal state the connectome can't supply (io.ts's StateSpec). */
struct StateSpec {
  std::string name;
  std::string description;
  NeuronQuery select;
  double max_rate;
  StateKey state;
};

struct ExcitabilityGroup { StateKey state; double mv; std::vector<uint32_t> neurons; };

bool dfb_sleep(std::string_view type);

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
std::vector<StateSpec> state_inputs();
std::vector<ReadoutSpec> readouts();

/** decode() reads the readouts by these positions in readouts(). */
enum Readout : uint8_t { kDNg100, kDNa02Left, kDNa02Right, kMDN, kDNp01, kFlight, kDNg12, kMN9, kPIP10 };

struct Group {
  InputSpec spec;
  std::vector<uint32_t> neurons;
  double max_rate;
};

struct StateGroup {
  StateSpec spec;
  std::vector<uint32_t> neurons;
};

struct ReadoutGroup {
  ReadoutSpec spec;
  std::vector<uint32_t> neurons;
};

struct Wiring {
  std::vector<Group> senses;
  std::vector<Group> background;
  /** The internal-state inputs this connectome has neurons for. */
  std::vector<StateGroup> state;
  std::vector<ExcitabilityGroup> excitability;
  std::vector<ReadoutGroup> readouts;
};

/** Resolves every group against a connectome; throws std::runtime_error if a group is empty or an input is also read. */
Wiring wire(const Connectome& connectome);

/** Each sense's intensity, 0..1 (grounded as 0 or 1). */
double intensity(const Senses& senses, Sense sense);

/** How hungry the senses say it is, 0..1: 1 (as it was before hunger) when not a number (io.ts's hungerOf). */
double hunger_of(const Senses& senses);

/** How thirsty the senses say it is, 0..1: 1 (as it was before thirst) when not a number (io.ts's thirstOf). */
double thirst_of(const Senses& senses);

/** The water taste neurons' output gain at this thirst (io.ts's waterOutputGain and THIRST, which say why). */
double water_output_gain(double thirst);

/** An internal state's value, 0..1. */
double state_of(const Senses& senses, StateKey key);

/** What a mechanosensory sense keeps of its strength at this sleep depth. */
double sleep_gate(const Senses& senses);

/** Commands from the smoothed readout rates, Hz. */
Command decode(const std::vector<double>& rates);

/** Exponential smoothing of a rate toward sample over dt ms with time constant tau ms. */
double smooth(double previous, double sample, double dt, double tau);

}  // namespace fly::io

#endif
