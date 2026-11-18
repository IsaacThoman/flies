// Each fly's brain on a thread of its own. JavaScript has no JIT on the Apple TV, far too slow
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
//   - requestMemory() and remember() queue requests the brain thread serves between steps, a
//     memory to take back first (even one given while the brain loads), then what it has
//     learned; memory() and remembered() hand over its answers. Neither thread waits on them.
//   - spawn() (the first brain's bridge only) makes another, for another fly the game lives:
//     a bridge of its own, its own thread and brain; stop() ends that thread and frees its
//     brain. The first brain is the host's for the app's lifetime.
#import "BrainBridge.h"
#import "JSHost.h"
#include "fly_brain.h"
#include <cmath>
#include <condition_variable>
#include <memory>
#include <pthread.h>

namespace {
constexpr double kMaxStepMs = 100;
// SENSE_ORDER, COMMAND_ORDER and STATE_STATS in packages/contracts/src/brain.ts.
constexpr int kScalars = 45, kCommands = 9, kStats = 4;
// Where hunger is among the scalars; a game that sends fewer keeps no account of it, which is 1.
constexpr int kHunger = 9;
// And thirst, which is 1 the same way.
constexpr int kThirst = 18;
// Where the wings' own beat is; a game that sends fewer has its wings folded, 0.
constexpr int kWingbeat = 10;
// Where the temperature at each antenna is; a game that sends fewer feels none, NaN.
constexpr int kTemperatureLeft = 19, kTemperatureRight = 20;
// Where touch where it lands starts, FLY_TOUCH_PARTS of it; a game that sends fewer is touched nowhere but by `touch`, 0.
constexpr int kTouchParts = 21;
// Where the legs' stepping is, left and right; a game that sends fewer has its legs still, 0.
constexpr int kLegs = 33;
static_assert(kTouchParts + FLY_TOUCH_PARTS == kLegs, "the legs come after the touch parts");
// Then each odorant at the left antenna and the right (ODORANTS in packages/brain/src/olfaction.ts).
constexpr int kOdor = kLegs + 2, kOdorants = 5;
static_assert(kOdor + 2 * kOdorants == kScalars, "the odours are the last scalars");
enum Status { kLoading, kRunning, kFailed };

struct BrainHost {
  NSString *path;
  uint32_t seed = 0;
  // A spawned brain: stop() may end it.
  bool spawned = false;
  std::atomic<bool> started{false};
  std::atomic<int> status{kLoading};
  // Written once, before status leaves kLoading.
  std::string error;
  uint32_t neurons = 0, connections = 0;
  uint32_t facets[2] = {};
  std::vector<float> directions[2];
  float acceptance = 0;
  std::vector<std::string> rateNames;
  // Time and senses submitted and not yet taken by the brain thread, and whether its fly is gone.
  std::mutex inputLock;
  std::condition_variable inputReady;
  double pendingMs = 0;
  bool stopping = false;
  float scalars[kScalars] = {};
  std::vector<float> light[2];
  bool eyesOpen = false;
  // Memory requests not yet served: the latest request for what it has learned, and memories to take back, by number.
  uint32_t memoryWanted = 0;
  uint32_t rememberRequests = 0;
  std::vector<std::pair<uint32_t, std::vector<uint8_t>>> toRemember;
  // The latest state: commands, stats, rates. With it, the answers to memory requests: the
  // last request served and what the brain had learned then, and each memory's refusal, "" if taken.
  std::mutex stateLock;
  std::vector<float> state;
  uint32_t states = 0;
  uint32_t memoryServed = 0;
  std::vector<uint8_t> memory;
  std::vector<std::string> remembered;

  void Fail(const std::string &why) {
    error = why;
    status.store(kFailed, std::memory_order_release);
    HostLog(2, [NSString stringWithFormat:@"brain: %s", why.c_str()]);
  }

