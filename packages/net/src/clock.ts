// The room's clock on a device. Everything shared is timed by it: when a
// fly was where it says, when a ball starts its dive, when a bubble was
// blown. A device knows only its own clock, so it asks the room the time
// now and then and keeps the answer from the quickest round trip (the one
// least skewed by the network), easing toward it rather than jumping, so
// nothing drawn from it ever leaps.

/** How many recent round trips are weighed. */
const SAMPLES = 8;
/** Offsets further off than this (ms) are taken at once instead of eased into: the first, or a clock that jumped. */
const SNAP = 250;
/** How much of the gap the clock closes each second when easing. */
const SLEW = 0.5;

export class RoomClock {
  /** Room time is local time plus this, ms. */
  offset = 0;
  /** The quickest recent round trip, ms. */
  rtt = 0;
  synced = false;
  #samples: { rtt: number; offset: number }[] = [];
  #target = 0;

  /** A round trip: sent at `sent` and answered at `received` (local ms) with the room's time `roomNow`. */
  sample(sent: number, roomNow: number, received: number) {
    const rtt = Math.max(0, received - sent);
    const offset = roomNow + rtt / 2 - received;
    this.#samples.push({ rtt, offset });
    if (this.#samples.length > SAMPLES) this.#samples.shift();
    let best = this.#samples[0];
    for (const s of this.#samples) if (s.rtt < best.rtt) best = s;
    this.rtt = best.rtt;
    this.#target = best.offset;
    if (!this.synced || Math.abs(this.#target - this.offset) > SNAP) this.offset = this.#target;
    this.synced = true;
  }

  /** Forgets what it knew: a new connection, perhaps to a room restarted with a clock of its own. */
  reset() {
    this.#samples.length = 0;
    this.synced = false;
    this.rtt = 0;
  }

  /** Eases the offset toward the best estimate; call each frame. */
  update(dt: number) {
    if (!this.synced) return;
    this.offset += (this.#target - this.offset) * Math.min(1, dt * SLEW);
  }

  /** Room time now, ms, for a local time. */
  now(local: number) {
    return local + this.offset;
  }
}

/**
 * The table's clock: local hours since the epoch, in the starter's time zone,
 * at a room time. `wall` is the wall clock (ms since 1970) at room time
 * `at`; `offset` is the zone's offset from UTC, minutes east. The light on
 * "Now" and the made-up forecast are read from it, the same on every device.
 */
export const tableHours = (roomNow: number, at: number, wall: number, offset: number) => (wall + roomNow - at) / 3_600_000 + offset / 60;
