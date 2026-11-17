#include "learning.hpp"

#include <array>
#include <cstring>
#include <limits>
#include <map>
#include <stdexcept>
#include <string_view>
#include <unordered_map>

#include "fdlibm.hpp"

namespace fly::learning {

namespace {

enum Lobe : uint8_t { kGamma, kAlphaBeta, kAlphaBetaPrime, kLobes };

struct CompartmentSpec {
  const char* id;
  Lobe lobe;
};

// learning.ts's COMPARTMENTS, in its order.
constexpr std::array<CompartmentSpec, 18> kCompartments{{
    {"g1", kGamma},         {"g2", kGamma},          {"g3", kGamma},          {"g4", kGamma},          {"g5", kGamma},
    {"ped", kAlphaBeta},    {"a1", kAlphaBeta},      {"a2", kAlphaBeta},      {"a3", kAlphaBeta},      {"b1", kAlphaBeta},
    {"b2", kAlphaBeta},     {"ap1", kAlphaBetaPrime}, {"ap2", kAlphaBetaPrime}, {"ap3", kAlphaBetaPrime}, {"bp1", kAlphaBetaPrime},
    {"bp2a", kAlphaBetaPrime}, {"bp2m", kAlphaBetaPrime}, {"bp2p", kAlphaBetaPrime},
}};

using Table = std::unordered_map<std::string_view, std::vector<std::string_view>>;

// learning.ts's DAN_COMPARTMENTS and MBON_COMPARTMENTS, which say where each comes from.
const Table& dan_compartments() {
  static const Table table{
      {"PAM01", {"g5"}},         {"PAM02", {"bp2a"}},       {"PAM03", {"b2", "bp2a"}}, {"PAM04", {"b2"}},   {"PAM05", {"bp2p"}},
      {"PAM06", {"bp2m"}},       {"PAM07", {"g4"}},         {"PAM08", {"g4"}},         {"PAM09", {"b1", "ped"}}, {"PAM10", {"b1"}},
      {"PAM11", {"a1"}},         {"PAM12", {"g3"}},         {"PAM13", {"bp1"}},        {"PAM14", {"bp1"}},  {"PAM15", {"g5", "bp2a"}},
      {"PPL101", {"g1", "ped"}}, {"PPL102", {"g1"}},        {"PPL103", {"g2", "ap1"}}, {"PPL104", {"ap3"}}, {"PPL105", {"ap2", "a2"}},
      {"PPL106", {"a3"}},
  };
  return table;
}

const Table& mbon_compartments() {
  static const Table table{
      {"MBON01", {"g5", "bp2a"}},  {"MBON02", {"b2", "bp2a"}},   {"MBON03", {"bp2m", "bp2p"}}, {"MBON04", {"bp2m", "bp2p"}},
      {"MBON05", {"g4"}},          {"MBON06", {"b1"}},           {"MBON07", {"a1"}},           {"MBON09", {"g3", "bp1"}},
      {"MBON10", {"bp1"}},         {"MBON11", {"g1", "ped"}},    {"MBON12", {"g2", "ap1"}},    {"MBON13", {"ap2"}},
      {"MBON14", {"a3"}},          {"MBON15", {"ap1"}},          {"MBON15-like", {"ap1"}},     {"MBON16", {"ap3"}},
      {"MBON17", {"ap3"}},         {"MBON17-like", {"ap3"}},     {"MBON18", {"a2"}},           {"MBON19", {"a2", "a3"}},
      {"MBON20", {"g1", "g2"}},    {"MBON21", {"g4", "g5"}},     {"MBON23", {"a2"}},           {"MBON24", {"b2", "g5"}},
      {"MBON25", {"g1", "g2"}},    {"MBON25-like", {"g1", "g2"}}, {"MBON26", {"bp2a", "bp2m", "bp2p"}}, {"MBON27", {"g5"}},
      {"MBON28", {"ap3"}},         {"MBON29", {"g4", "g5"}},     {"MBON30", {"g1", "g2", "g3"}}, {"MBON31", {"ap1"}},
      {"MBON32", {"g2"}},          {"MBON33", {"g2", "g3"}},     {"MBON34", {"g2"}},           {"MBON35", {"g2"}},
  };
  return table;
}

/** learning.ts's kcLobe: kLobes for none. */
Lobe kc_lobe(std::string_view type) {
  if (type.starts_with("KCg")) return kGamma;
  if (type.starts_with("KCab")) return kAlphaBeta;
  if (type.starts_with("KCapbp")) return kAlphaBetaPrime;
  return kLobes;
}

uint32_t compartment_index(std::string_view id) {
  for (uint32_t k = 0; k < kCompartments.size(); k++) {
    if (id == kCompartments[k].id) return k;
  }
  throw std::logic_error("No compartment " + std::string(id));
}

uint32_t fnv(uint32_t h, uint32_t word) { return (h ^ word) * 16777619u; }

constexpr uint32_t kMagic = 0x4d594c46u, kVersion = 1, kHeader = 24, kEntry = 5;
constexpr double kSteps = 255;

/** A factor kept to a 255th (learning.ts's quantum). */
uint8_t quantum(double factor) { return static_cast<uint8_t>(js::round(factor * kSteps)); }

void put32(std::vector<uint8_t>& out, size_t at, uint32_t x) {
  for (int b = 0; b < 4; b++) out[at + b] = static_cast<uint8_t>(x >> (8 * b));
}

uint32_t get32(std::span<const uint8_t> in, size_t at) {
  return static_cast<uint32_t>(in[at]) | static_cast<uint32_t>(in[at + 1]) << 8 | static_cast<uint32_t>(in[at + 2]) << 16 | static_cast<uint32_t>(in[at + 3]) << 24;
}

}  // namespace

std::vector<uint8_t> write_memory(uint32_t hash, uint32_t count, const std::vector<double>& factors) {
  uint32_t changed = 0;
  for (double f : factors) {
    if (quantum(f) != kSteps) changed++;
  }
  const bool dense = static_cast<uint64_t>(kEntry) * changed > factors.size();
  std::vector<uint8_t> out(kHeader + (dense ? factors.size() : kEntry * static_cast<size_t>(changed)));
  put32(out, 0, kMagic);
  put32(out, 4, kVersion);
  put32(out, 8, hash);
  put32(out, 12, count);
  put32(out, 16, dense ? 1 : 0);
  put32(out, 20, dense ? static_cast<uint32_t>(factors.size()) : changed);
  size_t at = kHeader;
  for (uint32_t p = 0; p < factors.size(); p++) {
    const uint8_t q = quantum(factors[p]);
    if (dense) {
      out[at++] = q;
    } else if (q != kSteps) {
      put32(out, at, p);
      out[at + 4] = q;
      at += kEntry;
    }
  }
  return out;
}

MemoryEntries read_memory(std::span<const uint8_t> memory, uint32_t hash, uint32_t count) {
  if (memory.size() < kHeader || get32(memory, 0) != kMagic) throw std::invalid_argument("This isn't a fly's memory");
  if (get32(memory, 4) != kVersion) throw std::invalid_argument("This memory is of version " + std::to_string(get32(memory, 4)) + ", not 1");
  if (get32(memory, 8) != hash || get32(memory, 12) != count) throw std::invalid_argument("This memory is another brain's");
  const uint32_t kind = get32(memory, 16);
  const uint32_t entries = get32(memory, 20);
  if (kind > 1) throw std::invalid_argument("This memory is damaged: its kind is unknown");
  if (kind == 1 ? entries != count || memory.size() != kHeader + static_cast<uint64_t>(count) : memory.size() != kHeader + kEntry * static_cast<uint64_t>(entries)) {
    throw std::invalid_argument("This memory is damaged: its length is wrong");
  }
  MemoryEntries out;
  out.index.resize(entries);
  out.factor.resize(entries);
  for (uint32_t n = 0; n < entries; n++) {
    const size_t at = kHeader + (kind == 1 ? n : kEntry * static_cast<size_t>(n));
    out.index[n] = kind == 1 ? n : get32(memory, at);
    const uint8_t q = memory[kind == 1 ? at : at + 4];
    if (out.index[n] >= count || (n > 0 && out.index[n] <= out.index[n - 1])) throw std::invalid_argument("This memory is damaged: its synapses are out of order");
    out.factor[n] = q / kSteps;
  }
  return out;
}

void MushroomBody::remember(std::span<const uint8_t> memory, Simulation& sim) {
  const MemoryEntries entries = read_memory(memory, layout_hash_, static_cast<uint32_t>(edges_.size()));
  for (uint32_t p = 0; p < factors_.size(); p++) {
    if (factors_[p] == 1) continue;
    factors_[p] = 1;
    sim.set_plastic_factor(p, 1);
  }
  for (size_t n = 0; n < entries.index.size(); n++) {
    factors_[entries.index[n]] = entries.factor[n];
    sim.set_plastic_factor(entries.index[n], entries.factor[n]);
  }
}

MushroomBody::MushroomBody(const Connectome& c, const Parameters& parameters) : parameters_(parameters) {
  if (!(parameters.tau > 0 && parameters.window > 0 && parameters.depression >= 0 && parameters.depression <= 1 && parameters.potentiation >= 0 &&
        parameters.potentiation <= 1)) {
    throw std::invalid_argument("Learning needs positive time constants and a depression and potentiation from 0 to 1");
  }
  const auto per = static_cast<uint32_t>(kCompartments.size());
  compartments_ = 2 * per;
  const Table& dans_table = dan_compartments();
  const Table& mbons_table = mbon_compartments();
  // Decided once per type and side (learning.ts says why), not per neuron or edge.
  const std::vector<std::string>& types = c.table(kType);
  std::vector<uint8_t> lobe_of(types.size()), is_dan(types.size()), is_mbon(types.size());
  for (size_t t = 0; t < types.size(); t++) {
    lobe_of[t] = kc_lobe(types[t]);
    is_dan[t] = dans_table.count(types[t]) != 0;
    is_mbon[t] = mbons_table.count(types[t]) != 0;
  }
  std::vector<int8_t> hemisphere_of;
  for (const std::string& side : c.table(kSide)) hemisphere_of.push_back(side == "left" ? 0 : side == "right" ? 1 : -1);
  const auto hemi = [&](uint32_t i) { return hemisphere_of[c.code(kSide, i)]; };
  for (uint32_t i = 0; i < c.neurons(); i++) {
    const uint32_t t = c.code(kType, i);
    if (lobe_of[t] != kLobes && hemi(i) >= 0) {
      kcs_.push_back(i);
    } else if (is_dan[t] != 0) {
      dans_.push_back(i);
    }
  }
  kc_of_.assign(c.neurons(), -1);
  dan_of_.assign(c.neurons(), -1);
  for (size_t k = 0; k < kcs_.size(); k++) kc_of_[kcs_[k]] = static_cast<int32_t>(k);
  for (size_t d = 0; d < dans_.size(); d++) dan_of_[dans_[d]] = static_cast<int32_t>(d);

  std::map<std::vector<uint32_t>, uint32_t> gates;
  std::vector<std::vector<uint32_t>> gate_lists;
  // The gate for an MBON type and a KC's lobe and hemisphere: -1 for none, -2 not yet worked out.
  std::vector<int32_t> gate_for(types.size() * kLobes * 2, -2);
  kc_ptr_.assign(kcs_.size() + 1, 0);
  for (size_t k = 0; k < kcs_.size(); k++) {
    const uint32_t i = kcs_[k];
    const Lobe lobe = static_cast<Lobe>(lobe_of[c.code(kType, i)]);
    const auto h = static_cast<uint32_t>(hemi(i));
    for (uint32_t e = c.ptr(i); e < c.ptr(i + 1); e++) {
      const uint32_t t = c.code(kType, c.post(e));
      if (is_mbon[t] == 0) continue;
      int32_t& gate = gate_for[(t * kLobes + lobe) * 2 + h];
      if (gate == -2) {
        std::vector<uint32_t> list;
        for (std::string_view id : mbons_table.at(types[t])) {
          const uint32_t at = compartment_index(id);
          if (kCompartments[at].lobe == lobe) list.push_back(h * per + at);
        }
        gate = -1;
        if (!list.empty()) {
          auto found = gates.find(list);
          if (found == gates.end()) {
            found = gates.emplace(list, static_cast<uint32_t>(gate_lists.size())).first;
            gate_lists.push_back(list);
          }
          gate = static_cast<int32_t>(found->second);
        }
      }
      if (gate < 0) continue;
      edges_.push_back(e);
      edge_gate_.push_back(static_cast<uint32_t>(gate));
      layout_hash_ = fnv(layout_hash_, c.root_id(i));
      layout_hash_ = fnv(layout_hash_, c.root_id(c.post(e)));
      for (uint32_t at : gate_lists[static_cast<size_t>(gate)]) layout_hash_ = fnv(layout_hash_, at);
    }
    kc_ptr_[k + 1] = static_cast<uint32_t>(edges_.size());
  }
  kc_place_.reserve(kcs_.size());
  for (uint32_t i : kcs_) kc_place_.push_back(static_cast<uint8_t>(hemi(i) * kLobes + lobe_of[c.code(kType, i)]));
  for (uint32_t at = 0; at < compartments_; at++) compartment_place_.push_back(static_cast<uint8_t>((at / per) * kLobes + kCompartments[at % per].lobe));
  gate_ptr_.assign(gate_lists.size() + 1, 0);
  for (size_t g = 0; g < gate_lists.size(); g++) {
    gate_ptr_[g + 1] = gate_ptr_[g] + static_cast<uint32_t>(gate_lists[g].size());
    gate_compartments_.insert(gate_compartments_.end(), gate_lists[g].begin(), gate_lists[g].end());
  }
  gate_has_.assign(gate_lists.size() * compartments_, 0);
  for (size_t g = 0; g < gate_lists.size(); g++) {
    for (uint32_t at : gate_lists[g]) gate_has_[g * compartments_ + at] = 1;
  }

  // Each DAN's share of its release in each hemisphere, by its synapses onto that hemisphere's KCs and MBONs.
  std::vector<std::array<double, 2>> share;
  for (uint32_t i : dans_) {
    std::array<double, 2> synapses{0, 0};
    for (uint32_t e = c.ptr(i); e < c.ptr(i + 1); e++) {
      const uint32_t j = c.post(e);
      const uint32_t t = c.code(kType, j);
      const int h = hemi(j);
      if (h >= 0 && (lobe_of[t] != kLobes || is_mbon[t] != 0)) synapses[h] += c.count(e);
    }
    const double total = synapses[0] + synapses[1];
    if (total > 0) {
      share.push_back({synapses[0] / total, synapses[1] / total});
    } else {
      const int own = hemi(i);
      share.push_back(own >= 0 ? std::array<double, 2>{own == 0 ? 1.0 : 0.0, own == 1 ? 1.0 : 0.0} : std::array<double, 2>{0.5, 0.5});
    }
  }
  std::vector<double> supply(compartments_, 0);
  for (size_t d = 0; d < dans_.size(); d++) {
    for (std::string_view id : dans_table.at(c.value(kType, dans_[d]))) {
      for (uint32_t h = 0; h < 2; h++) supply[h * per + compartment_index(id)] += share[d][h];
    }
  }
  dan_ptr_.assign(dans_.size() + 1, 0);
  for (size_t d = 0; d < dans_.size(); d++) {
    for (uint32_t h = 0; h < 2; h++) {
      if (share[d][h] == 0) continue;
      for (std::string_view id : dans_table.at(c.value(kType, dans_[d]))) {
        const uint32_t at = h * per + compartment_index(id);
        dan_compartment_.push_back(at);
        dan_amount_.push_back(share[d][h] / supply[at]);
      }
    }
    dan_ptr_[d + 1] = static_cast<uint32_t>(dan_compartment_.size());
  }

  factors_.assign(edges_.size(), 1);
  fired_.assign(kcs_.size(), -std::numeric_limits<double>::infinity());
  is_eligible_.assign(kcs_.size(), 0);
  dopamine_.assign(compartments_, 0);
  dopamine_at_.assign(compartments_, -std::numeric_limits<double>::infinity());
  is_dirty_.assign(edges_.size(), 0);
}

std::vector<uint32_t> MushroomBody::watched() const {
  std::vector<uint32_t> out(kcs_);
  out.insert(out.end(), dans_.begin(), dans_.end());
  return out;
}

double MushroomBody::dopamine(uint32_t c, double t) const {
  const double since = t - dopamine_at_[c];
  if (since > parameters_.window) return 0;
  return dopamine_[c] * fdlibm::exp(-since / parameters_.tau);
}

double MushroomBody::eligibility(uint32_t k, double t) const {
  const double since = t - fired_[k];
  if (since > parameters_.window) return 0;
  return fdlibm::exp(-since / parameters_.tau);
}

void MushroomBody::mark(uint32_t p) {
  if (is_dirty_[p] != 0) return;
  is_dirty_[p] = 1;
  dirty_.push_back(p);
}

void MushroomBody::learn(Simulation& sim, double now) {
  const std::vector<uint32_t>& neurons = sim.logged_neurons();
  const std::vector<uint64_t>& steps = sim.logged_steps();
  const double dt = sim.dt();
  const double depression = parameters_.depression;
  const double potentiation = parameters_.potentiation;
  for (size_t q = 0; q < neurons.size(); q++) {
    const uint32_t i = neurons[q];
    const double t = static_cast<double>(steps[q]) * dt;
    const int32_t d = dan_of_[i];
    if (d >= 0) {
      for (uint32_t m = dan_ptr_[d]; m < dan_ptr_[d + 1]; m++) {
        const uint32_t c = dan_compartment_[m];
        const double amount = dan_amount_[m];
        dopamine_[c] = dopamine(c, t) + amount;
        dopamine_at_[c] = t;
        // Forward: the KCs that fired before this release lose some of their synapses' strength in this compartment.
        const uint8_t place = compartment_place_[c];
        for (uint32_t k : eligible_) {
          if (kc_place_[k] != place) continue;
          const double e = eligibility(k, t);
          if (e == 0) continue;
          for (uint32_t p = kc_ptr_[k]; p < kc_ptr_[k + 1]; p++) {
            const uint32_t g = edge_gate_[p];
            if (gate_has_[g * compartments_ + c] == 0) continue;
            const double size = gate_ptr_[g + 1] - gate_ptr_[g];
            factors_[p] = factors_[p] * (1 - (depression * amount * e) / size);
            mark(p);
          }
        }
      }
      continue;
    }
    const int32_t k = kc_of_[i];
    if (k < 0) continue;
    // Backward: dopamine released before this spike gives back some of what its synapses lost.
    for (uint32_t p = kc_ptr_[k]; p < kc_ptr_[k + 1]; p++) {
      if (factors_[p] == 1) continue;
      const uint32_t g = edge_gate_[p];
      double released = 0;
      for (uint32_t m = gate_ptr_[g]; m < gate_ptr_[g + 1]; m++) released += dopamine(gate_compartments_[m], t);
      if (released == 0) continue;
      const double size = gate_ptr_[g + 1] - gate_ptr_[g];
      // At most all the way back: a long run of the DANs' spikes doesn't overshoot.
      factors_[p] = factors_[p] + js::min(1, (potentiation * released) / size) * (1 - factors_[p]);
      mark(p);
    }
    fired_[k] = t;
    if (is_eligible_[k] == 0) {
      is_eligible_[k] = 1;
      eligible_.push_back(static_cast<uint32_t>(k));
    }
  }
  sim.clear_spike_log();
  // KCs out of the window leave the eligible list, the rest keeping their order.
  size_t kept = 0;
  for (uint32_t k : eligible_) {
    if (now - fired_[k] > parameters_.window) {
      is_eligible_[k] = 0;
    } else {
      eligible_[kept++] = k;
    }
  }
  eligible_.resize(kept);
  for (uint32_t p : dirty_) {
    is_dirty_[p] = 0;
    sim.set_plastic_factor(p, factors_[p]);
  }
  dirty_.clear();
}

}  // namespace fly::learning
