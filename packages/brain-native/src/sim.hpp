// The spiking engine, sim.ts in C++: leaky integrate-and-fire neurons on a
// connectome, stepped sparsely so that only neurons with some state cost
// anything. sim.ts's opening comment is the specification; in short, each
// neuron has a membrane potential v, a synaptic drive g and an adaptation a,
// all in mV above rest, and step s does, in order:
//   1. deliver the spikes fired at step s - delay, in ascending neuron order,
//      then the withdrawals drawn then, each its synapses' opposite;
//   2. update every active neuron: decay g and a; if refractory, count down
//      and hold v at 0, otherwise integrate v and fire at threshold;
//   3. fire the neurons the Poisson inputs pick, unless refractory, and note
//      the withdrawals the withdrawing inputs pick.
//
// The results are sim.ts's to the bit: state is held in single precision and
// computed in double, operation for operation as there. How the active set is
// kept is free, since only its membership and the order of delivery affect
// the numbers; here it is a bitmap, swept in index order, which needs no
// sorting at all.

#ifndef FLY_SIM_HPP
#define FLY_SIM_HPP

#include "exact.hpp"

#include <cstddef>
#include <cstdint>
#include <limits>
#include <optional>
#include <span>
#include <string>
#include <variant>
#include <vector>

namespace fly {

struct SimulationOptions {
  /** Step, ms. */
  double dt = 0.5;
  /** Membrane and synaptic time constants, ms. */
  double tau_mem = 20;
  double tau_syn = 5;
  /** Spike threshold, mV above rest. */
  double threshold = 7;
  /** Refractory period and synaptic delay, ms; rounded to whole steps, at least one. */
  double refractory = 2.2;
  double delay = 1.8;
  /** State below this, in mV, counts as rest. */
  double epsilon = 1e-3;
  /** Steps between checks for neurons at rest. */
  uint32_t cleanup_interval = 16;
  /** Seeds the Poisson inputs. */
  uint32_t seed = 1;
  /** Whether a spike also clears the neuron's synaptic drive g (Shiu et al. 2024). */
  bool reset_drive = false;
  /** Spike-frequency adaptation: mV added per spike, decaying with tau ms. */
  struct Adaptation {
    double increment;
    double tau;
  };
  std::optional<Adaptation> adaptation;
};

/**
 * Independent Bernoulli trials of probability p for each neuron each step
 * (a Poisson train of rate p / dt), drawn by skipping geometric gaps between
 * successes, so the cost is per spike rather than per neuron per step.
 */
class PoissonInput {
 public:
  PoissonInput(std::vector<uint32_t> neurons, uint32_t seed) : neurons_(std::move(neurons)), random_(seed) {}

  /** Changing it redraws the gap to the next success, which is fair because the trials are memoryless. */
  void set_probability(double p);
  /** Writes this step's firing neurons into out, in group order; returns how many. */
  uint32_t sample(uint32_t* out);
  const std::vector<uint32_t>& neurons() const { return neurons_; }

 private:
  double gap();

  std::vector<uint32_t> neurons_;
  js::Mulberry32 random_;
  double p_ = 0;
  double log_miss_ = 0;
  // Trials from the start of the next step to the next success; a double, as in sim.ts.
  double next_ = std::numeric_limits<double>::infinity();
};

/**
 * Independent Bernoulli trials for each neuron each step, each neuron with a
 * probability of its own. Drawn by thinning: candidates come at the highest
 * probability, skipping geometric gaps as PoissonInput does, and each is kept
 * with its own probability over the highest. That costs one draw per
 * candidate, about (neurons × highest probability) a step.
 */
class RatedPoissonInput {
 public:
  RatedPoissonInput(std::vector<uint32_t> neurons, uint32_t seed) : neurons_(std::move(neurons)), random_(seed), p_(neurons_.size(), 0) {}

  /** Each neuron's chance of firing in a step is its rate times scale (rates in Hz and the step in seconds), at most 1. */
  void set_probabilities(std::span<const double> rates, double scale);
  /** Writes this step's firing neurons into out, in group order; returns how many. */
  uint32_t sample(uint32_t* out);
  const std::vector<uint32_t>& neurons() const { return neurons_; }

 private:
  double gap();

  std::vector<uint32_t> neurons_;
  js::Mulberry32 random_;
  std::vector<double> p_;
  double max_ = 0;
  double log_miss_ = 0;
  double next_ = std::numeric_limits<double>::infinity();
};

class Simulation {
 public:
  /** One connection: its target and its weight, count × gain[pre] × postScale[post]. */
  struct Edge {
    uint32_t post;
    float weight;
  };

  /** An edge's weight as sim.ts computes it: count × gain[pre], times postScale[post] when there is one. */
  static float weight(uint32_t count, float gain) { return static_cast<float>(count * static_cast<double>(gain)); }
  static float weight(uint32_t count, float gain, float post_scale) {
    return static_cast<float>(count * static_cast<double>(gain) * static_cast<double>(post_scale));
  }

