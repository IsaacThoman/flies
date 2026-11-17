// How thirsty the fly is: internal state the body keeps account of, as it
// does hunger (hunger.ts). The brain takes it (BrainSenses.thirst: how
// strongly its water taste neurons pass on what they taste).
//
// A fly loses water through its cuticle and its breathing all the time, and
// faster the drier the air. Two hours in air below 20% relative humidity are
// enough to make flies drink more water, and nothing else more (Jourjine et
// al. 2016, Cell 166: 855, Figure 3A, after Lin et al. 2014, Nat Neurosci 17:
// 1536); six to eight hours raise the osmolality of their hemolymph by 55
// mOsm/kg, which five minutes with water undo (ibid., Figure 6B). Thirst runs
// 60 times faster here, as hunger does: what takes a real fly an hour takes
// this one a minute.
//
// The air's humidity isn't modelled: it is always the dry air those flies were
// kept in. Nor is the water in what it eats. Juice and fruit are mostly water,
// but foods say only how sweet they are and how much plain water they are,
// not how much water they hold, so only plain water quenches it.

export const THIRST = {
  /**
   * Fly time, s, over which a fly that drinks nothing goes most of the way
   * (1 - 1/e) from quenched to thirsty: 6 real hours in dry air, the shorter
   * end of the 6 to 8 hours that raised its hemolymph's osmolality by 55
   * mOsm/kg (a chosen reading of that measurement), over 60.
   */
  tau: 360,
  /**
   * What takes a thirsty fly to quenched: this much drunk, as the pantry
   * counts it (a whole dropped drop of Water is 1), times its water. A game
   * unit, not a measurement, as hunger's meal is: one drop is a full drink.
   */
  draught: 1,
} as const;

/**
 * Thirst to begin with: a fly two hours out of its culture vial's wet food,
 * in dry air, the thirst Jourjine et al. gave the flies they found drinking
 * more (0.28).
 */
export const THIRST_START = -Math.expm1(-120 / THIRST.tau);

export class Thirst {
  /** 0 just drunk to 1 thirsty, what the brain is sent. */
  level: number = THIRST_START;

  /** Advances by `dt` seconds of fly time, in which it drank `water`: what it took in times its water. */
  step(dt: number, water: number) {
    if (!(dt > 0)) return;
    const drunk = water > 0 ? water / THIRST.draught : 0;
    this.level = clamp01(this.level + (1 - this.level) * -Math.expm1(-dt / THIRST.tau) - drunk);
  }

  /**
   * `seconds` spent away, the game closed or hidden, with nothing to drink:
   * thirst grows as it would here, but no further than a new fly's
   * (THIRST_START), the same game rule as hunger's (Hunger.away). A fly that
   * left thirstier than that comes back no less thirsty.
   */
  away(seconds: number) {
    if (!(seconds > 0)) return;
    const before = this.level;
    this.step(seconds, 0);
    this.level = Math.max(before, Math.min(this.level, THIRST_START));
  }
}

const clamp01 = (x: number) => (x > 0 ? (x < 1 ? x : 1) : 0);
