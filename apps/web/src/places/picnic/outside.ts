// What the picnic's goings-on (life.ts, run with its table) leave for its
// backdrop to show: a gust in the trees, the grass and the lake, a gull
// gliding over, a sailboat out on the lake. One picnic is shown at a time.

export const outside = {
  /** The gust blowing over the table now: its velocity (mm/s), and how strong it is, 0 to 1. */
  gust: { x: 0, z: 0, strength: 0 },
  /** A gull gliding over, mm, its heading (radians, 0 toward +x) and the beat of its wings (0 to 1, 0 gliding). */
  gull: { on: false, x: 0, y: 0, z: 0, heading: 0, flap: 0 },
  /** A sailboat on the lake, mm, its heading, and how far it heels. */
  boat: { on: false, x: 0, z: 0, heading: 0, heel: 0 },
};
