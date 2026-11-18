// The regions (regions.ts): the catalog and the rules without the real data;
// with it (skipped without; `npm run brain:fetch`), the partition and its
// counts, where the senses' and commands' neurons fall, and that the rates
// respond where they should. packages/brain-native/tests/regions.test.ts holds
// the native rules to these.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { loadConnectome } from "./format.ts";
import { decode, READOUTS, SENSES, wire } from "./io.ts";
import { DEFAULT_CONNECTOME_PATH, readConnectomeFile } from "./node.ts";
import { REGIONS, REGION_RATE_NAMES, regionIdOf, regionOf } from "./regions.ts";
import type { Annotations } from "./regions.ts";
import { FlyBrain } from "./runtime.ts";
import { BATTERY, facetAngles, render } from "./stimuli.ts";
import type { Scene } from "./stimuli.ts";
import { bufferOf, syntheticConnectome } from "./test-helpers.ts";
import { RESTING_SENSES } from "./types.ts";
import type { BrainSenses } from "./types.ts";

test("the catalog: unique ids, every field filled in, pairs alike but for their side", () => {
  assert.equal(new Set(REGIONS.map((r) => r.id)).size, REGIONS.length);
  assert.ok(REGIONS.length <= 256, "a region index fits in a byte");
  assert.deepEqual(REGION_RATE_NAMES, REGIONS.map((r) => `region.${r.id}`));
  for (const region of REGIONS) {
    assert.match(region.id, /^[a-z]+(-[a-z]+)*$/, region.id);
    for (const field of ["name", "description", "place"] as const) assert.ok(region[field].length > 0, `${region.id} ${field}`);
    assert.ok(["left", "right", "midline", "both"].includes(region.side), region.id);
    assert.ok(Number.isInteger(region.neurons) && region.neurons > 0, region.id);
    assert.ok(region.fullHz >= 5, `${region.id} fullHz ${region.fullHz}`);
    const paired = /-(left|right)$/.exec(region.id);
    assert.equal(paired?.[1] ?? null, region.side === "left" || region.side === "right" ? region.side : null, region.id);
  }
  REGIONS.forEach((region, k) => {
    if (region.side !== "left") return;
    const right = REGIONS[k + 1];
    assert.equal(right.id, region.id.replace(/-left$/, "-right"), "each left is followed by its right");
    assert.deepEqual([right.name, right.description, right.fullHz], [region.name, region.description, region.fullHz], region.id);
    assert.equal(right.place, region.place.replaceAll("left", "right"), region.id);
  });
});

