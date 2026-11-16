// The nervous system by region, for showing it at work: every neuron in
// exactly one anatomical region that a drawing of the fly can place in its
// body, and each region's mean firing rate, reported for display as
// `region.<id>` in stats.rates. No command reads them.
//
// The packed connectome has no positions and no neuropil per neuron, so the
// regions are placed by what its annotations say: super class, class, sub
// class, soma side and cell type. Where a type's name says which neuropil it
// belongs to, that decides; where nothing does, the neuron goes to an honest
// catch-all of its part of the body (README, Regions, has the rules and what
// each catches). Left and right are the fly's own, by soma side.
//
// No Node APIs. packages/brain-native/src/regions.cpp is the same, rule for
// rule, and tests hold the two to the same region for every neuron.

import type { Connectome } from "./format.ts";

export type RegionSide = "left" | "right" | "midline" | "both";

export type Region = {
  /** Stable; its rate is `region.<id>` in stats.rates. */
  readonly id: string;
  /** Short display name, without the side (see `side`). */
  readonly name: string;
  /** What it is and which neurons are in it. */
  readonly description: string;
  /** Where it is in the body, for whoever draws it. */
  readonly place: string;
  /** Left or right (by soma side), on the midline, or both sides together. */
  readonly side: RegionSide;
  /** Neurons in it in the FlyEM male CNS connectome (the packed file). */
  readonly neurons: number;
  /**
   * The rate, Hz, at which a display shows it at full strength (rate / fullHz,
   * clamped to 1): measured, so that strong stimulation comes near it and
   * rest shows faintly where the region is active at rest (README, Regions).
   */
  readonly fullHz: number;
};

/** Smoothing time constant, ms, of the region rates (as of the vision stages: VISION_TAU). */
export const REGION_TAU = 100;

/** A region's name in stats.rates. */
export const regionName = (id: string) => `region.${id}`;

type Shared = { name: string; description: string; place: (side: "left" | "right") => string };
type Own = { neurons: number; fullHz: number };

/** A left/right pair, alike but for the side in their ids and places. */
function pair(id: string, shared: Shared, left: Own, right: Own): Region[] {
  return (["left", "right"] as const).map((side) => ({
    id: `${id}-${side}`,
    name: shared.name,
    description: shared.description,
    place: shared.place(side),
    side,
    ...(side === "left" ? left : right),
  }));
}

