#include "sim.hpp"

#include <algorithm>
#include <bit>
#include <cmath>
#include <stdexcept>

#include "fdlibm.hpp"

namespace fly {

void PoissonInput::set_probability(double p) {
  p_ = js::min(1, js::max(0, p));
  log_miss_ = fdlibm::log1p(-p_);
  next_ = gap();
}

uint32_t PoissonInput::sample(uint32_t* out) {
  const auto size = static_cast<double>(neurons_.size());
  double at = next_;
  uint32_t n = 0;
  while (at < size) {
    out[n++] = neurons_[static_cast<size_t>(at)];
    at += 1 + gap();
  }
  next_ = at - size;
  return n;
}

double PoissonInput::gap() {
  if (p_ <= 0) return std::numeric_limits<double>::infinity();
  if (p_ >= 1) return 0;
  // 1 - random() is in (0, 1], so the log is finite.
  return std::floor(fdlibm::log(1 - random_.next()) / log_miss_);
}

void RatedPoissonInput::set_probabilities(std::span<const double> rates, double scale) {
  double max = 0;
  for (size_t k = 0; k < p_.size(); k++) {
    const double p = js::min(1, js::max(0, rates[k] * scale));
    p_[k] = p;
    if (p > max) max = p;
  }
  max_ = max;
  log_miss_ = fdlibm::log1p(-max);
  next_ = gap();
}

uint32_t RatedPoissonInput::sample(uint32_t* out) {
  const auto size = static_cast<double>(neurons_.size());
  const double max = max_;
  double at = next_;
  uint32_t n = 0;
  while (at < size) {
    const auto k = static_cast<size_t>(at);
    if (random_.next() * max < p_[k]) out[n++] = neurons_[k];
    at += 1 + gap();
  }
  next_ = at - size;
  return n;
}

double RatedPoissonInput::gap() {
  if (max_ <= 0) return std::numeric_limits<double>::infinity();
  if (max_ >= 1) return 0;
  return std::floor(fdlibm::log(1 - random_.next()) / log_miss_);
}

Simulation::Simulation(std::vector<uint32_t> ptr, std::vector<Edge> edges, const SimulationOptions& options)
    : ptr_(std::move(ptr)), edges_(std::move(edges)) {
  if (ptr_.empty()) throw std::invalid_argument("ptr must have at least one entry");
  neurons_ = static_cast<uint32_t>(ptr_.size() - 1);
  if (ptr_[0] != 0 || ptr_.back() != edges_.size()) throw std::invalid_argument("ptr does not span the connections");
  for (uint32_t i = 0; i < neurons_; i++) {
    if (ptr_[i + 1] < ptr_[i]) throw std::invalid_argument("ptr decreases");
  }
  for (const Edge& edge : edges_) {
    if (edge.post >= neurons_) throw std::invalid_argument("a connection targets no neuron");
  }
  dt_ = options.dt;
  threshold_ = options.threshold;
  epsilon_ = options.epsilon;
  cleanup_interval_ = options.cleanup_interval;
  seed_ = options.seed;
  reset_drive_ = options.reset_drive;
  const auto& adaptation = options.adaptation;
  if (adaptation && !(adaptation->increment >= 0 && adaptation->tau > 0)) {
    throw std::invalid_argument("adaptation needs an increment of zero or more and a positive tau");
  }
  const bool adapting = adaptation && adaptation->increment > 0;
  if (!(dt_ > 0 && options.tau_mem > 0 && options.tau_syn > 0)) throw std::invalid_argument("dt and the time constants must be positive");
  if (!(epsilon_ >= 0)) throw std::invalid_argument("epsilon must not be negative");
  if (cleanup_interval_ < 1) throw std::invalid_argument("cleanupInterval must be a whole number of steps");
  leak_ = dt_ / options.tau_mem;
  decay_ = fdlibm::exp(-dt_ / options.tau_syn);
  keep_drive_ = reset_drive_ ? 0 : 1;
  adapt_decay_ = adapting ? fdlibm::exp(-dt_ / adaptation->tau) : 0;
  adapt_step_ = adapting ? adaptation->increment : 0;
  refractory_steps_ = static_cast<int32_t>(js::min(65535, js::max(1, js::round(options.refractory / dt_))));
  delay_steps_ = static_cast<uint32_t>(js::max(1, js::round(options.delay / dt_)));

  silent_.assign(neurons_, 1);
  for (uint32_t i = 0; i < neurons_; i++) {
    for (uint32_t e = ptr_[i]; e < ptr_[i + 1]; e++) {
      if (edges_[e].weight != 0) silent_[i] = 0;
    }
  }
  state_.assign(neurons_, Neuron{0, 0, 0, 0});
  const size_t words = (static_cast<size_t>(neurons_) + 63) / 64;
  in_set_.assign(words, 0);
  listed_.assign(words, 0);
  // A neuron fires at most once a step, so a slot never holds more than every neuron.
  ring_.assign(delay_steps_, std::vector<uint32_t>(neurons_));
  ring_length_.assign(delay_steps_, 0);
  scratch_.resize(neurons_);
  watch_ptr_.assign(static_cast<size_t>(neurons_) + 1, 0);
}

void Simulation::join(uint32_t i) {
  const uint64_t bit = uint64_t{1} << (i & 63);
  uint64_t& word = in_set_[i >> 6];
  if ((word & bit) == 0) {
    word |= bit;
    listed_[i >> 6] |= bit;
    listed_count_++;
  }
}

void Simulation::set_bias(std::span<const float> bias) {
  if (!bias.empty() && bias.size() != neurons_) {
    throw std::invalid_argument("bias has " + std::to_string(bias.size()) + " entries, expected " + std::to_string(neurons_));
  }
  // Neurons that had a bias rejoin the main sweep, which cuts them once at rest.
  for (uint32_t i : biased_) {
    listed_[i >> 6] |= uint64_t{1} << (i & 63);
    listed_count_++;
  }
  biased_.clear();
  if (bias.empty()) {
    bias_.clear();
    return;
  }
  bias_.assign(bias.begin(), bias.end());
  for (uint32_t i = 0; i < neurons_; i++) {
    if (bias_[i] != 0) biased_.push_back(i);
  }
  for (uint32_t i : biased_) {
    const uint64_t bit = uint64_t{1} << (i & 63);
    in_set_[i >> 6] |= bit;
    if ((listed_[i >> 6] & bit) != 0) {
      listed_[i >> 6] &= ~bit;
      listed_count_--;
    }
  }
}

std::vector<uint32_t> Simulation::members(std::span<const uint32_t> neurons, const std::string& what) const {
  std::vector<uint32_t> unique(neurons.begin(), neurons.end());
  std::sort(unique.begin(), unique.end());
  unique.erase(std::unique(unique.begin(), unique.end()), unique.end());
  for (uint32_t i : unique) {
    if (i >= neurons_) throw std::invalid_argument(what + ": no neuron " + std::to_string(i));
  }
  return unique;
}

void Simulation::check_name(const std::string& name) const {
  for (const Input& input : inputs_) {
    if (input.name == name) throw std::invalid_argument("There is already an input called \"" + name + "\"");
  }
}

uint32_t Simulation::add_input(const std::string& name, std::span<const uint32_t> neurons, double rate_hz) {
  check_name(name);
  const auto index = static_cast<uint32_t>(inputs_.size());
  inputs_.push_back(Input{name, 0, false, PoissonInput(members(neurons, "input \"" + name + "\""), js::input_seed(seed_, index))});
  set_rate(index, rate_hz);
  return index;
}

void Simulation::set_rate(uint32_t index, double rate_hz) {
  Input& input = inputs_.at(index);
  auto* source = std::get_if<PoissonInput>(&input.source);
  if (source == nullptr) throw std::invalid_argument("\"" + input.name + "\" has a rate per neuron; use setRates");
  if (!(rate_hz >= 0)) throw std::invalid_argument("Input rates must be zero or more");
  if (rate_hz == input.rate) return;
  input.rate = rate_hz;
  input.on = rate_hz > 0;
  source->set_probability((rate_hz * dt_) / 1000);
}

uint32_t Simulation::add_output_gain(const std::string& name, std::span<const uint32_t> neurons) {
  for (const OutputGain& group : output_gains_) {
    if (group.name == name) throw std::invalid_argument("There is already an output gain called \"" + name + "\"");
  }
  OutputGain group{name, {}, {}, 1};
  for (uint32_t i : members(neurons, "output gain \"" + name + "\"")) {
    for (uint32_t e = ptr_[i]; e < ptr_[i + 1]; e++) {
      group.edges.push_back(e);
      group.base.push_back(edges_[e].weight);
    }
  }
  output_gains_.push_back(std::move(group));
  return static_cast<uint32_t>(output_gains_.size() - 1);
}

void Simulation::set_output_gain(uint32_t index, double factor) {
  OutputGain& group = output_gains_.at(index);
  // Above 0, so a group that delivers its spikes keeps delivering them (see silent_).
  if (!(factor > 0 && std::isfinite(factor))) throw std::invalid_argument("An output gain must be a positive number");
  if (factor == group.factor) return;
  group.factor = factor;
  for (size_t k = 0; k < group.edges.size(); k++) edges_[group.edges[k]].weight = static_cast<float>(static_cast<double>(group.base[k]) * factor);
}

uint32_t Simulation::add_rated_input(const std::string& name, std::span<const uint32_t> neurons) {
  check_name(name);
  for (uint32_t i : neurons) {
    if (i >= neurons_) throw std::invalid_argument("input \"" + name + "\": no neuron " + std::to_string(i));
  }
  std::vector<uint32_t> sorted(neurons.begin(), neurons.end());
  std::sort(sorted.begin(), sorted.end());
  if (std::adjacent_find(sorted.begin(), sorted.end()) != sorted.end()) throw std::invalid_argument("input \"" + name + "\": a neuron is listed twice");
  const auto index = static_cast<uint32_t>(inputs_.size());
  inputs_.push_back(
      Input{name, 0, false, RatedPoissonInput(std::vector<uint32_t>(neurons.begin(), neurons.end()), js::input_seed(seed_, index))});
  return index;
}

void Simulation::set_rates(uint32_t index, std::span<const double> rates_hz) {
  Input& input = inputs_.at(index);
  auto* source = std::get_if<RatedPoissonInput>(&input.source);
  if (source == nullptr) throw std::invalid_argument("\"" + input.name + "\" has one rate for all its neurons; use setRate");
  const size_t size = source->neurons().size();
  if (rates_hz.size() != size) {
    throw std::invalid_argument("\"" + input.name + "\" has " + std::to_string(size) + " neurons, not " + std::to_string(rates_hz.size()));
  }
  bool on = false;
  for (double rate : rates_hz) {
    if (!(rate >= 0)) throw std::invalid_argument("Input rates must be zero or more");
    if (rate > 0) on = true;
  }
  input.on = on;
  source->set_probabilities(rates_hz, dt_ / 1000);
}

uint32_t Simulation::add_readout(const std::string& name, std::span<const uint32_t> neurons) {
  for (const std::string& each : readout_names_) {
    if (each == name) throw std::invalid_argument("There is already a readout called \"" + name + "\"");
  }
  readout_members_.push_back(members(neurons, "readout \"" + name + "\""));
  readout_names_.push_back(name);
  readout_counts_.push_back(0);
  // Neuron -> readouts, as CSR.
  std::fill(watch_ptr_.begin(), watch_ptr_.end(), 0);
  for (const auto& group : readout_members_) {
    for (uint32_t i : group) watch_ptr_[i + 1]++;
  }
  for (uint32_t i = 0; i < neurons_; i++) watch_ptr_[i + 1] += watch_ptr_[i];
  watch_ids_.assign(watch_ptr_[neurons_], 0);
  std::vector<uint32_t> fill(watch_ptr_.begin(), watch_ptr_.end() - 1);
  for (uint32_t r = 0; r < readout_members_.size(); r++) {
    for (uint32_t i : readout_members_[r]) watch_ids_[fill[i]++] = r;
  }
  return static_cast<uint32_t>(readout_names_.size() - 1);
}

void Simulation::drain_readouts(std::vector<uint32_t>& into) {
  into = readout_counts_;
  std::fill(readout_counts_.begin(), readout_counts_.end(), 0);
}

void Simulation::set_partition(std::vector<uint8_t> part_of, uint32_t parts) {
  if (part_of.size() != neurons_) {
    throw std::invalid_argument("A partition needs a part for each of the " + std::to_string(neurons_) + " neurons, not " + std::to_string(part_of.size()));
  }
  for (size_t i = 0; i < part_of.size(); i++) {
    if (part_of[i] >= parts) {
      throw std::invalid_argument("Neuron " + std::to_string(i) + " is in part " + std::to_string(part_of[i]) + ", but there are " + std::to_string(parts));
    }
  }
  part_of_ = std::move(part_of);
  part_counts_.assign(parts, 0);
}

void Simulation::drain_partition(std::vector<uint32_t>& into) {
  into = part_counts_;
  std::fill(part_counts_.begin(), part_counts_.end(), 0);
}

std::span<const uint32_t> Simulation::last_spikes() const {
  if (last_slot_ < 0) return {};
  return {ring_[static_cast<size_t>(last_slot_)].data(), ring_length_[static_cast<size_t>(last_slot_)]};
}

uint64_t Simulation::advance(double ms) {
  const double total = carry_ms_ + ms;
  const double steps = js::max(0, std::floor(total / dt_ + 1e-9));
  carry_ms_ = js::max(0, total - steps * dt_);
  const auto count = static_cast<uint64_t>(steps);
  for (uint64_t s = 0; s < count; s++) step();
  return count;
}

// Step 2 for the neurons without a bias, in index order, writing this step's
// spikes to out (so ascending) and returning how many. On cleanup steps
// (kCleanup) it also drops the neurons at rest. It computes the integrated v
// before looking at the refractory count (a held neuron's v is 0, so this is
// harmless), as sim.ts does.
template <bool kCleanup>
uint32_t Simulation::sweep(uint32_t* out) {
  Neuron* const state = state_.data();
  uint64_t* const listed = listed_.data();
  uint64_t* const in_set = in_set_.data();
  const size_t words = listed_.size();
  const double leak = leak_;
  const double decay = decay_;
  const double threshold = threshold_;
  const double keep_drive = keep_drive_;
  const double adapt_decay = adapt_decay_;
  const double adapt_step = adapt_step_;
  const double epsilon = epsilon_;
  const int32_t refractory = refractory_steps_;
  uint32_t fired = 0;
  uint32_t cut_count = 0;
  for (size_t w = 0; w < words; w++) {
    uint64_t bits = listed[w];
    uint64_t cut = 0;
    while (bits != 0) {
      const int b = std::countr_zero(bits);
      bits &= bits - 1;
      const auto i = static_cast<uint32_t>(w * 64 + static_cast<size_t>(b));
      Neuron& s = state[i];
      const double v = s.v;
      const double g = s.g;
      const double a = s.a;
      const int32_t hold = s.hold;
      const double next = v + leak * (g - a - v);
      const double decayed = g * decay;
      s.g = static_cast<float>(decayed);
      s.a = static_cast<float>(a * adapt_decay);
      if (hold > 0) {
        s.hold = hold - 1;
      } else if (next >= threshold) {
        s.v = 0;
        // + 0 turns -0 into 0, so that a cleared drive is exactly 0.
        s.g = static_cast<float>(decayed * keep_drive + 0.0);
        s.a = static_cast<float>(a * adapt_decay + adapt_step);
        s.hold = refractory;
        out[fired++] = i;
      } else {
        s.v = static_cast<float>(next);
      }
      if constexpr (kCleanup) {
        // Compared as stored, in single precision, as sim.ts does.
        if (std::fabs(s.v) < epsilon && std::fabs(s.g) < epsilon && s.hold == 0 && s.a < epsilon) {
          s.v = 0;
          s.g = 0;
          s.a = 0;
          cut |= uint64_t{1} << b;
        }
      }
    }
    if constexpr (kCleanup) {
      if (cut != 0) {
        listed[w] &= ~cut;
        in_set[w] &= ~cut;
        cut_count += static_cast<uint32_t>(std::popcount(cut));
      }
    }
  }
  listed_count_ -= cut_count;
  return fired;
}

// The same update for the biased neurons, appending their spikes (ascending) to out[fired..].
uint32_t Simulation::sweep_biased(uint32_t* out, uint32_t fired) {
  for (uint32_t i : biased_) {
    Neuron& s = state_[i];
    const double v = s.v;
    const double g = s.g;
    const double a = s.a;
    const int32_t hold = s.hold;
    const double next = v + leak_ * (g + static_cast<double>(bias_[i]) - a - v);
    const double decayed = g * decay_;
    s.g = static_cast<float>(decayed);
    s.a = static_cast<float>(a * adapt_decay_);
    if (hold > 0) {
      s.hold = hold - 1;
    } else if (next >= threshold_) {
      s.v = 0;
      s.g = static_cast<float>(decayed * keep_drive_ + 0.0);
      s.a = static_cast<float>(a * adapt_decay_ + adapt_step_);
      s.hold = refractory_steps_;
      out[fired++] = i;
    } else {
      s.v = static_cast<float>(next);
    }
  }
  return fired;
}

// out[0..sorted) is ascending; sorts out[sorted..fired) into it, through the
// scratch buffer, which is free once the inputs have been sampled.
void Simulation::merge_tail(uint32_t* out, uint32_t sorted, uint32_t fired) {
  uint32_t* tail = scratch_.data();
  const uint32_t extra = fired - sorted;
  std::copy(out + sorted, out + fired, tail);
  std::sort(tail, tail + extra);
  uint32_t a = sorted;
  uint32_t b = extra;
  uint32_t at = fired;
  while (b > 0) {
    if (a > 0 && out[a - 1] > tail[b - 1]) {
      out[--at] = out[--a];
    } else {
      out[--at] = tail[--b];
    }
  }
}

// How many spikes ahead delivery prefetches connections (8 to 16 measure the same).
constexpr uint32_t kPrefetchAhead = 12;

void Simulation::step() {
  const auto slot = static_cast<uint32_t>(steps_ % delay_steps_);
  uint32_t* const out = ring_[slot].data();
  Neuron* const state = state_.data();

  // 1. Deliver the spikes from `delay` steps ago, which sit in this slot.
  const uint32_t arriving = ring_length_[slot];
  if (arriving > 0) {
    const uint32_t* const ptr = ptr_.data();
    const Edge* const edges = edges_.data();
    const size_t edge_count = edges_.size();
    const uint8_t* const silent = silent_.data();
    uint64_t events = 0;
    for (uint32_t k = 0; k < arriving; k++) {
      // A spiking neuron's connections are a few cache lines far from the
      // last one's and rarely cached, so ask for them a few spikes early.
      if (k + kPrefetchAhead < arriving) {
        const uint32_t ahead = ptr[out[k + kPrefetchAhead]];
        __builtin_prefetch(edges + ahead);
        if (ahead + 16 < edge_count) __builtin_prefetch(edges + ahead + 16);
      }
      const uint32_t pre = out[k];
      if (silent[pre] != 0) continue;
      const uint32_t start = ptr[pre];
      const uint32_t end = ptr[pre + 1];
      events += end - start;
      for (uint32_t e = start; e < end; e++) {
        const uint32_t j = edges[e].post;
        // sim.ts adds in double and stores the sum as a float. For a sum of
        // two floats that is the same as adding in single precision: double
        // has more than 2 × 24 + 2 bits, so rounding twice gives the
        // correctly rounded float sum (Figueroa 1995).
        state[j].g += edges[e].weight;
        join(j);
      }
    }
    events_ += events;
  }

  // 2. Update the active neurons. This step's spikes overwrite the slot just delivered.
  const bool cleanup = steps_ % cleanup_interval_ == cleanup_interval_ - 1;
  uint32_t fired = cleanup ? sweep<true>(out) : sweep<false>(out);
  const uint32_t sorted = fired;
  if (!biased_.empty()) fired = sweep_biased(out, fired);

  // 3. Poisson inputs.
  uint32_t* const picked = scratch_.data();
  for (Input& input : inputs_) {
    if (!input.on) continue;
    const uint32_t m = std::visit([picked](auto& source) { return source.sample(picked); }, input.source);
    for (uint32_t k = 0; k < m; k++) {
      const uint32_t i = picked[k];
      Neuron& s = state[i];
      if (s.hold != 0) continue;
      s.v = 0;
      if (reset_drive_) s.g = 0;
      s.a = static_cast<float>(static_cast<double>(s.a) + adapt_step_);
      s.hold = refractory_steps_;
      out[fired++] = i;
      join(i);
    }
  }

  if (fired > sorted) merge_tail(out, sorted, fired);
  ring_length_[slot] = fired;
  last_slot_ = slot;
  steps_++;
  if (fired == 0) return;
  spikes_ += fired;
  if (!readout_names_.empty()) {
    for (uint32_t k = 0; k < fired; k++) {
      const uint32_t i = out[k];
      for (uint32_t m = watch_ptr_[i]; m < watch_ptr_[i + 1]; m++) readout_counts_[watch_ids_[m]]++;
    }
  }
  if (!part_of_.empty()) {
    const uint8_t* const part_of = part_of_.data();
    uint32_t* const counts = part_counts_.data();
    for (uint32_t k = 0; k < fired; k++) counts[part_of[out[k]]]++;
  }
}

}  // namespace fly
