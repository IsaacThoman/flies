// The rest of the kit's state: a ring of choices stepped with left and right
// (the tool shelf), a page of text scrolled with up and down, the stack of
// screens Back walks out of, and an eased value for drawing transitions.

/** A ring of slots chosen with left and right, going round at the ends. */
export class Ring {
  readonly size: number;
  index: number;

  constructor(size: number, index = 0) {
    this.size = Math.max(1, size);
    this.index = ((index % this.size) + this.size) % this.size;
  }

  step(dir: -1 | 1) {
    this.index = (this.index + dir + this.size) % this.size;
    return this.index;
  }
}

/** A page taller than its window, scrolled a line at a time. */
export class Scroller {
  offset = 0;
  /** How far it can scroll: content height minus window height (≥ 0). */
  max = 0;
  readonly line: number;

  constructor(line: number) {
    this.line = line;
  }

  setExtent(content: number, window: number) {
    this.max = Math.max(0, content - window);
    this.offset = Math.min(this.offset, this.max);
  }

  /** Scrolls a line; false at the end it was pushed against. */
  step(dir: -1 | 1): boolean {
    const next = Math.min(this.max, Math.max(0, this.offset + dir * this.line));
    if (next === this.offset) return false;
    this.offset = next;
    return true;
  }
}

/** The screens open, the first at the bottom. Back pops; at the root, Back leaves. */
export class Navigator<S extends string> {
  readonly stack: S[];

  constructor(root: S) {
    this.stack = [root];
  }

  get current(): S {
    return this.stack[this.stack.length - 1];
  }

  get atRoot() {
    return this.stack.length === 1;
  }

  push(screen: S) {
    if (this.current !== screen) this.stack.push(screen);
  }

  /** Back one screen; false at the root. */
  pop(): boolean {
    if (this.atRoot) return false;
    this.stack.pop();
    return true;
  }

  /** Back to the root, or to a new root. */
  reset(root: S = this.stack[0]) {
    this.stack.length = 0;
    this.stack.push(root);
  }

  /** Replaces the current screen without growing the stack. */
  replace(screen: S) {
    this.stack[this.stack.length - 1] = screen;
  }
}

/** A value eased toward a target at a rate (1/s), frame-rate independent. */
export class Eased {
  value: number;
  target: number;
  readonly rate: number;

  constructor(value: number, rate: number) {
    this.value = value;
    this.target = value;
    this.rate = rate;
  }

  /** Advances; true while it is still moving. */
  update(dt: number): boolean {
    if (this.value === this.target) return false;
    const next = this.value + (this.target - this.value) * (1 - Math.exp(-this.rate * Math.max(0, dt)));
    this.value = Math.abs(next - this.target) < 1e-3 ? this.target : next;
    return true;
  }

  snap(value: number) {
    this.value = value;
    this.target = value;
  }
}
