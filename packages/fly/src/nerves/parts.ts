// The parts of the nervous system the model draws: the neuropils of the brain
// and the cord, the tracts between them, the nerves out to the body and the
// sense organs at their ends. Each part is one piece of the drawing that one
// thing lights (the game decides what: a region of the brain model); a part
// is never lit by two things, so where several kinds of neuron share a place
// in the fly they are drawn as separate parts there (a leg nerve's motor and
// sensory strands, a leg neuromere and the motor neurons' cell bodies on its
// edge).
//
// The cord is drawn segment by segment and side by side, its leg neuropils
// and the tectulum over them, so that whatever lights it can be as fine as
// that.

/** Sensory neurons bring news in, motor (and neurosecretory) neurons send commands out, central ones are everything between. */
export type NerveRole = "sensory" | "central" | "motor";

/**
 * How a part is drawn. A neuropil is a solid volume of synapses; the rind is
 * the brain's layer of cell bodies, drawn as a shell that glows at its edge so
 * it never hides what is inside; a tract is a bundle of axons inside the
 * nervous system, a nerve one out in the body; an organ is a cluster of cell
 * bodies: sense cells in a sense organ, or motor neurons at the edge of the
 * cord.
 */
export type NerveKind = "neuropil" | "rind" | "tract" | "nerve" | "organ";

export type NerveSide = "left" | "right" | "midline" | "both";

export type NervePart = {
  readonly id: string;
  readonly role: NerveRole;
  readonly kind: NerveKind;
  readonly side: NerveSide;
  /** What it is, in a few words. */
  readonly name: string;
};

export const SIDES = ["left", "right"] as const;
export type Side = (typeof SIDES)[number];
/** The leg pairs, front to back, as they are named in the parts' ids. */
export const LEG_NAMES = ["front", "middle", "hind"] as const;

const part = (id: string, role: NerveRole, kind: NerveKind, side: NerveSide, name: string): NervePart => ({ id, role, kind, side, name });
const paired = (id: string, role: NerveRole, kind: NerveKind, name: string) => SIDES.map((side) => part(`${id}-${side}`, role, kind, side, name));
const perLeg = (id: string, role: NerveRole, kind: NerveKind, name: string) =>
  LEG_NAMES.flatMap((leg) => SIDES.map((side) => part(`${id}-${leg}-${side}`, role, kind, side, `${name}, ${leg} leg`)));