  /** The wiring as CSR by presynaptic neuron: ptr has neurons + 1 entries, edges ptr.back(). */
  Simulation(std::vector<uint32_t> ptr, std::vector<Edge> edges, const SimulationOptions& options);

  uint32_t neurons() const { return neurons_; }
  /** Step, ms. */
  double dt() const { return dt_; }
  uint64_t steps() const { return steps_; }
  uint64_t spikes() const { return spikes_; }
  /** Spike deliveries to individual targets (muted neurons' spikes excluded). */
  uint64_t events() const { return events_; }
  /** Simulated time since construction, ms. */
  double time() const { return static_cast<double>(steps_) * dt_; }
  /** Neurons in the active set now. */
  uint32_t active() const { return listed_count_ + static_cast<uint32_t>(biased_.size()); }

  float potential(uint32_t i) const { return state_[i].v; }
  float drive(uint32_t i) const { return state_[i].g; }
  float adaptation(uint32_t i) const { return state_[i].a; }

  /**
   * A steady drive, mV, per neuron, added to g when integrating v (empty to
   * clear it). Neurons with a bias never leave the active set. This is the
   * engine's graded input.
   */
  void set_bias(std::span<const float> bias);

  /** Adds a group of neurons driven as independent Poisson trains; returns its index. Each draws from its own stream. */
  uint32_t add_input(const std::string& name, std::span<const uint32_t> neurons, double rate_hz = 0);
  /** Changes a group input's rate, Hz per neuron, from the next step on. */
  void set_rate(uint32_t input, double rate_hz);
  /**
   * Adds a group of neurons each driven as its own Poisson train, at a rate
   * of its own (set_rates; all 0 to begin with); returns its index. The
   * neurons keep the order given, which is the order of the rates, and must
   * be distinct. It draws from its own stream, like a group input.
   *
   * With withdraw, a picked neuron doesn't fire: its release falls below its
   * resting level for a moment, which its targets feel, after the synaptic
   * delay, as the opposite of one of its spikes (sim.ts's addRatedInput).
   */
  uint32_t add_rated_input(const std::string& name, std::span<const uint32_t> neurons, bool withdraw = false);
  /** Changes each neuron's rate, Hz, of a rated input from the next step on, in the order its neurons were given. */
  void set_rates(uint32_t input, std::span<const double> rates_hz);

  /**
   * Adds a group of neurons whose outgoing weights set_output_gains scales, each
   * by its own factor (sim.ts's addOutputGain): how strongly each spike of theirs
   * reaches its targets, not whether they fire. Starts at 1; returns its index.
   */
  uint32_t add_output_gain(const std::string& name, std::span<const uint32_t> neurons);
  /** Scales each member's outgoing weights by its factor (above 0) times their weights at 1, from the next spike delivered on. */
  void set_output_gains(uint32_t group, std::span<const double> factors);
  /** Scales every member's outgoing weights by the same factor (sim.ts's setOutputGain). */
  void set_output_gain(uint32_t group, double factor);
  const std::vector<uint32_t>& output_gain_members(uint32_t group) const { return output_gains_.at(group).members; }
  uint32_t add_excitability(const std::string& name, std::span<const uint32_t> neurons);
  void set_excitability(uint32_t group, std::span<const double> mv);
  const std::vector<uint32_t>& excitability_members(uint32_t group) const { return excitability_.at(group).members; }
  void set_tally(std::span<const uint32_t> neurons);
  void drain_tally(std::vector<uint32_t>& into);
  void set_weights(std::span<const float> weights);
  void reset();

  /**
   * Makes these edges' weights settable one by one, each as a factor on its
   * weight now, all at 1 to begin with (sim.ts's setPlasticEdges): a synapse
   * that learns. An edge can't also be in an output gain, and silent_ stays
   * as it was, so the active set doesn't depend on the factors.
   */
  void set_plastic_edges(std::span<const uint32_t> edges);
  /** Sets plastic edge k's weight to its weight at 1 times factor (0 or more), from the next spike delivered on. */
  void set_plastic_factor(uint32_t k, double factor);
  /** Edge e's weight now, mV. */
  float weight_of(uint32_t e) const { return edges_.at(e).weight; }

  /**
   * Logs every spike of these neurons with the step it was fired in, in the
   * order fired (by step, then ascending neuron), until cleared (sim.ts's
   * setSpikeLog). Costs one look-up a spike while set.
   */
  void set_spike_log(std::span<const uint32_t> neurons);
  /** The spikes logged since the last clear_spike_log: their neurons and the steps they fired in, in the order fired. */
  const std::vector<uint32_t>& logged_neurons() const { return log_neurons_; }
  const std::vector<uint64_t>& logged_steps() const { return log_steps_; }
  void clear_spike_log() {
    log_neurons_.clear();
    log_steps_.clear();
  }

  /** Adds a group of neurons whose spikes drain_readouts counts; returns its index. */
  uint32_t add_readout(const std::string& name, std::span<const uint32_t> neurons);
  /** Spikes in each readout since the last drain, by index; then zeroes them. */
  void drain_readouts(std::vector<uint32_t>& into);
  /** A readout's neurons, deduplicated and ascending. */
  const std::vector<uint32_t>& readout_members(uint32_t readout) const { return readout_members_[readout]; }

