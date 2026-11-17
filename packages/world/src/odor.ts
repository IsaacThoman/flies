// What food smells of, and how its smell spreads in still or moving air.
//
// The field is the exact steady solution of advection and diffusion from a
// point source in uniform wind in three dimensions, doubled by the floor it
// stands on (docs/olfaction-gates-protocol.md, Part D): at a distance r from
// the food's middle, x of it downwind, C = (r0 / r) exp(-U (r - x) / (2 D)),
// 1 at the food's own edge (r0, its radius) and never more. It has no
// turbulence, no intermittency and no time to build up: smell is everywhere
// at once, as steady as the air. Each odorant's strength is that times what
// the food gives off of it, summed over the foods and held to 1.

/** The odorants, in the brain's order (packages/brain/src/olfaction.ts, ODORANTS). */
export const ODORANTS = ["ethylAcetate", "aceticAcid", "ethanol", "isoamylAcetate", "co2"] as const;
export type Odorant = (typeof ODORANTS)[number];

/**
 * The air the smell moves in. `speed` mm/s along (`x`, `z`), a unit vector;
 * `diffusion` mm²/s. Both chosen (protocol, Part D): a slow indoor draught,
 * and about these small volatiles' molecular diffusivity in air (Fuller
 * estimates, 6 to 16 mm²/s).
 */
export type Air = { speed: number; x: number; z: number; diffusion: number };
export const STILL_DRAUGHT: Air = { speed: 20, x: 1, z: 0, diffusion: 10 };

/** Something that smells: where its middle is, how wide it is (mm), and how much of each odorant it gives off (ODORANTS' order, 0 to 1). */
export type OdorSource = { x: number; y: number; z: number; r: number; emits: readonly number[] };

export class OdorField {
  air: Air;
  sources: readonly OdorSource[];

  constructor(sources: readonly OdorSource[], air: Air = STILL_DRAUGHT) {
    this.sources = sources;
    this.air = air;
  }

  /** Each odorant's strength at a point, 0 to 1, into `into` (ODORANTS' order). */
  at(x: number, y: number, z: number, into: Float64Array): Float64Array {
    into.fill(0);
    const { speed, diffusion } = this.air;
    for (const source of this.sources) {
      const dx = x - source.x;
      const dz = z - source.z;
      const r = Math.hypot(dx, y - source.y, dz);
      const downwind = dx * this.air.x + dz * this.air.z;
      const c = r <= source.r ? 1 : Math.min(1, (source.r / r) * Math.exp((-speed * (r - downwind)) / (2 * diffusion)));
      for (let k = 0; k < ODORANTS.length; k++) into[k] += c * (source.emits[k] ?? 0);
    }
    for (let k = 0; k < ODORANTS.length; k++) into[k] = Math.min(1, into[k]);
    return into;
  }
}
