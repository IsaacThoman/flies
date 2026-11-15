// What it takes for this C++ to compute exactly what the TypeScript computes.
// Every file of the library includes this first.
//
// JavaScript evaluates every operation in double precision, rounding each
// result once, and stores Float32Array elements rounded to nearest. C++ does
// the same provided the compiler neither fuses a multiply and an add into one
// rounding (FP contraction, which clang does by default on arm64) nor
// reassociates (fast math). The pragma below turns contraction off for each
// file that includes this; the checks refuse to build where the rest would
// not hold.

#ifndef FLY_EXACT_HPP
#define FLY_EXACT_HPP

#pragma STDC FP_CONTRACT OFF

#include <cfloat>
#include <cmath>
#include <cstdint>

#if defined(__FAST_MATH__)
#error "The brain must be compiled without fast math (-ffast-math, Xcode's Relax IEEE Compliance): it would change its results."
#endif
#if FLT_EVAL_METHOD != 0
#error "The brain needs float and double arithmetic evaluated in their own precision (FLT_EVAL_METHOD 0)."
#endif

namespace fly::js {

/** Math.round: the nearest integer, ties toward +infinity. */
inline double round(double x) {
  if (!std::isfinite(x)) return x;
  const double down = std::floor(x);
  // x - floor(x) is exact for every double.
  return x - down >= 0.5 ? down + 1 : down;
}

/** Math.max and Math.min of two non-NaN numbers: +0 counts as more than -0. */
inline double max(double a, double b) {
  if (a == b) return std::signbit(a) ? b : a;
  return a > b ? a : b;
}
inline double min(double a, double b) {
  if (a == b) return std::signbit(a) ? a : b;
  return a < b ? a : b;
}

/** io.ts's clamp: NaN and infinities read as 0. */
inline double clamp(double value, double lo, double hi) {
  return std::isfinite(value) ? min(hi, max(lo, value)) : 0;
}

/** sim.ts's mulberry32: uniform numbers in [0, 1), multiples of 2^-32. */
class Mulberry32 {
 public:
  explicit Mulberry32(uint32_t seed) : a_(seed) {}
  double next() {
    a_ += 0x6d2b79f5u;
    uint32_t t = a_;
    t = (t ^ (t >> 15)) * (t | 1u);
    t ^= t + (t ^ (t >> 7)) * (t | 61u);
    return static_cast<double>(t ^ (t >> 14)) / 4294967296.0;
  }

 private:
  uint32_t a_;
};

/** sim.ts's inputSeed: the seed of input group `index` (JavaScript's `seed | 0` keeps the low 32 bits). */
inline uint32_t input_seed(uint32_t seed, uint32_t index) {
  uint32_t x = (seed * 0x9e3779b1u) ^ ((index + 1) * 0x85ebca77u);
  x = (x ^ (x >> 16)) * 0x7feb352du;
  x = (x ^ (x >> 15)) * 0x846ca68bu;
  return x ^ (x >> 16);
}

}  // namespace fly::js

#endif
