// Where the things the player can point at were drawn. Each screen records
// its targets as it draws them, so what a tap or a click lands on is exactly
// what is on screen, wherever the layout put it, and nothing is laid out
// twice. Recording is off where nothing points (the Apple TV).

export type Hit = {
  /** What it is, in the screen's own words: "row", "tool", "chevron"... */
  kind: string;
  /** Which one (a row's index, a tool's), and a second number if it needs one (a chevron's direction). */
  index: number;
  value: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export class HitMap {
  /** Off: `add` records nothing. */
  enabled = true;
  /** What drew the targets now recorded (a screen's id): the frame may show something newer that hasn't been drawn yet. */
  owner = "";
  count = 0;
  readonly #hits: Hit[] = [];

  /** Starts a new drawing's targets. */
  begin(owner: string) {
    this.owner = owner;
    this.count = 0;
  }

  /** Records a target drawn at x, y, w × h (design units). Later targets are over earlier ones. */
  add(kind: string, x: number, y: number, w: number, h: number, index = 0, value = 0) {
    if (!this.enabled) return;
    let hit = this.#hits[this.count];
    if (!hit) this.#hits[this.count] = hit = { kind, index, value, x, y, w, h };
    hit.kind = kind;
    hit.index = index;
    hit.value = value;
    hit.x = x;
    hit.y = y;
    hit.w = w;
    hit.h = h;
    this.count++;
  }

  /** The `i`th target recorded, oldest first. */
  get(i: number): Hit | null {
    return i < this.count ? this.#hits[i] : null;
  }

  /**
   * The target at a point: the topmost drawn over it, or else the nearest
   * within `slop` (a fingertip is wider than what it means to touch).
   */
  at(x: number, y: number, slop = 0): Hit | null {
    let near: Hit | null = null;
    let best = slop;
    for (let i = this.count - 1; i >= 0; i--) {
      const h = this.#hits[i];
      const dx = Math.max(h.x - x, 0, x - (h.x + h.w));
      const dy = Math.max(h.y - y, 0, y - (h.y + h.h));
      if (dx === 0 && dy === 0) return h;
      const d = Math.hypot(dx, dy);
      if (d < best) {
        best = d;
        near = h;
      }
    }
    return near;
  }
}
