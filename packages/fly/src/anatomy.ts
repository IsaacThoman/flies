// The fly's measurements, shared by the geometry and the rig. Units are body
// lengths (front of the head to the tip of the abdomen, 2.4 mm in a male
// Drosophila melanogaster); the space is the model's: standing on y = 0,
// facing +z, +x on the fly's left. Left-side values are given; the right side
// is the mirror image. Proportions follow a male: head about a fifth of the
// length and a little wider than the thorax, the thorax the deepest part, a
// short blunt abdomen.

export type Vec3 = readonly [number, number, number];

/** Rest pivots: where each body joint sits when the fly stands at rest. */
export const PIVOT = {
  thorax: [0, 0.33, 0.13] as Vec3,
  neck: [0, 0.335, 0.33] as Vec3,
  antenna: [0.022, 0.362, 0.484] as Vec3,
  proboscis: [0, 0.24, 0.42] as Vec3,
  abdomen: [0, 0.32, -0.03] as Vec3,
  abdomenTip: [0, 0.29, -0.245] as Vec3,
  haltere: [0.112, 0.385, -0.005] as Vec3,
  wing: [0.118, 0.44, 0.105] as Vec3,
};

export const THORAX = { centre: [0, 0.335, 0.135] as Vec3, radii: [0.15, 0.155, 0.2] as Vec3 };
export const SCUTELLUM = { centre: [0, 0.43, -0.058] as Vec3, radii: [0.075, 0.034, 0.062] as Vec3 };
export const HEAD = { centre: [0, 0.335, 0.398] as Vec3, radii: [0.155, 0.13, 0.092] as Vec3 };
/** The compound eye: an ellipsoid turned out and a little forward. */
export const EYE = { centre: [0.058, 0.34, 0.408] as Vec3, radii: [0.106, 0.12, 0.09] as Vec3, yaw: 0.3 };
export const ABDOMEN = { centre: [0, 0.295, -0.25] as Vec3, radii: [0.128, 0.11, 0.25] as Vec3 };
/** Where each abdominal segment (A1 to A6) ends, as a fraction of the abdomen from front to tip. */
export const ABDOMINAL_SEGMENTS = [0.12, 0.3, 0.47, 0.63, 0.8, 1];

export const PROBOSCIS = { rostrum: 0.05, haustellum: 0.062, labellum: 0.04 };
export const HALTERE = { stalk: 0.045, knob: 0.0125 };
export const WING = { length: 0.8 };

export type LegSpec = {
  /** Coxa base on the thorax at rest, left side. */
  hip: Vec3;
  /** Direction the coxa points at rest. */
  coxaDir: Vec3;
  /** How far the coxa turns toward the foot, 0 to 1: the front coxae are the mobile ones. */
  coxaFollow: number;
  coxa: number;
  femur: number;
  tibia: number;
  basitarsus: number;
  /** Tarsomeres 2 to 5, which lie on the ground. */
  tarsus: number;
  femurRadius: number;
  tibiaRadius: number;
  /** Rest foot (claw) position on the ground, left side. */
  foot: Vec3;
  /** Which way the knee points (before mirroring): up and out from the body. */
  knee: Vec3;
  /** How far the claw may stray from its rest position on the ground and stay within the leg's reach. */
  reach: number;
};

/**
 * Front, middle and hind legs. The coxae cluster under the thorax: the front
 * pair close together just behind the head, the middle and hind pairs further
 * apart. Front feet stand ahead of the head, middle feet out to the side,
 * hind feet back beside the abdomen.
 */
export const LEGS: readonly LegSpec[] = [
  {
    hip: [0.045, 0.22, 0.29], coxaDir: [0.25, -0.62, 0.74], coxaFollow: 0.45,
    coxa: 0.085, femur: 0.19, tibia: 0.17, basitarsus: 0.075, tarsus: 0.09,
    femurRadius: 0.0155, tibiaRadius: 0.0095, foot: [0.27, 0, 0.66], knee: [0.8, 0.35, 0.45], reach: 0.15,
  },
  {
    hip: [0.068, 0.2, 0.175], coxaDir: [0.55, -0.82, 0.12], coxaFollow: 0.25,
    coxa: 0.05, femur: 0.22, tibia: 0.21, basitarsus: 0.085, tarsus: 0.095,
    femurRadius: 0.0135, tibiaRadius: 0.0088, foot: [0.53, 0, 0.1], knee: [0.9, 0.6, 0], reach: 0.21,
  },
  {
    hip: [0.07, 0.205, 0.075], coxaDir: [0.45, -0.8, -0.38], coxaFollow: 0.25,
    coxa: 0.055, femur: 0.24, tibia: 0.23, basitarsus: 0.09, tarsus: 0.095,
    femurRadius: 0.0145, tibiaRadius: 0.0088, foot: [0.38, 0, -0.34], knee: [0.75, 0.6, -0.3], reach: 0.19,
  },
];

/** The claw sits this far above the ground so that the tarsus, claws and pads rest on it rather than in it. */
export const FOOT_CLEARANCE = 0.0085;

/** Leg order: L1 R1 L2 R2 L3 R3. Side +1 is the fly's left (+x). */
export const LEG_COUNT = 6;
export const legPair = (leg: number) => leg >> 1;
export const legSide = (leg: number) => ((leg & 1) === 0 ? 1 : -1);

/** Joint indices into the body mesh's joint array. */
export const J = {
  thorax: 0,
  head: 1,
  antenna: 2, // + 0 left, + 1 right
  rostrum: 4,
  haustellum: 5,
  labellum: 6,
  abdomen: 7,
  abdomenTip: 8,
  haltere: 9, // + 0 left, + 1 right
  leg: 11, // + leg * 5 + segment
} as const;
export const LEG_SEGMENTS = 5; // coxa, femur (with trochanter), tibia, basitarsus, tarsomeres 2–5
export const BODY_JOINTS = J.leg + LEG_COUNT * LEG_SEGMENTS;

/** Each wing is drawn as this many copies spread over the stroke: the blur. */
export const WING_COPIES = 8;
export const WING_JOINTS = 2 * WING_COPIES;
