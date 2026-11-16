// Every sound, synthesised into buffers when the game starts: the Apple TV's
// audio has gain automation and buffer sources but no oscillators or filters,
// so the waveforms and the filtering are worked out here, sample by sample.
//
// The wing buzz follows the wings, the feet patter while it walks, and the
// outdoors (a breeze, the lake, birds now and then) plays quietly underneath.

export type Sound = "move" | "select" | "back" | "blocked" | "tick" | "tool" | "drop" | "land" | "swoop" | "pop" | "takeoff" | "eat" | "open";

import { followParam } from "./follow.ts";

const TAU = Math.PI * 2;
const RATE = 22050;

/** A deterministic noise source, so every start sounds the same. */
function noise(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2147483648 - 1;
  };
}

type Synth = (t: number, i: number) => number;

function render(ctx: BaseAudioContext, seconds: number, synth: Synth, rate = RATE): AudioBuffer {
  const length = Math.max(1, Math.round(seconds * rate));
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = synth(i / rate, i);
  return buffer;
}

/** A bell-ish tone: a few partials with their own decays. */
const bell = (f: number, t: number, decay: number) =>
  Math.exp(-t * decay) * (Math.sin(TAU * f * t) * 0.6 + Math.sin(TAU * f * 2.01 * t) * 0.25 * Math.exp(-t * decay) + Math.sin(TAU * f * 3.02 * t) * 0.12 * Math.exp(-t * decay * 2));

const attack = (t: number, a = 0.004) => Math.min(1, t / a);

function synthesise(ctx: BaseAudioContext): Record<Sound, AudioBuffer> {
  const n1 = noise(1);
  const n2 = noise(2);
  const n3 = noise(3);
  let low = 0;
  return {
    move: render(ctx, 0.09, (t) => attack(t) * bell(1760, t, 45) * 0.5),
    tick: render(ctx, 0.06, (t) => attack(t) * bell(2350, t, 70) * 0.35),
    select: render(ctx, 0.45, (t) => attack(t) * (bell(1046.5, t, 9) * 0.5 + (t > 0.07 ? bell(1568, t - 0.07, 8) * 0.5 : 0))),
    back: render(ctx, 0.35, (t) => attack(t) * (bell(1318.5, t, 12) * 0.45 + (t > 0.06 ? bell(880, t - 0.06, 10) * 0.45 : 0))),
    blocked: render(ctx, 0.14, (t) => attack(t) * Math.exp(-t * 30) * Math.sin(TAU * (220 - t * 300) * t) * 0.5),
    tool: render(ctx, 0.16, (t) => attack(t) * Math.exp(-t * 18) * Math.sin(TAU * (520 + t * 2600) * t) * 0.4),
    open: render(ctx, 0.4, (t) => attack(t, 0.02) * Math.exp(-t * 7) * (Math.sin(TAU * 659 * t) + Math.sin(TAU * 988 * t) * 0.6) * 0.3),
    drop: render(ctx, 0.25, (t) => attack(t) * Math.exp(-t * 16) * Math.sin(TAU * (1500 * Math.exp(-t * 9) + 400) * t) * 0.5),
    land: render(ctx, 0.12, (t) => attack(t, 0.002) * Math.exp(-t * 40) * (Math.sin(TAU * 300 * t) * 0.4 + n1() * 0.15)),
    pop: render(ctx, 0.08, (t) => attack(t, 0.001) * Math.exp(-t * 60) * (Math.sin(TAU * (2600 - t * 9000) * t) * 0.4 + n2() * 0.25)),
    eat: render(ctx, 0.3, (t) => attack(t, 0.01) * Math.exp(-t * 9) * Math.sin(TAU * (300 + Math.sin(t * 60) * 80) * t) * 0.25),
    takeoff: render(ctx, 0.3, (t) => attack(t, 0.005) * Math.exp(-t * 10) * Math.sin(TAU * (260 + t * 900) * t) * 0.35),
    swoop: render(ctx, 1.4, (t) => {
      // Noise through a one-pole low-pass that opens and closes: air rushing past.
      const shape = Math.sin(Math.PI * Math.min(1, t / 1.4));
      const k = 0.04 + 0.4 * shape * shape;
      low += (n3() - low) * k;
      return low * shape * 0.9;
    }),
  };
}

/** The buzz of beating wings, ~220 Hz with its harmonics, made to loop seamlessly. */
function wingLoop(ctx: BaseAudioContext) {
  const f = 220;
  const seconds = 50 / f;
  return render(ctx, seconds, (t) => {
    const p = (t * f) % 1;
    // A rounded saw: rich but not harsh.
    const saw = 2 * p - 1;
    return (saw * 0.35 + Math.sin(TAU * f * t) * 0.4 + Math.sin(TAU * 2 * f * t) * 0.15) * 0.6;
  });
}

/** Tiny feet: soft irregular ticks, to loop while it walks. */
function feetLoop(ctx: BaseAudioContext) {
  const r = noise(7);
  const ticks: number[] = [];
  for (let t = 0; t < 1; t += 0.055 + (r() + 1) * 0.02) ticks.push(t);
  return render(ctx, 1, (t) => {
    let s = 0;
    for (const at of ticks) {
      const d = t - at;
      if (d >= 0 && d < 0.02) s += Math.exp(-d * 400) * Math.sin(TAU * 3200 * d) * 0.3;
    }
    return s;
  });
}

