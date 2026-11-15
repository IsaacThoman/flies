// The native brain against the TypeScript one on the small synthetic
// connectome the TypeScript tests use (packages/brain/src/test-helpers.ts), so
// these run without the real data: every tick of the scripted senses bit for
// bit, the same refusals with the same messages for broken files, and the
// same outcome on randomly corrupted ones. The fuzzing also runs under the
// sanitizers.

import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConnectome } from "../../brain/src/format.ts";
import { mulberry32 } from "../../brain/src/sim.ts";
import { syntheticConnectome } from "../../brain/src/test-helpers.ts";
import { build, firstDifference, native, noCompiler, scenario, tempFile, typescript } from "./compare.ts";
import type { Tick } from "./compare.ts";

const synthetic = syntheticConnectome();
const bufferOf = (bytes: Uint8Array) => bytes.slice().buffer;

function compare(dir: string, bytes: Uint8Array, seed: number, ticks: readonly Tick[]) {
  const file = tempFile(bytes);
  try {
    const expected = typescript(bufferOf(bytes), seed, ticks);
    const actual = native(dir, file.path, seed, ticks);
    return { expected, actual, difference: firstDifference(expected, actual, ticks) };
  } finally {
    file.remove();
  }
}

test("every tick of 70 simulated seconds is the TypeScript's, bit for bit, for several seeds", { skip: noCompiler }, () => {
  const dir = build();
  for (const seed of [1, 3, 0xdeadbeef]) {
    const ticks = scenario(70, seed);
    const { expected, difference } = compare(dir, synthetic.bytes, seed, ticks);
    assert.equal(difference, null, `seed ${seed}: ${difference}`);
    // The comparison means something: the fly did things, and some ticks were refused.
    const spikes = expected.slice(1).reduce((sum, line) => sum + (line.startsWith("error") ? 0 : Number(line.split(" ")[0])), 0);
    assert.ok(spikes > 50_000, `${spikes} spikes`);
    assert.ok(expected.some((line) => line.startsWith("error tick takes 0 to 1000 ms")));
  }
});

/** The bytes with the header's text changed, the sections moved to follow it. */
function withHeaderText(bytes: Uint8Array, change: (text: string) => string): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(8, true);
  const json = new TextEncoder().encode(change(new TextDecoder().decode(bytes.subarray(12, 12 + length))));
  const align8 = (n: number) => (n + 7) & ~7;
  const sections = bytes.subarray(align8(12 + length));
  const out = new Uint8Array(align8(12 + json.length) + sections.length);
  out.set(bytes.subarray(0, 8));
  new DataView(out.buffer).setUint32(8, json.length, true);
  out.set(json, 12);
  out.set(sections, align8(12 + json.length));
  return out;
}

/** The bytes with the header changed. */
function withHeader(bytes: Uint8Array, change: (header: Record<string, unknown>) => unknown): Uint8Array {
  return withHeaderText(bytes, (text) => {
    const header = JSON.parse(text);
    return JSON.stringify(change(header) ?? header);
  });
}

/** The bytes with one section's element k set. */
function withElement(bytes: Uint8Array, section: string, k: number, value: number): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(8, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + length)));
  const info = header.sections[section];
  const at = ((12 + length + 7) & ~7) + info.offset;
  const out = bytes.slice();
  const target = new DataView(out.buffer);
  if (info.type === "u8") target.setUint8(at + k, value);
  else if (info.type === "u16") target.setUint16(at + 2 * k, value, true);
  else target.setUint32(at + 4 * k, value, true);
  return out;
}

