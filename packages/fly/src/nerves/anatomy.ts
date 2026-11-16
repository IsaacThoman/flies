// Where the nervous system sits in the fly. Its shapes are measured from one
// male's CNS (measured.ts) in micrometres, in two frames: the brain's (origin
// at the narrowest point of the oesophageal foramen) and the cord's (origin at
// the front of its neuropil), both with +x the fly's left, +y dorsal, +z
// anterior. Here each frame is placed in the model: the brain in the head, the
// cord on the floor of the thorax over the legs' coxae.
//
// The specimen was a CNS dissected out of the fly, so how its brain and cord
// sit relative to each other is the posture it was fixed in, not the fly's;
// the two are placed separately and joined by the neck connective here. The
// model's head is a little smaller than a real male's (its eyes are true to
// size, its head capsule narrower), so the brain is drawn at 0.88 of true
// scale to fit its optic lobes under the eyes; the cord, in a thorax of true
// size, at true scale. A few things the meshes don't give (the retina, which
// the dataset doesn't include; the pars intercerebralis; the neck's path) are
// placed from the literature and the model's own anatomy, and say so.

import { EYE } from "../anatomy.ts";
import type { V3 } from "./builder.ts";

/** Body lengths per micrometre: a male is 2.4 mm long. */
const TRUE_SCALE = 1 / 2400;

export const HEAD = {
  scale: 0.88 * TRUE_SCALE,
  /** Where the brain's origin is in the head, at rest. */
  origin: [0, 0.336, 0.416] as V3,
  /**
   * How far the brain is tipped nose-down from the dataset's orientation, in
   * radians: the dataset's brain was tilted back 18° from the template's to
   * square it with its slabs; this brings the subesophageal zone over the
   * proboscis and the connective out through the back of the head.
   */
  pitch: 0.12,
};

export const CORD = {
  scale: TRUE_SCALE,
  /** Where the cord's origin (the front of its neuropil, on the midline) is in the thorax, at rest. */
  origin: [0, 0.293, 0.3] as V3,
  /** How far it is tipped up at the front, radians, to lie along the thorax's floor, which rises toward the neck. */
  pitch: 0.1,
};

const cp = Math.cos(HEAD.pitch), sp = Math.sin(HEAD.pitch);
/** A brain-frame point (µm) in the model at rest; `m` -1 mirrors it to the right. */
export const brainPoint = (p: readonly number[], m: number): V3 => {
  const y = p[1] * cp + p[2] * sp, z = p[2] * cp - p[1] * sp;
  return [p[0] * m * HEAD.scale, HEAD.origin[1] + y * HEAD.scale, HEAD.origin[2] + z * HEAD.scale];
};
const cc = Math.cos(CORD.pitch), cs = Math.sin(CORD.pitch);
/** A cord-frame point (µm) in the model at rest; `m` -1 mirrors it to the right. */
export const cordPoint = (p: readonly number[], m: number): V3 => {
  const y = p[1] * cc + p[2] * cs, z = p[2] * cc - p[1] * cs;
  return [p[0] * m * CORD.scale, CORD.origin[1] + y * CORD.scale, CORD.origin[2] + z * CORD.scale];
};

/** The eye's outward, upward and forward axes for a side (as body.ts builds the eye: turned out and forward by its yaw). */
export function eyeBasis(m: number): [V3, V3, V3] {
  const c = Math.cos(EYE.yaw), s = Math.sin(EYE.yaw);
  return [[c * m, 0, s], [0, 1, 0], [-s * m, 0, c]];
}

/**
 * The retina isn't in the dataset (it is outside the CNS). It is the eye's
 * photoreceptors, 80–100 µm long under 20 µm of lens: a thick cup filling the
 * eye between the cornea and the lamina, drawn as a plate bent to the model's
 * eye. Its middle, half its height and width, thickness and radii of
 * curvature, in body lengths.
 */
export const RETINA = (() => {
  const [o] = eyeBasis(1);
  const depth = 0.083;
  return {
    centre: [EYE.centre[0] + o[0] * depth, EYE.centre[1], EYE.centre[2] + o[2] * depth] as V3,
    half: [0.1, 0.075] as const,
    thickness: 0.026,
    curve: [0.12, 0.068] as const,
  };
})();

/**
 * Brain-frame points the meshes don't give. The pars intercerebralis is the
 * cluster of neurosecretory cell bodies on the dorsal midline over the
 * protocerebrum; their axons leave by the nerve to the corpora cardiaca
 * behind the brain (measured), which lie on the oesophagus in the neck. The
 * frontal ganglion sits on the oesophagus just in front of the brain.
 */
export const BRAIN_POINTS = {
  parsIntercerebralis: [0, 196, 18] as V3,
  corporaCardiaca: [0, -20, -200] as V3,
  frontalGanglion: [0, -18, 150] as V3,
};

/**
 * The neck connective, from where it leaves the brain (measured) to the front
 * of the cord: through the middle of the neck, the model's, bending with the
 * head at the neck's pivot. Each half carries its descending axons dorsally
 * and its ascending ones ventrally, as the tracts lie; 60 µm across in all.
 */
export const NECK = {
  /** On the way, in the model: the neck's middle, at its pivot. */
  through: [0, 0.302, 0.334] as V3,
  /** Where it meets the cord, in the cord's frame. */
  entry: [0, -8, 18] as V3,
  radius: 13 * TRUE_SCALE,
  /** The descending tract's start, in the brain: the posterior slope, where most descending neurons' dendrites are. */
  descendingFrom: [26, 20, -95] as V3,
  /** The ascending tract's end, in the brain: the ventral brain round the oesophagus. */
  ascendingTo: [30, -45, -60] as V3,
};

/**
 * The cord's own paths, in its frame (µm): the descending tracts run back
 * along its dorsal side through the tectulum and end in the leg neuropils;
 * the ascending ones start in them and run forward ventrally; the midline,
 * and the median fibres along the top with a median nerve from each thoracic
 * segment.
 */
export const CORD_PATHS = {
  descending: [[18, 30, -40], [22, 40, -150], [24, 30, -260], [20, 0, -360], [14, -20, -430]] as V3[],
  ascending: [[12, -40, -420], [20, -40, -320], [22, -50, -220], [20, -40, -110], [14, -30, -20]] as V3[],
  ventralMidline: [[0, -95, -10], [0, -125, -120], [0, -130, -250], [0, -95, -380], [0, -40, -520]] as V3[],
  dorsalMidline: [[0, 40, -20], [0, 55, -150], [0, 50, -280], [0, 25, -380], [0, 30, -500]] as V3[],
  medianNerves: [[0, 45, -70], [0, 62, -200], [0, 40, -310]] as V3[],
  /** The cell bodies of each leg's motor neurons, on the outer ventral edge of its leg neuropil, front to hind. */
  legMotorSomata: [[118, -95, -80], [92, -130, -240], [92, -105, -400]] as V3[],
  /** The flight motor neurons' cell bodies, over the wing tectulum; the neck's, over the front of the neck tectulum. */
  flightSomata: [50, 72, -205] as V3,
  neckSomata: [42, 48, -40] as V3,
  /** The abdominal motor neurons' cell bodies, in the abdominal neuromeres. */
  abdominalSomata: [12, 20, -470] as V3,
};
