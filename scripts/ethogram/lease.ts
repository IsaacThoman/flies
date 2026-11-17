// Long audits yield the shared Mac between CPU batches without resetting the animal.
import { mkdirSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { setTimeout as delay, setImmediate as yieldTurn } from 'node:timers/promises';

export class HeavyLease {
  #slot: string | null = null;
  #acquired = 0;
  #released = -Infinity;
  #branch: string;
  constructor(branch: string) { this.#branch = branch; }
  release() {
    if (!this.#slot) return;
    unlinkSync(`${this.#slot}/owner`);
    rmdirSync(this.#slot);
    this.#slot = null;
    this.#released = performance.now();
  }
  async checkpoint() {
    // A resolved promise alone would starve signal handlers during a long CPU loop.
    await yieldTurn();
    if (this.#slot && performance.now() - this.#acquired < 570_000) return;
    this.release();
    while (performance.now() - this.#released < 120_000) await delay(1000);
    mkdirSync('/tmp/flies-heavy', { recursive: true });
    while (!this.#slot) {
      for (let n = 1; n <= 8; n++) {
        const slot = `/tmp/flies-heavy/slot-${n}`;
        try { mkdirSync(slot); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue; throw error; }
        this.#slot = slot;
        this.#acquired = performance.now();
        writeFileSync(`${slot}/owner`, `${this.#branch}\n`, { flag: 'wx' });
        break;
      }
      if (!this.#slot) await delay(1000);
    }
  }
}
