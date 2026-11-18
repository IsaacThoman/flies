#include "regions.hpp"

#include <initializer_list>
#include <unordered_map>

namespace fly::regions {

namespace {

// regions.ts compares JavaScript strings, which are UTF-16, and these are the
// same strings in UTF-8. Every literal here is ASCII, and an ASCII string is
// equal to, or a prefix of, another in UTF-8 exactly when it is in UTF-16.
bool among(std::string_view value, std::initializer_list<std::string_view> list) {
  for (std::string_view each : list) {
    if (value == each) return true;
  }
  return false;
}

bool starts_with_any(std::string_view value, std::initializer_list<std::string_view> prefixes) {
  for (std::string_view prefix : prefixes) {
    if (value.starts_with(prefix)) return true;
  }
  return false;
}

bool has_side(const Annotations& n) { return n.side == "left" || n.side == "right"; }

std::string sided(const Annotations& n, std::string_view id, std::string_view otherwise) {
  return has_side(n) ? std::string(id) + "-" + std::string(n.side) : std::string(otherwise);
}

// regions.ts's opticLobe, which says where its rules come from.
std::string_view optic_lobe(std::string_view type) {
  // One type of both a Pm and an Li.
  if (type == "Pm7_Li28") return "optic-other";
  if (among(type, {"L1", "L2", "L3", "L4", "L5", "Lai", "T1", "C2", "C3", "Lawf1", "Lawf2"}) || starts_with_any(type, {"Lat"})) return "lamina";
  if (among(type, {"T2", "T2a", "T3", "ME_unclear", "l-LNv"}) || starts_with_any(type, {"Mi", "Dm", "Pm", "Cm", "aMe", "Tm", "MeLo", "MeVPMe"})) {
    return "medulla";
  }
  if (among(type, {"LO_unclear"}) || starts_with_any(type, {"Li", "LT", "LC"})) return "lobula";
  if (among(type, {"H1", "LOP_unclear"}) || starts_with_any(type, {"T4", "T5", "LPi", "Tlp"})) return "lobula-plate";
  return "optic-other";
}

// regions.ts's centralBrain.
std::string central_brain(const Annotations& n) {
  if (n.klass == "CX" || starts_with_any(n.type, {"FB", "FS"})) return "central-complex";
  const auto by_side = [&n](std::string_view id) { return sided(n, id, "central-brain-other"); };
  if (among(n.klass, {"Kenyon_Cell", "MBON", "DAN"}) || among(n.type, {"APL", "DPM"}) || n.type.starts_with("MB-")) return by_side("mushroom-body");
  if (among(n.klass, {"ALPN", "ALLN", "ALIN", "ALON"})) return by_side("antennal-lobe");
  if (n.klass == "SEZPN") return by_side("subesophageal");
  if (starts_with_any(n.type, {"SMP", "SLP", "SIP", "aSP"})) return by_side("superior-protocerebrum");
  if (starts_with_any(n.type, {"LH"})) return by_side("lateral-horn");
  if (starts_with_any(n.type, {"AVLP", "PVLP", "PLP", "WED", "AOTU", "TuTu", "VLP"})) return by_side("ventrolateral-protocerebrum");
  if (starts_with_any(n.type, {"CL", "ICL", "SCL", "IB", "ATL", "CRE", "aIPg", "VES", "PS", "IPS", "SPS", "GOR", "EPA", "LAL", "TuBu"})) {
    return by_side("inferior-ventromedial");
  }
  if (starts_with_any(n.type, {"GNG", "AMMC", "SAD", "FLA", "PRW", "CAN"})) return by_side("subesophageal");
  return "central-brain-other";
}

}  // namespace

const std::vector<std::string>& ids() {
  static const std::vector<std::string> kIds = {
      "retina-left", "retina-right", "lamina-left", "lamina-right", "medulla-left", "medulla-right", "lobula-left", "lobula-right",
      "lobula-plate-left", "lobula-plate-right", "optic-other-left", "optic-other-right", "visual-projection-left", "visual-projection-right",
      "visual-centrifugal-left", "visual-centrifugal-right", "antenna-smell", "johnston-left", "johnston-right", "head-bristles", "mouthparts",
      "head-sensory-other", "antennal-lobe-left", "antennal-lobe-right", "mushroom-body-left", "mushroom-body-right", "central-complex",
      "superior-protocerebrum-left", "superior-protocerebrum-right", "lateral-horn-left", "lateral-horn-right", "ventrolateral-protocerebrum-left",
      "ventrolateral-protocerebrum-right", "inferior-ventromedial-left", "inferior-ventromedial-right", "subesophageal-left", "subesophageal-right",
      "central-brain-other", "head-motor", "brain-endocrine", "descending-left", "descending-right", "ascending-left", "ascending-right",
      "front-leg-motor-left", "front-leg-motor-right", "middle-leg-motor-left", "middle-leg-motor-right", "hind-leg-motor-left",
      "hind-leg-motor-right", "flight-motor", "neck-motor", "abdomen-motor", "leg-sensory", "thorax-sensory", "abdomen-sensory", "proprioceptors",
      "bristles", "cord-interneurons-left", "cord-interneurons-right", "cord-midline", "cord-efferent", "unplaced",
  };
  return kIds;
}

std::string rate_name(std::string_view id) { return "region." + std::string(id); }

std::string id_of(const Annotations& n) {
  const std::string_view s = n.super_class;
  if (s == "ol_sensory") return sided(n, "retina", "unplaced");
  if (s == "ol_intrinsic") return sided(n, optic_lobe(n.type), "unplaced");
  if (s == "visual_projection") return sided(n, "visual-projection", "unplaced");
  if (s == "visual_projection_tbc") return sided(n, "optic-other", "unplaced");
  if (s == "visual_centrifugal") return sided(n, "visual-centrifugal", "unplaced");
  if (s == "cb_sensory") {
    if (among(n.klass, {"olfactory", "hygrosensory", "thermosensory"})) return "antenna-smell";
    if (n.type.starts_with("JO-")) return sided(n, "johnston", "head-sensory-other");
    if (n.type.starts_with("BM")) return "head-bristles";
    if (n.klass == "gustatory" || starts_with_any(n.type, {"TPMN", "aPhM"})) return "mouthparts";
    return "head-sensory-other";
  }
  if (s == "cb_sensory_tbc") return "head-sensory-other";
  if (s == "cb_intrinsic") return central_brain(n);
  if (s == "cb_motor") return "head-motor";
  if (among(s, {"cb_endocrine", "cb_efferent", "ENS"})) return "brain-endocrine";
  if (among(s, {"descending_neuron", "sensory_descending"})) return sided(n, "descending", "unplaced");
  if (s == "ascending_neuron") return sided(n, "ascending", "unplaced");
  if (s == "vnc_motor") {
    if (n.sub_class == "fl") return sided(n, "front-leg-motor", "unplaced");
    if (n.sub_class == "ml") return sided(n, "middle-leg-motor", "unplaced");
    if (n.sub_class == "hl") return sided(n, "hind-leg-motor", "unplaced");
    if (among(n.sub_class, {"wm", "hm", "xm"})) return "flight-motor";
    if (n.sub_class == "nm") return "neck-motor";
    if (n.sub_class == "ad") return "abdomen-motor";
    return "unplaced";
  }
  if (among(s, {"vnc_sensory", "sensory_ascending"})) {
    if (among(n.sub_class, {"leg", "leg_bristle"})) return "leg-sensory";
    if (among(n.sub_class, {"wing", "wing_bristle", "haltere", "notum", "neck"})) return "thorax-sensory";
    if (n.sub_class == "abdomen") return "abdomen-sensory";
    if (among(n.sub_class, {"campaniform_sensilla", "chordotonal_organ", "hair_plate"})) return "proprioceptors";
    if (among(n.sub_class, {"mechanosensory_bristle", "taste_bristle"})) return "bristles";
    return "unplaced";
  }
  if (s == "vnc_intrinsic") return sided(n, "cord-interneurons", "cord-midline");
  if (s == "vnc_tbc") return "cord-midline";
  if (among(s, {"vnc_efferent", "vnc_endocrine", "efferent_ascending", "efferent_descending"})) return "cord-efferent";
  return "unplaced";
}

std::vector<uint8_t> of(const Connectome& connectome) {
  std::unordered_map<std::string, uint8_t> index;
  for (size_t k = 0; k < ids().size(); k++) index.emplace(ids()[k], static_cast<uint8_t>(k));
  std::vector<uint8_t> out(connectome.neurons());
  // A region follows from the annotations alone, and few neurons' differ: 24,000 sets among 167,000 neurons.
  std::unordered_map<uint64_t, uint8_t> known;
  for (uint32_t i = 0; i < connectome.neurons(); i++) {
    uint64_t key = 0;
    for (Category column : {kType, kSuperClass, kClass, kSubClass, kSide}) key = key * connectome.table(column).size() + connectome.code(column, i);
    const auto [at, added] = known.try_emplace(key, 0);
    if (added) {
      at->second = index.at(id_of({connectome.value(kSuperClass, i), connectome.value(kClass, i), connectome.value(kSubClass, i), connectome.value(kType, i),
                                   connectome.value(kSide, i)}));
    }
    out[i] = at->second;
  }
  return out;
}

}  // namespace fly::regions
