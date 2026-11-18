#include "io.hpp"
#include "params.hpp"

#include <cmath>
#include <initializer_list>
#include <stdexcept>
#include <string_view>
#include <unordered_set>

#include "fdlibm.hpp"
#include "leg_sensors.hpp"

namespace fly::io {

namespace {

using Condition = std::function<bool(std::string_view)>;

Condition is(std::string value) {
  return [value = std::move(value)](std::string_view s) { return s == value; };
}
Condition one_of(std::initializer_list<const char*> values) {
  std::vector<std::string> list(values.begin(), values.end());
  return [list = std::move(list)](std::string_view s) {
    for (const std::string& each : list) {
      if (s == each) return true;
    }
    return false;
  };
}
Condition starts_with(std::string prefix) {
  return [prefix = std::move(prefix)](std::string_view s) { return s.substr(0, prefix.size()) == prefix; };
}

NeuronQuery query(std::initializer_list<std::pair<Category, Condition>> conditions) {
  NeuronQuery q;
  for (const auto& [column, condition] : conditions) q[column] = condition;
  return q;
}

/** One side's part of a selection. */
NeuronQuery sided(NeuronQuery q, Side side) {
  q[kSide] = is(side == kLeft ? "left" : "right");
  return q;
}

const NeuronQuery kLooming = query({{kType, one_of({"LPLC2", "LC4"})}});
// Pushing the antenna deflects it and holds it there. The Johnston's organ
// neurons that answer a sustained push or pull are zones C and E (Kamikouchi et
// al. 2009; Yorozu et al. 2009; Hampel et al. 2020), and they drive antennal
// grooming (Hampel et al. 2015, 2020). A and B answer sound and vibration; F
// drives grooming too, but answers neither a push nor vibration (what it senses
// is unknown, Hampel et al. 2020).
const NeuronQuery kAntenna = query({{kSuperClass, is("cb_sensory")},
                                    {kType, [](std::string_view s) { return s.size() > 3 && s.starts_with("JO-") && (s[3] == 'C' || s[3] == 'E'); }}});

// The mouth's taste neurons, by what they are: every type of the labellum,
// its taste pegs and the pharynx matched to that taste's receptors (io.ts's
// SWEET_TYPES, BITTER_TYPES and WATER_TYPES say whose matches and why).
NeuronQuery mouth_taste(Condition types) { return query({{kSuperClass, is("cb_sensory")}, {kClass, is("gustatory")}, {kType, std::move(types)}}); }
constexpr const char* kSweetDescription = "The mouth's sugar-sensing taste neurons: LB3b, LB3c, dorsal_tpGRN, PhG1a, PhG1b, PhG1c";
constexpr const char* kBitterDescription = "The mouth's bitter-sensing taste neurons: LB1a, LB1b, LB1c, LB1d";
constexpr const char* kWaterDescription = "The mouth's water-sensing taste neurons: LB3a, PhG3, PhG4";

// The front legs' taste neurons that answer a male's cuticle: LgLG1a (ppk23
// M cells) and LgAG1 (Gr32a/Gr33a) of the front legs, by root ID (io.ts's
// FORELEG_MALE_TASTE says why).
const std::vector<uint32_t> kForelegMaleTaste = {
    807958, 808071, 808278, 808369, 808379, 808524, 809798, 810164, 811797, 812809, 813636, 814020, 814544, 814710, 815091, 815110, 816273, 816447, 816927,
    816972, 817352, 817570, 818574, 819815, 820449, 821805, 823278, 823555, 824934, 905725, 907867, 911569, 912149, 933097,
    91673,  92777,  94281,  94719,  94995,  95900,  105964, 108436, 111872, 816710,
};

// The legs' campaniform sensilla, and the rate the wings' and halteres' fire
// at full flight power (io.ts's LEG_CAMPANIFORM and WINGBEAT_RATE say why).
constexpr const char* kLegCampaniform = "SNpp53";
constexpr double kWingbeatRate = 100;

// The legs' proprioceptors, driven by how fast that side's legs step (io.ts's
// LEG_RATE and LEG_STEPPING, and leg-sensors.ts, say why).
constexpr double kLegRate = 50;
constexpr double kLegStepping = 0.05;
struct LegOrgan {
  const char* name;
  const char* description;
  Condition types;
  const std::vector<uint32_t>& left;
  const std::vector<uint32_t>& right;
  double full;
};

// Touch lands somewhere: each part of the body's bristles is its own sense
// (io.ts's HEAD_TOUCH and BODY_TOUCH say why each is what it is).
std::vector<TouchRegion> head_touch() {
  struct Part {
    Sense left, right;
    const char* name;
    const char* description;
    std::initializer_list<const char*> types;
  };
  const Part parts[] = {
      {kTouchEyeLeft, kTouchEyeRight, "Eye", "the compound eye's interommatidial bristles (BM_InOm)", {"BM_InOm"}},
      {kTouchFrontLeft, kTouchFrontRight, "Front",
       "the bristles that enter by the antennal nerve (BM): the antenna's, and the front and top of the head's between the eyes", {"BM"}},
      {kTouchOcciputLeft, kTouchOcciputRight, "Occiput", "the back of the head's: the occiput's and behind the eye (BM_vOcci_vPoOr, BM_Vt_PoOc)",
       {"BM_vOcci_vPoOr", "BM_Vt_PoOc"}},
      {kTouchMouthpartsLeft, kTouchMouthpartsRight, "Mouthparts",
       "under the head: the proboscis', maxillary palps', vibrissae's and haustellum's (BM_Taste, BM_MaPa, BM_Vib, BM_Hau)",
       {"BM_Taste", "BM_MaPa", "BM_Vib", "BM_Hau"}},
  };
  std::vector<TouchRegion> out;
  for (const Part& part : parts) {
    for (Side side : {kLeft, kRight}) {
      out.push_back({side == kLeft ? part.left : part.right, std::string("touch") + part.name + (side == kLeft ? "Left" : "Right"),
                     std::string(side == kLeft ? "Left: " : "Right: ") + part.description,
                     sided(query({{kSuperClass, is("cb_sensory")}, {kType, one_of(part.types)}}), side)});
    }
  }
  return out;
}

bool notum_type(std::string_view t) { return t == "SNta02" || t == "SNta05" || t == "SNta10" || t == "SNta12" || t == "SNta13" || t == "SNta33"; }
bool wing_type(std::string_view t) {
  return t == "SNta04" || t == "SNta06" || t == "SNta07" || t == "SNta11" || t == "SNta14" || t == "SNta18" || t == "SNta03";
}

std::vector<TouchRegion> body_touch() {
  return {
      {kTouchNotum, "touchNotum", "The notum's bristles (SNta02, SNta05, SNta10, SNta12, SNta13, SNta33)", query({{kSuperClass, is("vnc_sensory")}, {kType, notum_type}})},
      {kTouchWings, "touchWings", "The wings' margins' and the halteres' bristles (SNta04, SNta06, SNta07, SNta11, SNta14, SNta18, SNta03)",
       query({{kSuperClass, is("vnc_sensory")}, {kType, wing_type}})},
      {kTouchAbdomen, "touchAbdomen", "The abdominal nerves' sensory neurons of no known modality, its bristles among them",
       query({{kSuperClass, one_of({"vnc_sensory", "sensory_ascending"})}, {kClass, is("unknown_sensory")}, {kSubClass, is("abdomen")}})},
      {kTouchLegs, "touchLegs", "The legs' tactile neurons: every other tactile neuron of the cord",
       query({{kSuperClass, is("vnc_sensory")},
              {kClass, is("mechanosensory_tactile")},
              {kType, [](std::string_view t) { return !notum_type(t) && !wing_type(t); }}})},
  };
}

// A bristle neuron's mean rate over half a second of deflection (io.ts's BRISTLE_RATE).
constexpr double kBristleRate = 50;

/** A group of regions: their neurons, region after region (io.ts's regional: an empty region is left empty); throws if a region's neuron is outside the group or in another region too. */
Group regional(const Connectome& c, InputSpec spec) {
  const std::vector<uint32_t> group = c.find(spec.select);
  const std::unordered_set<uint32_t> within(group.begin(), group.end());
  std::unordered_set<uint32_t> seen;
  std::vector<uint32_t> neurons;
  std::vector<uint32_t> ends;
  for (const TouchRegion& region : spec.regions) {
    const std::string& name = region.name;
    for (uint32_t i : c.find(region.select)) {
      if (within.count(i) == 0) throw std::runtime_error("Neuron " + std::to_string(i) + " of \"" + name + "\" is outside \"" + spec.name + "\"");
      if (!seen.insert(i).second) throw std::runtime_error("Neuron " + std::to_string(i) + " of \"" + name + "\" is in another region of \"" + spec.name + "\" too");
      neurons.push_back(i);
    }
    ends.push_back(static_cast<uint32_t>(neurons.size()));
  }
  const double rate = spec.max_rate;
  return {std::move(spec), std::move(neurons), rate, std::move(ends)};
}

uint64_t output_synapses(const Connectome& c, const std::vector<uint32_t>& neurons) {
  uint64_t total = 0;
  for (uint32_t i : neurons) {
    for (uint32_t e = c.ptr(i); e < c.ptr(i + 1); e++) total += c.count(e);
  }
  return total;
}

/** The rate factor for one side of a balanced pair: below 1 for the side with more output synapses. */
double balance_factor(const Connectome& c, const std::vector<uint32_t>& mine, const std::vector<uint32_t>& theirs) {
  const auto a = static_cast<double>(output_synapses(c, mine));
  const auto b = static_cast<double>(output_synapses(c, theirs));
  return a > b && a > 0 ? b / a : 1;
}

}  // namespace

std::vector<InputSpec> senses() {
  std::vector<InputSpec> out = {
      {"loomLeft", "Looming detectors (LPLC2, LC4) of the left eye", sided(kLooming, kLeft), 100, "", kLoomLeft, kLeft},
      {"loomRight", "Looming detectors (LPLC2, LC4) of the right eye", sided(kLooming, kRight), 100, "", kLoomRight, kLeft},
      {"touch head", "Mechanosensory bristle neurons of the head (BM types), by part and side", query({{kSuperClass, is("cb_sensory")}, {kType, starts_with("BM")}}),
       kBristleRate, "", kTouch, kLeft, {}, false, true, head_touch()},
      {"touch body", "Mechanosensory bristle neurons of the notum, wings and halteres, abdomen and legs",
       query({{kSuperClass, one_of({"vnc_sensory", "sensory_ascending"})}, {kClass, one_of({"mechanosensory_tactile", "unknown_sensory"})}}), kBristleRate, "",
       kTouch, kLeft, {}, false, true, body_touch()},
      {"bumpLeft", "Displacement-sensitive Johnston's organ neurons (zones C and E) of the left antenna", sided(kAntenna, kLeft), 100, "", kBumpLeft, kLeft, {}, false, true},
      {"bumpRight", "Displacement-sensitive Johnston's organ neurons (zones C and E) of the right antenna", sided(kAntenna, kRight), 100, "", kBumpRight,
       kLeft, {}, false, true},
      {"wind", "Wind- and gravity-sensitive Johnston's organ neurons of both antennae", query({{kSuperClass, is("cb_sensory")}, {kSubClass, is("wind_gravity")}}),
       100, "", kWind, kLeft, {}, false, true},
      {"sweet", kSweetDescription, mouth_taste(one_of({"LB3b", "LB3c", "dorsal_tpGRN", "PhG1a", "PhG1b", "PhG1c"})), 100, "", kSweet, kLeft},
      {"grounded", "Campaniform sensilla (load sensors) of the legs (SNpp53), firing tonically while standing",
       query({{kSubClass, is("campaniform_sensilla")}, {kType, is(kLegCampaniform)}}), 20, "", kGrounded, kLeft, {}, false, true},
      {"maleTaste", "Front legs' taste neurons for a male's pheromones: LgLG1a (ppk23 M cells) and LgAG1 (Gr32a/Gr33a)",
       query({{kType, one_of({"LgLG1a", "LgAG1"})}}), 50, "", kMaleTaste, kLeft, kForelegMaleTaste, true},
      {"wingbeat", "Campaniform sensilla (strain sensors) of the wings and halteres, firing with each stroke",
       query({{kSuperClass, one_of({"vnc_sensory", "sensory_ascending"})},
              {kSubClass, is("campaniform_sensilla")},
              {kType, [](std::string_view t) { return t != kLegCampaniform; }}}),
       kWingbeatRate, "", kWingbeat, kLeft, {}, true},
      {"bitter", kBitterDescription, mouth_taste(one_of({"LB1a", "LB1b", "LB1c", "LB1d"})), 100, "", kBitter, kLeft, {}, true},
      {"water", kWaterDescription, mouth_taste(one_of({"LB3a", "PhG3", "PhG4"})), 100, "", kWater, kLeft, {}, true},
  };
  const LegOrgan organs[] = {
      {"claw", "Femoral chordotonal organ claw neurons (tibia position)", one_of({"SNpp50", "SNpp51"}), kClawLeft, kClawRight, kLegStepping},
      {"club", "Femoral chordotonal organ club neurons (tibia movement and vibration)", one_of({"SNpp40", "SNpp47", "SNpp56", "SNpp57", "SNpp60"}),
       kClubLeft, kClubRight, 0},
      {"hair plates", "Hair plates (joint limits)", one_of({"SNpp45", "SNpp52"}), kHairPlateLeft, kHairPlateRight, kLegStepping},
  };
  for (const LegOrgan& organ : organs) {
    for (Side side : {kLeft, kRight}) {
      const std::string name = side == kLeft ? "left" : "right";
      InputSpec spec{std::string(organ.name) + " " + name, std::string(organ.description) + " of the " + name + " legs", query({{kType, organ.types}}),
                     kLegRate, "", side == kLeft ? kLegsLeft : kLegsRight, kLeft, side == kLeft ? organ.left : organ.right, false, true};
      spec.last = true;
      spec.full = organ.full;
      out.push_back(std::move(spec));
    }
  }
  return out;
}

// Spontaneous input, always on: the visual scene a fly at rest still sees.
// Every visual projection neuron except the looming detectors (nothing is
// looming at rest) fires at a low background rate, set per eye by the
// internal state (see state.hpp). The two eyes are balanced (see
// InputSpec::balance): the right eye's neurons have 19% more output synapses.
std::vector<InputSpec> background() {
  std::vector<InputSpec> out;
  for (Side side : {kLeft, kRight}) {
    const std::string name = side == kLeft ? "left" : "right";
    const std::string other = side == kLeft ? "right" : "left";
    out.push_back({"background " + name, "Visual projection neurons of the " + name + " eye except LPLC2 and LC4",
                   query({{kSuperClass, is("visual_projection")}, {kSide, is(name)}, {kType, [](std::string_view t) { return t != "LPLC2" && t != "LC4"; }}}),
                   6, "background " + other, kSenseCount, side});
  }
  return out;
}

// Internal state the connectome can't supply, fed to the real neurons that
// carry it in the fly (io.ts's STATE_INPUTS says why each).
bool dfb_sleep(std::string_view t) { return (t.starts_with("FB6") || t.starts_with("FB7")) && !params::dfb_dopaminergic(t); }

std::vector<StateSpec> state_inputs() {
  return {
      {"clock morning", "The morning oscillator's clock neurons, s-LNv and l-LNv (the M cells)", query({{kType, one_of({"s-LNv", "l-LNv"})}}), 5,
       kClockMorning},
      {"clock evening", "The evening oscillator's clock neurons, LNd and the 5th s-LNv (the E cells)",
       query({{kType, one_of({"LNd_b", "LNd_c", "5thsLNv_LNd6"})}}), 5, kClockEvening},
      {"sleep pressure", "The R5 ring neurons (ER5)",
       query({{kType, [](std::string_view t) { return t == "ER5"; }}}), 10, kSleepPressure},
  };
}

// The aristae's heating and cooling cells (io.ts's THERMO_INPUTS says why these).
std::vector<ThermoSpec> thermo_inputs() {
  std::vector<ThermoSpec> out;
  for (Side side : {kLeft, kRight}) {
    const std::string name = side == kLeft ? "left" : "right";
    out.push_back({"heating " + name, "Heating cells (Gr28b.d) of the " + name + " arista, TRN_VP2",
                   query({{kSuperClass, is("cb_sensory")}, {kClass, is("thermosensory")}, {kType, is("TRN_VP2")}, {kSide, is(name)}}), side, true});
    out.push_back({"cooling " + name, "Cooling cells (Ir21a) of the " + name + " arista, TRN_VP3a and TRN_VP3b",
                   query({{kSuperClass, is("cb_sensory")}, {kClass, is("thermosensory")}, {kType, one_of({"TRN_VP3a", "TRN_VP3b"})}, {kSide, is(name)}}), side,
                   false});
  }
  return out;
}

// Spontaneous firing measured in the fly, for sensory neurons whose resting
// rate is known (io.ts's RESTING says where each is from).
std::vector<RestingSpec> resting() {
  return {
      {"resting taste", "The labellum's sugar, bitter and water taste neurons (LB3b, LB3c, LB1a to LB1d, LB3a), firing spontaneously",
       mouth_taste(one_of({"LB3b", "LB3c", "LB1a", "LB1b", "LB1c", "LB1d", "LB3a"})), 1},
  };
}

std::vector<ReadoutSpec> readouts() {
  return {
      {"DNg100", "BDN2, forward walking", query({{kType, is("DNg100")}}), 150},
      {"DNa02 left", "Steering, left", query({{kType, is("DNa02")}, {kSide, is("left")}}), 150},
      {"DNa02 right", "Steering, right", query({{kType, is("DNa02")}, {kSide, is("right")}}), 150},
      {"MDN", "Moonwalker, backward walking", query({{kType, is("MDN")}}), 150},
      {"DNp01", "Giant fiber, escape take-off", query({{kType, is("DNp01")}}), 40},
      {"flight", "Indirect flight power muscle motor neurons", query({{kType, one_of({"DLM1-4", "DLMn/a", "DVM1a-c", "DVMn/2a", "DVMn/3a"})}}), 100},
      {"DNg12", "Head-grooming descending neurons DNg12_a, _b and _c", query({{kType, one_of({"DNg12_a", "DNg12_b", "DNg12_c"})}}), 150},
      {"MN9", "Proboscis extension motor neuron", query({{kType, is("MN9")}}), 150},
      {"pIP10", "Courtship song command descending neurons", query({{kType, is("pIP10")}}), 150},
  };
}

// io.ts's REINFORCEMENT, which says why.
std::vector<InputSpec> reinforcement() {
  return {
      {"sweet reward", "Reward dopaminergic neurons of the mushroom body's β'2a and γ4 compartments (PAM02, PAM07, PAM08), which sugar excites",
       query({{kType, one_of({"PAM02", "PAM07", "PAM08"})}}), 20, "", kSweet, kLeft},
  };
}

Wiring wire(const Connectome& c) {
  Wiring w;
  for (InputSpec& spec : senses()) {
    if (!spec.regions.empty()) {
      w.senses.push_back(regional(c, std::move(spec)));
      continue;
    }
    std::vector<uint32_t> neurons = c.find(spec.select);
    if (!spec.root_ids.empty()) {
      const std::unordered_set<uint32_t> wanted(spec.root_ids.begin(), spec.root_ids.end());
      std::erase_if(neurons, [&](uint32_t i) { return wanted.count(c.root_id(i)) == 0; });
    }
    const double rate = spec.max_rate;
    w.senses.push_back({std::move(spec), std::move(neurons), rate});
  }
  for (InputSpec& spec : background()) {
    std::vector<uint32_t> neurons = c.find(spec.select);
    const double rate = spec.max_rate;
    w.background.push_back({std::move(spec), std::move(neurons), rate});
  }
  for (std::vector<Group>* groups : {&w.senses, &w.background}) {
    for (Group& each : *groups) {
      for (const Group& other : *groups) {
        if (other.spec.name == each.spec.balance) {
          each.max_rate = each.spec.max_rate * balance_factor(c, each.neurons, other.neurons);
          break;
        }
      }
    }
  }
  // A connectome without them (a test's) leaves them out.
  for (StateSpec& spec : state_inputs()) {
    std::vector<uint32_t> neurons = c.find(spec.select);
    if (!neurons.empty()) w.state.push_back({std::move(spec), std::move(neurons)});
  }
  for (ThermoSpec& spec : thermo_inputs()) {
    std::vector<uint32_t> neurons = c.find(spec.select);
    if (!neurons.empty()) w.thermo.push_back({std::move(spec), std::move(neurons)});
  }
  NeuronQuery sleepy{};
  sleepy[kType] = dfb_sleep;
  auto excitable = c.find(sleepy);
  if (!excitable.empty()) w.excitability.push_back({kSleepPressure, 7, std::move(excitable)});
  for (InputSpec& spec : reinforcement()) {
    std::vector<uint32_t> neurons = c.find(spec.select);
    const double rate = spec.max_rate;
    if (!neurons.empty()) w.reinforcement.push_back({std::move(spec), std::move(neurons), rate});
  }
  for (RestingSpec& spec : resting()) {
    std::vector<uint32_t> neurons = c.find(spec.select);
    if (!neurons.empty()) w.resting.push_back({std::move(spec), std::move(neurons)});
  }
  for (ReadoutSpec& spec : readouts()) {
    std::vector<uint32_t> neurons = c.find(spec.select);
    w.readouts.push_back({std::move(spec), std::move(neurons)});
  }
  const auto empty = [](const std::string& name, const std::string& description) {
    return std::runtime_error("The connectome has no neurons for \"" + name + "\" (" + description + ")");
  };
  for (const std::vector<Group>* groups : {&w.senses, &w.background}) {
    for (const Group& group : *groups) {
      if (group.neurons.empty()) throw empty(group.spec.name, group.spec.description);
    }
  }
  for (const ReadoutGroup& group : w.readouts) {
    if (group.neurons.empty()) throw empty(group.spec.name, group.spec.description);
  }
  std::unordered_set<uint32_t> driven;
  for (const std::vector<Group>* groups : {&w.senses, &w.background}) {
    for (const Group& group : *groups) driven.insert(group.neurons.begin(), group.neurons.end());
  }
  for (const StateGroup& group : w.state) driven.insert(group.neurons.begin(), group.neurons.end());
  for (const ThermoGroup& group : w.thermo) driven.insert(group.neurons.begin(), group.neurons.end());
  for (const auto& group : w.excitability) driven.insert(group.neurons.begin(), group.neurons.end());
  for (const Group& group : w.reinforcement) driven.insert(group.neurons.begin(), group.neurons.end());
  for (const RestingGroup& group : w.resting) driven.insert(group.neurons.begin(), group.neurons.end());
  for (const ReadoutGroup& group : w.readouts) {
    for (uint32_t i : group.neurons) {
      if (driven.count(i) != 0) throw std::runtime_error("Neuron " + std::to_string(i) + " is both driven and read (readout \"" + group.spec.name + "\")");
    }
  }
  return w;
}

double intensity(const Senses& s, Sense sense) {
  switch (sense) {
    case kLoomLeft: return js::clamp(s.loom_left, 0, 1);
    case kLoomRight: return js::clamp(s.loom_right, 0, 1);
    case kTouch: return js::clamp(s.touch, 0, 1);
    case kBumpLeft: return js::clamp(s.bump_left, 0, 1);
    case kBumpRight: return js::clamp(s.bump_right, 0, 1);
    case kWind: return js::clamp(s.wind, 0, 1);
    case kSweet: return js::clamp(s.sweet, 0, 1);
    case kGrounded: return s.grounded ? 1 : 0;
    case kMaleTaste: return js::clamp(s.male_taste, 0, 1);
    case kWingbeat: return js::clamp(s.wingbeat, 0, 1);
    case kBitter: return js::clamp(s.bitter, 0, 1);
    case kWater: return js::clamp(s.water, 0, 1);
    case kLegsLeft: return js::clamp(s.legs_left, 0, 1);
    case kLegsRight: return js::clamp(s.legs_right, 0, 1);
    case kSenseCount: break;
    default: return js::clamp(s.touch_parts[sense - kTouchEyeLeft], 0, 1);
  }
  return 0;
}

double region_rate(const Group& group, size_t r, const Senses& s) {
  const double felt = js::max(intensity(s, group.spec.sense), intensity(s, group.spec.regions[r].sense));
  return group.max_rate * felt * (group.spec.gated ? sleep_gate(s) : 1);
}

double hunger_of(const Senses& s) { return std::isfinite(s.hunger) ? js::min(1, js::max(0, s.hunger)) : 1; }

double thirst_of(const Senses& s) { return std::isfinite(s.thirst) ? js::min(1, js::max(0, s.thirst)) : 1; }

// io.ts's THIRST.sated: a fly that has just drunk has its water neurons pass on 1/1.4 of a thirsty one's.
constexpr double kQuenched = 1 / 1.4;

double water_output_gain(double thirst) { return kQuenched + (1 - kQuenched) * thirst; }

double state_of(const Senses& s, StateKey key) { return key < kStateCount ? js::clamp(s.state[key], 0, 1) : 0; }

double sleep_gate(const Senses& s) { return 1 - kSleepGate * state_of(s, kSleepDepth); }

// Rate, Hz, at which each command reaches 1.
constexpr double kWalk = 40, kTurn = 40, kBack = 40, kEscape = 200, kWings = 120, kGroom = 60, kFeed = 40, kSing = 40;

Command decode(const std::vector<double>& r) {
  Command c;
  c.walk = js::clamp(r[kDNg100] / kWalk, 0, 1);
  // DNa02 drives turning toward its own side; positive is toward the fly's right.
  c.turn = js::clamp((r[kDNa02Right] - r[kDNa02Left]) / kTurn, -1, 1);
  c.back = js::clamp(r[kMDN] / kBack, 0, 1);
  c.escape = js::clamp(r[kDNp01] / kEscape, 0, 1);
  c.wings = js::clamp(r[kFlight] / kWings, 0, 1);
  c.groom = js::clamp(r[kDNg12] / kGroom, 0, 1);
  c.feed = js::clamp(r[kMN9] / kFeed, 0, 1);
  c.sing = js::clamp(r[kPIP10] / kSing, 0, 1);
  return c;
}

double smooth(double previous, double sample, double dt, double tau) { return previous + (sample - previous) * -fdlibm::expm1(-dt / tau); }

}  // namespace fly::io
