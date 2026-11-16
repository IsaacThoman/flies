// A choice in a menu that costs something to act on (carrying the fly to
// another place builds the whole place behind a veil), acted on only once
// the player has settled on it: a pause on one value, or leaving its row or
// the screen. Stepping through the values on the way costs nothing.

/** Seconds on one value, still on its row, that settle it. */
export const SETTLE = 1;

export class Settle {
  /** Seconds since the last change, or -1 with nothing waiting. */
  #wait = -1;
  #choosing: () => boolean;
  #act: () => void;

  /** `choosing`: whether the player is on the choice's row now; `act`: what settling it does. */
  constructor(choosing: () => boolean, act: () => void) {
    this.#choosing = choosing;
    this.#act = act;
  }

  /** The settings changed: from the choice's row, it waits afresh; from anywhere else (another row, a launch), it is acted on at once. */
  changed() {
    if (this.#choosing()) this.#wait = 0;
    else this.#settle();
  }

  /** `dt` seconds on: acted on once it has rested long enough, or the player has left its row. */
  update(dt: number) {
    if (this.#wait < 0) return;
    this.#wait += dt;
    if (this.#wait >= SETTLE || !this.#choosing()) this.#settle();
  }

  #settle() {
    this.#wait = -1;
    this.#act();
  }
}
