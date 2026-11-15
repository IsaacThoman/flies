#include "json.hpp"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>

namespace fly::json {

namespace {

bool is_space(char c) { return c == ' ' || c == '\t' || c == '\n' || c == '\r'; }
bool is_digit(char c) { return c >= '0' && c <= '9'; }

void append_utf8(std::string& out, uint32_t code) {
  if (code < 0x80) {
    out += static_cast<char>(code);
  } else if (code < 0x800) {
    out += static_cast<char>(0xc0 | (code >> 6));
    out += static_cast<char>(0x80 | (code & 0x3f));
  } else if (code < 0x10000) {
    out += static_cast<char>(0xe0 | (code >> 12));
    out += static_cast<char>(0x80 | ((code >> 6) & 0x3f));
    out += static_cast<char>(0x80 | (code & 0x3f));
  } else {
    out += static_cast<char>(0xf0 | (code >> 18));
    out += static_cast<char>(0x80 | ((code >> 12) & 0x3f));
    out += static_cast<char>(0x80 | ((code >> 6) & 0x3f));
    out += static_cast<char>(0x80 | (code & 0x3f));
  }
}

// strtod on digits and an exponent alone: without a decimal point, which
// strtod would read in the C library's current locale, the result is the
// correctly rounded value JavaScript gives the same literal.
double decimal(bool negative, const std::string& digits, long long exponent) {
  std::string text = negative ? "-" : "";
  text += digits;
  text += 'e';
  text += std::to_string(exponent);
  return std::strtod(text.c_str(), nullptr);
}

class Parser {
 public:
  Parser(std::string_view text, std::vector<Value>& values) : text_(text), values_(values) {}

  bool run(std::string& error) {
    // Containers being filled, innermost last. Iterative, so that nesting
    // costs heap rather than the calling thread's stack.
    std::vector<uint32_t> open;
    for (;;) {
      // A value is expected here.
      skip();
      if (pos_ >= text_.size()) return fail(error, "unexpected end of input");
      const char c = text_[pos_];
      uint32_t index;
      if (c == '{' || c == '[') {
        ++pos_;
        index = add(c == '{' ? Type::Object : Type::Array, open);
        open.push_back(index);
        skip();
        const char close = c == '{' ? '}' : ']';
        if (pos_ < text_.size() && text_[pos_] == close) {
          ++pos_;
          open.pop_back();
        } else if (c == '{') {
          if (!key(open.back(), error)) return false;
          continue;
        } else {
          continue;
        }
      } else if (c == '"') {
        std::string s;
        if (!string(s, error)) return false;
        index = add(Type::String, open);
        values_[index].string = std::move(s);
      } else if (c == '-' || is_digit(c)) {
        double x;
        if (!number(x, error)) return false;
        index = add(Type::Number, open);
        values_[index].number = x;
      } else if (literal("true")) {
        add(Type::True, open);
      } else if (literal("false")) {
        add(Type::False, open);
      } else if (literal("null")) {
        add(Type::Null, open);
      } else {
        return fail(error, "unexpected character");
      }
      // A value is complete: close containers until one continues.
      for (;;) {
        skip();
        if (open.empty()) {
          if (pos_ != text_.size()) return fail(error, "unexpected text after the value");
          return true;
        }
        if (pos_ >= text_.size()) return fail(error, "unexpected end of input");
        const Value& container = values_[open.back()];
        const char next = text_[pos_++];
        if (next == ',') {
          if (container.type == Type::Object && !key(open.back(), error)) return false;
          break;
        }
        if (next != (container.type == Type::Object ? '}' : ']')) return fail(error, "expected ',' or the end of a container");
        open.pop_back();
      }
    }
  }

 private:
  bool fail(std::string& error, const char* what) {
    error = "not valid JSON: ";
    error += what;
    error += " at byte ";
    error += std::to_string(pos_);
    return false;
  }

  void skip() {
    while (pos_ < text_.size() && is_space(text_[pos_])) ++pos_;
  }

  bool literal(std::string_view word) {
    if (text_.substr(pos_, word.size()) != word) return false;
    pos_ += word.size();
    return true;
  }

  // Appends a value to the innermost open container, if any.
  uint32_t add(Type type, const std::vector<uint32_t>& open) {
    const auto index = static_cast<uint32_t>(values_.size());
    values_.emplace_back();
    values_.back().type = type;
    if (!open.empty()) values_[open.back()].items.push_back(index);
    return index;
  }

