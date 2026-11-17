// The fly brain as native code: the same simulation as packages/brain, for
// hosts where JavaScript is too slow to run it (the Apple TV has no JIT).
//
// Plain C interface. One fly_brain is used from one thread at a time.

#ifndef FLY_BRAIN_H
#define FLY_BRAIN_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct fly_brain fly_brain;

/** What the body feels. Intensities run 0 to 1; see BrainSenses in packages/brain/src/types.ts. */
typedef struct fly_senses {
  float loom_left, loom_right, touch, bump_left, bump_right, wind, sweet;
  /** 1 standing on its feet (the weight on its legs), 0 held or in the air. */
  int grounded;
  /** Luminance per facet, 0 to 1, fly_brain_facets() values each; both NULL with the eyes shut. */
  const float* light_left;
  const float* light_right;
  /** The front legs touching another male fly: the taste of his pheromones, 0 to 1. */
  float male_taste;
  /**
   * Internal state, not a sense: how hungry it is, 0 just fed to 1 starved
   * (BrainSenses.hunger). 1, or NAN, for a host that keeps no account of
   * hunger: the brain as it was before it had one. Not 0: that is a fed fly.
   */
  float hunger;
  /** How hard its own wings beat, 0 (folded) to 1 (full flight power), as their strain sensors feel it. */
  float wingbeat;
  /**
   * Internal state, 0 to 1 each (types.ts's BrainSenses says what each is); 0, as a
   * struct initialised without them leaves them, is a rested fly with no clock.
   */
  float clock_morning, clock_evening, clock_sleep, sleep_pressure, sleep_depth;
  /** Something bitter, and plain water, on the mouthparts, 0 to 1 each; 0, as a struct initialised without them leaves them. */
  float bitter, water;
  /**
   * Internal state, not a sense: how thirsty it is, 0 just drunk to 1 thirsty
   * (BrainSenses.thirst). 1, or NAN, for a host that keeps no account of
   * thirst: the brain as it was before it had one. Not 0, which a struct
   * initialised without it leaves: that is a fly that has just drunk.
   */
  float thirst;
  /** Odor strengths 0..1 in ODORANTS order: ethyl acetate, acetic acid, ethanol, isoamyl acetate, CO2. Zero-initialised = no odour. */
  float odor_left[5], odor_right[5];
} fly_senses;

/** What the brain wants done. All 0 to 1 except turn, which runs -1 (hard left) to 1 (hard right). */
typedef struct fly_command {
  float walk, turn, back, escape, wings, groom, feed, sing;
} fly_command;

typedef struct fly_stats {
  /** Simulated and wall-clock time of the tick, ms. */
  double sim_ms, wall_ms;
  uint32_t spikes, active;
} fly_stats;

/**
 * Builds a brain from a packed connectome (the bytes of connectome.bin; they
 * are copied or parsed during the call and need not outlive it). Returns NULL
 * and writes a message to `error` on failure.
 */
fly_brain* fly_brain_create(const uint8_t* data, size_t length, uint32_t seed, char* error, size_t error_size);
void fly_brain_destroy(fly_brain* brain);

uint32_t fly_brain_neurons(const fly_brain* brain);
uint32_t fly_brain_connections(const fly_brain* brain);

/** Facets of the left (0) or right (1) eye; 0 when this brain has no eyes. */
uint32_t fly_brain_facets(const fly_brain* brain, int side);
/** Unit viewing directions, x y z per facet: x toward the fly's right, y ahead, z up. */
const float* fly_brain_eye_directions(const fly_brain* brain, int side);
/** Half-angle of a facet's cone, radians. */
float fly_brain_eye_acceptance(const fly_brain* brain);

/** The groups whose mean firing rates a tick reports, in order. */
uint32_t fly_brain_rate_count(const fly_brain* brain);
const char* fly_brain_rate_name(const fly_brain* brain, uint32_t index);

/**
 * Advances the simulation by `dt_ms` (0 to 1000) of fly time under these
 * senses. `rates` receives fly_brain_rate_count() values, Hz; it may be NULL.
 * Returns 0, or nonzero with a message in `error`.
 */
int fly_brain_tick(fly_brain* brain, double dt_ms, const fly_senses* senses, fly_command* command, fly_stats* stats, float* rates, char* error, size_t error_size);

#ifdef __cplusplus
}
#endif

#endif