/** Every region, in the order of stats.rates: from the eyes inward, then the head, the neck and the cord. */
export const REGIONS: readonly Region[] = [
  ...pair(
    "retina",
    {
      name: "Retina",
      description: "Photoreceptors R1-R8 of the compound eye, and of the eyelet under it (the optic lobe's sensory neurons). The model's light enters one synapse in, at the lamina, so they are not driven.",
      place: (side) => `${side} compound eye: the retina, the layer of photoreceptors under the facets`,
    },
    { neurons: 2349, fullHz: 5 },
    { neurons: 3749, fullHz: 5 },
  ),
  ...pair(
    "lamina",
    {
      name: "Lamina",
      description: "The lamina's own cell types: monopolar cells L1-L5 (L1-L3 are where the model's light enters), the amacrine Lai, T1, the centrifugal C2 and C3, the wide-field Lawf1 and Lawf2, and the lamina tangential Lat cells.",
      place: (side) => `${side} optic lobe, the lamina: the outermost neuropil, a thin curved shell directly under the retina`,
    },
    { neurons: 7474, fullHz: 41 },
    { neurons: 7551, fullHz: 41 },
  ),
  ...pair(
    "medulla",
    {
      name: "Medulla",
      description: "The medulla's own cells (Mi, Dm, Pm, Cm, the accessory medulla's aMe, l-LNv, MeVPMe) and the columnar cells whose dendrites are there and whose axons end in the lobula or lobula plate: Tm, TmY, T2, T3 and MeLo.",
      place: (side) => `${side} optic lobe, the medulla: the largest neuropil, inside the lamina across the first optic chiasm`,
    },
    { neurons: 28185, fullHz: 15 },
    { neurons: 28284, fullHz: 15 },
  ),
  ...pair(
    "lobula",
    {
      name: "Lobula",
      description: "The lobula's intrinsic (Li) and tangential (LT) cells and the LC14 cells joining the two lobulas.",
      place: (side) => `${side} optic lobe, the lobula: the inner neuropil in front of the lobula plate, across the second optic chiasm from the medulla`,
    },
    { neurons: 827, fullHz: 16 },
    { neurons: 842, fullHz: 16 },
  ),
  ...pair(
    "lobula-plate",
    {
      name: "Lobula plate",
      description: "The direction-selective T4 and T5 cells, whose axons make its four layers (T4's dendrites are in the medulla, T5's in the lobula), its intrinsic LPi cells, the Tlp cells and H1.",
      place: (side) => `${side} optic lobe, the lobula plate: a flat neuropil behind the lobula, at the back of the optic lobe`,
    },
    { neurons: 7365, fullHz: 5 },
    { neurons: 7361, fullHz: 5 },
  ),
  ...pair(
    "optic-other",
    {
      name: "Optic lobe, other",
      description: "Optic lobe cells that span several of its neuropils with no single home (the Y cells, LOLP1, CT1, Am1 and others), whose type is unclear across neuropils, or untyped.",
      place: (side) => `${side} optic lobe, across its neuropils`,
    },
    { neurons: 758, fullHz: 5 },
    { neurons: 758, fullHz: 5 },
  ),
  ...pair(
    "visual-projection",
    {
      name: "Visual projection neurons",
      description: "Visual projection neurons: from the optic lobe into the central brain (the LC, LPLC, LLPC and LPC types, the looming detectors, the tangential cells HS and VS, MeTu and others). All but the looming detectors carry the model's made-up visual background at rest.",
      place: (side) => `from the ${side} optic lobe (lobula, lobula plate and medulla) through the optic stalk into the ${side} side of the central brain`,
    },
    { neurons: 4589, fullHz: 12 },
    { neurons: 4612, fullHz: 12 },
  ),
  ...pair(
    "visual-centrifugal",
    {
      name: "Visual centrifugal neurons",
      description: "Visual centrifugal neurons: from the central brain out into the optic lobe.",
      place: (side) => `from the ${side} side of the central brain out through the optic stalk into the ${side} optic lobe`,
    },
    { neurons: 283, fullHz: 9.3 },
    { neurons: 280, fullHz: 9.3 },
  ),
  {
    id: "antenna-smell",
    name: "Smell, humidity and temperature",
    description: "Olfactory, hygrosensory and thermosensory receptor neurons of the antennae and maxillary palps. The model has no sense of smell, so they are not driven.",
    place: "the antennae's third segments (with the sacculus and arista) and the maxillary palps, both sides; their axons go to the antennal lobes",
    side: "both",
    neurons: 2730,
    fullHz: 5,
  },
  ...pair(
    "johnston",
    {
      name: "Johnston's organ",
      description: "Johnston's organ neurons (JO-*), which sense the antenna's third segment moving: touch on the antenna (bump), wind and gravity, sound. `bump` drives all of a side's, `wind` the wind- and gravity-sensitive ones.",
      place: (side) => `the ${side} antenna's second segment (the pedicel); their axons go to the ${side} antennal mechanosensory and motor centre at the bottom of the brain`,
    },
    { neurons: 348, fullHz: 150 },
    { neurons: 324, fullHz: 150 },
  ),
  {
    id: "head-bristles",
    name: "Head bristles",
    description: "Mechanosensory bristle neurons of the head (BM types): between the eye facets, on the vertex, occiput, face and palps. `touch` drives them.",
    place: "the bristles all over the head capsule, both sides; their axons go to the bottom of the brain (the subesophageal zone)",
    side: "both",
    neurons: 932,
    fullHz: 48,
  },
  {
    id: "mouthparts",
    name: "Taste and touch of the mouthparts",
    description: "Taste neurons of the labellum's bristles and taste pegs and of the pharynx, and the mouthparts' touch neurons (TPMN, aPhM). `sweet` drives nine of the taste types.",
    place: "the proboscis on the underside of the head, on the midline: the labellum at its tip and the pharynx inside; their axons go to the subesophageal zone",
    side: "midline",
    neurons: 374,
    fullHz: 22,
  },
  {
    id: "head-sensory-other",
    name: "Head sensory, other",
    description: "The head's other sensory neurons: of unknown modality, without a type, or to be confirmed.",
    place: "the head, organ not recorded",
    side: "both",
    neurons: 174,
    fullHz: 5,
  },
  ...pair(
    "antennal-lobe",
    {
      name: "Antennal lobe",
      description: "The antennal lobe's projection neurons (ALPN) and local neurons (ALLN), and its input (ALIN) and output (ALON) neurons: the first olfactory centre.",
      place: (side) => `${side} antennal lobe: the round neuropil at the front and bottom of the ${side} brain hemisphere, where the antennal nerve enters`,
    },
    { neurons: 572, fullHz: 5 },
    { neurons: 570, fullHz: 5 },
  ),
  ...pair(
    "mushroom-body",
    {
      name: "Mushroom body",
      description: "Kenyon cells, the mushroom body output neurons (MBON), the dopaminergic neurons that innervate it (DAN: PAM, PPL1; their output is muted in the model) and its intrinsic APL and DPM: learning and memory.",
      place: (side) => `${side} mushroom body: the calyx at the top back of the hemisphere, the peduncle running forward from it and the lobes at the front, one rising and one pointing to the midline`,
    },
    { neurons: 2241, fullHz: 5 },
    { neurons: 2269, fullHz: 5 },
  ),
  {
    id: "central-complex",
    name: "Central complex",
    description: "The central complex's neurons (protocerebral bridge, fan-shaped body, ellipsoid body and noduli; cell bodies on both sides): navigation and steering.",
    place: "on the midline in the middle of the brain: the fan-shaped and ellipsoid bodies, the protocerebral bridge behind them and the noduli below",
    side: "midline",
    neurons: 2979,
    fullHz: 5,
  },
  ...pair(
    "superior-protocerebrum",
    {
      name: "Superior protocerebrum",
      description: "Neurons whose type is named for the superior protocerebrum (SMP, SLP, SIP, aSP).",
      place: (side) => `the top of the ${side} brain hemisphere, above the mushroom body lobes, from the midline outward`,
    },
    { neurons: 1969, fullHz: 5 },
    { neurons: 1961, fullHz: 5 },
  ),
  ...pair(
    "lateral-horn",
    {
      name: "Lateral horn",
      description: "Neurons whose type is named for the lateral horn (LH*): innate responses to smell.",
      place: (side) => `the ${side} brain hemisphere's outer top, at the back, between the mushroom body calyx and the optic lobe`,
    },
    { neurons: 1016, fullHz: 5 },
    { neurons: 1010, fullHz: 5 },
  ),
  ...pair(
    "ventrolateral-protocerebrum",
    {
      name: "Ventrolateral protocerebrum",
      description: "Neurons whose type is named for the ventrolateral neuropils (AVLP, PVLP, PLP, WED, AOTU), where most visual projection neurons end.",
      place: (side) => `the ${side} brain hemisphere's outer side next to the optic lobe, from front to back`,
    },
    { neurons: 2336, fullHz: 7.8 },
    { neurons: 2345, fullHz: 7.8 },
  ),
  ...pair(
    "inferior-ventromedial",
    {
      name: "Inferior and ventromedial brain",
      description: "Neurons whose type is named for the inferior neuropils (CL, IB, ATL, CRE, aIPg), the ventromedial ones (VES, posterior slope PS, IPS, SPS) or the lateral accessory lobe and bulb (LAL, TuBu): much of the premotor brain the descending neurons start from.",
      place: (side) => `the ${side} half of the brain's middle depth, around the oesophagus: below the superior protocerebrum, beside the central complex, and down the back to the posterior slope`,
    },
    { neurons: 1919, fullHz: 5 },
    { neurons: 1933, fullHz: 5 },
  ),
  ...pair(
    "subesophageal",
    {
      name: "Subesophageal zone",
      description: "Neurons whose type is named for the gnathal ganglion (GNG) or the neuropils around it (antennal mechanosensory and motor centre AMMC, saddle SAD, flange FLA, prow PRW), and the subesophageal projection neurons: taste, the mouthparts and the antennae's touch.",
      place: (side) => `the bottom of the brain on the ${side}, below the oesophagus, down to where the neck connective leaves`,
    },
    { neurons: 1193, fullHz: 17 },
    { neurons: 1207, fullHz: 17 },
  ),
  {
    id: "central-brain-other",
    name: "Central brain, other",
    description: "Central brain neurons the annotations don't place: types named only by number (CB), untyped ones, types named for something other than a neuropil, and those with cell bodies on the midline.",
    place: "the central brain, both hemispheres, not placed",
    side: "both",
    neurons: 6644,
    fullHz: 5,
  },
  {
    id: "head-motor",
    name: "Head motor neurons",
    description: "The brain's motor neurons: of the proboscis and pharynx (MN1-MN13 and others; MN9 is what `feed` reads), and a few of the antennae, neck and retina. Their output is muted in the model (no predicted transmitter).",
    place: "the subesophageal zone at the bottom of the brain, both sides; axons out through the head's nerves, most to the proboscis",
    side: "both",
    neurons: 107,
    fullHz: 28,
  },
  {
    id: "brain-endocrine",
    name: "Neuroendocrine and enteric",
    description: "The brain's neurosecretory cells (insulin-producing, DH44, ITP and others), the enteric nervous system's neurons and the brain's efferent neurons.",
    place: "the top of the brain near the midline (pars intercerebralis and lateralis), and the small ganglia on the gut behind the brain",
    side: "both",
    neurons: 126,
    fullHz: 5,
  },
  ...pair(
    "descending",
    {
      name: "Descending neurons",
      description: "Descending neurons, the brain's commands to the body (all the command readouts but the flight and proboscis motor neurons are among them), and the few sensory neurons whose axons descend with them.",
      place: (side) => `the neck connective's ${side} half: from cell bodies in the ${side} side of the brain down through the neck into the ventral nerve cord`,
    },
    { neurons: 662, fullHz: 16 },
    { neurons: 654, fullHz: 16 },
  ),
  ...pair(
    "ascending",
    {
      name: "Ascending neurons",
      description: "Ascending neurons: from the ventral nerve cord up to the brain, telling it what the body is doing.",
      place: (side) => `the neck connective's ${side} half: from cell bodies in the ${side} side of the ventral nerve cord up through the neck into the brain`,
    },
    { neurons: 930, fullHz: 8.2 },
    { neurons: 907, fullHz: 8.2 },
  ),
  ...pair(
    "front-leg-motor",
    {
      name: "Front leg motor neurons",
      description: "Motor neurons of the front leg. Their output is muted in the model (no predicted transmitter).",
      place: (side) => `the ventral nerve cord's prothoracic neuromere (the front), ${side} leg neuropil; axons out through the ${side} prothoracic leg nerve`,
    },
    { neurons: 68, fullHz: 11 },
    { neurons: 67, fullHz: 11 },
  ),
  ...pair(
    "middle-leg-motor",
    {
      name: "Middle leg motor neurons",
      description: "Motor neurons of the middle leg. Their output is muted in the model (no predicted transmitter).",
      place: (side) => `the ventral nerve cord's mesothoracic neuromere (the middle), ${side} leg neuropil; axons out through the ${side} mesothoracic leg nerve`,
    },
    { neurons: 58, fullHz: 9.7 },
    { neurons: 58, fullHz: 9.7 },
  ),
  ...pair(
    "hind-leg-motor",
    {
      name: "Hind leg motor neurons",
      description: "Motor neurons of the hind leg. Their output is muted in the model (no predicted transmitter).",
      place: (side) => `the ventral nerve cord's metathoracic neuromere (the back of the thorax), ${side} leg neuropil; axons out through the ${side} metathoracic leg nerve`,
    },
    { neurons: 66, fullHz: 7.4 },
    { neurons: 64, fullHz: 7.4 },
  ),
  {
    id: "flight-motor",
    name: "Wing and haltere motor neurons",
    description: "Motor neurons of the wings (the power muscles' DLM and DVM, which `wings` reads, and the steering muscles) and halteres, and a few unassigned ones leaving through the same dorsal nerves. Their output is muted in the model.",
    place: "the dorsal part of the ventral nerve cord (the tectulum) over the mesothoracic and metathoracic neuromeres, both sides; axons out the dorsal nerves to the wing and haltere muscles",
    side: "both",
    neurons: 89,
    fullHz: 65,
  },
  {
    id: "neck-motor",
    name: "Neck motor neurons",
    description: "The ventral nerve cord's neck motor neurons, which turn the head. Their output is muted in the model.",
    place: "the front of the ventral nerve cord, the prothoracic neuromere's dorsal part, both sides; axons out to the neck muscles",
    side: "both",
    neurons: 24,
    fullHz: 22,
  },
  {
    id: "abdomen-motor",
    name: "Abdomen motor neurons",
    description: "Motor neurons of the abdomen and its organs. Their output is muted in the model.",
    place: "the abdominal ganglion at the back end of the ventral nerve cord, both sides; axons out the abdominal nerves",
    side: "both",
    neurons: 214,
    fullHz: 31,
  },
  {
    id: "leg-sensory",
    name: "Leg sensory neurons",
    description: "Sensory neurons recorded as the legs': touch, taste bristles and others along the legs and feet.",
    place: "the six legs, most in the feet; axons to the leg neuropils of the ventral nerve cord",
    side: "both",
    neurons: 1640,
    fullHz: 5,
  },
  {
    id: "thorax-sensory",
    name: "Wing, haltere and thorax sensory neurons",
    description: "Sensory neurons recorded as the wings' (the wing margin's taste and touch bristles, the veins), the halteres', the notum's and the neck's.",
    place: "the wings, the halteres and the back of the thorax (notum), both sides; axons to the ventral nerve cord's dorsal neuropils",
    side: "both",
    neurons: 868,
    fullHz: 5,
  },
  {
    id: "abdomen-sensory",
    name: "Abdomen sensory neurons",
    description: "Sensory neurons recorded as the abdomen's.",
    place: "the abdomen; axons to the abdominal ganglion at the back of the ventral nerve cord",
    side: "both",
    neurons: 1143,
    fullHz: 5,
  },
  {
    id: "proprioceptors",
    name: "Proprioceptors",
    description: "Body proprioceptors recorded by organ but not by place: campaniform sensilla (strain sensors; the model's `grounded` drives them as the legs' load sensors), chordotonal organs and hair plates.",
    place: "mostly in the legs (chordotonal organs in the femur, campaniform sensilla and hair plates at the joints), some at the bases of the wings and halteres; the exact places aren't recorded",
    side: "both",
    neurons: 964,
    fullHz: 35,
  },
  {
    id: "bristles",
    name: "Body bristles",
    description: "Touch and taste bristles of the thorax, abdomen and legs, recorded by organ but not by place. `touch` drives the touch bristles.",
    place: "the bristles over the thorax, abdomen and legs; the exact places aren't recorded",
    side: "both",
    neurons: 2276,
    fullHz: 9.8,
  },
  ...pair(
    "cord-interneurons",
    {
      name: "Ventral nerve cord interneurons",
      description: "The ventral nerve cord's own interneurons. The annotations don't say which neuromere each is in.",
      place: (side) => `the ventral nerve cord's ${side} half, all along it, from the prothoracic neuromere at the front to the abdominal ganglion at the back`,
    },
    { neurons: 6474, fullHz: 5.1 },
    { neurons: 6448, fullHz: 5.1 },
  ),
  {
    id: "cord-midline",
    name: "Ventral nerve cord, midline",
    description: "Ventral nerve cord interneurons with their cell bodies on the midline, and cord neurons whose class is to be confirmed.",
    place: "the ventral nerve cord, along its midline",
    side: "midline",
    neurons: 277,
    fullHz: 34,
  },
  {
    id: "cord-efferent",
    name: "Ventral nerve cord, efferent and neuroendocrine",
    description: "The ventral nerve cord's efferent neurons (mostly unpaired median modulatory ones) and neuroendocrine cells, and the efferent neurons running through the neck.",
    place: "the ventral nerve cord, mostly along its midline; axons out to muscles and organs",
    side: "both",
    neurons: 128,
    fullHz: 9.1,
  },
  {
    id: "unplaced",
    name: "Unplaced",
    description: "Neurons nothing above places: descending and ascending neurons with cell bodies on the midline or no side, and sensory neurons whose class or organ is to be confirmed.",
    place: "anywhere; not placed",
    side: "both",
    neurons: 75,
    fullHz: 6.9,
  },
];

