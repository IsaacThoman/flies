// olfaction.ts's receptor groups and odor rates, in the same input order.
#ifndef FLY_OLFACTION_HPP
#define FLY_OLFACTION_HPP
#include "exact.hpp"
#include "io.hpp"
#include <array>
#include <span>

namespace fly::olfaction {
constexpr size_t kOdorants = 5;
struct Row {
  const char* glomerulus;
  const char* unit;
  const char* source;
  double spontaneous;
  std::array<double, kOdorants> answers;
};
extern const std::span<const Row> kTable;
struct Group {
  std::string name;
  std::string glomerulus;
  std::string side;
  std::vector<uint32_t> neurons;
  double spontaneous;
  std::array<double, kOdorants> answers;
};
std::vector<Group> wire(const Connectome& c);
std::array<double, 2 * kOdorants> odor_of(const io::Senses& senses);
double rate(const Group& group, const std::array<double, 2 * kOdorants>& odor);
bool corrected(std::string_view type);
}  // namespace fly::olfaction
#endif
