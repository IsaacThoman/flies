// A small made-up connectome with one group of neurons for every sense,
// background input and readout the brain wires to, so the runtime can be
// tested without the real data. Each input group drives its own readout
// directly; that is fine for a fixture (the real wiring is what the
// real-data tests are about).

import type { EyeColumn } from "./eye-columns.ts";
import { CATEGORY_NAMES, writeConnectome } from "./format.ts";
import type { CategoryName, ConnectomeData } from "./format.ts";
import { FORELEG_MALE_TASTE } from "./io.ts";

export type SyntheticNeuron = { type: string; superClass: string; class?: string; subClass?: string; side?: string; nt?: string; nerve?: string; rootId?: number };

/** Packs neurons and [pre, post, synapses] edges into connectome bytes. */
export function packSynthetic(neurons: readonly SyntheticNeuron[], edges: readonly [number, number, number][]): Uint8Array {
  const n = neurons.length;
  const value = (i: number, name: CategoryName) => (neurons[i] as unknown as Record<string, string | undefined>)[name] ?? "";
  const columns = {} as ConnectomeData["columns"];
  for (const name of CATEGORY_NAMES) {
    const table = [...new Set(["", ...neurons.map((_, i) => value(i, name))])].sort();
    const code = new Map(table.map((s, k) => [s, k]));
    const codes = Array.from({ length: n }, (_, i) => code.get(value(i, name))!);
    columns[name] = { codes: name === "type" ? Uint16Array.from(codes) : Uint8Array.from(codes), table };
  }
  const sorted = [...edges].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const ptr = new Uint32Array(n + 1);
  for (const [pre] of sorted) ptr[pre + 1]++;
  for (let i = 0; i < n; i++) ptr[i + 1] += ptr[i];
  return writeConnectome({
    synapses: sorted.reduce((sum, [, , count]) => sum + count, 0),
    rootId: Uint32Array.from(neurons, (each, i) => each.rootId ?? 1000 + i),
    ptr,
    post: Uint32Array.from(sorted, ([, post]) => post),
    count: Uint16Array.from(sorted, ([, , count]) => count),
    ntConfidence: Uint8Array.from(neurons, (each) => (each.nt ? 80 : 0)),
    columns,
  });
}

/** Neuron indices by label, and the packed bytes. */
export type Synthetic = { bytes: Uint8Array; index: Record<string, number[]>; neurons: SyntheticNeuron[] };

/**
 * Every group the brain needs, a few neurons each, with:
 * looming detectors -> giant fiber -> flight motor neurons; head bristles ->
 * MDN; wind JO -> DNg12; sweet taste -> MN9; bitter taste -> an inhibitory
 * interneuron -> MN9; water taste -> nothing; a male's taste on the front
 * legs -> pIP10; the wings' campaniform sensilla -> the flight motor neurons;
 * each eye's LC10a -> that side's
 * DNa02 and DNg100. Each eye also has four columns of L1, L2 and L3 (see
 * syntheticEyeColumns), whose L2s drive that eye's LPLC2. Leave groups out
 * with `without`, or change their annotations with `change`, to get broken
 * ones.
 */
