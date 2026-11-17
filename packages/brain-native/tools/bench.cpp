// Wall time per simulated second of the native brain on the real connectome,
// through the C interface in 16 ms ticks as the game sends them: at rest and
// with every sense at full strength, the eyes shut, then with the eyes open on
// the scenes of a frames file, then at rest again:
//
//   fly-brain-bench <connectome.bin> [seconds=10] [seed=1] [frames]
//
// Each regime runs a simulated second untimed first. The frames file is what
// scripts/bench.ts writes: for each scene a line-free run of frames, left eye
// then right eye each tick, each a u32 count and that many f32
// (tools/harness.cpp's format), the untimed second's ticks and then the timed
// ones; the scenes' names are the arguments after it. Single-threaded.

#include <sys/resource.h>
#if defined(__APPLE__)
#include <mach/mach.h>
#endif

#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <string>
#include <vector>

#include "fly_brain.h"
#include "fly_brain_internal.hpp"

namespace {

double megabytes(long bytes) { return static_cast<double>(bytes) / (1024.0 * 1024.0); }

// Memory in use now: on Apple platforms the footprint, which is what Xcode
// shows and what the system counts against an app; elsewhere the peak
// resident size.
long footprint() {
#if defined(__APPLE__)
  task_vm_info_data_t info{};
  mach_msg_type_number_t count = TASK_VM_INFO_COUNT;
  if (task_info(mach_task_self(), TASK_VM_INFO, reinterpret_cast<task_info_t>(&info), &count) != KERN_SUCCESS) return 0;
  return static_cast<long>(info.phys_footprint);
#else
  rusage usage{};
  getrusage(RUSAGE_SELF, &usage);
  return usage.ru_maxrss * 1024;
#endif
}

// The most the footprint has been (the peak resident size off Apple platforms).
long peak() {
#if defined(__APPLE__)
  task_vm_info_data_t info{};
  mach_msg_type_number_t count = TASK_VM_INFO_COUNT;
  if (task_info(mach_task_self(), TASK_VM_INFO, reinterpret_cast<task_info_t>(&info), &count) != KERN_SUCCESS) return 0;
  return static_cast<long>(info.ledger_phys_footprint_peak);
#else
  return footprint();
#endif
}

// The next tick's light from the frames file, read outside the timing.
struct Frames {
  std::ifstream file;
  std::vector<float> eye[2];

  void next(fly_senses& senses) {
    for (std::vector<float>& frame : eye) {
      uint32_t count = 0;
      file.read(reinterpret_cast<char*>(&count), 4);
      frame.resize(count);
      file.read(reinterpret_cast<char*>(frame.data()), static_cast<std::streamsize>(4 * static_cast<size_t>(count)));
    }
    if (!file) {
      std::fputs("the frames file ended early\n", stderr);
      std::exit(1);
    }
    senses.light_left = eye[0].data();
    senses.light_right = eye[1].data();
  }
};

void regime(fly_brain* brain, const char* label, fly_senses senses, double seconds, Frames* frames = nullptr) {
  const double tick = 16;
  fly_command command;
  fly_stats stats;
  char error[256];
  for (double t = 0; t < 1000; t += tick) {
    if (frames != nullptr) frames->next(senses);
    fly_brain_tick(brain, tick, &senses, &command, &stats, nullptr, error, sizeof error);
  }
  const uint64_t events_before = brain->brain.sim().events();
  double wall = 0;
  double sim = 0;
  double active = 0;
  uint64_t spikes = 0;
  int ticks = 0;
  while (sim < seconds * 1000) {
    if (frames != nullptr) frames->next(senses);
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
    std::fputs("usage: fly-brain-bench <connectome.bin> [seconds=10] [seed=1] [frames scene...]\n", stderr);
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
  const long before = footprint();
  char error[512];
  const auto started = std::chrono::steady_clock::now();
  fly_brain* brain = fly_brain_create(data.data(), data.size(), seed, error, sizeof error);
  const double build_ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - started).count();
  if (brain == nullptr) {
    std::fprintf(stderr, "%s\n", error);
    return 1;
  }
  const long built = footprint();
  std::printf("built %u neurons, %u connections in %.0f ms\n", fly_brain_neurons(brain), fly_brain_connections(brain), build_ms);
  // The host need not keep the file once the brain is built.
  std::printf("memory: %.1f MB with the file read, %.1f MB with the brain built (the brain and building it: %.1f MB)\n", megabytes(before), megabytes(built),
              megabytes(built - before));

  const fly_senses rest{0, 0, 0, 0, 0, 0, 0, 1, nullptr, nullptr, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, NAN, NAN, {}};
  const fly_senses everything{1, 1, 1, 1, 1, 1, 1, 1, nullptr, nullptr, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, NAN, NAN, {}};
  regime(brain, "at rest (standing)", rest, seconds);
  regime(brain, "every sense at full strength", everything, seconds);
  if (argc > 4) {
    Frames frames{std::ifstream(argv[4], std::ios::binary), {}};
    for (int scene = 5; scene < argc; scene++) regime(brain, argv[scene], rest, seconds, &frames);
  }
  regime(brain, "at rest again", rest, seconds);
  std::printf("memory at the end: %.1f MB (at most %.1f MB, the file read included)\n", megabytes(footprint()), megabytes(peak()));
  fly_brain_destroy(brain);
  return 0;
}