/** Outdoors: a breeze and the lake lapping, eight seconds that loop. */
function outdoorsLoop(ctx: BaseAudioContext) {
  const r = noise(11);
  const seconds = 8;
  let a = 0;
  let b = 0;
  const length = seconds * RATE;
  return render(ctx, seconds, (_t, i) => {
    a += (r() - a) * 0.02;
    b += (a - b) * 0.05;
    // Swells that loop: whole cycles over the eight seconds.
    const swell = 0.55 + 0.25 * Math.sin((TAU * 2 * i) / length) + 0.2 * Math.sin((TAU * 5 * i) / length + 1);
    const lap = Math.max(0, Math.sin((TAU * 3 * i) / length)) ** 4 * 0.6;
    // Cross-fade the loop's ends so it joins without a click.
    const edge = Math.min(1, i / 2000, (length - i) / 2000);
    return (b * 6 * swell + a * lap * 0.8) * edge * 0.5;
  });
}

/** A bird's chirp: quick upward sweeps. */
function chirp(ctx: BaseAudioContext, seed: number) {
  const r = noise(seed);
  const notes = 2 + Math.floor((r() + 1) * 2);
  const base = 2600 + r() * 600;
  return render(ctx, notes * 0.11, (t) => {
    const k = Math.floor(t / 0.11);
    const u = t - k * 0.11;
    const f = base + u * 9000 + k * 120;
    return attack(u, 0.005) * Math.exp(-u * 30) * Math.sin(TAU * f * u) * 0.25;
  });
}

type Loop = { source: AudioBufferSourceNode; gain: GainNode };

export class Audio {
  readonly ctx: AudioContext | null;
  #effects: GainNode | null = null;
  #outdoors: GainNode | null = null;
  #buffers: Record<Sound, AudioBuffer> | null = null;
  #wings: Loop | null = null;
  #feet: Loop | null = null;
  #chirps: AudioBuffer[] = [];
  #nextChirp = 8;
  #started = false;

  constructor() {
    let ctx: AudioContext | null;
    try {
      const Ctor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
      ctx = Ctor ? new Ctor() : null;
    } catch {
      ctx = null;
    }
    this.ctx = ctx;
  }

  /** Builds the sounds and starts the loops. Call from a key press, so browsers allow sound. */
  start(effects: number, ambience: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume?.();
    if (this.#started) return;
    this.#started = true;
    try {
      this.#effects = ctx.createGain();
      this.#effects.connect(ctx.destination);
      this.#outdoors = ctx.createGain();
      this.#outdoors.connect(ctx.destination);
      this.setVolumes(effects, ambience);
      this.#buffers = synthesise(ctx);
      this.#wings = this.#loop(wingLoop(ctx), this.#effects);
      this.#feet = this.#loop(feetLoop(ctx), this.#effects);
      this.#loop(outdoorsLoop(ctx), this.#outdoors).gain.gain.value = 1;
      this.#chirps = [chirp(ctx, 21), chirp(ctx, 22), chirp(ctx, 23)];
    } catch {
      this.#buffers = null;
    }
  }

  #loop(buffer: AudioBuffer, out: GainNode): Loop {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(out);
    source.start();
    return { source, gain };
  }

  setVolumes(effects: number, ambience: number) {
    const ctx = this.ctx;
    if (!ctx || !this.#effects || !this.#outdoors) return;
    // Volumes 0 to 10, on a gentle curve.
    this.#effects.gain.setTargetAtTime((effects / 10) ** 2 * 0.8, ctx.currentTime, 0.05);
    this.#outdoors.gain.setTargetAtTime((ambience / 10) ** 2 * 0.5, ctx.currentTime, 0.2);
  }

  play(sound: Sound, volume = 1, rate = 1) {
    const ctx = this.ctx;
    if (!ctx || !this.#buffers || !this.#effects) return;
    const source = ctx.createBufferSource();
    source.buffer = this.#buffers[sound];
    source.playbackRate.value = rate;
    if (volume !== 1) {
      const gain = ctx.createGain();
      gain.gain.value = volume;
      source.connect(gain);
      gain.connect(this.#effects);
    } else source.connect(this.#effects);
    source.start();
  }

  /**
   * Follows the fly each frame: how hard its wings beat (0 to 1), how fast it
   * walks (0 to 1), and how near the camera is (1 close, 0 far), which sets
   * how loud the fly's own sounds are.
   */
  follow(wings: number, walking: number, near: number, dt: number) {
    const ctx = this.ctx;
    if (!ctx || !this.#wings || !this.#feet) return;
    const now = ctx.currentTime;
    followParam(this.#wings.gain.gain, Math.min(1, wings) * 0.35 * near, now, 0.03);
    followParam(this.#wings.source.playbackRate, 0.85 + wings * 0.3, now, 0.05);
    followParam(this.#feet.gain.gain, Math.min(1, walking) * 0.25 * near, now, 0.05);
    // Now and then, a bird.
    this.#nextChirp -= dt;
    if (this.#nextChirp <= 0 && this.#outdoors && this.#chirps.length) {
      this.#nextChirp = 6 + Math.random() * 14;
      const source = ctx.createBufferSource();
      source.buffer = this.#chirps[Math.floor(Math.random() * this.#chirps.length)];
      source.playbackRate.value = 0.9 + Math.random() * 0.25;
      source.connect(this.#outdoors);
      source.start();
    }
  }
}
