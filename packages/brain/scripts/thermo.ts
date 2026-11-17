// The antennae's thermoreceptors in this connectome: which neurons they are,
// where they lead, and what the brain does when the temperature at one or
// both antennae changes (README, Senses: temperature).
//
//   node packages/brain/scripts/thermo.ts [--part audit|routes|steps|rest|all] [--seeds 1,2,3] [--step 0.5] [--seconds 180]
//
// audit: joins the thermosensory and hygrosensory neurons to FlyEM's public
// annotation table by body ID (pinned hash, as scripts/olfaction.ts does) and
// checks each one's type, class and side (the packed wiring's side against
// the table's root side, which is the antenna's) and its entry nerve.
// Needs packages/brain/data/annotations.feather and anatomy.bin (README, Anatomy sidecar).
//
// routes: synapses from each antenna's heating and cooling cells onto the
// readouts' neurons (DNa02 of each side, MDN, DNg100), directly and through one
// other neuron (each route counted by its weaker leg), and their strongest
// partners.
//
// steps: from rest standing at 25 °C (2 s), the temperature at the left, the
// right or both antennae changes by `--step` °C (warmer, then in another run
// cooler) for 2 s: each readout's rate and the commands, against 2 s more at
// 25 °C. The turn is signed toward the fly's right; away from a warmed left
// antenna is positive.
//
// rest: `--seconds` at rest standing, with no temperature and at 25 °C at both
// antennae (what the game sends where nothing is warmer or cooler): the time
// it walks and its turn events (the diagnostic observer), and spikes a second.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { compressionRegistry, CompressionType, tableFromIPC } from "apache-arrow";
import lz4 from "lz4js";
import { loadAnatomy } from "../src/anatomy.ts";
import { readConnectomeFile } from "../src/node.ts";
import { ANNOTATION_SHA256 } from "../src/pack-anatomy.ts";
import { BehaviorObserver } from "../src/observer.ts";
import { FlyBrain } from "../src/runtime.ts";
import { RESTING_SENSES } from "../src/types.ts";
import type { BrainSenses } from "../src/types.ts";

const { values } = parseArgs({
  options: {
    part: { type: "string", default: "all" },
    seeds: { type: "string", default: "1,2,3" },
    step: { type: "string", default: "0.5" },
    seconds: { type: "string", default: "180" },
    annotations: { type: "string", default: "packages/brain/data/annotations.feather" },
    anatomy: { type: "string", default: "packages/brain/data/anatomy.bin" },
    path: { type: "string", default: "packages/brain/data/connectome.bin" },
  },
});
const seeds = values.seeds.split(",").map(Number);
const STEP = Number(values.step);
const c = readConnectomeFile(values.path);
const type = (i: number) => c.columns.type.value(i);
const side = (i: number) => c.columns.side.value(i);
const bytes = (path: string) => Uint8Array.from(readFileSync(path)).buffer;

async function audit() {
  if (!existsSync(values.annotations) || !existsSync(values.anatomy)) {
    console.log(`audit: needs ${values.annotations} and ${values.anatomy} (README, Anatomy sidecar)`);
    return;
  }
  const annotationData = bytes(values.annotations);
  assert.equal(createHash("sha256").update(new Uint8Array(annotationData)).digest("hex"), ANNOTATION_SHA256);
  const anatomy = await loadAnatomy(bytes(values.anatomy), bytes(values.path));
  compressionRegistry.set(CompressionType.LZ4_FRAME, { decode: (b) => lz4.decompress(b) });
  const rows = new Map<number, Record<string, unknown>>();
  for (const row of tableFromIPC(annotationData)) rows.set(Number(row.bodyId), row.toJSON());
  const side = { L: "left", R: "right" } as Record<string, string>;
  console.log("Thermosensory and hygrosensory neurons (cb_sensory), by type: neurons left/right by the antenna they come from; every one checked against FlyEM's table");
  for (const cls of ["thermosensory", "hygrosensory"]) {
    const found = c.find({ superClass: "cb_sensory", class: cls });
    const byType = new Map<string, { left: number; right: number; "": number; nerve: Set<string> }>();
    for (const i of found) {
      const row = rows.get(c.rootId[i]);
      assert.ok(row, `no annotation for ${c.rootId[i]}`);
      assert.equal(row.type, type(i));
      assert.equal(row.class, cls);
      // The packed side of these sensory neurons is FlyEM's root side, the antenna's.
      assert.equal(side[row.rootSide as string] ?? "", c.columns.side.value(i), `side of ${c.rootId[i]}`);
      assert.equal(anatomy.columns.rootSide.value(i).replace("unknown", ""), c.columns.side.value(i));
      const each = byType.get(type(i)) ?? { left: 0, right: 0, "": 0, nerve: new Set<string>() };
      each[c.columns.side.value(i) as "left" | "right" | ""]++;
      each.nerve.add(String(row.entryNerve));
      byType.set(type(i), each);
    }
    for (const [t, n] of [...byType].sort()) console.log(`  ${cls.padEnd(14)} ${t.padEnd(10)} ${n.left}/${n.right}${n[""] ? ` and ${n[""]} of no side` : ""}  entry nerve ${[...n.nerve].join(",")}`);
  }
}