test("the rules place each kind of neuron, and fall back to each part of the body's catch-all", () => {
  const at = (n: Partial<Annotations>) => regionIdOf({ superClass: "", class: "", subClass: "", type: "", side: "", ...n });
  const cases: [Partial<Annotations>, string][] = [
    [{ superClass: "ol_sensory", type: "R1-R6", side: "left" }, "retina-left"],
    [{ superClass: "ol_sensory", type: "R7y" }, "unplaced"],
    [{ superClass: "ol_intrinsic", type: "L2", side: "right" }, "lamina-right"],
    [{ superClass: "ol_intrinsic", type: "T1", side: "left" }, "lamina-left"],
    [{ superClass: "ol_intrinsic", type: "Lawf2", side: "left" }, "lamina-left"],
    [{ superClass: "ol_intrinsic", type: "Lat3", side: "left" }, "lamina-left"],
    [{ superClass: "ol_intrinsic", type: "Tm1", side: "left" }, "medulla-left"],
    [{ superClass: "ol_intrinsic", type: "TmY5a", side: "left" }, "medulla-left"],
    [{ superClass: "ol_intrinsic", type: "T2a", side: "left" }, "medulla-left"],
    [{ superClass: "ol_intrinsic", type: "Dm-DRA1", side: "left" }, "medulla-left"],
    [{ superClass: "ol_intrinsic", type: "Pm2a", side: "left" }, "medulla-left"],
    [{ superClass: "ol_intrinsic", type: "Pm7_Li28", side: "left" }, "optic-other-left"],
    [{ superClass: "ol_intrinsic", type: "Li14", side: "left" }, "lobula-left"],
    [{ superClass: "ol_intrinsic", class: "ol_bilateral", type: "LC14b", side: "left" }, "lobula-left"],
    [{ superClass: "ol_intrinsic", type: "T4a", side: "left" }, "lobula-plate-left"],
    [{ superClass: "ol_intrinsic", type: "T5d", side: "right" }, "lobula-plate-right"],
    [{ superClass: "ol_intrinsic", type: "Tlp12", side: "left" }, "lobula-plate-left"],
    [{ superClass: "ol_intrinsic", type: "Y3", side: "left" }, "optic-other-left"],
    [{ superClass: "ol_intrinsic", type: "ME_LO_unclear", side: "left" }, "optic-other-left"],
    [{ superClass: "ol_intrinsic", type: "", side: "left" }, "optic-other-left"],
    [{ superClass: "visual_projection", type: "LPLC2", side: "right" }, "visual-projection-right"],
    [{ superClass: "visual_centrifugal", type: "LPT111", side: "left" }, "visual-centrifugal-left"],
    [{ superClass: "cb_sensory", class: "olfactory", type: "ORN_DA1" }, "antenna-smell"],
    [{ superClass: "cb_sensory", class: "mechanosensory", type: "JO-EV1", side: "left" }, "johnston-left"],
    [{ superClass: "cb_sensory", class: "mechanosensory", type: "JO-EV1" }, "head-sensory-other"],
    [{ superClass: "cb_sensory", class: "mechanosensory", type: "BM_InOm", side: "left" }, "head-bristles"],
    [{ superClass: "cb_sensory", class: "gustatory", type: "dorsal_tpGRN", side: "left" }, "mouthparts"],
    [{ superClass: "cb_sensory", class: "mechanosensory", type: "aPhM1" }, "mouthparts"],
    [{ superClass: "cb_sensory", class: "unknown_sensory", type: "ENS1" }, "head-sensory-other"],
    [{ superClass: "cb_intrinsic", class: "Kenyon_Cell", type: "KCg-m", side: "left" }, "mushroom-body-left"],
    [{ superClass: "cb_intrinsic", type: "APL", side: "right" }, "mushroom-body-right"],
    [{ superClass: "cb_intrinsic", class: "ALPN", type: "DA1_lPN", side: "left" }, "antennal-lobe-left"],
    [{ superClass: "cb_intrinsic", class: "CX", type: "EPG", side: "left" }, "central-complex"],
    [{ superClass: "cb_intrinsic", type: "FB1A", side: "right" }, "central-complex"],
    [{ superClass: "cb_intrinsic", type: "SMP001", side: "left" }, "superior-protocerebrum-left"],
    [{ superClass: "cb_intrinsic", type: "LHAV1a1", side: "left" }, "lateral-horn-left"],
    [{ superClass: "cb_intrinsic", type: "PVLP001", side: "left" }, "ventrolateral-protocerebrum-left"],
    [{ superClass: "cb_intrinsic", type: "PS001", side: "left" }, "inferior-ventromedial-left"],
    [{ superClass: "cb_intrinsic", type: "LAL001", side: "left" }, "inferior-ventromedial-left"],
    [{ superClass: "cb_intrinsic", type: "GNG001", side: "right" }, "subesophageal-right"],
    [{ superClass: "cb_intrinsic", type: "GNG001", side: "center" }, "central-brain-other"],
    [{ superClass: "cb_intrinsic", type: "CB0001", side: "left" }, "central-brain-other"],
    [{ superClass: "cb_motor", subClass: "pm", type: "MN9", side: "left" }, "head-motor"],
    [{ superClass: "cb_endocrine", type: "IPC", side: "left" }, "brain-endocrine"],
    [{ superClass: "descending_neuron", type: "DNp01", side: "left" }, "descending-left"],
    [{ superClass: "descending_neuron", type: "DNge138", side: "center" }, "unplaced"],
    [{ superClass: "ascending_neuron", type: "AN00A001", side: "right" }, "ascending-right"],
    [{ superClass: "vnc_motor", subClass: "fl", side: "left" }, "front-leg-motor-left"],
    [{ superClass: "vnc_motor", subClass: "hl", side: "right" }, "hind-leg-motor-right"],
    [{ superClass: "vnc_motor", subClass: "wm", type: "DLM1-4", side: "left" }, "flight-motor"],
    [{ superClass: "vnc_motor", subClass: "nm", side: "left" }, "neck-motor"],
    [{ superClass: "vnc_motor", subClass: "ad", side: "left" }, "abdomen-motor"],
    [{ superClass: "vnc_motor", type: "DLM1-4", side: "left" }, "unplaced"],
    [{ superClass: "vnc_sensory", subClass: "leg_bristle", side: "left" }, "leg-sensory"],
    [{ superClass: "sensory_ascending", subClass: "haltere" }, "thorax-sensory"],
    [{ superClass: "vnc_sensory", subClass: "abdomen" }, "abdomen-sensory"],
    [{ superClass: "vnc_sensory", subClass: "campaniform_sensilla" }, "proprioceptors"],
    [{ superClass: "vnc_sensory", subClass: "mechanosensory_bristle" }, "bristles"],
    [{ superClass: "vnc_sensory" }, "unplaced"],
    [{ superClass: "vnc_intrinsic", side: "left" }, "cord-interneurons-left"],
    [{ superClass: "vnc_intrinsic", side: "center" }, "cord-midline"],
    [{ superClass: "vnc_efferent", side: "center" }, "cord-efferent"],
    [{ superClass: "something new" }, "unplaced"],
  ];
  const ids = new Set(REGIONS.map((r) => r.id));
  for (const [annotations, id] of cases) {
    assert.equal(at(annotations), id, JSON.stringify(annotations));
    assert.ok(ids.has(id), id);
  }
});

