// The packed connectome, connectome.bin, as format.ts reads it: the same
// validation in the same order with the same messages, so that a file one
// build refuses the other refuses too. See format.ts for the layout.
//
// A Connectome reads the caller's bytes in place (little-endian whatever the
// machine, and at any alignment) and copies nothing but the string tables;
// it is only valid while they are. The brain takes what it needs from it
// while it is built.

#ifndef FLY_CONNECTOME_HPP
#define FLY_CONNECTOME_HPP

#include "exact.hpp"

#include <array>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

namespace fly {

/** format.ts's ConnectomeFormatError. */
class FormatError : public std::runtime_error {
 public:
  using std::runtime_error::runtime_error;
};

/** The categorical columns, in format.ts's CATEGORY_NAMES order. */
enum Category : uint8_t { kSuperClass, kClass, kSubClass, kNt, kSide, kNerve, kType, kCategories };

/** One condition per column (empty for none); a neuron matches when it meets all of them. */
using NeuronQuery = std::array<std::function<bool(std::string_view)>, kCategories>;

class Connectome {
 public:
  /** Validates the bytes as loadConnectome does; throws FormatError. */
  Connectome(const uint8_t* data, size_t length);

  uint32_t neurons() const { return neurons_; }
  uint32_t connections() const { return connections_; }

  uint32_t root_id(uint32_t i) const { return u32(root_id_ + 4 * static_cast<size_t>(i)); }
  uint32_t ptr(uint32_t i) const { return u32(ptr_ + 4 * static_cast<size_t>(i)); }
  uint32_t post(size_t k) const { return u32(post_ + 4 * k); }
  uint16_t count(size_t k) const { return u16(count_ + 2 * k); }
  uint32_t code(Category column, uint32_t i) const {
    return column == kType ? u16(codes_[kType] + 2 * static_cast<size_t>(i)) : codes_[column][i];
  }
  const std::string& value(Category column, uint32_t i) const { return tables_[column][code(column, i)]; }
  const std::vector<std::string>& table(Category column) const { return tables_[column]; }

  /** The neuron index for a root ID, or -1 (format.ts's indexOf). */
  int64_t index_of(uint32_t root_id) const;

  /** Indices, ascending, of the neurons matching every condition (format.ts's find). */
  std::vector<uint32_t> find(const NeuronQuery& query) const;

 private:
  static uint32_t u32(const uint8_t* p) {
    return static_cast<uint32_t>(p[0]) | static_cast<uint32_t>(p[1]) << 8 | static_cast<uint32_t>(p[2]) << 16 | static_cast<uint32_t>(p[3]) << 24;
  }
  static uint16_t u16(const uint8_t* p) { return static_cast<uint16_t>(p[0] | p[1] << 8); }

  uint32_t neurons_ = 0;
  uint32_t connections_ = 0;
  const uint8_t* root_id_ = nullptr;
  const uint8_t* ptr_ = nullptr;
  const uint8_t* post_ = nullptr;
  const uint8_t* count_ = nullptr;
  std::array<const uint8_t*, kCategories> codes_{};
  std::array<std::vector<std::string>, kCategories> tables_;
  // How many neurons have each code of each column.
  std::array<std::vector<uint32_t>, kCategories> code_counts_;
};

}  // namespace fly

#endif
