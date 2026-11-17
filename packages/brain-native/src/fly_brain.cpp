// The C interface of include/fly_brain.h over fly::Brain. Nothing thrown
// inside crosses it: every failure becomes a message in the caller's buffer.

#include "exact.hpp"

#include "fly_brain.h"

#include <cstdio>
#include <exception>
#include <new>
#include <span>
#include <stdexcept>
#include <string>

#include "brain.hpp"
#include "fly_brain_internal.hpp"

namespace {

void report(char* error, size_t error_size, const char* message) {
  if (error != nullptr && error_size > 0) std::snprintf(error, error_size, "%s", message);
}

template <class F>
bool guarded(char* error, size_t error_size, F&& f) {
  try {
    f();
    return true;
  } catch (const std::bad_alloc&) {
    report(error, error_size, "Out of memory");
  } catch (const std::exception& e) {
    report(error, error_size, e.what());
  } catch (...) {
    report(error, error_size, "Unknown error");
  }
  return false;
}

}  // namespace

extern "C" {

fly_brain* fly_brain_create(const uint8_t* data, size_t length, uint32_t seed, char* error, size_t error_size) {
  fly_brain* brain = nullptr;
  guarded(error, error_size, [&] {
    if (data == nullptr && length > 0) throw fly::FormatError("The brain needs the packed connectome's bytes");
    static const uint8_t kNothing = 0;
    const fly::Connectome connectome(data != nullptr ? data : &kNothing, length);
    brain = new fly_brain{fly::Brain(connectome, seed)};
  });
  return brain;
}

void fly_brain_destroy(fly_brain* brain) { delete brain; }

uint32_t fly_brain_neurons(const fly_brain* brain) { return brain->brain.neurons(); }
uint32_t fly_brain_connections(const fly_brain* brain) { return brain->brain.connections(); }

uint32_t fly_brain_facets(const fly_brain* brain, int side) {
  return side == 0 || side == 1 ? brain->brain.facets(static_cast<fly::io::Side>(side)) : 0;
}

const float* fly_brain_eye_directions(const fly_brain* brain, int side) {
  const auto& eyes = brain->brain.eyes();
  return eyes && (side == 0 || side == 1) ? (*eyes)[static_cast<size_t>(side)].directions.data() : nullptr;
}

float fly_brain_eye_acceptance(const fly_brain* brain) { return brain->brain.eyes() ? static_cast<float>(fly::eyes::acceptance()) : 0; }

uint32_t fly_brain_rate_count(const fly_brain* brain) { return static_cast<uint32_t>(brain->brain.rate_names().size()); }

const char* fly_brain_rate_name(const fly_brain* brain, uint32_t index) {
  const auto& names = brain->brain.rate_names();
  return index < names.size() ? names[index].c_str() : nullptr;
}

int fly_brain_tick(fly_brain* brain, double dt_ms, const fly_senses* senses, fly_command* command, fly_stats* stats, float* rates, char* error,
                   size_t error_size) {
  fly::Light light;
  // Both pointers NULL: the eyes are shut. One NULL: that eye is left out, which the brain refuses.
  if (brain != nullptr && senses != nullptr && (senses->light_left != nullptr || senses->light_right != nullptr)) {
    light.open = true;
    if (senses->light_left != nullptr) light.left = std::span<const float>(senses->light_left, brain->brain.facets(fly::io::kLeft));
    if (senses->light_right != nullptr) light.right = std::span<const float>(senses->light_right, brain->brain.facets(fly::io::kRight));
  }
  return fly::tick(brain, dt_ms, senses, light, command, stats, rates, error, error_size);
}

}  // extern "C"

namespace fly {

int tick(fly_brain* brain, double dt_ms, const fly_senses* senses, const Light& light, fly_command* command, fly_stats* stats, float* rates, char* error,
         size_t error_size) {
  const bool ok = guarded(error, error_size, [&] {
    if (brain == nullptr || senses == nullptr) throw std::invalid_argument("fly_brain_tick needs a brain and its senses");
    fly::io::Senses in;
    in.loom_left = senses->loom_left;
    in.loom_right = senses->loom_right;
    in.touch = senses->touch;
    in.bump_left = senses->bump_left;
    in.bump_right = senses->bump_right;
    in.wind = senses->wind;
    in.sweet = senses->sweet;
    in.grounded = senses->grounded != 0;
    in.male_taste = senses->male_taste;
    in.hunger = senses->hunger;
    in.wingbeat = senses->wingbeat;
    in.state[fly::io::kClockMorning] = senses->clock_morning;
    in.state[fly::io::kClockEvening] = senses->clock_evening;
    in.state[fly::io::kClockSleep] = senses->clock_sleep;
    in.state[fly::io::kSleepPressure] = senses->sleep_pressure;
    in.state[fly::io::kSleepDepth] = senses->sleep_depth;
    in.bitter = senses->bitter;
    in.water = senses->water;
    fly::TickStats out;
    const fly::io::Command c = brain->brain.tick(dt_ms, in, light, out);
    if (command != nullptr) {
      *command = fly_command{static_cast<float>(c.walk),  static_cast<float>(c.turn),  static_cast<float>(c.back), static_cast<float>(c.escape),
                             static_cast<float>(c.wings), static_cast<float>(c.groom), static_cast<float>(c.feed),
                             static_cast<float>(c.sing)};
    }
    if (stats != nullptr) *stats = fly_stats{out.sim_ms, out.wall_ms, static_cast<uint32_t>(out.spikes), out.active};
    if (rates != nullptr) {
      const auto& smoothed = brain->brain.rates();
      for (size_t r = 0; r < smoothed.size(); r++) rates[r] = static_cast<float>(smoothed[r]);
    }
  });
  return ok ? 0 : 1;
}

}  // namespace fly
