// The few parts of the xlsx format the published tables we read need: the
// zip's central directory, deflated or stored entries, shared strings and
// plain cells. Each sheet by name, as rows of cells.

import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

export function readXlsx(path: string): Map<string, string[][]> {
  const zip = readFileSync(path);
  let end = zip.length - 22;
  while (end >= 0 && zip.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error(`${path} is not a zip file`);
  const files = new Map<string, Buffer>();
  let at = zip.readUInt32LE(end + 16);
  for (let k = 0, n = zip.readUInt16LE(end + 10); k < n; k++) {
    const method = zip.readUInt16LE(at + 10);
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const skip = nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
    const name = zip.toString("utf8", at + 46, at + 46 + nameLength);
    const local = zip.readUInt32LE(at + 42);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(start, start + size);
    files.set(name, method === 8 ? inflateRawSync(raw) : raw);
    at += 46 + skip;
  }
  const text = (name: string) => {
    const file = files.get(name);
    if (!file) throw new Error(`${path} has no ${name}`);
    return file.toString("utf8");
  };
  const unescape = (s: string) =>
    s.replace(/&(lt|gt|amp|quot|apos);/g, (_, e: string) => ({ lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" })[e]!);
  const strings = [...text("xl/sharedStrings.xml").matchAll(/<si>(.*?)<\/si>/gs)].map((m) =>
    unescape([...m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map((t) => t[1]).join("")),
  );
  const targets = new Map([...text("xl/_rels/workbook.xml.rels").matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const sheets = new Map<string, string[][]>();
  for (const m of text("xl/workbook.xml").matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const rows: string[][] = [];
    for (const row of text(`xl/${targets.get(m[2])}`).matchAll(/<row [^>]*>(.*?)<\/row>/gs)) {
      const cells: string[] = [];
      for (const cell of row[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
        const column = [...cell[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
        const value = /<v>(.*?)<\/v>/s.exec(cell[3] ?? "")?.[1] ?? "";
        cells[column] = /t="s"/.test(cell[2]) ? strings[Number(value)] : unescape(value);
      }
      rows.push(Array.from(cells, (each) => each ?? ""));
    }
    sheets.set(unescape(m[1]), rows);
  }
  return sheets;
}