export const NERVE_PARTS: readonly NervePart[] = [
  // The eyes and optic lobes, from the outside in.
  ...paired("retina", "sensory", "organ", "Retina: the photoreceptors under the facets"),
  ...paired("lamina", "central", "neuropil", "Lamina"),
  ...paired("medulla", "central", "neuropil", "Medulla"),
  ...paired("lobula", "central", "neuropil", "Lobula"),
  ...paired("lobula-plate", "central", "neuropil", "Lobula plate"),
  ...paired("optic-chiasm", "central", "tract", "Inner optic chiasm: fibres between the medulla and the lobula complex"),
  ...paired("optic-tract", "central", "tract", "Optic tracts: from the lobula, lobula plate and medulla into the central brain"),
  ...paired("optic-centrifugal", "central", "tract", "Centrifugal fibres: from the central brain back out into the optic lobe"),
  // The antennae.
  ...paired("antenna-olfactory", "sensory", "organ", "Smell sensilla of the antenna's third segment, and their axons to the antennal lobe"),
  ...paired("antenna-mechanosensory", "sensory", "organ", "Johnston's organ in the second segment, and its axons to the AMMC"),
  // The head's other senses and its motor nerves.
  part("head-bristle-sockets", "sensory", "organ", "both", "Sense cells at the sockets of the head's bristles"),
  part("labellum-taste", "sensory", "organ", "midline", "Taste and touch of the labellum and pharynx, and the labial nerve's sensory axons"),
  part("pharyngeal-nerves", "sensory", "nerve", "both", "The pharyngeal nerves' sensory axons into the subesophageal zone"),
  part("labial-motor-nerve", "motor", "nerve", "midline", "Motor axons down the proboscis to its muscles"),
  // The central brain.
  ...paired("antennal-lobe", "central", "neuropil", "Antennal lobe"),
  ...paired("mushroom-body", "central", "neuropil", "Mushroom body: calyx, peduncle and lobes"),
  ...paired("superior-protocerebrum", "central", "neuropil", "Superior protocerebrum"),
  ...paired("lateral-horn", "central", "neuropil", "Lateral horn"),
  ...paired("ventrolateral-protocerebrum", "central", "neuropil", "Ventrolateral neuropils and the anterior optic tubercle"),
  ...paired("inferior-ventromedial", "central", "neuropil", "Inferior and ventromedial neuropils, around the oesophagus"),
  ...paired("subesophageal", "central", "neuropil", "Subesophageal zone"),
  part("central-complex", "central", "neuropil", "midline", "Central complex: protocerebral bridge, fan-shaped body, ellipsoid body, noduli"),
  part("pars-intercerebralis", "motor", "organ", "midline", "Neurosecretory cells of the pars intercerebralis, and the frontal ganglion"),
  part("brain-rind", "central", "rind", "both", "The central brain's rind of cell bodies"),
  // The neck connective.
  ...paired("descending-tract", "central", "tract", "Descending axons: from the brain down the neck and along the cord"),
  ...paired("ascending-tract", "central", "tract", "Ascending axons: from the cord up the neck into the brain"),
  part("connective-midline", "central", "tract", "midline", "The neck connective's midline"),
  // The ventral nerve cord, segment by segment, and the tectulum over it.
  ...paired("cord-t1", "central", "neuropil", "Prothoracic leg neuropil (T1)"),
  ...paired("cord-t2", "central", "neuropil", "Mesothoracic leg neuropil (T2)"),
  ...paired("cord-t3", "central", "neuropil", "Metathoracic leg neuropil (T3)"),
  ...paired("cord-abdominal", "central", "neuropil", "Abdominal neuromeres"),
  ...paired("cord-neck-tectulum", "central", "neuropil", "Neck tectulum, over T1"),
  ...paired("cord-wing-tectulum", "central", "neuropil", "Wing tectulum, over T2"),
  ...paired("cord-haltere-tectulum", "central", "neuropil", "Haltere tectulum, over T3"),
  part("cord-midline", "central", "tract", "midline", "The cord's midline"),
  part("cord-efferent", "motor", "nerve", "midline", "The cord's median efferent fibres and median nerves"),
  // Out to the muscles.
  ...perLeg("leg-motor", "motor", "nerve", "Leg motor neurons: cell bodies at the neuromere's edge and axons down the leg nerve"),
  ...paired("flight-motor", "motor", "nerve", "Flight motor neurons: cell bodies in the tectulum, axons out the dorsal nerves to the wing and haltere muscles"),
  ...paired("neck-motor", "motor", "nerve", "Neck motor neurons and their nerve"),
  part("abdominal-motor", "motor", "nerve", "midline", "Abdominal motor axons down the abdominal nerve trunk"),
  // In from the body's senses.
  ...perLeg("leg-sensory", "sensory", "nerve", "Leg sensory axons, from the tarsus up the leg nerve"),
  ...perLeg("proprioceptors", "sensory", "organ", "Proprioceptors of the leg: the femoral chordotonal organ and the campaniform sensilla"),
  ...paired("flight-proprioceptors", "sensory", "organ", "Campaniform sensilla at the bases of the wing and haltere"),
  part("body-bristle-sockets", "sensory", "organ", "both", "Sense cells at the sockets of the body's bristles"),
  ...paired("wing-nerve", "sensory", "nerve", "Wing nerve, from the wing's base"),
  ...paired("haltere-nerve", "sensory", "nerve", "Haltere nerve, from the haltere"),
  part("abdominal-sensory", "sensory", "nerve", "midline", "Abdominal sensory axons up the abdominal nerve trunk"),
];

export const PART_INDEX: ReadonlyMap<string, number> = new Map(NERVE_PARTS.map((p, i) => [p.id, i]));

/** A part's index, for the builder: throws on a part that isn't in the list, so a typo can't draw into the wrong one. */
export function partIndex(id: string): number {
  const i = PART_INDEX.get(id);
  if (i === undefined) throw new Error(`No nerve part ${id}`);
  return i;
}

/** The glow array's length: one float a part, in whole vec4s (the shaders read it as vec4s). */
export const GLOW_SLOTS = Math.ceil(NERVE_PARTS.length / 4) * 4;
