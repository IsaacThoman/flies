#include "connectome.hpp"

#include <cmath>
#include <cstring>

#include "json.hpp"

namespace fly {

namespace {

[[noreturn]] void fail(const std::string& message) { throw FormatError(message); }

enum class Element : uint8_t { U8, U16, U32 };
enum class Size : uint8_t { N, N1, E };

struct Section {
  const char* name;
  Element type;
  Size size;
};

// format.ts's SECTIONS: order in the file, element type, length.
constexpr Section kSections[] = {
    {"rootId", Element::U32, Size::N},   {"ptr", Element::U32, Size::N1},    {"post", Element::U32, Size::E},
    {"count", Element::U16, Size::E},    {"superClass", Element::U8, Size::N}, {"class", Element::U8, Size::N},
    {"subClass", Element::U8, Size::N},  {"nt", Element::U8, Size::N},       {"side", Element::U8, Size::N},
    {"nerve", Element::U8, Size::N},     {"type", Element::U16, Size::N},    {"ntConfidence", Element::U8, Size::N},
};
constexpr size_t kSectionCount = sizeof kSections / sizeof kSections[0];
constexpr const char* kCategoryNames[kCategories] = {"superClass", "class", "subClass", "nt", "side", "nerve", "type"};

const char* element_name(Element type) { return type == Element::U8 ? "u8" : type == Element::U16 ? "u16" : "u32"; }
double element_bytes(Element type) { return type == Element::U8 ? 1 : type == Element::U16 ? 2 : 4; }

// JavaScript truthiness of a member that may be missing.
bool truthy(const json::Value* value) {
  if (value == nullptr) return false;
  switch (value->type) {
    case json::Type::Null:
    case json::Type::False: return false;
    case json::Type::Number: return value->number != 0 && !std::isnan(value->number);
    case json::Type::String: return !value->string.empty();
    default: return true;
  }
}

uint32_t le32(const uint8_t* p) {
  return static_cast<uint32_t>(p[0]) | static_cast<uint32_t>(p[1]) << 8 | static_cast<uint32_t>(p[2]) << 16 | static_cast<uint32_t>(p[3]) << 24;
}

}  // namespace

Connectome::Connectome(const uint8_t* data, size_t length) {
  if (length < 12) fail("Not a connectome: only " + std::to_string(length) + " bytes");
  if (std::memcmp(data, "CBUG", 4) != 0) fail("Not a connectome: expected magic \"CBUG\"");
  const uint32_t version = le32(data + 4);
  if (version != 1) fail("Unsupported connectome version " + std::to_string(version) + " (expected 1)");
  const uint32_t header_length = le32(data + 8);
  if (12 + static_cast<uint64_t>(header_length) > length) fail("Truncated connectome: the header runs past the end of the file");

  std::string_view text(reinterpret_cast<const char*>(data + 12), header_length);
  if (!json::valid_utf8(text)) fail("Corrupt connectome header: The encoded data was not valid for encoding utf-8");
  // TextDecoder drops a byte order mark.
  if (text.substr(0, 3) == "\xEF\xBB\xBF") text.remove_prefix(3);
  json::Document doc;
  std::string error;
  if (!doc.parse(text, error)) fail("Corrupt connectome header: " + error);
  const json::Value& header = doc.root();
  if (header.type != json::Type::Object && header.type != json::Type::Array) fail("Corrupt connectome header");

  const json::Value* n_value = doc.member(header, "neurons");
  const json::Value* e_value = doc.member(header, "connections");
  if (!json::is_safe_integer(n_value) || n_value->number < 0 || !json::is_safe_integer(e_value) || e_value->number < 0) {
    fail("Corrupt connectome header: bad counts");
  }
  const json::Value* synapses = doc.member(header, "synapses");
  if (!json::is_safe_integer(synapses) || synapses->number < 0) fail("Corrupt connectome header: bad synapse count");
  const json::Value* source = doc.member(header, "source");
  for (const char* field : {"dataset", "license", "url"}) {
    const json::Value* each = source == nullptr ? nullptr : doc.member(*source, field);
    if (each == nullptr || each->type != json::Type::String) fail("Corrupt connectome header: missing source");
  }
  const double n = n_value->number;
  const double e = e_value->number;

  const uint64_t data_start = (12 + static_cast<uint64_t>(header_length) + 7) & ~static_cast<uint64_t>(7);
  const json::Value* sections = doc.member(header, "sections");
  const uint8_t* at[kSectionCount];
  for (size_t s = 0; s < kSectionCount; s++) {
    const Section& section = kSections[s];
    const std::string name = section.name;
    const json::Value* info = sections == nullptr ? nullptr : doc.member(*sections, section.name);
    if (!truthy(info)) fail("Corrupt connectome header: no " + name + " section");
    const double expected = section.size == Size::N ? n : section.size == Size::N1 ? n + 1 : e;
    const json::Value* type = doc.member(*info, "type");
    if (type == nullptr || type->type != json::Type::String || type->string != element_name(section.type)) {
      fail("Corrupt connectome: " + name + " is " + (type == nullptr ? "undefined" : doc.to_string(*type)) + ", expected " + element_name(section.type));
    }
    const json::Value* entries = doc.member(*info, "length");
    if (entries == nullptr || entries->type != json::Type::Number || entries->number != expected) {
      fail("Corrupt connectome: " + name + " has " + (entries == nullptr ? "undefined" : doc.to_string(*entries)) + " entries, expected " +
           json::number_to_string(expected));
    }
    const json::Value* offset = doc.member(*info, "offset");
    if (!json::is_safe_integer(offset) || offset->number < 0 || static_cast<uint64_t>(offset->number) % 8 != 0) fail("Corrupt connectome: bad " + name + " offset");
    // In doubles, as JavaScript adds them; nothing past 2^53 fits a file anyway.
    const double start = static_cast<double>(data_start) + offset->number;
    if (start + expected * element_bytes(section.type) > static_cast<double>(length)) {
      fail("Truncated connectome: the " + name + " section runs past the end of the file");
    }
    at[s] = data + static_cast<size_t>(start);
  }
  // Every section fits the buffer, so these fit 32 bits for any buffer under 16 GB.
  if (n > 4294967295.0 || e > 4294967295.0) fail("Corrupt connectome header: bad counts");
  neurons_ = static_cast<uint32_t>(n);
  connections_ = static_cast<uint32_t>(e);
  ptr_ = at[1];
  post_ = at[2];
  count_ = at[3];
  for (int c = 0; c < kCategories; c++) codes_[c] = at[4 + c];
  root_id_ = at[0];
  const uint8_t* nt_confidence = at[11];

  for (uint32_t i = 1; i < neurons_; i++) {
    if (root_id(i) <= root_id(i - 1)) {
      fail("Corrupt connectome: root IDs are not strictly ascending");
    }
  }
  if (ptr(0) != 0 || ptr(neurons_) != connections_) fail("Corrupt connectome: ptr does not span the connections");
  for (uint32_t i = 0; i < neurons_; i++) {
    const uint32_t start = ptr(i);
    const uint32_t end = ptr(i + 1);
    if (end < start) fail("Corrupt connectome: ptr decreases at neuron " + std::to_string(i));
    int64_t previous = -1;
    // format.ts reads past the last connection as undefined, which passes
    // both tests; ptr must then decrease later, which is caught above.
    for (uint32_t k = start; k < end && k < connections_; k++) {
      const uint32_t j = post(k);
      if (j >= neurons_) fail("Corrupt connectome: connection " + std::to_string(k) + " targets neuron " + std::to_string(j) + " of " + std::to_string(neurons_));
      if (j <= previous) fail("Corrupt connectome: targets of neuron " + std::to_string(i) + " are not strictly ascending");
      previous = j;
    }
  }
  for (uint32_t i = 0; i < neurons_; i++) {
    if (nt_confidence[i] > 100) fail("Corrupt connectome: NT confidence above 100");
  }

  const json::Value* tables = doc.member(header, "tables");
  for (int c = 0; c < kCategories; c++) {
    const std::string name = kCategoryNames[c];
    const json::Value* table = tables == nullptr ? nullptr : doc.member(*tables, kCategoryNames[c]);
    bool strings = table != nullptr && table->type == json::Type::Array;
    if (strings) {
      for (uint32_t item : table->items) strings = strings && doc.at(item).type == json::Type::String;
    }
    if (!strings) fail("Corrupt connectome header: no " + name + " table");
    const size_t size = table->items.size();
    for (uint32_t i = 0; i < neurons_; i++) {
      if (code(static_cast<Category>(c), i) >= size) fail("Corrupt connectome: " + name + " code out of range");
    }
    tables_[c].reserve(size);
    for (uint32_t item : table->items) tables_[c].push_back(doc.at(item).string);
  }
}

int64_t Connectome::index_of(uint32_t id) const {
  // Root IDs are strictly ascending (checked above), so a binary search finds the one index format.ts's does.
  int64_t lo = 0;
  int64_t hi = static_cast<int64_t>(neurons_) - 1;
  while (lo <= hi) {
    const int64_t mid = (lo + hi) / 2;
    const uint32_t at = root_id(static_cast<uint32_t>(mid));
    if (at == id) return mid;
    if (at < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

std::vector<uint32_t> Connectome::find(const NeuronQuery& query) const {
  // Each condition is resolved once per table entry, then neurons are matched by code.
  std::vector<std::pair<Category, std::vector<uint8_t>>> masks;
  for (int c = 0; c < kCategories; c++) {
    if (!query[c]) continue;
    std::vector<uint8_t> mask;
    mask.reserve(tables_[c].size());
    for (const std::string& value : tables_[c]) mask.push_back(query[c](value) ? 1 : 0);
    masks.emplace_back(static_cast<Category>(c), std::move(mask));
  }
  std::vector<uint32_t> out;
  for (uint32_t i = 0; i < neurons_; i++) {
    bool all = true;
    for (const auto& [column, mask] : masks) all = all && mask[code(column, i)] == 1;
    if (all) out.push_back(i);
  }
  return out;
}

}  // namespace fly