test("the brain reports every region after the readouts; an empty one stays at 0, and no command reads them", () => {
  const synthetic = syntheticConnectome();
  const brain = new FlyBrain(loadConnectome(bufferOf(synthetic.bytes)), { seed: 2 });
  assert.deepEqual([...brain.regions], [...regionOf(loadConnectome(bufferOf(synthetic.bytes)))]);
  const sizes = new Uint32Array(REGIONS.length);
  for (const r of brain.regions) sizes[r]++;
  let rates: Record<string, number> = {};
  for (let k = 0; k < 60; k++) rates = brain.tick(16, { ...RESTING_SENSES, sweet: 1, touch: 1 }).stats.rates;
  assert.deepEqual(Object.keys(rates).slice(READOUTS.length), REGION_RATE_NAMES);
  REGIONS.forEach((region, r) => {
    if (sizes[r] === 0) assert.equal(rates[REGION_RATE_NAMES[r]], 0, region.id);
  });
  assert.ok(rates["region.mouthparts"] > 10, `mouthparts ${rates["region.mouthparts"]}`);
  assert.ok(rates["region.head-bristles"] > 10, `head bristles ${rates["region.head-bristles"]}`);
  const without = Object.fromEntries(Object.entries(rates).filter(([name]) => !name.startsWith("region.")));
  const loud = { ...rates, ...Object.fromEntries(REGION_RATE_NAMES.map((name) => [name, 1e6])) };
  assert.deepEqual(decode(loud), decode(without));
});

const skip = existsSync(DEFAULT_CONNECTOME_PATH) ? false : `no ${DEFAULT_CONNECTOME_PATH}; run npm run brain:fetch`;
const connectome = skip ? undefined : readConnectomeFile();
const regions = connectome ? regionOf(connectome) : new Uint8Array(0);
const index = (id: string) => REGIONS.findIndex((r) => r.id === id);

test("on the real connectome every neuron is in one region, as many as the catalog says, none empty", { skip }, () => {
  const sizes = new Array(REGIONS.length).fill(0);
  for (const r of regions) sizes[r]++;
  assert.equal(regions.length, 166_700);
  assert.deepEqual(
    Object.fromEntries(REGIONS.map((region, r) => [region.id, sizes[r]])),
    Object.fromEntries(REGIONS.map((region) => [region.id, region.neurons])),
  );
  assert.ok(sizes.every((n) => n > 0));
});

test("on the real connectome the senses' and the commands' neurons are where the catalog says", { skip }, () => {
  const c = connectome!;
  const within = (neurons: ArrayLike<number>, ...ids: string[]) => {
    assert.ok(neurons.length > 0);
    for (let k = 0; k < neurons.length; k++) assert.ok(ids.includes(REGIONS[regions[neurons[k]]].id), `${c.columns.type.value(neurons[k])} in ${REGIONS[regions[neurons[k]]].id}, not ${ids}`);
  };
  const sense = (name: string) => c.find(SENSES.find((s) => s.name === name)!.select);
  const read = (name: string) => c.find(READOUTS.find((s) => s.name === name)!.select);
  within(sense("loomLeft"), "visual-projection-left");
  within(sense("loomRight"), "visual-projection-right");
  within(sense("bumpLeft"), "johnston-left");
  within(sense("bumpRight"), "johnston-right");
  within(sense("wind"), "johnston-left", "johnston-right");
  // Touch's regions: the head's bristles; the body's are the cord's bristles, the notum's, the legs' and the abdomen's.
  const touch = (name: string) => wire(c).senses.find((g) => g.spec.name === name)!.neurons;
  within(touch("touch head"), "head-bristles");
  within(touch("touch body"), "bristles", "thorax-sensory", "leg-sensory", "abdomen-sensory");
  within(sense("sweet"), "mouthparts");
  within(sense("grounded"), "proprioceptors");
  within(sense("wingbeat"), "proprioceptors");
  for (const side of ["left", "right"]) within(c.find({ type: ["L1", "L2", "L3"], side }), `lamina-${side}`);
  for (const name of ["DNg100", "DNa02 left", "DNa02 right", "MDN", "DNp01", "DNg12"]) within(read(name), "descending-left", "descending-right");
  within(read("flight"), "flight-motor");
  within(read("MN9"), "head-motor");
});