/** Each region's name in stats.rates, in the order of REGIONS. */
export const REGION_RATE_NAMES: readonly string[] = REGIONS.map((region) => regionName(region.id));

const INDEX = new Map(REGIONS.map((region, k) => [region.id, k]));

/** A neuron's annotations, as the classification reads them. */
export type Annotations = { superClass: string; class: string; subClass: string; type: string; side: string };

const among = (value: string, list: readonly string[]) => list.includes(value);
const startsWithAny = (value: string, prefixes: readonly string[]) => prefixes.some((prefix) => value.startsWith(prefix));

// Optic lobe intrinsic cells by type, after Fischbach and Dittrich (1989) and
// the male optic lobe's inventory (Nern et al. 2025). The lamina has its own
// cell types as Tuthill et al. (2013) list them (C2, C3 and the Lawfs take
// their input in the medulla and feed back to it). Otherwise a type named for
// one neuropil belongs to it, and the columnar types named for a shape go
// where their dendrites are, except T4 and T5, which go where their axons
// make the lobula plate's layers. Types spanning neuropils with no single
// home, and those unclear across neuropils, go to optic-other.
const LAMINA_TYPES = ["L1", "L2", "L3", "L4", "L5", "Lai", "T1", "C2", "C3", "Lawf1", "Lawf2"];
const LAMINA_PREFIXES = ["Lat"];
const MEDULLA_TYPES = ["T2", "T2a", "T3", "ME_unclear", "l-LNv"];
const MEDULLA_PREFIXES = ["Mi", "Dm", "Pm", "Cm", "aMe", "Tm", "MeLo", "MeVPMe"];
const LOBULA_TYPES = ["LO_unclear"];
const LOBULA_PREFIXES = ["Li", "LT", "LC"];
const LOBULA_PLATE_TYPES = ["H1", "LOP_unclear"];
const LOBULA_PLATE_PREFIXES = ["T4", "T5", "LPi", "Tlp"];