const s = synthetic.bytes;
// The first neuron with more than one target, and its first connection.
const fanned = (() => {
  const c = loadConnectome(bufferOf(s));
  for (let i = 0; i < c.neurons; i++) if (c.ptr[i + 1] - c.ptr[i] > 1) return c.ptr[i];
  throw new Error("no neuron with two targets");
})();
const BROKEN: [string, Uint8Array][] = [
  ["empty", new Uint8Array(0)],
  ["too short", new Uint8Array(4)],
  ["not a connectome", new TextEncoder().encode("this is not a connectome")],
  ["wrong magic", Uint8Array.from([...new TextEncoder().encode("CBUH"), ...s.subarray(4)])],
  ["another version", (() => { const b = s.slice(); new DataView(b.buffer).setUint32(4, 2, true); return b; })()],
  ["header past the end", (() => { const b = s.slice(); new DataView(b.buffer).setUint32(8, 1 << 30, true); return b; })()],
  ["truncated", s.subarray(0, s.length - 64)],
  ["header not UTF-8", (() => { const b = s.slice(); b[14] = 0xff; return b; })()],
  ["header not JSON", (() => { const b = s.slice(); b[12] = "!".charCodeAt(0); return b; })()],
  ["header a number", withHeader(s, () => 5)],
  ["header null", withHeaderText(s, () => "null")],
  ["header an array", withHeader(s, () => [1, 2])],
  ["neurons missing", withHeader(s, (h) => void delete h.neurons)],
  ["neurons a string", withHeader(s, (h) => void (h.neurons = "84"))],
  ["neurons fractional", withHeader(s, (h) => void (h.neurons = 84.5))],
  ["connections negative", withHeader(s, (h) => void (h.connections = -1))],
  ["synapses unsafe", withHeader(s, (h) => void (h.synapses = 2 ** 60))],
  ["no source", withHeader(s, (h) => void delete h.source)],
  ["source url not a string", withHeader(s, (h) => void ((h.source as Record<string, unknown>).url = 3))],
  ["no sections", withHeader(s, (h) => void delete h.sections)],
  ["no post section", withHeader(s, (h) => void delete (h.sections as Record<string, unknown>).post)],
  ["post section 0", withHeader(s, (h) => void ((h.sections as Record<string, unknown>).post = 0))],
  ["post section true", withHeader(s, (h) => void ((h.sections as Record<string, unknown>).post = true))],
  ["count of the wrong type", withHeader(s, (h) => void ((h.sections as Record<string, Record<string, unknown>>).count.type = "u32"))],
  ["type of type an array", withHeader(s, (h) => void ((h.sections as Record<string, Record<string, unknown>>).type.type = ["u16", null, 1.5e300]))],
  ["type of type an object", withHeader(s, (h) => void ((h.sections as Record<string, Record<string, unknown>>).type.type = { u16: 1 }))],
  ["side too long", withHeader(s, (h) => void ((h.sections as Record<string, Record<string, unknown>>).side.length = 0.000001234))],
  ["side length missing", withHeader(s, (h) => void delete (h.sections as Record<string, Record<string, unknown>>).side.length)],
  ["nt offset unaligned", withHeader(s, (h) => void ((h.sections as Record<string, Record<string, unknown>>).nt.offset = 4))],
  ["nt offset past the end", withHeader(s, (h) => void ((h.sections as Record<string, Record<string, unknown>>).nt.offset = 1 << 20))],
  ["no type table", withHeader(s, (h) => void delete (h.tables as Record<string, unknown>).type)],
  ["a table with a number", withHeader(s, (h) => void (h.tables as Record<string, unknown[]>).class.push(7))],
  ["a short table", withHeader(s, (h) => void (h.tables as Record<string, unknown[]>).superClass.pop())],
  ["tables with escapes", withHeader(s, (h) => void (h.tables as Record<string, string[]>).type.push("é😀\ud800 \"quoted\"\n"))],
  ["duplicate keys", withHeaderText(s, (text) => text.replace('{"neurons":', '{"neurons":5,"neurons":'))],
  ["duplicate keys, the last wrong", withHeaderText(s, (text) => text.replace(/}$/, ',"neurons":5}'))],
  ["numbers written oddly", withHeaderText(s, (text) => text.replace(/"neurons":(\d+)/, (_, n) => `"neurons":${n}.000e0`).replace(/"offset":0\b/, '"offset":-0'))],
  ["whitespace everywhere", withHeaderText(s, (text) => ` \t\r\n${JSON.stringify(JSON.parse(text), null, " \t\r\n")}\n `)],
  ["nothing after the header allowed", withHeaderText(s, (text) => `${text} x`)],
  ["deeply nested", withHeaderText(s, (text) => text.replace(/}$/, `,"deep":${"[".repeat(100000)}${"]".repeat(100000)}}`))],
  ["unterminated nesting", withHeaderText(s, (text) => text.replace(/}$/, `,"deep":${"[".repeat(1000)}}`))],
  ["a lone surrogate escape", withHeaderText(s, (text) => text.replace('"LPLC2"', '"LPLC2\\ud800"'))],
  ["root IDs out of order", withElement(s, "rootId", 3, 1)],
  ["ptr not from 0", withElement(s, "ptr", 0, 1)],
  ["ptr decreasing", withElement(s, "ptr", 5, 0)],
  ["ptr past the connections", withElement(s, "ptr", 2, 1 << 20)],
  ["a connection to nowhere", withElement(s, "post", 0, 9999)],
  ["targets out of order", withElement(s, "post", fanned + 1, 0)],
  ["a target twice", withElement(s, "post", fanned + 1, loadConnectome(bufferOf(s)).post[fanned])],
  ["NT confidence 101", withElement(s, "ntConfidence", 2, 101)],
  ["a code out of range", withElement(s, "subClass", 2, 200)],
  ["no MN9", syntheticConnectome({ without: ["MN9"] }).bytes],
  ["no looming on the left", syntheticConnectome({ without: ["LPLC2 left", "LC4 left"] }).bytes],
  ["no background on the right", syntheticConnectome({ without: ["LC10a right"] }).bytes],
  ["a readout that is driven", syntheticConnectome({ change: { "DNp01 left": { superClass: "visual_projection" } } }).bytes],
  ["a byte order mark", withHeaderText(s, (text) => `\ufeff${text}`)],
  ["two byte order marks", withHeaderText(s, (text) => `\ufeff\ufeff${text}`)],
];

