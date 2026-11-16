// The QR encoder against published reference values (the standard's format
// and version bit tables, a worked Reed–Solomon example) and against whole
// codes Core Image's QR generator made for the same bytes at level M.

import assert from "node:assert/strict";
import { test } from "node:test";
import { formatBits, isDark, qrCode, qrVersionFor, reedSolomon, versionBits } from "../src/qr.ts";

test("the error correction of a worked example (HELLO WORLD at 1-M)", () => {
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepEqual([...reedSolomon(data, 10)], [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

test("the format bits for level M and each mask, as the standard tabulates them", () => {
  const table = ["101010000010010", "101000100100101", "101111001111100", "101101101001011", "100010111111001", "100000011001110", "100111110010111", "100101010100000"];
  for (let mask = 0; mask < 8; mask++) assert.equal(formatBits(mask).toString(2).padStart(15, "0"), table[mask], `mask ${mask}`);
});

test("the version bits for versions 7 to 10, as the standard tabulates them", () => {
  assert.deepEqual([7, 8, 9, 10].map(versionBits), [0x07c94, 0x085bc, 0x09a99, 0x0a4d3]);
});

test("the smallest version that holds a length, up to version 10's 213 bytes", () => {
  const most = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213];
  most.forEach((n, i) => {
    assert.equal(qrVersionFor(n), i + 1, `${n} bytes`);
    assert.equal(qrVersionFor(n + 1), i === 9 ? null : i + 2, `${n + 1} bytes`);
  });
  assert.equal(qrCode("y".repeat(214)), null);
});

const rows = (text: string) => {
  const qr = qrCode(text)!;
  return Array.from({ length: qr.size }, (_, y) => Array.from({ length: qr.size }, (_, x) => (isDark(qr, x, y) ? "#" : ".")).join(""));
};

test("a table's invitation is Core Image's code for the same link, module for module (version 4)", () => {
  const link = "https://flies.isaacthoman.com/?table=abcdefghjk";
  assert.equal(qrCode(link)!.version, 4);
  assert.deepEqual(rows(link), [
    "#######.##..####..#..#.##.#######",
    "#.....#.....###.#.###.....#.....#",
    "#.###.#...##..##.##..##...#.###.#",
    "#.###.#.####....##.#...#..#.###.#",
    "#.###.#.##.##...##.#.#.#..#.###.#",
    "#.....#.####...#.#..###...#.....#",
    "#######.#.#.#.#.#.#.#.#.#.#######",
    "........#####.#..######.#........",
    "#...#.#######.##.#..###..#####..#",
    "...#....#.#.#..####..#.#.#...###.",
    "###.####.##..###..#...###....#.#.",
    "...#.#..#.####......#####.#....#.",
    ".#..#.#.#....#.##..#.##.#.#.##.##",
    "..#..#.#...####..#####.#.#.#..#..",
    "....###...#.#.##.##.####.##.####.",
    ".#.#...#.#...#.####..#..#####....",
    ".######.####.....#.#.##.#.#.#..#.",
    "###.##.##.#.#..##.#..###.#...###.",
    "..##.##..#..####.#..#.###..#.#.#.",
    "#...##.#..#.###.####.#.#.###.....",
    "#.##..#.#...#.#...###..##.#.##..#",
    "#.#.##....#..##.#..#...#.#.#.#.#.",
    "..###.##.#..###.##.#..####..##.#.",
    "..##.......#.##..#####.##.#....##",
    "###.#.#.###..###.#..###.#####....",
    "........#####..####..#..#...#.#..",
    "#######.###....##.#.#...#.#.##.#.",
    "#.....#....#.##.......#.#...#..##",
    "#.###.#.##....###..#..#.######...",
    "#.###.#..........####...#.######.",
    "#.###.#..#..##.#..#.###.#.###....",
    "#.....#...###.####...#.###...#...",
    "#######.###......##########..#..#",
  ]);
});

test("the largest code made is Core Image's too, with its version bits and every block (version 10)", () => {
  // Core Image's 57×57 modules for 213 "y"s, row by row, a bit each, most significant first.
  const packed = Buffer.from(
    "/oM4qqqvP8EHxbd3dpBuuhTRERHLt05puqqqpdulsg/qqpLsFHwbF3dxB/qqqqqqqv4AM6nHd3UAox6yPqqqEoQSD5qqqqnHn38sREQkowOKm3d3V6cpq2CqqqKXoRzJqqqqnInh6sREQkoocqm3d3V6dpoqCqqqKO4wRpqqqqnDhjMsREQkpasQW3d3V6fxIWCqqqKWo0WZqqqqnA1C8sREQkpY0ZW3d3V6f8pOCqqqKWqQaZqqqqnj8yE/xEQ+rR8eXHd3UausJOaqqrqQxRSbGqqsX/90AvxEQ+tY7Onfd3fawkPKZKqrQSCTC5qqqim6v4CixEQKkZo+Xfd3fYzgDSZKqrQaCQjZqqqinwv4yixEQKsB4Qnfd3faygDSZKqrQSSQtZqqqinypZKixEQKuZ4bnfd3faj1jaZKqrQSbgtZqqqinpxwKixEQKvx8cnfd3faAtP6fqqr+QBnJZGqqsX/pkKqxERqsE08FHd3UaulJ6Pqqq+V0kp72qqt0uv2IyxEQq8E0MGrd3ao/vTuMKqrEIA=",
    "base64",
  );
  const qr = qrCode("y".repeat(213))!;
  assert.equal(qr.size, 57);
  for (let i = 0; i < 57 * 57; i++) {
    const dark = ((packed[i >> 3] >> (7 - (i & 7))) & 1) === 1;
    assert.equal(isDark(qr, i % 57, Math.floor(i / 57)), dark, `module ${i % 57}, ${Math.floor(i / 57)}`);
  }
});

test("any text a phone might be given, in UTF-8: finders in three corners, timing between them", () => {
  for (const text of ["a", "ünïcødé ✓", "https://flies.example/?table=23456789mn", "x".repeat(150)]) {
    const qr = qrCode(text)!;
    const n = qr.size;
    assert.equal(n, qr.version * 4 + 17);
    for (const [x0, y0] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      for (let d = 0; d < 7; d++) {
        assert.ok(isDark(qr, x0 + d, y0) && isDark(qr, x0, y0 + d) && isDark(qr, x0 + 6, y0 + d) && isDark(qr, x0 + d, y0 + 6), `${text}: a finder's ring at ${x0}, ${y0}`);
      }
      assert.ok(isDark(qr, x0 + 3, y0 + 3) && !isDark(qr, x0 + 1, y0 + 1), `${text}: a finder's middle at ${x0}, ${y0}`);
    }
    for (let i = 8; i < n - 8; i++) assert.equal(isDark(qr, i, 6), i % 2 === 0, `${text}: timing across at ${i}`);
    assert.ok(isDark(qr, 8, n - 8), `${text}: the dark module`);
  }
});
