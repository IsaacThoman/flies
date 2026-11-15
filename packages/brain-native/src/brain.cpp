#include "brain.hpp"

#include <chrono>
#include <stdexcept>

#include "json.hpp"
#include "params.hpp"

namespace fly {

Brain::Brain(const Connectome& connectome, uint32_t seed)
    : neurons_(connectome.neurons()),
      connections_(connectome.connections()),
      wiring_(io::wire(connectome)),
      sim_(params::build(connectome, seed)),
      // A separate stream from the Poisson inputs', which input_seed derives from the same seed.
      state_(seed ^ 0x5bd1e995u) {
  for (const io::Group& group : wiring_.senses) sense_inputs_.push_back(sim_.add_input(group.spec.name, group.neurons));
  for (const io::Group& group : wiring_.background) background_inputs_.push_back(sim_.add_input(group.spec.name, group.neurons));
  for (const io::ReadoutGroup& group : wiring_.readouts) {
    sim_.add_readout(group.spec.name, group.neurons);
    rate_names_.push_back(group.spec.name);
    rates_.push_back(0);
  }
}

io::Command Brain::tick(double dt_ms, const io::Senses& senses, const Light&, TickStats& stats) {
  if (!(dt_ms >= 0 && dt_ms <= kMaxTickMs)) throw std::invalid_argument("tick takes 0 to 1000 ms, not " + json::number_to_string(dt_ms));
  const auto started = std::chrono::steady_clock::now();
  const uint64_t spikes_before = sim_.spikes();
  const double time_before = sim_.time();
  for (size_t k = 0; k < wiring_.senses.size(); k++) {
    const io::Group& group = wiring_.senses[k];
    sim_.set_rate(sense_inputs_[k], group.max_rate * io::intensity(senses, group.spec.sense));
  }
  double left = dt_ms;
  while (left > 1e-9) {
    const double chunk = js::min(kChunkMs, left);
    left -= chunk;
    state_.step(chunk / 1000);
    const double level[2] = {state_.level(io::kLeft), state_.level(io::kRight)};
    for (size_t k = 0; k < wiring_.background.size(); k++) {
      const io::Group& group = wiring_.background[k];
      sim_.set_rate(background_inputs_[k], group.max_rate * js::clamp(level[group.spec.side], 0, 1));
    }
    const double before = sim_.time();
    sim_.advance(chunk);
    const double ran = sim_.time() - before;
    if (ran <= 0) continue;
    sim_.drain_readouts(counts_);
    for (size_t r = 0; r < wiring_.readouts.size(); r++) {
      const double hz = (counts_[r] / static_cast<double>(wiring_.readouts[r].neurons.size()) / ran) * 1000;
      rates_[r] = io::smooth(rates_[r], hz, ran, wiring_.readouts[r].spec.tau);
    }
  }
  stats.sim_ms = sim_.time() - time_before;
  stats.wall_ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - started).count();
  stats.spikes = sim_.spikes() - spikes_before;
  stats.active = sim_.active();
  return io::decode(rates_);
}

}  // namespace fly
