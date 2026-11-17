// Where each of the brain's regions is drawn on the fly's nervous system
// (packages/fly/src/nerves): the parts its firing rate lights. A part belongs
// to at most one region. Groups whose location or organ is unknown light
// nothing; the corresponding strands remain unlit anatomical context.
//
// The drawing has its own parts for things the regions don't yet tell apart:
// the cord is drawn segment by segment (T1, T2, T3, the abdominal neuromeres
// and the tectulum over them), and its interneurons light all of their side's
// for now. When the brain reports them by segment, only this table changes.
//
// Where several regions share a place in the fly, each is drawn as what is its
// own there: motor neurons as their cell bodies at the cord's edge and the
// nerves their axons leave by, sensory neurons as the organs and nerves they
// come in from, descending and ascending neurons as the tracts they run in;
// the neuropils go to the neurons that fill them.

import { REGIONS } from "@fly/brain";
import { LEG_NAMES, NERVE_PARTS, SIDES } from "@fly/fly";

const each = <T>(f: (side: (typeof SIDES)[number]) => [string, T][]): [string, T][] => SIDES.flatMap(f);
const same = (...ids: string[]) => each((side) => ids.map((id) => [`${id}-${side}`, [`${id}-${side}`]]));
const legs = (part: string, side: string) => LEG_NAMES.map((leg) => `${part}-${leg}-${side}`);

/** Anatomy retained for context, with no measured rate assignable to it. */
export const UNLIT_PARTS = ["connective-midline", "pharyngeal-nerves"] as const;

export const REGION_PARTS: Readonly<Record<string, readonly string[]>> = Object.fromEntries([
  ...same("retina", "lamina", "medulla", "lobula", "lobula-plate"),
  ...each((side) => [
    [`optic-other-${side}`, [`optic-chiasm-${side}`]],
    [`visual-projection-${side}`, [`optic-tract-${side}`]],
    [`visual-centrifugal-${side}`, [`optic-centrifugal-${side}`]],
    [`johnston-${side}`, [`antenna-mechanosensory-${side}`]],
  ]),
  ["antenna-smell", ["antenna-olfactory-left", "antenna-olfactory-right"]],
  ["head-bristles", ["head-bristle-sockets"]],
  ["mouthparts", ["labellum-taste"]],
  ["head-sensory-other", []],
  ...same("antennal-lobe", "mushroom-body", "superior-protocerebrum", "lateral-horn", "ventrolateral-protocerebrum", "inferior-ventromedial", "subesophageal"),
  ["central-complex", ["central-complex"]],
  ["central-brain-other", ["brain-rind"]],
  ["head-motor", ["labial-motor-nerve"]],
  ["brain-endocrine", ["pars-intercerebralis"]],
  ...each((side) => [
    [`descending-${side}`, [`descending-tract-${side}`]],
    [`ascending-${side}`, [`ascending-tract-${side}`]],
    [`front-leg-motor-${side}`, [`leg-motor-front-${side}`]],
    [`middle-leg-motor-${side}`, [`leg-motor-middle-${side}`]],
    [`hind-leg-motor-${side}`, [`leg-motor-hind-${side}`]],
    [`cord-interneurons-${side}`, ["t1", "t2", "t3", "abdominal", "neck-tectulum", "wing-tectulum", "haltere-tectulum"].map((s) => `cord-${s}-${side}`)],
  ]),
  ["flight-motor", ["flight-motor-left", "flight-motor-right"]],
  ["neck-motor", ["neck-motor-left", "neck-motor-right"]],
  ["abdomen-motor", ["abdominal-motor"]],
  ["leg-sensory", SIDES.flatMap((side) => legs("leg-sensory", side))],
  ["thorax-sensory", SIDES.flatMap((side) => [`wing-nerve-${side}`, `haltere-nerve-${side}`])],
  ["abdomen-sensory", ["abdominal-sensory"]],
  ["proprioceptors", SIDES.flatMap((side) => [...legs("proprioceptors", side), `flight-proprioceptors-${side}`])],
  ["bristles", ["body-bristle-sockets"]],
  ["cord-midline", ["cord-midline"]],
  ["cord-efferent", ["cord-efferent"]],
  ["unplaced", []],
]);

/** For each part, in NERVE_PARTS order, the index in REGIONS of the region that lights it (-1 if none). */
export function partRegions(): Int16Array {
  const out = new Int16Array(NERVE_PARTS.length).fill(-1);
  const partIndex = new Map(NERVE_PARTS.map((p, i) => [p.id, i]));
  REGIONS.forEach((region, r) => {
    for (const id of REGION_PARTS[region.id] ?? []) {
      const p = partIndex.get(id);
      if (p !== undefined) out[p] = r;
    }
  });
  return out;
}
