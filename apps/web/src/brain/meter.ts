// What the brain has been doing lately, for the screens that show it: spikes
// per second of fly time, how fast it runs against real time, and a short
// history of both. Fed from whichever driver is running; allocates nothing
// once built.

import type { BrainDriver } from "@fly/contracts";

/** Seconds of history kept for the graphs, and how many samples. */
export const HISTORY_SECONDS = 20;
export const HISTORY_SAMPLES = 80;

export class BrainMeter {
  /** Spikes per second of fly time, over about the last second. */
  spikesPerSecond = 0;
  /** Fly time simulated per unit of real time: 1 is real time. */
  speed = 0;
  /** Neurons active at the end of the last tick. */
  active = 0;
  /** Spikes per second at evenly spaced moments, oldest first: `history[(head + i) % length]`. */
  readonly history = new Float32Array(HISTORY_SAMPLES);
  head = 0;
  #lastAt = -1;
  #windowSpikes = 0;
  #windowSim = 0;
  #windowStart = -1;
  #sampleAt = -1;

  /** Call every frame with the driver and `performance.now()`. */
  update(driver: BrainDriver, now: number) {
    if (driver.status !== "running" || !driver.state) {
      if (now - this.#lastAt > 2000) {
        this.spikesPerSecond = 0;
        this.speed = 0;
      }
    } else if (driver.stateAt !== this.#lastAt) {
      this.#lastAt = driver.stateAt;
      const { stats } = driver.state;
      if (this.#windowStart < 0) this.#windowStart = now;
      this.#windowSpikes += stats.spikes;
      this.#windowSim += stats.simMs;
      this.active = stats.active;
      const span = now - this.#windowStart;
      if (span >= 1000) {
        this.spikesPerSecond = this.#windowSim > 0 ? this.#windowSpikes / (this.#windowSim / 1000) : 0;
        this.speed = this.#windowSim / span;
        this.#windowSpikes = 0;
        this.#windowSim = 0;
        this.#windowStart = now;
      }
    }
    const every = (HISTORY_SECONDS * 1000) / HISTORY_SAMPLES;
    if (this.#sampleAt < 0) this.#sampleAt = now;
    while (now - this.#sampleAt >= every) {
      this.#sampleAt += every;
      this.history[this.head] = this.spikesPerSecond;
      this.head = (this.head + 1) % HISTORY_SAMPLES;
    }
  }
}
