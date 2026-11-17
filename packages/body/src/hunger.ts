// How hungry the fly is, and how full its crop: internal state the body keeps
// account of. The brain takes the hunger (BrainSenses.hunger: how strongly its
// sweet taste neurons pass on what they taste, and how restless it is), and
// the model shows the crop as an abdomen that swells after a meal.
//
// Real flies get hungry over hours: starved for 6 hours a fly already accepts
// weaker sugar, and more so after one day and two (Inagaki et al. 2012, Cell
// 148: 583); the dopaminergic neuron that carries hunger to the taste neurons
// fires at 1 Hz just after a meal and 25 Hz after a day without food (Marella
// et al. 2012, Neuron 73: 941). A wallpaper can't wait that long, so time runs
// 60 times faster here, for hunger only: what takes a real fly an hour takes
// this one a minute. Its meals, its walking and everything else run in real
// time.

export const HUNGER = {
  /**
   * Fly time, s, over which a fly that eats nothing goes most of the way
   * (1 - 1/e) from fed to starved: 12 real hours, a round number for "most
   * of the way in a day", over 60.
   */
  tau: 720,
  /**
   * What takes a starved fly to fed: this much food eaten, as the pantry
   * counts it (a whole dropped lump is 1), times its sweetness. Sugar is
   * what feeds it, so food half as sweet feeds half as much. A game unit,
   * not a measurement: one lump of sugar is a full meal.
   */
  meal: 1,
  /**
   * Fly time, s, for half of what is in the crop to pass on to the gut. Real
   * crops take hours to empty (Edgecomb, Murdock & Smith 1987, J Exp Biol
   * 127: 79, weighed blowflies' from 10 minutes to 5 hours after a meal); an
   * hour, a round number, over 60.
   */
  cropHalfLife: 60,
  /** Hunger to begin with: hungry enough to go and look for food. */
  start: 0.7,
} as const;

export class Hunger {
  /** 0 just fed to 1 starved, what the brain is sent. */
  level: number = HUNGER.start;
  /** How full the crop is, 0 empty to 1 a full meal: how swollen the abdomen is. */
  fullness = 0;

  /** Advances by `dt` seconds of fly time, in which it ate `sugar`: food eaten times its sweetness. */
  step(dt: number, sugar: number) {
    if (!(dt > 0)) return;
    const fed = sugar > 0 ? sugar / HUNGER.meal : 0;
    this.level = clamp01(this.level + (1 - this.level) * -Math.expm1(-dt / HUNGER.tau) - fed);
    this.fullness = clamp01(this.fullness * Math.exp((-dt * Math.LN2) / HUNGER.cropHalfLife) + fed);
  }

  /**
   * `seconds` spent away, the game closed or hidden, with nothing to eat: the
   * crop empties and hunger grows as they would here, but no further than the
   * hunger a fly arrives with (HUNGER.start). Hunger runs 60 times fast, so any
   * absence longer than half an hour would otherwise always end in a starved
   * fly; a fly that left hungrier than that comes back no less hungry. The cap
   * is a game rule, not a measurement.
   */
  away(seconds: number) {
    if (!(seconds > 0)) return;
    const before = this.level;
    this.step(seconds, 0);
    this.level = Math.max(before, Math.min(this.level, HUNGER.start));
  }
}

const clamp01 = (x: number) => (x > 0 ? (x < 1 ? x : 1) : 0);
