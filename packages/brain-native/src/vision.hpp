// The input stage of the eyes, vision.ts in C++: what each facet's
// photoreceptors and lamina make of the light, as firing rates of that
// column's L1, L2 and L3, and the vision.<stage> readouts. vision.ts's opening
// comment and packages/brain/README.md (Seeing) say what it reproduces and
// what it leaves out.

#ifndef FLY_VISION_HPP
#define FLY_VISION_HPP

#include "exact.hpp"

#include <cstdint>
#include <span>
#include <string>
#include <string_view>
#include <vector>

#include "connectome.hpp"
#include "eyes.hpp"
#include "io.hpp"

namespace fly::vision {

/** vision.ts's RETINA. */
struct RetinaParameters {
  /** Time constant, ms, of the ambient level each facet adapts to, and of L3's response. */
  double ambient = 2000;
  /** Time constant, ms, of the recent level L1 and L2 compare the light with. */
  double transient = 200;
  /** Luminance (0 black, 1 white) added to the ambient level in the Weber fraction, so a dark scene doesn't divide by 0. */
  double floor = 0.05;
  /** Rate, Hz, of a lamina cell at a contrast of 1 (full darkening), and its ceiling. */
  double max_rate = 200;
  /** Rate, Hz, of a lamina cell in a steady scene. */
  double tonic = 0;
  /** Factor on L1's withdrawals under brightening, 1 for the same scale as darkening (0: no ON pathway). */
  double withdraw = 1;
  /** L1's sustained component: its response to a facet's light against the level of `luminance`, as a fraction of its transient response to the same contrast (0: none). */
  double sustained = 0.3;
  /** Time constant, ms, of the level L1's sustained component measures the light against. */
  double luminance = 100000;
};

/** One eye's photoreceptors and lamina: luminance per facet in, a rate per driven lamina cell out. */
class Retina {
 public:
  explicit Retina(const eyes::Eye& eye, const RetinaParameters& parameters = {});

  /** The driven cells, in the order of rates(): every facet's L1 that exists, then its L2s, then its L3s. */
  const std::vector<uint32_t>& neurons() const { return neurons_; }
  /** Hz per neuron of neurons(), as of the last step. */
  const std::vector<double>& rates() const { return rates_; }
  /** Every facet's L1 that exists, as at the start of neurons(): the cells brightening withdraws. */
  const std::vector<uint32_t>& l1() const { return l1_; }
  /** Hz per neuron of l1(), as of the last step: how often its release is withdrawn. */
  const std::vector<double>& withdrawals() const { return withdrawals_; }
  uint32_t facets() const { return facets_; }

  /**
   * Advances by dt ms under this light, facets() luminances (nullptr: the eye
   * is shut; Brain::tick checks the length), and updates rates(). Opening the eye starts it adapted to what
   * it sees then. Returns false when every rate was 0 before and still is.
   * While the light doesn't change and nothing fires, a step only compares
   * the light with the last and remembers the time; the levels catch up,
   * exactly, when it changes.
   */
  bool step(double dt, const std::span<const float>* light);

 private:
  RetinaParameters parameters_;
  uint32_t facets_;
  std::vector<uint32_t> neurons_;
  std::vector<double> rates_;
  std::vector<uint32_t> l1_;
  std::vector<double> withdrawals_;
  // For each driven cell, its facet and whether it is transient (L1, L2) or sustained (L3).
  std::vector<uint32_t> facet_;
  std::vector<uint8_t> transient_;
  std::vector<double> ambient_;
  std::vector<double> recent_;
  std::vector<double> slow_;
  // Each facet's luminance at the last step, clamped to 0..1.
  std::vector<double> seen_;
  bool open_ = false;
  // Whether any rate was above 0 after the last step.
  bool firing_ = false;
  // ms of unchanging light, with every rate 0, not yet applied to the levels.
  double idle_ = 0;
};

/** Smoothing time constant, ms, of the vision.<stage> rates (runtime.ts's VISION_TAU). */
constexpr double kTau = 100;

/** vision.ts's VISION_STAGES, in order from the eye inward. */
struct Stage {
  const char* name;
  /** The driven lamina cells themselves, rather than a selection. */
  bool lamina;
  NeuronQuery select;
};
std::vector<Stage> stages();

/** The stages' patterns on cell types: /^T[45][a-d]$/ and /^(LC|LPLC|LLPC|LPC)\d/. */
bool t4_t5(std::string_view type);
bool lobula_columnar(std::string_view type);

/** A stage's name in the rates: vision.<stage> <side>. */
std::string stage_name(const Stage& stage, io::Side side);

}  // namespace fly::vision

#endif