  bool Running() const { return status.load(std::memory_order_acquire) == kRunning; }
};

// What a bridge object holds: its brain, shared with its thread for as long as either needs it.
using Shared = std::shared_ptr<BrainHost>;
JSClassRef gBridgeClass = nullptr;
NSString *gConnectome = nil;
// Each brain's thread is numbered in its name, for profiles.
std::atomic<int> gBrains{0};

fly_brain *Load(BrainHost &b) {
  @autoreleasepool {
    double t = NowMs();
    NSError *error = nil;
    NSData *data = [NSData dataWithContentsOfFile:b.path options:NSDataReadingMappedIfSafe error:&error];
    if (!data) { b.Fail(std::string("can't read the connectome: ") + (error.localizedDescription ?: @"missing").UTF8String); return nullptr; }
    char message[512] = "";
    fly_brain *brain = fly_brain_create((const uint8_t *)data.bytes, data.length, b.seed, message, sizeof message);
    if (!brain) { b.Fail(message[0] ? message : "fly_brain_create failed"); return nullptr; }
    b.neurons = fly_brain_neurons(brain);
    b.connections = fly_brain_connections(brain);
    for (int side = 0; side < 2; side++) {
      uint32_t n = fly_brain_facets(brain, side);
      const float *d = n ? fly_brain_eye_directions(brain, side) : nullptr;
      b.facets[side] = d ? n : 0;
      if (d) b.directions[side].assign(d, d + 3 * n);
      b.light[side].assign(b.facets[side], 0);
    }
    b.acceptance = fly_brain_eye_acceptance(brain);
    for (uint32_t i = 0, n = fly_brain_rate_count(brain); i < n; i++) {
      const char *name = fly_brain_rate_name(brain, i);
      b.rateNames.push_back(name ? name : "");
    }
    b.state.assign(kCommands + kStats + b.rateNames.size(), 0);
    HostLog(0, [NSString stringWithFormat:@"brain: %u neurons, %u connections, %u + %u facets, %zu rates, %.1f MB loaded in %.0f ms",
                b.neurons, b.connections, b.facets[0], b.facets[1], b.rateNames.size(), data.length / 1048576.0, NowMs() - t]);
    return brain;
  }
}

void *Run(void *arg) {
  // The thread's own hold on its brain: it outlives the bridge object if the game lets go first.
  Shared host = *static_cast<Shared *>(arg);
  delete static_cast<Shared *>(arg);
  BrainHost &b = *host;
  char name[32];
  snprintf(name, sizeof name, "flies.brain.%d", gBrains.fetch_add(1));
  pthread_setname_np(name);
  fly_brain *brain = Load(b);
  if (!brain) return nullptr;
  b.status.store(kRunning, std::memory_order_release);
  float scalars[kScalars];
  std::vector<float> light[2] = { b.light[0], b.light[1] };
  std::vector<float> rates(b.rateNames.size());
  uint32_t served = 0;
  for (;;) {
    double dt;
    bool eyes;
    uint32_t wanted;
    std::vector<std::pair<uint32_t, std::vector<uint8_t>>> memories;
    {
      std::unique_lock<std::mutex> g(b.inputLock);
      b.inputReady.wait(g, [&b, served] { return b.pendingMs > 0 || b.stopping || b.memoryWanted > served || !b.toRemember.empty(); });
      if (b.stopping) break;
      dt = b.pendingMs;
      b.pendingMs = 0;
      std::copy(b.scalars, b.scalars + kScalars, scalars);
      eyes = b.eyesOpen;
      if (eyes) for (int side = 0; side < 2; side++) std::copy(b.light[side].begin(), b.light[side].end(), light[side].begin());
      wanted = b.memoryWanted;
      memories.swap(b.toRemember);
    }
    for (auto &[request, bytes] : memories) {
      char message[512] = "";
      const bool taken = fly_brain_remember(brain, bytes.data(), bytes.size(), message, sizeof message) == 0;
      if (!taken) HostLog(1, [NSString stringWithFormat:@"brain: memory refused: %s", message]);
      std::lock_guard<std::mutex> g(b.stateLock);
      b.remembered.resize(std::max<size_t>(b.remembered.size(), request), "");
      b.remembered[request - 1] = taken ? "" : (message[0] ? message : "refused");
    }
    if (wanted > served) {
      std::vector<uint8_t> bytes(fly_brain_memory(brain, nullptr, 0));
      bytes.resize(fly_brain_memory(brain, bytes.data(), bytes.size()));
      std::lock_guard<std::mutex> g(b.stateLock);
      b.memory.swap(bytes);
      b.memoryServed = served = wanted;
    }
    if (!(dt > 0)) continue;
    fly_senses senses = {
      scalars[0], scalars[1], scalars[2], scalars[3], scalars[4], scalars[5], scalars[6], scalars[7] > 0.5f,
      eyes ? light[0].data() : nullptr, eyes ? light[1].data() : nullptr, scalars[8], scalars[kHunger], scalars[kWingbeat],
      scalars[11], scalars[12], scalars[13], scalars[14], scalars[15], scalars[16], scalars[17], scalars[kThirst], scalars[kTemperatureLeft], scalars[kTemperatureRight], {},
      scalars[kLegs], scalars[kLegs + 1],
    };
    std::copy(scalars + kTouchParts, scalars + kTouchParts + FLY_TOUCH_PARTS, senses.touch_parts);
    std::copy(scalars + kOdor, scalars + kOdor + kOdorants, senses.odor_left);
    std::copy(scalars + kOdor + kOdorants, scalars + kOdor + 2 * kOdorants, senses.odor_right);
    fly_command c = {};
    fly_stats stats = {};
    char message[512] = "";
    if (fly_brain_tick(brain, dt, &senses, &c, &stats, rates.empty() ? nullptr : rates.data(), message, sizeof message)) {
      b.Fail(message[0] ? message : "fly_brain_tick failed");
      break;
    }
    std::lock_guard<std::mutex> g(b.stateLock);
    float *s = b.state.data();
    const float head[kCommands + kStats] = { c.walk, c.turn, c.back, c.escape, c.wings, c.groom, c.feed, c.sing, c.lean,
                                             (float)stats.sim_ms, (float)stats.wall_ms, (float)stats.spikes, (float)stats.active };
    std::copy(head, head + kCommands + kStats, s);
    std::copy(rates.begin(), rates.end(), s + kCommands + kStats);
    b.states++;
  }
  fly_brain_destroy(brain);
  return nullptr;
}

BrainHost &Host(JSObjectRef self) {
  static BrainHost none;
  auto *shared = static_cast<Shared *>(JSObjectGetPrivate(self));
  return shared ? **shared : none;
}

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

#define NATIVE(name) JSValueRef name(JSContextRef ctx, JSObjectRef, JSObjectRef self, size_t argc, const JSValueRef argv[], JSValueRef *)

NATIVE(B_start) {
  auto *shared = static_cast<Shared *>(JSObjectGetPrivate(self));
  if (!shared || (*shared)->started.exchange(true)) return JSValueMakeUndefined(ctx);
  BrainHost &b = **shared;
  b.seed = (uint32_t)(int64_t)Arg(ctx, argc, argv, 0);
  // A thread of its own with room for the simulation's stack; below the JavaScript and render
  // threads, which keep the frame rate.
  pthread_attr_t attr;
  pthread_attr_init(&attr);
  pthread_attr_setstacksize(&attr, 8 << 20);
  pthread_attr_set_qos_class_np(&attr, QOS_CLASS_USER_INITIATED, 0);
  pthread_attr_setdetachstate(&attr, PTHREAD_CREATE_DETACHED);
  pthread_t thread;
  auto *hold = new Shared(*shared);
  if (pthread_create(&thread, &attr, Run, hold)) {
    delete hold;
    b.Fail("can't start the brain thread");
  }
  pthread_attr_destroy(&attr);
  return JSValueMakeUndefined(ctx);
}
NATIVE(B_status) {
  static const char *names[] = { "loading", "running", "failed" };
  return JSStringValue(ctx, @(names[Host(self).status.load(std::memory_order_acquire)]));
}
NATIVE(B_error) {
  BrainHost &b = Host(self);
  return JSStringValue(ctx, b.status.load(std::memory_order_acquire) == kFailed ? @(b.error.c_str()) : @"");
}
NATIVE(B_neurons) { BrainHost &b = Host(self); return JSValueMakeNumber(ctx, b.Running() ? b.neurons : 0); }
NATIVE(B_connections) { BrainHost &b = Host(self); return JSValueMakeNumber(ctx, b.Running() ? b.connections : 0); }
NATIVE(B_eyeDirections) {
  BrainHost &b = Host(self);
  int side = Arg(ctx, argc, argv, 0) ? 1 : 0;
  return MakeFloat32Array(ctx, b.Running() ? b.directions[side] : std::vector<float>());
}
NATIVE(B_eyeAcceptance) { BrainHost &b = Host(self); return JSValueMakeNumber(ctx, b.Running() ? b.acceptance : 0); }
NATIVE(B_rateNames) {
  BrainHost &b = Host(self);
  JSObjectRef names = JSObjectMakeArray(ctx, 0, nullptr, nullptr);
  if (!b.Running()) return names;
  for (size_t i = 0; i < b.rateNames.size(); i++) JSObjectSetPropertyAtIndex(ctx, names, (unsigned)i, JSStringValue(ctx, @(b.rateNames[i].c_str())), nullptr);
  return names;
}
// submit(dtMs, scalars, lightLeft, lightRight)
NATIVE(B_submit) {
  BrainHost &b = Host(self);
  double dt = Arg(ctx, argc, argv, 0);
  if (!b.Running() || !(dt > 0)) return JSValueMakeUndefined(ctx);
  size_t ns = 0, nl = 0, nr = 0;
  const float *scalars = Floats(ctx, argc, argv, 1, &ns);
  const float *left = Floats(ctx, argc, argv, 2, &nl), *right = Floats(ctx, argc, argv, 3, &nr);
  {
    std::lock_guard<std::mutex> g(b.inputLock);
    b.pendingMs = std::min(b.pendingMs + dt, kMaxStepMs);
    std::fill(b.scalars, b.scalars + kScalars, 0.f);
    b.scalars[kHunger] = 1.f;
    b.scalars[kThirst] = 1.f;
    b.scalars[kTemperatureLeft] = b.scalars[kTemperatureRight] = NAN;
    if (scalars) std::copy(scalars, scalars + std::min<size_t>(ns, kScalars), b.scalars);
    b.eyesOpen = left && right && b.facets[0] && b.facets[1];
    if (b.eyesOpen) {
      std::vector<float> &l = b.light[0], &r = b.light[1];
      std::fill(std::copy(left, left + std::min<size_t>(nl, l.size()), l.begin()), l.end(), 0.f);
      std::fill(std::copy(right, right + std::min<size_t>(nr, r.size()), r.begin()), r.end(), 0.f);
    }
  }
  b.inputReady.notify_one();
  return JSValueMakeUndefined(ctx);
}
// read(out): copies the latest state into out and returns how many states there have been.
NATIVE(B_read) {
  BrainHost &b = Host(self);
  size_t n = 0;
  float *out = (float *)Floats(ctx, argc, argv, 0, &n);
  if (!b.Running()) return JSValueMakeNumber(ctx, 0);
  std::lock_guard<std::mutex> g(b.stateLock);
  if (out) std::copy(b.state.begin(), b.state.begin() + std::min(n, b.state.size()), out);
  return JSValueMakeNumber(ctx, b.states);
}
// requestMemory(): asks the brain thread for what the brain has learned; returns the request's number.
NATIVE(B_requestMemory) {
  BrainHost &b = Host(self);
  uint32_t request;
  {
    std::lock_guard<std::mutex> g(b.inputLock);
    request = ++b.memoryWanted;
  }
  b.inputReady.notify_one();
  return JSValueMakeNumber(ctx, request);
}
// memory(request): what the brain had learned when the thread served that request or a later one, as a Uint8Array, or null until then.
NATIVE(B_memory) {
  BrainHost &b = Host(self);
  const double request = Arg(ctx, argc, argv, 0);
  std::lock_guard<std::mutex> g(b.stateLock);
  if (!(request >= 1 && request <= b.memoryServed)) return JSValueMakeNull(ctx);
  JSObjectRef out = JSObjectMakeTypedArray(ctx, kJSTypedArrayTypeUint8Array, b.memory.size(), nullptr);
  if (!b.memory.empty()) memcpy(JSObjectGetTypedArrayBytesPtr(ctx, out, nullptr), b.memory.data(), b.memory.size());
  return out;
}
// remember(memory): hands the brain thread a Uint8Array to take back before its next step; returns the request's number.
NATIVE(B_remember) {
  BrainHost &b = Host(self);
  std::vector<uint8_t> bytes;
  if (argc > 0 && JSValueGetTypedArrayType(ctx, argv[0], nullptr) == kJSTypedArrayTypeUint8Array) {
    size_t n = 0;
    const uint8_t *data = (const uint8_t *)JSBytesOf(ctx, argv[0], &n);
    if (data) bytes.assign(data, data + n);
  }
  uint32_t request;
  {
    std::lock_guard<std::mutex> g(b.inputLock);
    request = ++b.rememberRequests;
    b.toRemember.emplace_back(request, std::move(bytes));
  }
  b.inputReady.notify_one();
  return JSValueMakeNumber(ctx, request);
}
// remembered(request): null until the brain thread has dealt with that memory, then "" if it took it, or why it didn't.
NATIVE(B_remembered) {
  BrainHost &b = Host(self);
  const double request = Arg(ctx, argc, argv, 0);
  std::lock_guard<std::mutex> g(b.stateLock);
  if (!(request >= 1 && request <= b.remembered.size())) return JSValueMakeNull(ctx);
  return JSStringValue(ctx, @(b.remembered[(size_t)request - 1].c_str()));
}
// stop(): a spawned brain's fly is gone; its thread ends and frees the brain.
NATIVE(B_stop) {
  BrainHost &b = Host(self);
  if (!b.spawned) return JSValueMakeUndefined(ctx);
  {
    std::lock_guard<std::mutex> g(b.inputLock);
    b.stopping = true;
  }
  b.inputReady.notify_one();
  return JSValueMakeUndefined(ctx);
}

JSObjectRef MakeBridge(JSContextRef ctx, bool spawned);

// spawn(): another brain's bridge, for another fly.
NATIVE(B_spawn) { return MakeBridge(ctx, true); }

void Finalize(JSObjectRef self) {
  auto *shared = static_cast<Shared *>(JSObjectGetPrivate(self));
  if (!shared) return;
  // A spawned brain the game let go of without stopping stops now; the thread holds its own reference until it has.
  BrainHost &b = **shared;
  if (b.spawned) {
    {
      std::lock_guard<std::mutex> g(b.inputLock);
      b.stopping = true;
    }
    b.inputReady.notify_one();
  }
  delete shared;
}

JSObjectRef MakeBridge(JSContextRef ctx, bool spawned) {
  if (!gBridgeClass) {
    JSClassDefinition definition = kJSClassDefinitionEmpty;
    definition.className = "NativeBrainBridge";
    definition.finalize = Finalize;
    gBridgeClass = JSClassCreate(&definition);
  }
  auto *shared = new Shared(std::make_shared<BrainHost>());
  (*shared)->path = gConnectome;
  (*shared)->spawned = spawned;
  JSObjectRef bridge = JSObjectMake(ctx, gBridgeClass, shared);
  struct { const char *name; JSObjectCallAsFunctionCallback fn; } fns[] = {
    { "start", B_start }, { "status", B_status }, { "error", B_error }, { "neurons", B_neurons },
    { "connections", B_connections }, { "eyeDirections", B_eyeDirections }, { "eyeAcceptance", B_eyeAcceptance },
    { "rateNames", B_rateNames }, { "submit", B_submit }, { "read", B_read },
    { "requestMemory", B_requestMemory }, { "memory", B_memory }, { "remember", B_remember }, { "remembered", B_remembered },
    { spawned ? "stop" : "spawn", spawned ? B_stop : B_spawn },
  };
  for (auto &f : fns) {
    JSStringRef s = JSStringCreateWithUTF8CString(f.name);
    JSObjectSetProperty(ctx, bridge, s, JSObjectMakeFunctionWithCallback(ctx, s, f.fn), kJSPropertyAttributeReadOnly, nullptr);
    JSStringRelease(s);
  }
  return bridge;
}
}  // namespace

JSObjectRef MakeBrainBridge(JSContextRef ctx, NSString *connectome) {
  gConnectome = connectome;
  return MakeBridge(ctx, false);
}