const TICK = 10;
/** Each region's mean rate over ms of ticks, each tick's senses from its time. */
function measure(b: FlyBrain, ms: number, senses: (t: number) => BrainSenses) {
  const sum = new Float64Array(REGIONS.length);
  let n = 0;
  for (let t = 0; t < ms; t += TICK) {
    const { rates } = b.tick(TICK, senses(t)).stats;
    REGION_RATE_NAMES.forEach((name, r) => (sum[r] += rates[name]));
    n++;
  }
  return (id: string) => sum[index(id)] / n;
}
/** A brain after 2 s of rest. */
function rested() {
  const b = new FlyBrain(connectome!, { seed: 1 });
  measure(b, 2000, () => RESTING_SENSES);
  return b;
}

test("on the real connectome the rates respond where they should, and rest leaves the giant fibre's neighbours quiet", { skip }, () => {
  const rest = measure(rested(), 2000, () => RESTING_SENSES);
  for (const side of ["left", "right"]) assert.ok(rest(`descending-${side}`) < 1.5, `descending ${side} at rest ${rest(`descending-${side}`)}`);
  assert.equal(rest("mouthparts"), 0);
  assert.ok(rest("visual-projection-left") > 0.5, "the visual background");

  // The game's fallback looming pulse, straight into the left eye's looming detectors.
  const pulse = measure(rested(), 300, (t) => ({ ...RESTING_SENSES, loomLeft: t < 80 ? 1 : Math.max(0, 1 - (t - 80) / 200) }));
  for (const side of ["left", "right"]) {
    assert.ok(pulse(`descending-${side}`) > 3 * rest(`descending-${side}`) && pulse(`descending-${side}`) > 2, `descending ${side} under the pulse ${pulse(`descending-${side}`)}`);
  }
  assert.ok(pulse("flight-motor") > 3 * rest("flight-motor"), `flight motor ${pulse("flight-motor")} against ${rest("flight-motor")}`);

  // A disc looming at the left eye, seen: through the left optic lobe from the lamina on.
  const loom = BATTERY.find((s) => s.name === "loom left")!;
  const b = new FlyBrain(connectome!, { seed: 1 });
  const angles = facetAngles(b.eyes!);
  const light = { left: new Float32Array(angles.left.az.length), right: new Float32Array(angles.right.az.length) };
  const show = (scene: Scene, t: number): BrainSenses => {
    render(scene, t, angles, light);
    return { ...RESTING_SENSES, light };
  };
  measure(b, 2000, () => show(() => loom.ground, 0));
  const seen = measure(b, loom.seconds * 1000, (t) => show(loom.scene, t / 1000));
  for (const stage of ["lamina", "medulla", "lobula"]) {
    assert.ok(seen(`${stage}-left`) > 2 * seen(`${stage}-right`) && seen(`${stage}-left`) > 0.5, `${stage}: left ${seen(`${stage}-left`)}, right ${seen(`${stage}-right`)}`);
  }

  const sweet = measure(rested(), 1000, () => ({ ...RESTING_SENSES, sweet: 1 }));
  assert.ok(sweet("mouthparts") > 10, `mouthparts ${sweet("mouthparts")}`);
  assert.ok(sweet("head-motor") > 2 * rest("head-motor"), `head motor ${sweet("head-motor")} against ${rest("head-motor")}`);
  for (const side of ["left", "right"]) assert.ok(sweet(`subesophageal-${side}`) > 5 * rest(`subesophageal-${side}`), `subesophageal ${side} ${sweet(`subesophageal-${side}`)}`);
});
