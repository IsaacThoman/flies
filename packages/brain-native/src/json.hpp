// Just enough of JSON.parse and JavaScript's view of its result to read the
// connectome's header the way format.ts does, including what format.ts makes
// of values of the wrong type.

#ifndef FLY_JSON_HPP
#define FLY_JSON_HPP

#include "exact.hpp"

#include <cstddef>
#include <cstdint>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace fly::json {

enum class Type : uint8_t { Null, False, True, Number, String, Array, Object };

struct Value {
  Type type = Type::Null;
  double number = 0;
  /** A string's value as UTF-8 (lone surrogates from \u escapes as their three-byte form). */
  std::string string;
  /** An array's elements, or an object's member values, as indices into Document::values. */
  std::vector<uint32_t> items;
  /** An object's keys, parallel to items. */
  std::vector<std::string> keys;
};

class Document {
 public:
  /** Parses text as JSON.parse does; false with a message in error if it is not JSON. */
  bool parse(std::string_view text, std::string& error);

  const Value& root() const { return values_[0]; }
  /** obj[key] for an object, as JavaScript reads it (the last of duplicate keys); null when missing or not an object. */
  const Value* member(const Value& object, std::string_view key) const;
  const Value& at(uint32_t index) const { return values_[index]; }

  /** String(value), as a template literal would print it. */
  std::string to_string(const Value& value) const;

 private:
  std::vector<Value> values_;
};

/** Number.isSafeInteger for a value. */
bool is_safe_integer(const Value* value);

/** Number.prototype.toString() for a double. */
std::string number_to_string(double x);

/** Whether bytes are valid UTF-8 as TextDecoder("utf-8", { fatal: true }) requires. */
bool valid_utf8(std::string_view bytes);

}  // namespace fly::json

#endif
