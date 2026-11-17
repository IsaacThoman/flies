// Writes src/orn-table.ts, each glomerulus's olfactory receptor neurons'
// spontaneous firing and their answers to the world's odorants, from the
// published single-neuron recordings that the DoOR database collects
// (Münch & Galizia 2016, Sci Rep 6: 21841; DoOR.data, CC BY-SA 4.0):
//
//   node packages/brain/scripts/orn-table.ts --door <DoOR.data>/data          rewrite it
//   node packages/brain/scripts/orn-table.ts --door <DoOR.data>/data --check  exit 1 if it differs
//
// Get DoOR.data at the pinned commit:
//   curl -fL https://codeload.github.com/ropensci/DoOR.data/tar.gz/db323a496577c4b4a72b5c2fcd1859e07521ffb5 | tar -xz
//
// The rule, fixed before any of the model's responses were measured (README,
// Smell): for each glomerulus the connectome labels, take the first of
// DATASETS that recorded a neuron or receptor DoOR maps to it, preferring a
// unit that maps to that glomerulus alone; its spontaneous rate and its
// answers (spontaneous subtracted) to ODORANTS at its dilution (10^-2) are the
// glomerulus's. An odorant that dataset didn't test is no answer. A
// glomerulus no dataset recorded fires at the median of the others'
// spontaneous rates and answers nothing.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { readConnectomeFile } from "../src/node.ts";
import { ODORANTS } from "../src/olfaction.ts";

const { values } = parseArgs({ options: { door: { type: "string" }, check: { type: "boolean", default: false } } });
assert(values.door, "--door <DoOR.data>/data");
const door = values.door;
const OUT = fileURLToPath(new URL("../src/orn-table.ts", import.meta.url));
export const DOOR_COMMIT = "db323a496577c4b4a72b5c2fcd1859e07521ffb5";

// Single-neuron spike rates with the spontaneous rate reported, in this order:
// Hallem & Carlson 2006 (Cell 125: 143, Table S1: 24 receptors in the empty
// neuron), then the native neurons of the antenna's basiconic sensilla (de
// Bruyne, Foster & Carlson 2001, Neuron 30: 537), the palps (de Bruyne, Clyne
// & Carlson 1999, J Neurosci 19: 4520) and the coeloconic sensilla (Yao, Ignell
// & Carlson 2005, J Neurosci 25: 8359, spontaneous only), Or67d in the empty
// neuron (van der Goes van Naters & Carlson 2007, Curr Biol 17: 606) and the
// larval receptors in it (Kreher, Mathew, Kim & Carlson 2008, Neuron 59: 110).
const DATASETS = ["Hallem.2006.EN", "Bruyne.2001.WT", "Bruyne.1999.WT", "Yao.2005.WT", "van.der.Goes.van.Naters.2007.EN", "Kreher.2008.EN"] as const;
const CITATION: Record<(typeof DATASETS)[number], string> = {
  "Hallem.2006.EN": "Hallem & Carlson 2006",
  "Bruyne.2001.WT": "de Bruyne et al. 2001",
  "Bruyne.1999.WT": "de Bruyne et al. 1999",
  "Yao.2005.WT": "Yao et al. 2005",
  "van.der.Goes.van.Naters.2007.EN": "van der Goes van Naters & Carlson 2007",
  "Kreher.2008.EN": "Kreher et al. 2008",
};
// The odorants' InChIKeys, in ODORANTS' order.
const KEYS: Record<(typeof ODORANTS)[number], string> = {
  ethylAcetate: "XEKOWRVHYACXOJ-UHFFFAOYSA-N",
  aceticAcid: "QTBSBXVTEAMEQO-UHFFFAOYSA-N",
  ethanol: "LFQSCWFLJHTTHZ-UHFFFAOYSA-N",
  isoamylAcetate: "MLFHJEHSLIIPHL-UHFFFAOYSA-N",
  co2: "CURLTUGMZLYLDI-UHFFFAOYSA-N",
};

// DoOR's tables are written by R: a header without the row-name column.
function table(file: string): Record<string, string>[] {
  // Quoted cells may hold separators and line breaks; none holds a quote.
  const text = readFileSync(join(door, file), "utf8");
  const lines: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (quoted) cell += ch;
    else if (ch === ";" || ch === "\n") {
      row.push(cell);
      cell = "";
      if (ch === "\n") {
        lines.push(row);
        row = [];
      }
    } else if (ch !== "\r") cell += ch;
  }
  if (cell !== "" || row.length > 0) lines.push([...row, cell]);
  const [head, ...body] = lines;
  return body.map((cells) => {
    const values = cells.length === head.length + 1 ? cells.slice(1) : cells;
    assert.equal(values.length, head.length, `${file}: ${cells.slice(0, 3).join(";")}`);
    return Object.fromEntries(head.map((h, k) => [h, values[k]]));
  });
}

