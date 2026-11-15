// Wall time per simulated second of the native brain on the real connectome,
// at rest and with every sense at full strength, through the C interface in
// 16 ms ticks as the game sends them:
//
//   fly-brain-bench <connectome.bin> [seconds=10] [seed=1]
//
// Each regime runs a simulated second untimed first. Single-threaded.

#include <sys/resource.h>

#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <vector>

#include "fly_brain.h"
#include "fly_brain_internal.hpp"

namespace {

double megabytes(long bytes) { return static_cast<double>(bytes) / (1024.0 * 1024.0); }

long peak_rss() {
  rusage usage{};
  getrusage(RUSAGE_SELF, &usage);
#if defined(__APPLE__)
  return usage.ru_maxrss;
#else
  return usage.ru_maxrss * 1024;
#endif
}

void regime(fly_brain* brain, const char* label, const fly_senses& senses, double seconds) {
  const double tick = 16;
  fly_command command;
  fly_stats stats;
  char error[256];
  for (double t = 0; t < 1000; t += tick) fly_brain_tick(brain, tick, &senses, &command, &stats, nullptr, error, sizeof error);
  const uint64_t events_before = brain->brain.sim().events();
  double wall = 0;
  double sim = 0;
  double active = 0;
  uint64_t spikes = 0;
  int ticks = 0;
  while (sim < seconds * 1000) {
    const auto started = std::chrono::steady_clock::now();
    if (fly_brain_tick(brain, tick, &senses, &command, &stats, nullptr, error, sizeof error) != 0) {
      std::fprintf(stderr, "%s\n", error);
      std::exit(1);
    }
    wall += std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - started).count();
    sim += stats.sim_ms;
    spikes += stats.spikes;
    active += stats.active;
    ticks++;
  }
  const double per = wall / sim;
  std::printf("%s\n", label);
  std::printf("  wall per simulated second  %.4f s (%.3f ms per 16 ms tick)\n", per, per * tick);
  std::printf("  active neurons             %.0f mean\n", active / ticks);
  std::printf("  spikes per second          %.0f\n", static_cast<double>(spikes) / (sim / 1000));
  std::printf("  synaptic events per second %.0f\n", static_cast<double>(brain->brain.sim().events() - events_before) / (sim / 1000));
}

}  // namespace

int main(int argc, char** argv) {
  if (argc < 2) {
    std::fputs("usage: fly-brain-bench <connectome.bin> [seconds=10] [seed=1]\n", stderr);
    return 2;
  }
  const double seconds = argc > 2 ? std::atof(argv[2]) : 10;
  const auto seed = static_cast<uint32_t>(argc > 3 ? std::strtoul(argv[3], nullptr, 10) : 1);
  std::vector<uint8_t> data;
  {
    std::ifstream file(argv[1], std::ios::binary | std::ios::ate);
    if (file) {
      data.resize(static_cast<size_t>(file.tellg()));
      file.seekg(0);
      file.read(reinterpret_cast<char*>(data.data()), static_cast<std::streamsize>(data.size()));
    }
    if (!file) {
      std::fprintf(stderr, "cannot read %s\n", argv[1]);
      return 1;
    }
  }
  const long before = peak_rss();
  char error[512];
  const auto started = std::chrono::steady_clock::now();
  fly_brain* brain = fly_brain_create(data.data(), data.size(), seed, error, sizeof error);
  const double build_ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - started).count();
  if (brain == nullptr) {
    std::fprintf(stderr, "%s\n", error);
    return 1;
  }
  const long built = peak_rss();
  // The host need not keep the file once the brain is built.
  std::vector<uint8_t>().swap(data);
  std::printf("built %u neurons, %u connections in %.0f ms\n", fly_brain_neurons(brain), fly_brain_connections(brain), build_ms);
  std::printf("peak resident memory: %.1f MB with the file read, %.1f MB while building\n", megabytes(before), megabytes(built));

  const fly_senses rest{0, 0, 0, 0, 0, 0, 0, 1, nullptr, nullptr};
  const fly_senses everything{1, 1, 1, 1, 1, 1, 1, 1, nullptr, nullptr};
  regime(brain, "at rest (standing)", rest, seconds);
  regime(brain, "every sense at full strength", everything, seconds);
  regime(brain, "at rest again", rest, seconds);
  std::printf("peak resident memory overall: %.1f MB\n", megabytes(peak_rss()));
  fly_brain_destroy(brain);
  return 0;
}
