// What the brain is wired to, io.ts in C++: which neurons each sense drives,
// which neurons each command is read from, and the arithmetic between firing
// rates and the body's 0..1 values. io.ts and packages/brain/README.md say why
// each group is what it is.

#ifndef FLY_IO_HPP
#define FLY_IO_HPP

#include "exact.hpp"

#include <cstdint>
#include <limits>
#include <string>
#include <vector>

#include "connectome.hpp"
#include "fly_brain.h"

namespace fly::io {

/** The senses that are one intensity each (types.ts's BrainSenses less light), the touch senses that say where it lands last (io.ts's TOUCH_SENSES). */
enum Sense : uint8_t {
  kLoomLeft,
  kLoomRight,
  kTouch,
  kBumpLeft,
  kBumpRight,
  kWind,
  kSweet,
  kGrounded,
  kMaleTaste,
  kWingbeat,
  kBitter,
  kWater,
  kLegsLeft,
  kLegsRight,
  kTouchEyeLeft,
  kTouchEyeRight,
  kTouchFrontLeft,
  kTouchFrontRight,
  kTouchOcciputLeft,
  kTouchOcciputRight,
  kTouchMouthpartsLeft,
  kTouchMouthpartsRight,
  kTouchNotum,
  kTouchWings,
  kTouchAbdomen,
  kTouchLegs,
  kSenseCount
};
constexpr int kTouchParts = kSenseCount - kTouchEyeLeft;
static_assert(kTouchParts == FLY_TOUCH_PARTS, "fly_brain.h's touch_parts are the touch senses");

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
  /** The air's temperature at each antenna's arista, °C (types.ts's BrainSenses.temperatureLeft and Right); NaN, left out: no input. */
  double temperature_left = std::numeric_limits<double>::quiet_NaN(), temperature_right = std::numeric_limits<double>::quiet_NaN();
  /** Touch where it lands, from kTouchEyeLeft on in Sense's order; 0, left out. */
  double touch_parts[kTouchParts] = {};
  double legs_left = 0, legs_right = 0;
  /** Odor strengths in ODORANTS order, left then right; absent is zero. */
  double odor_left[5] = {}, odor_right[5] = {};
};

struct Command {
  double walk = 0, turn = 0, back = 0, escape = 0, wings = 0, groom = 0, feed = 0, sing = 0, lean = 0;
};

enum Side : uint8_t { kLeft, kRight };

/** One part of the body's mechanosensory bristles, touched as its sense says (io.ts's TouchRegion). */
struct TouchRegion {
  Sense sense;
  /** Its sense's name in types.ts's BrainSenses. */
  std::string name;
  std::string description;
  NeuronQuery select;
};

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
  /** When not empty, the group is these regions' neurons, region after region, each its own sense (io.ts's SenseSpec.regions). */
  std::vector<TouchRegion> regions = {};
  /** Added after every other input (io.ts's InputSpec.last). */
  bool last = false;
  /** The intensity at which these neurons reach their full rate (io.ts's SenseSpec.full); 0 for none: linear. */
  double full = 0;
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

/** One antenna's heating or cooling cells, whose rates thermo.hpp works out from the temperature there (io.ts's ThermoSpec). */
struct ThermoSpec {
  std::string name;
  std::string description;
  NeuronQuery select;
  Side side;
  bool heating;
};
struct ExcitabilityGroup { StateKey state; double mv; std::vector<uint32_t> neurons; };

/** Resting activity a neuron has in the fly, measured (io.ts's RestingSpec): a rate it fires at whatever else happens. */
struct RestingSpec {
  std::string name;
  std::string description;
  NeuronQuery select;
  double rate;
};

bool dfb_sleep(std::string_view type);

struct ReadoutSpec {
  /** Name in the tick's rates. */
  std::string name;
  std::string description;
  NeuronQuery select;
  /** Time constant of the exponential smoothing of the group's mean rate, ms. */
  double tau;
};

/** io.ts's SENSES, BACKGROUND, STATE_INPUTS, REINFORCEMENT and READOUTS, in their order. */
std::vector<InputSpec> senses();
std::vector<InputSpec> background();
std::vector<StateSpec> state_inputs();
/** io.ts's THERMO_INPUTS, in its order. */
std::vector<ThermoSpec> thermo_inputs();
/** io.ts's REINFORCEMENT. */
std::vector<InputSpec> reinforcement();
std::vector<RestingSpec> resting();
std::vector<ReadoutSpec> readouts();

/** decode() reads the readouts by these positions in readouts(). */
enum Readout : uint8_t { kDNg100, kDNa02Left, kDNa02Right, kMDN, kDNp01, kFlight, kDNg12, kMN9, kPIP10, kDNp02, kDNp11 };

struct Group {
  InputSpec spec;
  std::vector<uint32_t> neurons;
  double max_rate;
  /** With regions, where each region's neurons end in `neurons` (they start where the one before ends). */
  std::vector<uint32_t> ends = {};
};

struct StateGroup {
  StateSpec spec;
  std::vector<uint32_t> neurons;
};

struct ThermoGroup {
  ThermoSpec spec;
  std::vector<uint32_t> neurons;
};

struct RestingGroup {
  RestingSpec spec;
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
  /** The thermoreceptor inputs this connectome has neurons for. */
  std::vector<ThermoGroup> thermo;
  std::vector<ExcitabilityGroup> excitability;
  /** The reinforcement stand-ins this connectome has neurons for. */
  std::vector<Group> reinforcement;
  /** The measured resting activity this connectome has neurons for. */
  std::vector<RestingGroup> resting;
  std::vector<ReadoutGroup> readouts;
};

/** Resolves every group against a connectome; throws std::runtime_error if a group is empty or an input is also read. */
Wiring wire(const Connectome& connectome);

/** Each sense's intensity, 0..1 (grounded as 0 or 1). */
double intensity(const Senses& senses, Sense sense);

/** Region r of a group of regions: its rate, Hz per neuron (io.ts's regionRate). */
double region_rate(const Group& group, size_t r, const Senses& senses);

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
