// The air's temperature: what the fly's antennae feel of warmth and cool.
// A place keeps one all over (its ambient), and warm or cool spots in it (a
// sunny stone, a lamp, a cold drink) add to it near them. The fly's brain
// is given the temperature at each antenna and makes of it what its
// thermoreceptors do (packages/brain/src/thermo.ts).

/**
 * The ambient temperature of a place that names none, °C. 25 °C is the
 * temperature flies are kept at in the laboratory, and the one they choose
 * on a gradient (Hamada et al. 2008, Nature 454:217; Sayeed & Benzer 1996),
 * so a place that doesn't say is one the fly is at ease in.
 */
export const AMBIENT_TEMPERATURE = 25;

/**
 * Something warmer or cooler than the air around it: the air within about
 * `radius` (mm) of (x, y, z) is `delta` °C warmer (or cooler, negative) at its
 * middle, falling off as a Gaussian of the distance: half as much at 1.18
 * radii, a fortieth at 2.7.
 */
export type ThermalSpot = { x: number; y: number; z: number; radius: number; delta: number };

/** A place's temperature: its ambient (AMBIENT_TEMPERATURE when left out) and its own warm and cool spots. */
export type Climate = { ambient?: number; spots?: readonly ThermalSpot[] };

/**
 * The air's temperature everywhere in the place, °C. `spots` may change
 * while the place is loaded (something warm put down or taken away);
 * loading a place sets it back to the place's own.
 */
export class Temperature {
  ambient = AMBIENT_TEMPERATURE;
  spots: ThermalSpot[] = [];

  set(climate: Climate | undefined) {
    this.ambient = climate?.ambient ?? AMBIENT_TEMPERATURE;
    this.spots = climate?.spots ? [...climate.spots] : [];
  }

  /** The temperature at (x, y, z), °C. */
  at(x: number, y: number, z: number): number {
    let t = this.ambient;
    for (let i = 0; i < this.spots.length; i++) {
      const s = this.spots[i];
      const dx = x - s.x;
      const dy = y - s.y;
      const dz = z - s.z;
      t += s.delta * Math.exp(-(dx * dx + dy * dy + dz * dz) / (2 * s.radius * s.radius));
    }
    return t;
  }
}