function opticLobe(type: string): string {
  // One type of both a Pm and an Li.
  if (type === "Pm7_Li28") return "optic-other";
  if (among(type, LAMINA_TYPES) || startsWithAny(type, LAMINA_PREFIXES)) return "lamina";
  if (among(type, MEDULLA_TYPES) || startsWithAny(type, MEDULLA_PREFIXES)) return "medulla";
  if (among(type, LOBULA_TYPES) || startsWithAny(type, LOBULA_PREFIXES)) return "lobula";
  if (among(type, LOBULA_PLATE_TYPES) || startsWithAny(type, LOBULA_PLATE_PREFIXES)) return "lobula-plate";
  return "optic-other";
}

// Central brain cells by the neuropil their type is named for (the hemibrain's
// and FlyWire's convention: the neuropil with most of the type's synapses),
// grouped as Ito et al. (2014) group the neuropils.
const CENTRAL_BRAIN: readonly (readonly [string, readonly string[]])[] = [
  ["superior-protocerebrum", ["SMP", "SLP", "SIP", "aSP"]],
  ["lateral-horn", ["LH"]],
  ["ventrolateral-protocerebrum", ["AVLP", "PVLP", "PLP", "WED", "AOTU", "TuTu", "VLP"]],
  ["inferior-ventromedial", ["CL", "ICL", "SCL", "IB", "ATL", "CRE", "aIPg", "VES", "PS", "IPS", "SPS", "GOR", "EPA", "LAL", "TuBu"]],
  ["subesophageal", ["GNG", "AMMC", "SAD", "FLA", "PRW", "CAN"]],
];

