/** An observation is body motion, never a thresholded brain command. Angles are unwrapped radians. */
export type Observation = { dt: number; speed: number; yawRate: number; yaw: number; onFeet: boolean; grooming: boolean; eating: boolean; edge: boolean; jumped: boolean };

export function mean(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null;
}
export function quantile(values: readonly number[], q: number): number | null {
  if (!(q >= 0 && q <= 1)) throw new Error('quantile must be in [0,1]');
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (sorted.length - 1) * q;
  return sorted[Math.floor(at)] + (sorted[Math.ceil(at)] - sorted[Math.floor(at)]) * (at % 1);
}

/** Complete bouts only: observation-window endpoints are censoring, not behavioural transitions. */
export class Bouts {
  readonly complete: number[] = [];
  starts = 0;
  censored = 0;
  seconds = 0;
  #active: boolean | null = null;
  #duration = 0;
  #leftCensored = false;
  add(active: boolean, dt: number) {
    if (this.#active === null) {
      this.#leftCensored = active;
      if (active) this.censored++;
    } else if (active !== this.#active) {
      if (this.#active && !this.#leftCensored) this.complete.push(this.#duration);
      this.#duration = 0;
      this.#leftCensored = false;
      if (active) this.starts++;
    }
    this.#active = active;
    if (active) { this.seconds += dt; this.#duration += dt; }
  }
  get rightCensored() { return this.#active === true; }
}

/** Fixed-width histogram bounds retained memory for arbitrarily long runs; quantile error ≤ binWidth. */
export class Histogram {
  readonly bins: Float64Array;
  total = 0;
  sum = 0;
  overflow = 0;
  readonly binWidth: number;
  constructor(binWidth: number, maximum: number) { this.binWidth = binWidth; this.bins = new Float64Array(Math.ceil(maximum / binWidth)); }
  add(value: number, weight: number) {
    const at = Math.floor(value / this.binWidth);
    if (!Number.isFinite(value) || value < 0 || !Number.isFinite(weight) || weight <= 0) throw new Error('invalid histogram sample');
    if (at >= this.bins.length) this.overflow += weight;
    else this.bins[at] += weight;
    this.total += weight;
    this.sum += value * weight;
  }
  quantile(q: number): number | null {
    if (!(q >= 0 && q <= 1)) throw new Error('quantile must be in [0,1]');
    if (!this.total) return null;
    let accumulated = 0;
    for (let i = 0; i < this.bins.length; i++) {
      accumulated += this.bins[i];
      if (accumulated > 0 && accumulated >= this.total * q) return (i + 0.5) * this.binWidth;
    }
    return null; // Overflow cannot masquerade as a finite quantile.
  }
}

type Saccade = { peak: number; frame: number; preYaw: number | null; angle: number | null };

export class Ethogram {
  readonly walking = new Bouts();
  readonly stopping = new Bouts();
  readonly grooming = new Bouts();
  readonly feeding = new Bouts();
  readonly airborne = new Bouts();
  readonly saccades = new Bouts();
  readonly speed = new Histogram(0.1, 1000);
  readonly yawSpeed = new Histogram(1, 10000);
  seconds = 0;
  onFeetSeconds = 0;
  activeSeconds = 0;
  edgeSeconds = 0;
  distance = 0;
  takeoffs = 0;
  #yaw: number[] = [];
  #onFeet: boolean[] = [];
  #frame = 0;
  #event: Saccade | null = null;
  #pending: Saccade[] = [];
  #leftEvent = false;
  readonly saccadeAngles: number[] = [];
  readonly dt: number;
  readonly halfWindow: number;
  constructor(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0 || Math.abs(0.05 / dt - Math.round(0.05 / dt)) > 1e-8) throw new Error('dt must divide the 50 ms half-window');
    this.dt = dt;
    this.halfWindow = Math.round(0.05 / dt);
  }
  add(s: Observation) {
    if (Math.abs(s.dt - this.dt) > 1e-8 || ![s.dt, s.speed, s.yawRate, s.yaw].every(Number.isFinite) || s.speed < 0) throw new Error('invalid observation');
    this.seconds += s.dt;
    const walking = s.onFeet && s.speed > 0.5;
    const yaw = Math.abs(s.yawRate) * 180 / Math.PI;
    this.walking.add(walking, s.dt);
    this.stopping.add(s.onFeet && !walking, s.dt);
    this.grooming.add(s.onFeet && s.grooming, s.dt);
    this.feeding.add(s.onFeet && s.eating, s.dt);
    this.airborne.add(!s.onFeet, s.dt);
    this.saccades.add(s.onFeet && yaw > 200, s.dt);
    if (walking) this.speed.add(s.speed, s.dt);
    if (s.onFeet) {
      this.onFeetSeconds += s.dt;
      this.yawSpeed.add(yaw, s.dt);
      this.distance += s.speed * s.dt;
      if (s.speed > 0.5 || yaw > 20) this.activeSeconds += s.dt;
      if (s.edge) this.edgeSeconds += s.dt;
    }
    if (s.jumped) this.takeoffs++;

    // A peak's angle is read over ±50 ms, rather than integrated only above threshold.
    this.#yaw.push(s.yaw);
    this.#onFeet.push(s.onFeet);
    if (this.#yaw.length > this.halfWindow + 1) { this.#yaw.shift(); this.#onFeet.shift(); }
    const turning = s.onFeet && yaw > 200;
    if (turning) {
      if (!this.#event) this.#leftEvent = this.#frame === 0;
      if (!this.#event || yaw > this.#event.peak) {
        this.#event = { peak: yaw, frame: this.#frame, preYaw: !this.#leftEvent && this.#yaw.length > this.halfWindow && this.#onFeet.every(Boolean) ? this.#yaw[0] : null, angle: null };
      }
    } else if (this.#event) {
      this.#pending.push(this.#event);
      this.#event = null;
    }
    if (!s.onFeet && this.#event) this.#event.preYaw = null;
    if (this.#event && this.#frame - this.#event.frame === this.halfWindow && this.#event.preYaw !== null) {
      this.#event.angle = Math.abs(s.yaw - this.#event.preYaw) * 180 / Math.PI;
    }
    for (let i = this.#pending.length - 1; i >= 0; i--) {
      const event = this.#pending[i];
      const age = this.#frame - event.frame;
      if (!s.onFeet && age <= this.halfWindow) event.preYaw = null;
      if (age === this.halfWindow && event.preYaw !== null) event.angle = Math.abs(s.yaw - event.preYaw) * 180 / Math.PI;
      if (age >= this.halfWindow) {
        if (event.angle !== null) this.saccadeAngles.push(event.angle);
        this.#pending.splice(i, 1);
      }
    }
    this.#frame++;
  }
  result() {
    const fraction = (time: number) => this.seconds ? time / this.seconds : null;
    return {
      seconds: this.seconds,
      speedMean: this.speed.total ? this.speed.sum / this.speed.total : null,
      speedP10: this.speed.quantile(0.1), speedMedian: this.speed.quantile(0.5), speedP90: this.speed.quantile(0.9),
      walkFraction: fraction(this.walking.seconds),
      activeFraction: fraction(this.activeSeconds),
      walkBoutMean: mean(this.walking.complete), walkBoutMedian: quantile(this.walking.complete, 0.5),
      walkBoutRate: this.seconds ? this.walking.starts / this.seconds : null,
      stopBoutMean: mean(this.stopping.complete), stopBoutMedian: quantile(this.stopping.complete, 0.5),
      yawMedianDegS: this.yawSpeed.quantile(0.5), yawP90DegS: this.yawSpeed.quantile(0.9),
      edgeFraction: this.onFeetSeconds ? this.edgeSeconds / this.onFeetSeconds : null,
      groomBoutMean: mean(this.grooming.complete), groomFraction: fraction(this.grooming.seconds),
      feedingBoutMean: mean(this.feeding.complete), feedingFraction: fraction(this.feeding.seconds),
      airborneBoutMean: mean(this.airborne.complete), airborneFraction: fraction(this.airborne.seconds),
      saccadeDurationMedianMs: this.saccades.complete.length ? quantile(this.saccades.complete, 0.5)! * 1000 : null,
      saccadeAngleMean: mean(this.saccadeAngles),
      saccadeRate: this.seconds ? this.saccades.starts / this.seconds : null,
      distanceMm: this.distance, takeoffs: this.takeoffs,
      samples: { walkingBouts: this.walking.complete.length, stoppingBouts: this.stopping.complete.length, groomingBouts: this.grooming.complete.length, feedingBouts: this.feeding.complete.length, airborneBouts: this.airborne.complete.length, saccades: this.saccades.complete.length, saccadeAngles: this.saccadeAngles.length },
      censoring: Object.fromEntries(['walking', 'stopping', 'grooming', 'feeding', 'airborne', 'saccades'].map(name => {
        const b = this[name as 'walking'];
        return [name, { left: b.censored, right: b.rightCensored ? 1 : 0 }];
      })),
      histogramOverflowSeconds: { speed: this.speed.overflow, yaw: this.yawSpeed.overflow },
    };
  }
}

/** Linear distance outside an acceptance band, reaching zero one additional tolerance away. */
export function distanceScore(value: number, target: number, tolerance: number): number {
  if (![value, target, tolerance].every(Number.isFinite) || tolerance <= 0) throw new Error('invalid scoring input');
  return 10 * Math.max(0, 1 - Math.max(0, Math.abs(value - target) - tolerance) / tolerance);
}