  /**
   * Counts every spike by the part of a partition of the neurons its neuron
   * is in: part_of[i] (below parts) for neuron i. Unlike a readout, this costs
   * one increment a spike whichever neuron fires, so it can cover them all.
   */
  void set_partition(std::vector<uint8_t> part_of, uint32_t parts);
  /** Spikes in each part since the last drain, by part; then zeroes them. */
  void drain_partition(std::vector<uint32_t>& into);

  /** The neurons that spiked in the last step, ascending. */
  std::span<const uint32_t> last_spikes() const;

  /** Runs whole steps covering ms of simulated time; remainders carry over. Returns the steps run. */
  uint64_t advance(double ms);
  /** Runs one step of dt. */
  void step();

 private:
  // Per-neuron state is interleaved, 16 bytes a neuron, so an update touches
  // one cache line rather than four. sim.ts keeps the refractory count as a
  // float; it is a small whole number either way.
  struct Neuron {
    float v;
    float g;
    float a;
    int32_t hold;
  };

  // Inputs in the order they were added, which seeds each one's stream. A
  // group input has one rate for all its neurons; a rated input one per
  // neuron.
  struct Input {
    std::string name;
    double rate;
    bool on;
    bool withdraw;
    std::variant<PoissonInput, RatedPoissonInput> source;
    std::vector<double> rates = {};
  };

  template <bool kCleanup>
  uint32_t sweep(uint32_t* out);
  uint32_t sweep_biased(uint32_t* out, uint32_t fired);
  void join(uint32_t i);
  void rebuild_biased();
  void scale_outputs(size_t group, size_t member);
  void merge_tail(uint32_t* out, uint32_t sorted, uint32_t fired);
  std::vector<uint32_t> members(std::span<const uint32_t> neurons, const std::string& what) const;
  void check_name(const std::string& name) const;

  uint32_t neurons_;
  double dt_;
  double threshold_;
  double epsilon_;
  uint32_t cleanup_interval_;
  uint32_t seed_;
  bool reset_drive_;
  int32_t refractory_steps_;
  uint32_t delay_steps_;
  double leak_;
  double decay_;
  // 0 with resetDrive, else 1: what a spike multiplies g by.
  double keep_drive_;
  // Per-step decay of the adaptation variable, and what a spike adds to it.
  double adapt_decay_;
  double adapt_step_;

  std::vector<uint32_t> ptr_;
  std::vector<Edge> edges_;
  // Neurons whose every outgoing weight is 0; their spikes are not delivered,
  // which is exact, since adding 0 changes nothing.
  std::vector<uint8_t> silent_;
  std::vector<Neuron> state_;

  // Membership of the active set, and the part of it the main sweep steps:
  // the same, less the neurons with a bias, which sweep_biased steps.
  std::vector<uint64_t> in_set_;
  std::vector<uint64_t> listed_;
  uint32_t listed_count_ = 0;
  std::vector<float> bias_;
  std::vector<uint32_t> biased_;

  // Spikes by the step they were fired in, modulo the delay.
  std::vector<std::vector<uint32_t>> ring_;
  std::vector<uint32_t> ring_length_;
  int64_t last_slot_ = -1;
  // Withdrawals by the step they were drawn in, modulo the delay, ascending:
  // delivered as their synapses' opposite. They are not spikes.
  std::vector<std::vector<uint32_t>> withdrawn_;

  std::vector<Input> inputs_;
  std::vector<uint32_t> scratch_;

  // Per-member output gains keep unscaled weights so changes never compound.
  struct OutputGain {
    std::string name;
    std::vector<uint32_t> members, starts, edges;
    std::vector<float> base;
    std::vector<double> factors;
  };
  std::vector<OutputGain> output_gains_;
  struct Excitability { std::string name; std::vector<uint32_t> members; };
  std::vector<Excitability> excitability_;
  std::vector<uint8_t> pinned_;
  std::vector<int32_t> tally_index_;
  std::vector<uint32_t> tally_;

  // Edges whose weights are set one by one: each edge and its weight at factor 1.
  std::vector<uint32_t> plastic_edges_;
  std::vector<float> plastic_base_;

  // Neurons whose spikes are logged (empty for none), and the log since it was last cleared.
  std::vector<uint8_t> logged_;
  std::vector<uint32_t> log_neurons_;
  std::vector<uint64_t> log_steps_;

  std::vector<std::string> readout_names_;
  std::vector<std::vector<uint32_t>> readout_members_;
  std::vector<uint32_t> readout_counts_;
  // Neuron -> readouts, as CSR.
  std::vector<uint32_t> watch_ptr_;
  std::vector<uint32_t> watch_ids_;

  // Which part of a partition each neuron is in (empty for none), and each part's spikes since the last drain.
  std::vector<uint8_t> part_of_;
  std::vector<uint32_t> part_counts_;

  uint64_t steps_ = 0;
  uint64_t spikes_ = 0;
  uint64_t events_ = 0;
  double carry_ms_ = 0;
};

}  // namespace fly

#endif