function centralBrain(n: Annotations): string {
  if (n.class === "CX" || startsWithAny(n.type, ["FB", "FS"])) return "central-complex";
  const bySide = (id: string) => (n.side === "left" || n.side === "right" ? `${id}-${n.side}` : "central-brain-other");
  if (among(n.class, ["Kenyon_Cell", "MBON", "DAN"]) || among(n.type, ["APL", "DPM"]) || n.type.startsWith("MB-")) return bySide("mushroom-body");
  if (among(n.class, ["ALPN", "ALLN", "ALIN", "ALON"])) return bySide("antennal-lobe");
  if (n.class === "SEZPN") return bySide("subesophageal");
  for (const [id, prefixes] of CENTRAL_BRAIN) if (startsWithAny(n.type, prefixes)) return bySide(id);
  return "central-brain-other";
}

/** The id of the region a neuron is in. */
export function regionIdOf(n: Annotations): string {
  const sided = (id: string, otherwise: string) => (n.side === "left" || n.side === "right" ? `${id}-${n.side}` : otherwise);
  switch (n.superClass) {
    case "ol_sensory":
      return sided("retina", "unplaced");
    case "ol_intrinsic":
      return sided(opticLobe(n.type), "unplaced");
    case "visual_projection":
      return sided("visual-projection", "unplaced");
    case "visual_projection_tbc":
      return sided("optic-other", "unplaced");
    case "visual_centrifugal":
      return sided("visual-centrifugal", "unplaced");
    case "cb_sensory":
      if (among(n.class, ["olfactory", "hygrosensory", "thermosensory"])) return "antenna-smell";
      if (n.type.startsWith("JO-")) return sided("johnston", "head-sensory-other");
      if (n.type.startsWith("BM")) return "head-bristles";
      if (n.class === "gustatory" || startsWithAny(n.type, ["TPMN", "aPhM"])) return "mouthparts";
      return "head-sensory-other";
    case "cb_sensory_tbc":
      return "head-sensory-other";
    case "cb_intrinsic":
      return centralBrain(n);
    case "cb_motor":
      return "head-motor";
    case "cb_endocrine":
    case "cb_efferent":
    case "ENS":
      return "brain-endocrine";
    case "descending_neuron":
    case "sensory_descending":
      return sided("descending", "unplaced");
    case "ascending_neuron":
      return sided("ascending", "unplaced");
    case "vnc_motor":
      if (n.subClass === "fl") return sided("front-leg-motor", "unplaced");
      if (n.subClass === "ml") return sided("middle-leg-motor", "unplaced");
      if (n.subClass === "hl") return sided("hind-leg-motor", "unplaced");
      if (among(n.subClass, ["wm", "hm", "xm"])) return "flight-motor";
      if (n.subClass === "nm") return "neck-motor";
      if (n.subClass === "ad") return "abdomen-motor";
      return "unplaced";
    case "vnc_sensory":
    case "sensory_ascending":
      if (among(n.subClass, ["leg", "leg_bristle"])) return "leg-sensory";
      if (among(n.subClass, ["wing", "wing_bristle", "haltere", "notum", "neck"])) return "thorax-sensory";
      if (n.subClass === "abdomen") return "abdomen-sensory";
      if (among(n.subClass, ["campaniform_sensilla", "chordotonal_organ", "hair_plate"])) return "proprioceptors";
      if (among(n.subClass, ["mechanosensory_bristle", "taste_bristle"])) return "bristles";
      return "unplaced";
    case "vnc_intrinsic":
      return sided("cord-interneurons", "cord-midline");
    case "vnc_tbc":
      return "cord-midline";
    case "vnc_efferent":
    case "vnc_endocrine":
    case "efferent_ascending":
    case "efferent_descending":
      return "cord-efferent";
    default:
      return "unplaced";
  }
}

/** Each neuron's region, as an index into REGIONS. */
export function regionOf(connectome: Connectome): Uint8Array {
  const { superClass, class: klass, subClass, type, side } = connectome.columns;
  const out = new Uint8Array(connectome.neurons);
  for (let i = 0; i < connectome.neurons; i++) {
    const id = regionIdOf({ superClass: superClass.value(i), class: klass.value(i), subClass: subClass.value(i), type: type.value(i), side: side.value(i) });
    out[i] = INDEX.get(id)!;
  }
  return out;
}