const used: string[] = ["door_mappings.csv", "door_dataset_info.csv"];
const info = new Map(table("door_dataset_info.csv").map((r) => [r.dataset, r]));
for (const d of DATASETS) assert.equal(info.get(d)?.["SFR.reported"], "yes", `${d} reports no spontaneous rate`);
const c = readConnectomeFile();
const glomeruli = [...new Set([...c.find({ superClass: "cb_sensory", class: "olfactory" })].map((i) => c.columns.type.value(i)))]
  .filter((t) => t.startsWith("ORN_"))
  .map((t) => t.slice(4))
  .sort();
// Which units DoOR maps to each glomerulus, and whether to it alone.
const units = new Map<string, { unit: string; alone: boolean }[]>();
for (const row of table("door_mappings.csv")) {
  if (row.adult === "FALSE") continue;
  const names = row.glomerulus.split("+").flatMap((g) => (g === "DL2d/v" ? ["DL2d", "DL2v"] : [g]));
  for (const g of names) {
    if (!glomeruli.includes(g)) continue;
    if (!units.has(g)) units.set(g, []);
    units.get(g)!.push({ unit: row.receptor, alone: names.length === 1 });
  }
}
const responses = new Map<string, Record<string, string>[]>();
const rowsOf = (unit: string) => {
  if (!responses.has(unit)) {
    let rows: Record<string, string>[] = [];
    try {
      rows = table(`${unit}.csv`);
      used.push(`${unit}.csv`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    responses.set(unit, rows);
  }
  return responses.get(unit)!;
};
const number = (s: string | undefined) => (s === undefined || s === "NA" || s === "" ? null : Number(s));

type Row = { glomerulus: string; unit: string; source: string; spontaneous: number; answers: number[] };
const rows: Row[] = [];
for (const g of glomeruli) {
  const candidates = [...(units.get(g) ?? [])].sort((a, b) => Number(b.alone) - Number(a.alone));
  let found: Row | null = null;
  for (const dataset of DATASETS) {
    for (const { unit } of candidates) {
      const data = rowsOf(unit);
      const sfr = number(data.find((r) => r.InChIKey === "SFR")?.[dataset]);
      if (sfr === null) continue;
      // DoOR keeps firing as recorded, the spontaneous rate in it (Hallem & Carlson's Table S1 is it less that rate).
      const answers = ODORANTS.map((o) => {
        const hz = number(data.find((r) => r.InChIKey === KEYS[o])?.[dataset]);
        return hz === null ? 0 : hz - sfr;
      });
      found = { glomerulus: g, unit, source: CITATION[dataset], spontaneous: sfr, answers };
      break;
    }
    if (found) break;
  }
  rows.push(found ?? { glomerulus: g, unit: candidates[0]?.unit ?? "", source: "", spontaneous: Number.NaN, answers: ODORANTS.map(() => 0) });
}
const measured = rows.filter((r) => r.source).map((r) => r.spontaneous).sort((a, b) => a - b);
const median = measured.length % 2 ? measured[(measured.length - 1) / 2] : (measured[measured.length / 2 - 1] + measured[measured.length / 2]) / 2;
for (const r of rows) if (!r.source) r.spontaneous = median;

const digest = createHash("sha256");
for (const file of [...new Set(used)].sort()) digest.update(file).update(readFileSync(join(door, file)));
const round = (x: number) => Math.round(x * 1000) / 1000;
const source = `// Each glomerulus's olfactory receptor neurons: the receptor or neuron
// recorded, the study, the spontaneous rate (Hz) and the change in firing
// (Hz, spontaneous subtracted) to each of ODORANTS at a 10^-2 dilution.
// Generated by scripts/orn-table.ts from DoOR.data (Münch & Galizia 2016,
// CC BY-SA 4.0) at ${DOOR_COMMIT};
// its files' digest ${digest.digest("hex")}.
// A glomerulus with no source was recorded by none of its datasets: it fires
// at the median of the others' spontaneous rates (${median} Hz) and answers nothing.

export type OrnRow = readonly [glomerulus: string, unit: string, source: string, spontaneous: number, answers: readonly number[]];

export const ORN_TABLE: readonly OrnRow[] = [
${rows.map((r) => `  [${JSON.stringify(r.glomerulus)}, ${JSON.stringify(r.unit)}, ${JSON.stringify(r.source)}, ${round(r.spontaneous)}, [${r.answers.map(round).join(", ")}]],`).join("\n")}
];
`;
if (values.check) {
  if (readFileSync(OUT, "utf8") !== source) {
    console.error(`${OUT} is not what DoOR.data gives`);
    process.exit(1);
  }
} else writeFileSync(OUT, source);
