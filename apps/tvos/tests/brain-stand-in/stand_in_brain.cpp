// A stand-in for packages/brain-native, for checking the Apple TV app's brain bridge without
// the real simulation (`node scripts/tvos.ts build --stand-in-brain`). It implements
// fly_brain.h with answers a test can predict:
//
//   - it checks the connectome's magic and takes its neuron and connection counts from the
//     file's header, so a test can tell the bundled file arrived whole;
//   - each eye has kFacets facets; turn is mean(right light) - mean(left light), so a test can
//     tell the light arrays arrived, and on the right sides;
//   - walk is always 0.8; feed follows `sweet`; sing follows `male_taste`; escape is 1 while grounded is 0;
//   - the stats count ticks (spikes) and the simulated time of each (sim_ms); the rates are the
//     ticks so far and the total simulated time, then numbered ones (each its own index) up to as
//     many as the real brain reports with its eyes and regions, so a test can tell they all arrive.
//
// Each tick takes kTickMs of wall time, so a test can watch submitted time pile up.
#include "fly_brain.h"
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>
#include <thread>
#include <vector>

namespace {
constexpr uint32_t kFacets = 8;
constexpr int kTickMs = 20;
// The real brain's: 9 command readouts, 63 regions, 12 vision stages.
constexpr uint32_t kRates = 84;

const std::vector<std::string> &RateNames() {
  static const std::vector<std::string> names = [] {
    std::vector<std::string> out = {"standin.ticks", "standin.simulatedMs"};
    for (uint32_t k = 2; k < kRates; k++) out.push_back("standin.rate" + std::to_string(k));
    return out;
  }();
  return names;
}

uint32_t HeaderNumber(const std::string &header, const char *key) {
  size_t at = header.find(std::string("\"") + key + "\":");
  return at == std::string::npos ? 0 : (uint32_t)strtoul(header.c_str() + at + strlen(key) + 3, nullptr, 10);
}
}  // namespace

struct fly_brain {
  uint32_t neurons = 0, connections = 0;
  std::vector<float> directions[2];
  uint64_t ticks = 0;
  double simulated = 0;
};

fly_brain *fly_brain_create(const uint8_t *data, size_t length, uint32_t, char *error, size_t error_size) {
  if (length < 12 || memcmp(data, "CBUG", 4) != 0) {
    snprintf(error, error_size, "not a packed connectome (%zu bytes)", length);
    return nullptr;
  }
  uint32_t headerLength;
  memcpy(&headerLength, data + 8, 4);
  if (12 + (size_t)headerLength > length) {
    snprintf(error, error_size, "connectome header runs past the end");
    return nullptr;
  }
  std::string header((const char *)data + 12, headerLength);
  auto *brain = new fly_brain();
  brain->neurons = HeaderNumber(header, "neurons");
  brain->connections = HeaderNumber(header, "connections");
  // Facets in a ring ahead of each eye: x toward the fly's right, y ahead, z up.
  for (int side = 0; side < 2; side++) {
    for (uint32_t i = 0; i < kFacets; i++) {
      double a = 2 * M_PI * i / kFacets;
      double x = (side ? 1 : -1) * 0.5, y = 0.8, z = 0.3 * sin(a);
      double n = sqrt(x * x + y * y + z * z);
      brain->directions[side].insert(brain->directions[side].end(), { (float)(x / n), (float)(y / n), (float)(z / n) });
    }
  }
  return brain;
}

void fly_brain_destroy(fly_brain *brain) { delete brain; }
uint32_t fly_brain_neurons(const fly_brain *brain) { return brain->neurons; }
uint32_t fly_brain_connections(const fly_brain *brain) { return brain->connections; }
uint32_t fly_brain_facets(const fly_brain *, int) { return kFacets; }
const float *fly_brain_eye_directions(const fly_brain *brain, int side) { return brain->directions[side ? 1 : 0].data(); }
float fly_brain_eye_acceptance(const fly_brain *) { return 0.1f; }

uint32_t fly_brain_rate_count(const fly_brain *) { return kRates; }
const char *fly_brain_rate_name(const fly_brain *, uint32_t index) { return index < kRates ? RateNames()[index].c_str() : nullptr; }

int fly_brain_tick(fly_brain *brain, double dt_ms, const fly_senses *senses, fly_command *command, fly_stats *stats, float *rates, char *error, size_t error_size) {
  if (!(dt_ms >= 0 && dt_ms <= 1000)) {
    snprintf(error, error_size, "dt_ms %g is out of range", dt_ms);
    return 1;
  }
  auto start = std::chrono::steady_clock::now();
  std::this_thread::sleep_for(std::chrono::milliseconds(kTickMs));
  double turn = 0;
  if (senses->light_left && senses->light_right) {
    double left = 0, right = 0;
    for (uint32_t i = 0; i < kFacets; i++) { left += senses->light_left[i]; right += senses->light_right[i]; }
    turn = (right - left) / kFacets;
  }
  brain->ticks++;
  brain->simulated += dt_ms;
  *command = { 0.8f, (float)turn, 0, senses->grounded ? 0.f : 1.f, 0, 0, senses->sweet, senses->male_taste };
  stats->sim_ms = dt_ms;
  stats->wall_ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - start).count();
  stats->spikes = (uint32_t)brain->ticks;
  stats->active = 0;
  if (rates) {
    rates[0] = (float)brain->ticks;
    rates[1] = (float)brain->simulated;
    for (uint32_t k = 2; k < kRates; k++) rates[k] = (float)k;
  }
  return 0;
}