const GROUPS = {
  "heating left": c.find({ type: "TRN_VP2", side: "left" }),
  "heating right": c.find({ type: "TRN_VP2", side: "right" }),
  "cooling left": c.find({ type: ["TRN_VP3a", "TRN_VP3b"], side: "left" }),
  "cooling right": c.find({ type: ["TRN_VP3a", "TRN_VP3b"], side: "right" }),
};
const READ: Record<string, Uint32Array> = {
  "DNa02 l": c.find({ type: "DNa02", side: "left" }),
  "DNa02 r": c.find({ type: "DNa02", side: "right" }),
  MDN: c.find({ type: "MDN" }),
  DNg100: c.find({ type: "DNg100" }),
  "DNb05 l": c.find({ type: "DNb05", side: "left" }),
  "DNb05 r": c.find({ type: "DNb05", side: "right" }),
};

function routes() {
  console.log("Wiring: synapses onto each readout, direct | through one neuron (sum over routes of the weaker leg)");
  const targets = Object.entries(READ).filter(([name]) => !name.startsWith("DNb05"));
  const into = new Map<number, Map<string, number>>();
  for (let p = 0; p < c.neurons; p++) {
    for (let e = c.ptr[p]; e < c.ptr[p + 1]; e++) {
      for (const [name, neurons] of targets) {
        if (!neurons.includes(c.post[e])) continue;
        const m = into.get(p) ?? new Map<string, number>();
        m.set(name, (m.get(name) ?? 0) + c.count[e]);
        into.set(p, m);
      }
    }
  }
  for (const [name, from] of Object.entries(GROUPS)) {
    const via = new Map<number, number>();
    const direct = new Map<string, number>();
    const partners = new Map<string, number>();
    for (const p of from) {
      for (let e = c.ptr[p]; e < c.ptr[p + 1]; e++) {
        const m = c.post[e];
        const label = `${type(m) || "?"}${side(m) ? ` ${side(m)[0]}` : ""}`;
        partners.set(label, (partners.get(label) ?? 0) + c.count[e]);
        if (into.has(m)) via.set(m, (via.get(m) ?? 0) + c.count[e]);
        for (const [t, neurons] of targets) if (neurons.includes(m)) direct.set(t, (direct.get(t) ?? 0) + c.count[e]);
      }
    }
    const cells = targets.map(([t]) => {
      let sum = 0;
      for (const [m, fromSyn] of via) sum += Math.min(fromSyn, into.get(m)!.get(t) ?? 0);
      return `${t} ${direct.get(t) ?? 0} | ${sum}`;
    });
    // The fewest synapses (of any strength) between these cells and each readout.
    const hops = targets.map(([t, neurons]) => {
      const goal = new Set(neurons);
      const seen = new Uint8Array(c.neurons);
      let frontier = [...from];
      for (const i of frontier) seen[i] = 1;
      for (let depth = 1; depth <= 6 && frontier.length; depth++) {
        const next: number[] = [];
        for (const p of frontier) {
          for (let e = c.ptr[p]; e < c.ptr[p + 1]; e++) {
            const m = c.post[e];
            if (goal.has(m)) return `${t} ${depth}`;
            if (!seen[m]) {
              seen[m] = 1;
              next.push(m);
            }
          }
        }
        frontier = next;
      }
      return `${t} >6`;
    });
    const top = [...partners].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${v}`);
    console.log(`  ${name.padEnd(14)} ${String(from.length).padStart(2)} neurons  ${cells.join("   ")}\n    synapses on the shortest path: ${hops.join(", ")}\n    strongest partners: ${top.join(", ")}`);
  }
}

const SETTLE_MS = 2000;
const STEP_MS = 2000;
const AT = (left: number, right: number): BrainSenses => ({ ...RESTING_SENSES, temperatureLeft: left, temperatureRight: right });

function steps() {
  console.log(`Steps of ${STEP} °C from 25 °C, ${STEP_MS} ms, seeds ${seeds.join(", ")}: mean rate (Hz) of each readout and the mean commands, each seed`);
  const conditions: [string, number, number][] = [
    ["none (25 °C)", 0, 0],
    ["left warmer", STEP, 0],
    ["right warmer", 0, STEP],
    ["both warmer", STEP, STEP],
    ["left cooler", -STEP, 0],
    ["right cooler", 0, -STEP],
    ["both cooler", -STEP, -STEP],
  ];
  for (const [label, dl, dr] of conditions) {
    const rows: Record<string, number[]> = {};
    for (const seed of seeds) {
      const brain = new FlyBrain(c, { seed });
      for (let t = 0; t < SETTLE_MS; t += 10) brain.tick(10, AT(25, 25));
      brain.sim.setRecording(true);
      const sum = { walk: 0, turn: 0, back: 0 };
      let n = 0;
      for (let t = 0; t < STEP_MS; t += 10) {
        const { command } = brain.tick(10, AT(25 + dl, 25 + dr));
        sum.walk += command.walk;
        sum.turn += command.turn;
        sum.back += command.back;
        n++;
      }
      const spikes = brain.sim.recording!;
      for (const [name, neurons] of Object.entries(READ)) {
        let s = 0;
        for (const i of neurons) s += spikes[i];
        (rows[name] ??= []).push((s / neurons.length / STEP_MS) * 1000);
      }
      for (const [k, v] of Object.entries(sum)) (rows[k] ??= []).push(v / n);
    }
    const cell = (k: string, v: number[]) => `${k} ${v.map((x) => x.toFixed(["walk", "turn", "back"].includes(k) ? 3 : 0)).join("/")}`;
    console.log(`  ${label.padEnd(13)} ${Object.entries(rows).map(([k, v]) => cell(k, v)).join("  ")}`);
  }
}

function rest() {
  const seconds = Number(values.seconds);
  console.log(`At rest standing, ${seconds} s, seeds ${seeds.join(", ")}: walking (the diagnostic observer), turn events left/right, spikes a second`);
  for (const [label, senses] of [
    ["no temperature", RESTING_SENSES],
    ["25 °C", AT(25, 25)],
  ] as const) {
    const out = seeds.map((seed) => {
      const brain = new FlyBrain(c, { seed });
      const observer = new BehaviorObserver();
      let spikes = 0;
      for (let t = 0; t < seconds * 1000; t += 16) {
        const { command, stats } = brain.tick(16, senses);
        observer.observe(command, 0.016);
        spikes += stats.spikes / seconds;
      }
      const { walking, turnsLeft, turnsRight } = observer.tally;
      return `${((100 * walking) / seconds).toFixed(0)}% ${turnsLeft}/${turnsRight} ${(spikes / 1000).toFixed(0)}k`;
    });
    console.log(`  ${label.padEnd(15)} ${out.join("   ")}`);
  }
}

if (values.part === "audit" || values.part === "all") await audit();
if (values.part === "routes" || values.part === "all") routes();
if (values.part === "steps" || values.part === "all") steps();
if (values.part === "rest" || values.part === "all") rest();
