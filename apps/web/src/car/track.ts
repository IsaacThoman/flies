// The road: a closed loop of country road between guard rails, as a
// centreline sampled finely enough that straight pieces between samples are
// as good as the curve. Metres throughout; y is up and the road is flat.
// No drawing here (scenery.ts draws it), so the car can be driven in a test.

/** Half the road's width between the rails, and where each lane's middle is from the centre line. */
export const ROAD = { half: 7.5, lane: 2.6 };
const SAMPLES = 720;

/** Where something is on the road: the sample before it, how far along, how far left of the centre line, and the road's heading there. */
export type RoadPoint = { index: number; s: number; lateral: number; yaw: number; x: number; z: number };

export const roadPoint = (): RoadPoint => ({ index: 0, s: 0, lateral: 0, yaw: 0, x: 0, z: 0 });

export class Track {
  /** The centre line, x then z for each sample, and the distance along it to each. */
  readonly xz: Float64Array;
  readonly s: Float64Array;
  readonly length: number;
  readonly count = SAMPLES;

  constructor(seed = 0) {
    const xz = new Float64Array(SAMPLES * 2);
    for (let i = 0; i < SAMPLES; i++) {
      const t = (i / SAMPLES) * Math.PI * 2;
      // A wobbly ring: long sweepers, a couple of tighter bends and no crossings (the radius never comes near 0).
      const r = 170 + 38 * Math.sin(2 * t + 0.6 + seed) + 24 * Math.cos(3 * t + seed * 0.5) + 10 * Math.sin(5 * t + 1);
      xz[i * 2] = r * Math.cos(t);
      xz[i * 2 + 1] = r * Math.sin(t);
    }
    const s = new Float64Array(SAMPLES + 1);
    for (let i = 0; i < SAMPLES; i++) {
      const j = (i + 1) % SAMPLES;
      s[i + 1] = s[i] + Math.hypot(xz[j * 2] - xz[i * 2], xz[j * 2 + 1] - xz[i * 2 + 1]);
    }
    this.xz = xz;
    this.s = s;
    this.length = s[SAMPLES];
  }

  /** The heading of the piece from sample `i` to the next: forward is (sin yaw, cos yaw), as for the fly. */
  yawAt(i: number) {
    const a = ((i % SAMPLES) + SAMPLES) % SAMPLES;
    const b = (a + 1) % SAMPLES;
    return Math.atan2(this.xz[b * 2] - this.xz[a * 2], this.xz[b * 2 + 1] - this.xz[a * 2 + 1]);
  }

  /** The point `along` metres round the loop and `lateral` metres left of the centre line, into `out`. */
  at(along: number, lateral: number, out: RoadPoint): RoadPoint {
    const L = this.length;
    const d = ((along % L) + L) % L;
    let lo = 0;
    let hi = SAMPLES;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.s[mid] <= d) lo = mid;
      else hi = mid;
    }
    const a = lo;
    const b = (a + 1) % SAMPLES;
    const k = (d - this.s[a]) / (this.s[a + 1] - this.s[a]);
    const yaw = this.yawAt(a);
    // Left of a heading (sin yaw, cos yaw) is (cos yaw, −sin yaw).
    out.x = this.xz[a * 2] + (this.xz[b * 2] - this.xz[a * 2]) * k + Math.cos(yaw) * lateral;
    out.z = this.xz[a * 2 + 1] + (this.xz[b * 2 + 1] - this.xz[a * 2 + 1]) * k - Math.sin(yaw) * lateral;
    out.index = a;
    out.s = d;
    out.lateral = lateral;
    out.yaw = yaw;
    return out;
  }

  /**
   * The nearest point of the centre line to (x, z), into `out`. Searches round
   * `out.index` when `near` (a car moves a few samples a frame at most),
   * otherwise the whole loop. Allocates nothing.
   */
  nearest(x: number, z: number, out: RoadPoint, near = true): RoadPoint {
    const span = near ? 24 : SAMPLES / 2;
    const from = near ? out.index : 0;
    let best = Infinity;
    let bestI = 0;
    let bestK = 0;
    for (let n = -span; n <= span; n++) {
      const a = (((from + n) % SAMPLES) + SAMPLES) % SAMPLES;
      const b = (a + 1) % SAMPLES;
      const ax = this.xz[a * 2];
      const az = this.xz[a * 2 + 1];
      const dx = this.xz[b * 2] - ax;
      const dz = this.xz[b * 2 + 1] - az;
      const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      const ex = x - (ax + dx * k);
      const ez = z - (az + dz * k);
      const d = ex * ex + ez * ez;
      if (d < best) {
        best = d;
        bestI = a;
        bestK = k;
      }
    }
    const yaw = this.yawAt(bestI);
    const b = (bestI + 1) % SAMPLES;
    const cx = this.xz[bestI * 2] + (this.xz[b * 2] - this.xz[bestI * 2]) * bestK;
    const cz = this.xz[bestI * 2 + 1] + (this.xz[b * 2 + 1] - this.xz[bestI * 2 + 1]) * bestK;
    out.index = bestI;
    out.s = this.s[bestI] + (this.s[bestI + 1] - this.s[bestI]) * bestK;
    out.lateral = (x - cx) * Math.cos(yaw) - (z - cz) * Math.sin(yaw);
    out.yaw = yaw;
    out.x = cx;
    out.z = cz;
    return out;
  }
}

/** The difference between two headings, wrapped to −π..π. */
export const wrapAngle = (a: number) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