// Odd but valid: format.ts takes these, and so must the native loader.
const ACCEPTED = new Set(["tables with escapes", "duplicate keys", "numbers written oddly", "whitespace everywhere", "deeply nested", "a lone surrogate escape", "a byte order mark"]);

// JSON.parse's messages are V8's own; the native ones say the same thing in other words.
const sameOutcome = (expected: string, actual: string) =>
  expected === actual ||
  (expected.startsWith("error Corrupt connectome header: ") && /Unexpected|JSON|position|token/.test(expected) && actual.startsWith("error Corrupt connectome header: not valid JSON"));

const FEW: Tick[] = scenario(0.2).slice(0, 12);

test("a broken connectome is refused with the TypeScript's message", { skip: noCompiler }, () => {
  const dir = build();
  const problems: string[] = [];
  for (const [what, bytes] of BROKEN) {
    const { expected, actual } = compare(dir, bytes, 1, FEW);
    if (ACCEPTED.has(what) === expected[0].startsWith("error")) problems.push(`${what}: the TypeScript says ${expected[0]}`);
    for (let k = 0; k < Math.max(expected.length, actual.length); k++) {
      if (!sameOutcome(expected[k] ?? "", actual[k] ?? "")) {
        problems.push(`${what}, line ${k}:\n  typescript ${expected[k]}\n  native     ${actual[k]}`);
        break;
      }
    }
  }
  assert.deepEqual(problems, []);
});

/** Randomly corrupted copies of the synthetic file: bytes flipped in the header or the sections, or the end cut off. */
function corruptions(count: number): [string, Uint8Array][] {
  const random = mulberry32(2024);
  const length = new DataView(s.buffer, s.byteOffset).getUint32(8, true);
  const out: [string, Uint8Array][] = [];
  for (let k = 0; k < count; k++) {
    const b = s.slice();
    const kind = k % 4;
    const flips = 1 + Math.floor(random() * 3);
    for (let f = 0; f < flips; f++) {
      const at = kind === 0 ? 12 + Math.floor(random() * length) : kind === 1 ? 12 + length + Math.floor(random() * (b.length - 12 - length)) : Math.floor(random() * b.length);
      b[at] = kind === 2 ? b[at] ^ (1 << Math.floor(random() * 8)) : Math.floor(random() * 256);
    }
    out.push([`corruption ${k}`, kind === 3 ? b.subarray(0, Math.floor(random() * b.length)) : b]);
  }
  return out;
}

for (const mode of ["release", "sanitize"] as const) {
  test(`randomly corrupted connectomes come out as in TypeScript (${mode} build)`, { skip: noCompiler }, () => {
    const dir = build(mode);
    let refused = 0;
    for (const [what, bytes] of corruptions(mode === "release" ? 400 : 120)) {
      const { expected, actual } = compare(dir, bytes, 1, FEW);
      if (expected[0].startsWith("error")) refused++;
      for (let k = 0; k < Math.max(expected.length, actual.length); k++) {
        assert.ok(sameOutcome(expected[k] ?? "", actual[k] ?? ""), `${what}, line ${k}:\n  typescript ${expected[k]}\n  native     ${actual[k]}`);
      }
    }
    assert.ok(refused > 20, `only ${refused} were refused`);
  });
}

test("the sanitizer build runs the scripted senses clean and gets the same answers", { skip: noCompiler }, () => {
  const ticks = scenario(30, 2);
  const { difference } = compare(build("sanitize"), synthetic.bytes, 2, ticks);
  assert.equal(difference, null, difference ?? "");
});
