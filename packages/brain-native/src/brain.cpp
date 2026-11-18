#include "brain.hpp"

#include <algorithm>
#include <chrono>
#include <stdexcept>
#include <string_view>
#include <unordered_set>
#include <utility>

#include "json.hpp"
#include "params.hpp"
#include "regions.hpp"

namespace fly {

Brain::Brain(const Connectome& connectome, uint32_t seed, const eyes::Columns& columns)
    : neurons_(connectome.neurons()),
      connections_(connectome.connections()),
      wiring_(io::wire(connectome)),
      sim_(params::build(connectome, seed)),
      // A separate stream from the Poisson inputs', which input_seed derives from the same seed.
      state_(seed ^ 0x5bd1e995u),
      modulation_(connectome, wiring_) {
  sense_inputs_.assign(wiring_.senses.size(), 0);
  for (size_t k = 0; k < wiring_.senses.size(); k++) {
    const io::Group& group = wiring_.senses[k];
    if (group.spec.after_eyes) continue;
    if (group.ends.empty()) {
      sense_inputs_[k] = sim_.add_input(group.spec.name, group.neurons);
      continue;
    }
    // A rate for each region: one input still, so every later input's stream is where it was.
    sense_inputs_[k] = sim_.add_rated_input(group.spec.name, group.neurons);
    regional_.push_back({k, std::vector<double>(group.neurons.size(), 0), std::vector<double>(group.ends.size(), 0)});
  }
  for (const io::Group& group : wiring_.background) background_inputs_.push_back(sim_.add_input(group.spec.name, group.neurons));
  // Thirst scales how strongly the water neurons' spikes reach their targets (io.ts, THIRST).
  for (const io::Group& group : wiring_.senses) {
    if (group.spec.sense == io::kWater) water_gain_ = sim_.add_output_gain(group.spec.name, group.neurons);
  }
  for (const io::ReadoutGroup& group : wiring_.readouts) {
    sim_.add_readout(group.spec.name, group.neurons);
    rate_names_.push_back(group.spec.name);
    rates_.push_back(0);
  }
  sim_.set_tally(modulation_.sources);
  for (uint32_t r = 0; r < modulation_.routes.size(); r++) {
    const auto& route = modulation_.routes[r];
    if (route.release && !route.carriers.empty()) release_.push_back({r, sim_.add_output_gain("release " + route.receptor, route.carriers)});
  }
  if (!modulation_.excitable.empty()) modulated_ = sim_.add_excitability("modulated", modulation_.excitable);
  // Every region is reported, after the readouts, whether or not it has neurons (an empty one stays at 0).
  std::vector<uint8_t> region_of = regions::of(connectome);
  region_sizes_.assign(regions::ids().size(), 0);
  for (uint8_t r : region_of) region_sizes_[r]++;
  sim_.set_partition(std::move(region_of), static_cast<uint32_t>(regions::ids().size()));
  for (const std::string& id : regions::ids()) {
    rate_names_.push_back(regions::rate_name(id));
    rates_.push_back(0);
  }
  // The eyes come after every other input but the senses added since
  // (after_eyes), so their streams leave the others' as they were.
  eyes_ = eyes::build(connectome, columns);
  if (eyes_) {
    for (io::Side side : {io::kLeft, io::kRight}) retinas_.emplace_back((*eyes_)[side]);
    for (io::Side side : {io::kLeft, io::kRight}) {
      gained_[side].assign(retinas_[side].rates().size(), 0);
      gained_withdrawals_[side].assign(retinas_[side].withdrawals().size(), 0);
    }
    std::unordered_set<uint32_t> read;
    for (const io::ReadoutGroup& group : wiring_.readouts) read.insert(group.neurons.begin(), group.neurons.end());
    for (io::Side side : {io::kLeft, io::kRight}) {
      const char* name = side == io::kLeft ? "left" : "right";
      for (uint32_t i : retinas_[side].neurons()) {
        if (read.count(i) != 0) throw std::runtime_error("Neuron " + std::to_string(i) + " is both driven by the " + name + " eye and read");
      }
      eye_inputs_[side] = sim_.add_rated_input(std::string("eye ") + name, retinas_[side].neurons());
    }
    for (io::Side side : {io::kLeft, io::kRight}) {
      for (const vision::Stage& stage : vision::stages()) {
        std::vector<uint32_t> neurons;
        if (stage.lamina) {
          neurons = retinas_[side].neurons();
        } else {
          NeuronQuery select = stage.select;
          const std::string side_name = side == io::kLeft ? "left" : "right";
          select[kSide] = [side_name](std::string_view s) { return s == side_name; };
          neurons = connectome.find(select);
        }
        if (neurons.empty()) continue;
        sim_.add_readout(vision::stage_name(stage, side), neurons);
        rate_names_.push_back(vision::stage_name(stage, side));
        rates_.push_back(0);
        vision_sizes_.push_back(static_cast<double>(neurons.size()));
      }
    }
  }
  for (size_t k = 0; k < wiring_.senses.size(); k++) {
    if (wiring_.senses[k].spec.after_eyes) sense_inputs_[k] = sim_.add_input(wiring_.senses[k].spec.name, wiring_.senses[k].neurons);
  }
  // After those, so they too leave every other input's stream as it was.
  for (const io::StateGroup& group : wiring_.state) state_inputs_.push_back(sim_.add_input(group.spec.name, group.neurons));
  // L1's withdrawals under brightening last of all, so every other input's stream is as it was without them.
  for (size_t side = 0; side < retinas_.size(); side++) {
    withdrawn_inputs_[side] = sim_.add_rated_input(std::string("eye ") + (side == io::kLeft ? "left" : "right") + " withdrawn", retinas_[side].l1(), true);
  }
  // The thermoreceptors after even those: with no temperature felt, every stream is as it was before them.
  for (const io::ThermoGroup& group : wiring_.thermo) thermo_inputs_.push_back(sim_.add_input(group.spec.name, group.neurons));
  // The reinforcement stand-ins after even those (io.ts, REINFORCEMENT).
  for (const io::Group& group : wiring_.reinforcement) reinforcement_inputs_.push_back(sim_.add_input(group.spec.name, group.neurons));
  // The receptor neurons of smell after even those, so every earlier input's stream is as it was.
  smell_ = olfaction::wire(connectome);
  std::unordered_set<uint32_t> read;
  for (const auto& group : wiring_.readouts) read.insert(group.neurons.begin(), group.neurons.end());
  for (const auto& group : smell_) {
    for (uint32_t i : group.neurons) {
      if (read.count(i)) throw std::runtime_error("Neuron " + std::to_string(i) + " is both driven by \"" + group.name + "\" and read");
    }
    smell_inputs_.push_back(sim_.add_input(group.name, group.neurons, 0));
  }
  // runtime.ts finds the learning connections only when first needed, to keep building quick; natively building
  // them takes a few ms, so they are found at once, which gives the same results.
  learning::MushroomBody body(connectome);
  if (!body.kcs().empty()) {
    sim_.set_plastic_edges(body.edges());
    sim_.set_spike_log(body.watched());
    learning_.emplace(std::move(body));
  }
}

std::vector<uint8_t> Brain::memory() const {
  return learning_ ? learning_->memory() : learning::write_memory(learning::kEmptyLayoutHash, 0, {});
}

void Brain::remember(std::span<const uint8_t> memory) {
  if (learning_) {
    learning_->remember(memory, sim_);
  } else {
    learning::read_memory(memory, learning::kEmptyLayoutHash, 0);
  }
}

io::Command Brain::tick(double dt_ms, const io::Senses& senses, const Light& light, TickStats& stats) {
  if (!(dt_ms >= 0 && dt_ms <= kMaxTickMs)) throw std::invalid_argument("tick takes 0 to 1000 ms, not " + json::number_to_string(dt_ms));
  const auto started = std::chrono::steady_clock::now();
  const uint64_t spikes_before = sim_.spikes();
  const double time_before = sim_.time();
  // Checked before anything moves, so a bad picture leaves the brain as it was.
  if (light.open && eyes_) {
    for (io::Side side : {io::kLeft, io::kRight}) {
      const auto& given = side == io::kLeft ? light.left : light.right;
      const uint32_t facets = retinas_[side].facets();
      if (!given || given->size() != facets) {
        throw std::invalid_argument(std::string("The ") + (side == io::kLeft ? "left" : "right") + " eye has " + std::to_string(facets) +
                                    " facets, but the light gives " + (given ? std::to_string(given->size()) : "undefined"));
      }
    }
  }
  const double gate = io::sleep_gate(senses);
  for (size_t k = 0; k < wiring_.senses.size(); k++) {
    const io::Group& group = wiring_.senses[k];
    if (!group.ends.empty()) continue;
    sim_.set_rate(sense_inputs_[k], group.max_rate * io::intensity(senses, group.spec.sense) * (group.spec.gated ? gate : 1));
  }
  for (Regional& regional : regional_) touch(regional, senses);
  for (size_t k = 0; k < wiring_.reinforcement.size(); k++) {
    const io::Group& group = wiring_.reinforcement[k];
    sim_.set_rate(reinforcement_inputs_[k], group.max_rate * io::intensity(senses, group.spec.sense));
  }
  const auto odor = olfaction::odor_of(senses);
  for (size_t k = 0; k < smell_.size(); k++) sim_.set_rate(smell_inputs_[k], olfaction::rate(smell_[k], odor));
  const double hunger = io::hunger_of(senses);
  modulation_.set_state(senses, hunger);
  modulation_.update(0);
  modulate();
  state_.set_hunger(hunger);
  sim_.set_output_gain(water_gain_, io::water_output_gain(io::thirst_of(senses)));
  for (size_t k = 0; k < wiring_.state.size(); k++) {
    const io::StateGroup& group = wiring_.state[k];
    sim_.set_rate(state_inputs_[k], group.spec.max_rate * io::state_of(senses, group.spec.state));
  }
  state_.rest(js::max(io::state_of(senses, io::kClockMorning), io::state_of(senses, io::kClockEvening)), io::state_of(senses, io::kClockSleep),
              io::state_of(senses, io::kSleepPressure), io::state_of(senses, io::kSleepDepth));
  const double eye_gain = 1 - io::kSleepEyes * state_.sleepiness();
  const double temperature[2] = {thermo::temperature_of(senses, io::kLeft), thermo::temperature_of(senses, io::kRight)};
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
    for (size_t side = 0; side < retinas_.size(); side++) {
      const std::span<const float>* seen = light.open ? &*(side == io::kLeft ? light.left : light.right) : nullptr;
      const bool changed = retinas_[side].step(chunk, seen);
      if (!changed && eye_gain == eye_gain_) continue;
      if (eye_gain == 1) {
        sim_.set_rates(eye_inputs_[side], retinas_[side].rates());
        sim_.set_rates(withdrawn_inputs_[side], retinas_[side].withdrawals());
      } else {
        // Sleepiness lowers the lamina's input whichever way the light changes.
        const std::vector<double>& rates = retinas_[side].rates();
        std::vector<double>& gained = gained_[side];
        for (size_t n = 0; n < gained.size(); n++) gained[n] = rates[n] * eye_gain;
        sim_.set_rates(eye_inputs_[side], gained);
        const std::vector<double>& withdrawals = retinas_[side].withdrawals();
        std::vector<double>& gained_withdrawals = gained_withdrawals_[side];
        for (size_t n = 0; n < gained_withdrawals.size(); n++) gained_withdrawals[n] = withdrawals[n] * eye_gain;
        sim_.set_rates(withdrawn_inputs_[side], gained_withdrawals);
      }
    }
    if (!retinas_.empty()) eye_gain_ = eye_gain;
    for (io::Side side : {io::kLeft, io::kRight}) {
      const thermo::Thermoreceptors::Rates rates = thermoreceptors_.step(side, temperature[side], chunk);
      for (size_t k = 0; k < wiring_.thermo.size(); k++) {
        const io::ThermoSpec& spec = wiring_.thermo[k].spec;
        if (spec.side == side) sim_.set_rate(thermo_inputs_[k], spec.heating ? rates.heating : rates.cooling);
      }
    }
    const double before = sim_.time();
    sim_.advance(chunk);
    const double ran = sim_.time() - before;
    if (ran <= 0) continue;
    sim_.drain_tally(modulation_.counts);
    modulation_.update(ran);
    modulate();
    if (learning_) learning_->learn(sim_, sim_.time());
    sim_.drain_readouts(counts_);
    for (size_t r = 0; r < wiring_.readouts.size(); r++) {
      const double hz = (counts_[r] / static_cast<double>(wiring_.readouts[r].neurons.size()) / ran) * 1000;
      rates_[r] = io::smooth(rates_[r], hz, ran, wiring_.readouts[r].spec.tau);
    }
    const size_t first = wiring_.readouts.size();
    sim_.drain_partition(region_counts_);
    for (size_t r = 0; r < region_sizes_.size(); r++) {
      if (region_sizes_[r] == 0) continue;
      double& rate = rates_[first + r];
      rate = io::smooth(rate, (region_counts_[r] / region_sizes_[r] / ran) * 1000, ran, regions::kTau);
    }
    // The vision readouts follow the regions in rates() but the readouts in the simulation's counts.
    const size_t vision_first = first + region_sizes_.size();
    for (size_t v = 0; v < vision_sizes_.size(); v++) {
      rates_[vision_first + v] = io::smooth(rates_[vision_first + v], (counts_[first + v] / vision_sizes_[v] / ran) * 1000, ran, vision::kTau);
    }
  }
  stats.sim_ms = sim_.time() - time_before;
  stats.wall_ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - started).count();
  stats.spikes = sim_.spikes() - spikes_before;
  stats.active = sim_.active();
  return io::decode(rates_);
}

// Sets a group of regions' rates, where any region's has changed: setting them redraws the input's next spike, so only then.
void Brain::touch(Regional& regional, const io::Senses& senses) {
  const io::Group& group = wiring_.senses[regional.group];
  bool changed = false;
  for (size_t r = 0; r < group.ends.size(); r++) {
    const double rate = io::region_rate(group, r, senses);
    if (rate == regional.felt[r]) continue;
    regional.felt[r] = rate;
    changed = true;
    std::fill(regional.rates.begin() + (r == 0 ? 0 : group.ends[r - 1]), regional.rates.begin() + group.ends[r], rate);
  }
  if (changed) sim_.set_rates(sense_inputs_[regional.group], regional.rates);
}

void Brain::modulate() {
  for (const auto& [route, group] : release_) sim_.set_output_gains(group, modulation_.routes[route].factors);
  if (!modulation_.excitable.empty()) sim_.set_excitability(modulated_, modulation_.bias);
}

}  // namespace fly