  // An object's next key and its colon; the value follows.
  bool key(uint32_t object, std::string& error) {
    skip();
    if (pos_ >= text_.size() || text_[pos_] != '"') return fail(error, "expected a key");
    std::string k;
    if (!string(k, error)) return false;
    skip();
    if (pos_ >= text_.size() || text_[pos_] != ':') return fail(error, "expected ':'");
    ++pos_;
    values_[object].keys.push_back(std::move(k));
    return true;
  }

  bool hex4(uint32_t& out) {
    if (pos_ + 4 > text_.size()) return false;
    out = 0;
    for (int k = 0; k < 4; k++) {
      const char c = text_[pos_++];
      out <<= 4;
      if (is_digit(c)) out |= static_cast<uint32_t>(c - '0');
      else if (c >= 'a' && c <= 'f') out |= static_cast<uint32_t>(c - 'a' + 10);
      else if (c >= 'A' && c <= 'F') out |= static_cast<uint32_t>(c - 'A' + 10);
      else return false;
    }
    return true;
  }

  bool string(std::string& out, std::string& error) {
    ++pos_;
    for (;;) {
      if (pos_ >= text_.size()) return fail(error, "unterminated string");
      const auto c = static_cast<unsigned char>(text_[pos_++]);
      if (c == '"') return true;
      if (c < 0x20) return fail(error, "control character in a string");
      if (c != '\\') {
        out += static_cast<char>(c);
        continue;
      }
      if (pos_ >= text_.size()) return fail(error, "unterminated string");
      const char e = text_[pos_++];
      switch (e) {
        case '"': out += '"'; break;
        case '\\': out += '\\'; break;
        case '/': out += '/'; break;
        case 'b': out += '\b'; break;
        case 'f': out += '\f'; break;
        case 'n': out += '\n'; break;
        case 'r': out += '\r'; break;
        case 't': out += '\t'; break;
        case 'u': {
          uint32_t unit;
          if (!hex4(unit)) return fail(error, "bad \\u escape");
          // A surrogate pair written as two escapes is one character, as in
          // a JavaScript string; a lone surrogate stays itself.
          if (unit >= 0xd800 && unit < 0xdc00 && text_.substr(pos_, 2) == "\\u") {
            const size_t back = pos_;
            pos_ += 2;
            uint32_t low;
            if (hex4(low) && low >= 0xdc00 && low < 0xe000) {
              unit = 0x10000 + ((unit - 0xd800) << 10) + (low - 0xdc00);
            } else {
              pos_ = back;
            }
          }
          append_utf8(out, unit);
          break;
        }
        default:
          return fail(error, "bad escape");
      }
    }
  }

  bool number(double& out, std::string& error) {
    const bool negative = text_[pos_] == '-';
    if (negative) ++pos_;
    std::string digits;
    if (pos_ < text_.size() && text_[pos_] == '0') {
      digits += '0';
      ++pos_;
    } else if (pos_ < text_.size() && is_digit(text_[pos_])) {
      while (pos_ < text_.size() && is_digit(text_[pos_])) digits += text_[pos_++];
    } else {
      return fail(error, "bad number");
    }
    long long exponent = 0;
    if (pos_ < text_.size() && text_[pos_] == '.') {
      ++pos_;
      if (pos_ >= text_.size() || !is_digit(text_[pos_])) return fail(error, "bad number");
      while (pos_ < text_.size() && is_digit(text_[pos_])) {
        digits += text_[pos_++];
        --exponent;
      }
    }
    if (pos_ < text_.size() && (text_[pos_] == 'e' || text_[pos_] == 'E')) {
      ++pos_;
      bool down = false;
      if (pos_ < text_.size() && (text_[pos_] == '+' || text_[pos_] == '-')) down = text_[pos_++] == '-';
      if (pos_ >= text_.size() || !is_digit(text_[pos_])) return fail(error, "bad number");
      long long e = 0;
      // Saturates far beyond any exponent that leaves a finite nonzero double.
      while (pos_ < text_.size() && is_digit(text_[pos_])) e = std::min(e * 10 + (text_[pos_++] - '0'), 1000000000LL);
      exponent += down ? -e : e;
    }
    out = decimal(negative, digits, exponent);
    return true;
  }