export function syntheticConnectome({ without = [], change = {} }: { without?: readonly string[]; change?: Record<string, Partial<SyntheticNeuron>> } = {}): Synthetic {
  const neurons: SyntheticNeuron[] = [];
  const index: Record<string, number[]> = {};
  const add = (label: string, count: number, neuron: SyntheticNeuron, rootIds?: readonly number[]) => {
    if (without.includes(label)) return;
    index[label] = [];
    for (let k = 0; k < count; k++) {
      index[label].push(neurons.length);
      neurons.push({ ...neuron, ...change[label], ...(rootIds ? { rootId: rootIds[k] } : {}) });
    }
  };
  for (const side of ["left", "right"]) {
    add(`LPLC2 ${side}`, 10, { type: "LPLC2", superClass: "visual_projection", side, nt: "ACH" });
    add(`LC4 ${side}`, 10, { type: "LC4", superClass: "visual_projection", side, nt: "ACH" });
    add(`JO ${side}`, 4, { type: "JO-EV1", superClass: "cb_sensory", class: "mechanosensory", subClass: "wind_gravity", side, nt: "ACH" });
    add(`BM ${side}`, 4, { type: "BM_InOm", superClass: "cb_sensory", class: "mechanosensory", side });
    add(`LC10a ${side}`, 6, { type: "LC10a", superClass: "visual_projection", side, nt: "ACH" });
    add(`DNa02 ${side}`, 1, { type: "DNa02", superClass: "descending_neuron", side, nt: "ACH" });
    add(`DNp01 ${side}`, 1, { type: "DNp01", superClass: "descending_neuron", side, nt: "ACH" });
    add(`L1 ${side}`, 4, { type: "L1", superClass: "ol_intrinsic", side, nt: "GLUT" });
    add(`L2 ${side}`, 4, { type: "L2", superClass: "ol_intrinsic", side, nt: "ACH" });
    add(`L3 ${side}`, 4, { type: "L3", superClass: "ol_intrinsic", side, nt: "ACH" });
  }
  add("bristle", 6, { type: "SNta02", superClass: "vnc_sensory", class: "mechanosensory_tactile", subClass: "mechanosensory_bristle", nt: "ACH" });
  add("sweet", 4, { type: "dorsal_tpGRN", superClass: "cb_sensory", class: "gustatory", side: "left", nt: "ACH" });
  add("bitter", 4, { type: "LB1a", superClass: "cb_sensory", class: "gustatory", side: "left", nt: "ACH" });
  add("water", 2, { type: "LB3a", superClass: "cb_sensory", class: "gustatory", side: "left", nt: "ACH" });
  add("campaniform", 4, { type: "SNpp53", superClass: "vnc_sensory", class: "mechanosensory_proprioceptive", subClass: "campaniform_sensilla", nt: "ACH" });
  add("wing campaniform", 3, { type: "SApp10", superClass: "sensory_ascending", class: "mechanosensory_proprioceptive", subClass: "campaniform_sensilla", nt: "ACH" });
  add("DNg100", 2, { type: "DNg100", superClass: "descending_neuron", side: "left", nt: "ACH" });
  add("MDN", 2, { type: "MDN", superClass: "descending_neuron", side: "left", nt: "ACH" });
  add("DLM", 2, { type: "DLM1-4", superClass: "vnc_motor", side: "left" });
  add("DNg12", 2, { type: "DNg12_a", superClass: "descending_neuron", side: "left", nt: "ACH" });
  add("MN9", 2, { type: "MN9", superClass: "cb_motor", side: "left" });
  add("interneuron", 2, { type: "GNG001", superClass: "cb_intrinsic", side: "center", nt: "GABA" });
  add("pIP10", 2, { type: "pIP10", superClass: "descending_neuron", side: "left", nt: "ACH" });
  // The front legs' male-taste neurons are picked by root ID (io.ts), so these
  // carry real ones, last because root IDs ascend; a mid leg's LgLG1a, by an ID
  // that isn't the front legs', must be left out.
  add("LgLG1a mid leg", 1, { type: "LgLG1a", superClass: "vnc_sensory", class: "gustatory", side: "left", nt: "ACH" }, [90000]);
  add("LgAG1", 1, { type: "LgAG1", superClass: "sensory_ascending", class: "gustatory", side: "left", nt: "ACH" }, FORELEG_MALE_TASTE.LgAG1);
  add("LgLG1a", 2, { type: "LgLG1a", superClass: "vnc_sensory", class: "gustatory", side: "left", nt: "ACH" }, FORELEG_MALE_TASTE.LgLG1a);

  const edges: [number, number, number][] = [];
  const wire = (from: string, to: string, count: number) => {
    for (const pre of index[from] ?? []) for (const post of index[to] ?? []) edges.push([pre, post, count]);
  };
  for (const side of ["left", "right"]) {
    wire(`LPLC2 ${side}`, `DNp01 ${side}`, 120);
    wire(`LC4 ${side}`, `DNp01 ${side}`, 120);
    wire(`DNp01 ${side}`, "DLM", 80);
    wire(`BM ${side}`, "MDN", 40);
    wire(`JO ${side}`, "DNg12", 40);
    wire(`LC10a ${side}`, `DNa02 ${side}`, 40);
    wire(`LC10a ${side}`, "DNg100", 15);
    wire(`L2 ${side}`, `LPLC2 ${side}`, 40);
  }
  wire("sweet", "MN9", 60);
  wire("bitter", "interneuron", 60);
  wire("interneuron", "MN9", 60);
  wire("campaniform", "interneuron", 5);
  wire("wing campaniform", "DLM", 40);
  wire("bristle", "MDN", 20);
  wire("LgLG1a", "pIP10", 120);
  wire("LgAG1", "pIP10", 120);
  return { bytes: packSynthetic(neurons, edges), index, neurons };
}

/**
 * Eye columns for the synthetic connectome: four a side, at [18, 19] and
 * around it, each with its own L1, L2 and L3 by body ID; the last column of
 * the left eye has no L3.
 */
export function syntheticEyeColumns(synthetic: Synthetic): { right: EyeColumn[]; left: EyeColumn[] } {
  const id = (label: string, k: number) => (synthetic.index[label] ? 1000 + synthetic.index[label][k] : 0);
  const eye = (side: string): EyeColumn[] =>
    [
      [18, 19],
      [19, 19],
      [18, 20],
      [19, 20],
    ].map(([hex1, hex2], k) => [hex1, hex2, 0, id(`L1 ${side}`, k), id(`L2 ${side}`, k), side === "left" && k === 3 ? 0 : id(`L3 ${side}`, k)] as const);
  return { right: eye("right"), left: eye("left") };
}

/** A fresh ArrayBuffer holding the bytes (createBrain takes one). */
export const bufferOf = (bytes: Uint8Array) => bytes.slice().buffer;
