// The fly's brain on a thread of its own. JavaScript has no JIT on the Apple TV, far too slow
// for 166,700 spiking neurons, so the game hands its senses to native code and reads back the
// latest answer (NativeBrainBridge in packages/contracts/src/brain.ts):
//
//   - start(seed) starts the brain thread, which reads the bundled connectome (memory-mapped)
//     and builds the brain; neither the main nor the JavaScript thread waits for it.
//   - submit() adds fly time and replaces the senses under a lock the brain thread only holds
//     to copy them, so it never waits on a step. Time submitted while the brain is busy adds up
//     to at most one step of kMaxStepMs; anything beyond is dropped, so a brain slower than real
//     time runs slow instead of falling further and further behind.
//   - the brain thread steps whenever time is waiting, then publishes its state for read().
#import "BrainBridge.h"
#import "JSHost.h"
#include "fly_brain.h"
#include <condition_variable>
#include <pthread.h>

namespace {
constexpr double kMaxStepMs = 100;
// SENSE_ORDER, COMMAND_ORDER and STATE_STATS in packages/contracts/src/brain.ts.
constexpr int kScalars = 8, kCommands = 7, kStats = 4;
enum Status { kLoading, kRunning, kFailed };

struct BrainHost {
  NSString *path;
  uint32_t seed = 0;
  std::atomic<bool> started{false};
  std::atomic<int> status{kLoading};
  // Written once, before status leaves kLoading.
  std::string error;
  uint32_t neurons = 0, connections = 0;
  uint32_t facets[2] = {};
  std::vector<float> directions[2];
  float acceptance = 0;
  std::vector<std::string> rateNames;
  // Time and senses submitted and not yet taken by the brain thread.
  std::mutex inputLock;
  std::condition_variable inputReady;
  double pendingMs = 0;
  float scalars[kScalars] = {};
  std::vector<float> light[2];
  bool eyesOpen = false;
  // The latest state: commands, stats, rates.
  std::mutex stateLock;
  std::vector<float> state;
  uint32_t states = 0;
};
BrainHost gBrain;

void Fail(const std::string &why) {
  gBrain.error = why;
  gBrain.status.store(kFailed, std::memory_order_release);
  HostLog(2, [NSString stringWithFormat:@"brain: %s", why.c_str()]);
}

fly_brain *Load() {
  @autoreleasepool {
    double t = NowMs();
    NSError *error = nil;
    NSData *data = [NSData dataWithContentsOfFile:gBrain.path options:NSDataReadingMappedIfSafe error:&error];
    if (!data) { Fail(std::string("can't read the connectome: ") + (error.localizedDescription ?: @"missing").UTF8String); return nullptr; }
    char message[512] = "";
    fly_brain *brain = fly_brain_create((const uint8_t *)data.bytes, data.length, gBrain.seed, message, sizeof message);
    if (!brain) { Fail(message[0] ? message : "fly_brain_create failed"); return nullptr; }
    gBrain.neurons = fly_brain_neurons(brain);
    gBrain.connections = fly_brain_connections(brain);
    for (int side = 0; side < 2; side++) {
      uint32_t n = fly_brain_facets(brain, side);
      const float *d = n ? fly_brain_eye_directions(brain, side) : nullptr;
      gBrain.facets[side] = d ? n : 0;
      if (d) gBrain.directions[side].assign(d, d + 3 * n);
      gBrain.light[side].assign(gBrain.facets[side], 0);
    }
    gBrain.acceptance = fly_brain_eye_acceptance(brain);
    for (uint32_t i = 0, n = fly_brain_rate_count(brain); i < n; i++) {
      const char *name = fly_brain_rate_name(brain, i);
      gBrain.rateNames.push_back(name ? name : "");
    }
    gBrain.state.assign(kCommands + kStats + gBrain.rateNames.size(), 0);
    HostLog(0, [NSString stringWithFormat:@"brain: %u neurons, %u connections, %u + %u facets, %zu rates, %.1f MB loaded in %.0f ms",
                gBrain.neurons, gBrain.connections, gBrain.facets[0], gBrain.facets[1], gBrain.rateNames.size(), data.length / 1048576.0, NowMs() - t]);
    return brain;
  }
}

void *Run(void *) {
  pthread_setname_np("appletvfly.brain");
  fly_brain *brain = Load();
  if (!brain) return nullptr;
  gBrain.status.store(kRunning, std::memory_order_release);
  float scalars[kScalars];
  std::vector<float> light[2] = { gBrain.light[0], gBrain.light[1] };
  std::vector<float> rates(gBrain.rateNames.size());
  for (;;) {
    double dt;
    bool eyes;
    {
      std::unique_lock<std::mutex> g(gBrain.inputLock);
      gBrain.inputReady.wait(g, [] { return gBrain.pendingMs > 0; });
      dt = gBrain.pendingMs;
      gBrain.pendingMs = 0;
      std::copy(gBrain.scalars, gBrain.scalars + kScalars, scalars);
      eyes = gBrain.eyesOpen;
      if (eyes) for (int side = 0; side < 2; side++) std::copy(gBrain.light[side].begin(), gBrain.light[side].end(), light[side].begin());
    }
    fly_senses senses = {
      scalars[0], scalars[1], scalars[2], scalars[3], scalars[4], scalars[5], scalars[6], scalars[7] > 0.5f,
      eyes ? light[0].data() : nullptr, eyes ? light[1].data() : nullptr,
    };
    fly_command c = {};
    fly_stats stats = {};
    char message[512] = "";
    if (fly_brain_tick(brain, dt, &senses, &c, &stats, rates.empty() ? nullptr : rates.data(), message, sizeof message)) {
      Fail(message[0] ? message : "fly_brain_tick failed");
      fly_brain_destroy(brain);
      return nullptr;
    }
    std::lock_guard<std::mutex> g(gBrain.stateLock);
    float *s = gBrain.state.data();
    const float head[kCommands + kStats] = { c.walk, c.turn, c.back, c.escape, c.wings, c.groom, c.feed,
                                             (float)stats.sim_ms, (float)stats.wall_ms, (float)stats.spikes, (float)stats.active };
    std::copy(head, head + kCommands + kStats, s);
    std::copy(rates.begin(), rates.end(), s + kCommands + kStats);
    gBrain.states++;
  }
}

bool Running() { return gBrain.status.load(std::memory_order_acquire) == kRunning; }

double Arg(JSContextRef ctx, size_t argc, const JSValueRef argv[], size_t i) {
  return i < argc ? JSValueToNumber(ctx, argv[i], nullptr) : 0;
}

/** A Float32Array argument's floats, or nullptr (null, missing, or another kind of value). */
const float *Floats(JSContextRef ctx, size_t argc, const JSValueRef argv[], size_t i, size_t *count) {
  *count = 0;
  if (i >= argc || JSValueGetTypedArrayType(ctx, argv[i], nullptr) != kJSTypedArrayTypeFloat32Array) return nullptr;
  size_t bytes = 0;
  const float *f = (const float *)JSBytesOf(ctx, argv[i], &bytes);
  *count = bytes / sizeof(float);
  return f;
}

JSObjectRef MakeFloat32Array(JSContextRef ctx, const std::vector<float> &values) {
  JSObjectRef array = JSObjectMakeTypedArray(ctx, kJSTypedArrayTypeFloat32Array, values.size(), nullptr);
  if (!values.empty()) memcpy(JSObjectGetTypedArrayBytesPtr(ctx, array, nullptr), values.data(), values.size() * sizeof(float));
  return array;
}

#define NATIVE(name) JSValueRef name(JSContextRef ctx, JSObjectRef, JSObjectRef, size_t argc, const JSValueRef argv[], JSValueRef *)

NATIVE(B_start) {
  if (gBrain.started.exchange(true)) return JSValueMakeUndefined(ctx);
  gBrain.seed = (uint32_t)(int64_t)Arg(ctx, argc, argv, 0);
  // A thread of its own with room for the simulation's stack; below the JavaScript and render
  // threads, which keep the frame rate.
  pthread_attr_t attr;
  pthread_attr_init(&attr);
  pthread_attr_setstacksize(&attr, 8 << 20);
  pthread_attr_set_qos_class_np(&attr, QOS_CLASS_USER_INITIATED, 0);
  pthread_attr_setdetachstate(&attr, PTHREAD_CREATE_DETACHED);
  pthread_t thread;
  if (pthread_create(&thread, &attr, Run, nullptr)) Fail("can't start the brain thread");
  pthread_attr_destroy(&attr);
  return JSValueMakeUndefined(ctx);
}
NATIVE(B_status) {
  static const char *names[] = { "loading", "running", "failed" };
  return JSStringValue(ctx, @(names[gBrain.status.load(std::memory_order_acquire)]));
}
NATIVE(B_error) {
  return JSStringValue(ctx, gBrain.status.load(std::memory_order_acquire) == kFailed ? @(gBrain.error.c_str()) : @"");
}
NATIVE(B_neurons) { return JSValueMakeNumber(ctx, Running() ? gBrain.neurons : 0); }
NATIVE(B_connections) { return JSValueMakeNumber(ctx, Running() ? gBrain.connections : 0); }
NATIVE(B_eyeDirections) {
  int side = Arg(ctx, argc, argv, 0) ? 1 : 0;
  return MakeFloat32Array(ctx, Running() ? gBrain.directions[side] : std::vector<float>());
}
NATIVE(B_eyeAcceptance) { return JSValueMakeNumber(ctx, Running() ? gBrain.acceptance : 0); }
NATIVE(B_rateNames) {
  JSObjectRef names = JSObjectMakeArray(ctx, 0, nullptr, nullptr);
  if (!Running()) return names;
  for (size_t i = 0; i < gBrain.rateNames.size(); i++) JSObjectSetPropertyAtIndex(ctx, names, (unsigned)i, JSStringValue(ctx, @(gBrain.rateNames[i].c_str())), nullptr);
  return names;
}
// submit(dtMs, scalars, lightLeft, lightRight)
NATIVE(B_submit) {
  double dt = Arg(ctx, argc, argv, 0);
  if (!Running() || !(dt > 0)) return JSValueMakeUndefined(ctx);
  size_t ns = 0, nl = 0, nr = 0;
  const float *scalars = Floats(ctx, argc, argv, 1, &ns);
  const float *left = Floats(ctx, argc, argv, 2, &nl), *right = Floats(ctx, argc, argv, 3, &nr);
  {
    std::lock_guard<std::mutex> g(gBrain.inputLock);
    gBrain.pendingMs = std::min(gBrain.pendingMs + dt, kMaxStepMs);
    std::fill(gBrain.scalars, gBrain.scalars + kScalars, 0.f);
    if (scalars) std::copy(scalars, scalars + std::min<size_t>(ns, kScalars), gBrain.scalars);
    gBrain.eyesOpen = left && right && gBrain.facets[0] && gBrain.facets[1];
    if (gBrain.eyesOpen) {
      std::vector<float> &l = gBrain.light[0], &r = gBrain.light[1];
      std::fill(std::copy(left, left + std::min<size_t>(nl, l.size()), l.begin()), l.end(), 0.f);
      std::fill(std::copy(right, right + std::min<size_t>(nr, r.size()), r.begin()), r.end(), 0.f);
    }
  }
  gBrain.inputReady.notify_one();
  return JSValueMakeUndefined(ctx);
}
// read(out): copies the latest state into out and returns how many states there have been.
NATIVE(B_read) {
  size_t n = 0;
  float *out = (float *)Floats(ctx, argc, argv, 0, &n);
  if (!Running()) return JSValueMakeNumber(ctx, 0);
  std::lock_guard<std::mutex> g(gBrain.stateLock);
  if (out) std::copy(gBrain.state.begin(), gBrain.state.begin() + std::min(n, gBrain.state.size()), out);
  return JSValueMakeNumber(ctx, gBrain.states);
}
}  // namespace

JSObjectRef MakeBrainBridge(JSContextRef ctx, NSString *connectome) {
  gBrain.path = connectome;
  JSObjectRef bridge = JSObjectMake(ctx, nullptr, nullptr);
  struct { const char *name; JSObjectCallAsFunctionCallback fn; } fns[] = {
    { "start", B_start }, { "status", B_status }, { "error", B_error }, { "neurons", B_neurons },
    { "connections", B_connections }, { "eyeDirections", B_eyeDirections }, { "eyeAcceptance", B_eyeAcceptance },
    { "rateNames", B_rateNames }, { "submit", B_submit }, { "read", B_read },
  };
  for (auto &f : fns) {
    JSStringRef s = JSStringCreateWithUTF8CString(f.name);
    JSObjectSetProperty(ctx, bridge, s, JSObjectMakeFunctionWithCallback(ctx, s, f.fn), kJSPropertyAttributeReadOnly, nullptr);
    JSStringRelease(s);
  }
  return bridge;
}