  std::string_view text_;
  size_t pos_ = 0;
  std::vector<Value>& values_;
};

}  // namespace

bool Document::parse(std::string_view text, std::string& error) {
  values_.clear();
  Parser parser(text, values_);
  if (parser.run(error)) return true;
  values_.clear();
  return false;
}

const Value* Document::member(const Value& object, std::string_view key) const {
  if (object.type != Type::Object) return nullptr;
  for (size_t k = object.keys.size(); k-- > 0;) {
    if (object.keys[k] == key) return &values_[object.items[k]];
  }
  return nullptr;
}

std::string Document::to_string(const Value& value) const {
  switch (value.type) {
    case Type::Null: return "null";
    case Type::False: return "false";
    case Type::True: return "true";
    case Type::Number: return number_to_string(value.number);
    case Type::String: return value.string;
    case Type::Object: return "[object Object]";
    case Type::Array: {
      // Array.prototype.join: null elements print as nothing.
      std::string out;
      for (size_t k = 0; k < value.items.size(); k++) {
        if (k > 0) out += ',';
        const Value& item = values_[value.items[k]];
        if (item.type != Type::Null) out += to_string(item);
      }
      return out;
    }
  }
  return "";
}

bool is_safe_integer(const Value* value) {
  if (value == nullptr || value->type != Type::Number) return false;
  const double x = value->number;
  return std::isfinite(x) && std::trunc(x) == x && std::fabs(x) <= 9007199254740991.0;
}

std::string number_to_string(double x) {
  if (std::isnan(x)) return "NaN";
  if (x == 0) return "0";
  if (x < 0) return "-" + number_to_string(-x);
  if (std::isinf(x)) return "Infinity";
  // The shortest digits that read back as x (ECMAScript Number::toString).
  std::string digits;
  int n = 0;
  for (int precision = 1; precision <= 17; precision++) {
    char buffer[64];
    std::snprintf(buffer, sizeof buffer, "%.*e", precision - 1, x);
    digits.clear();
    const char* p = buffer;
    for (; *p != 'e'; ++p) {
      if (is_digit(*p)) digits += *p;
    }
    const int e = std::atoi(p + 1);
    if (decimal(false, digits, e - (precision - 1)) == x) {
      n = e + 1;
      break;
    }
  }
  while (digits.size() > 1 && digits.back() == '0') digits.pop_back();
  const int k = static_cast<int>(digits.size());
  if (k <= n && n <= 21) return digits + std::string(static_cast<size_t>(n - k), '0');
  if (0 < n && n <= 21) return digits.substr(0, static_cast<size_t>(n)) + "." + digits.substr(static_cast<size_t>(n));
  if (-6 < n && n <= 0) return "0." + std::string(static_cast<size_t>(-n), '0') + digits;
  const int e = n - 1;
  std::string out = digits.substr(0, 1);
  if (k > 1) out += "." + digits.substr(1);
  out += e < 0 ? "e-" : "e+";
  out += std::to_string(e < 0 ? -e : e);
  return out;
}

bool valid_utf8(std::string_view bytes) {
  const auto* p = reinterpret_cast<const unsigned char*>(bytes.data());
  const size_t size = bytes.size();
  size_t i = 0;
  while (i < size) {
    const unsigned char c = p[i];
    if (c < 0x80) {
      i++;
      continue;
    }
    size_t extra;
    unsigned char lo = 0x80, hi = 0xbf;
    if (c >= 0xc2 && c <= 0xdf) {
      extra = 1;
    } else if (c >= 0xe0 && c <= 0xef) {
      extra = 2;
      if (c == 0xe0) lo = 0xa0;
      if (c == 0xed) hi = 0x9f;
    } else if (c >= 0xf0 && c <= 0xf4) {
      extra = 3;
      if (c == 0xf0) lo = 0x90;
      if (c == 0xf4) hi = 0x8f;
    } else {
      return false;
    }
    if (i + extra >= size) return false;
    if (p[i + 1] < lo || p[i + 1] > hi) return false;
    for (size_t k = 2; k <= extra; k++) {
      if (p[i + k] < 0x80 || p[i + k] > 0xbf) return false;
    }
    i += extra + 1;
  }
  return true;
}

}  // namespace fly::json
