// Every sound, synthesised into buffers when the game starts: the Apple TV's
// audio has gain automation and buffer sources but no oscillators or filters,
// so the waveforms and the filtering are worked out here, sample by sample.
//
// The wing buzz follows the wings, the feet patter while it walks, and the
// place's own sound (at the picnic a breeze, the lake and birds now and then)
// plays quietly underneath.

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

/**
 * A lab: the air handling's steady hush and the hum of the lights, the
 * fridge's compressor starting with a thud, running for most of a minute and
 * shuddering to a stop, and once a distant double beep. A minute and a half,
 * so the compressor and the beep come round rarely; at a low rate, as
 * nothing in it is high. Its end is blended into its start, so it loops
 * without a seam.
 */
function labLoop(ctx: BaseAudioContext) {
  const rate = 8000;
  const seconds = 90;
  const n = seconds * rate;
  const overlap = rate * 2;
  const data = new Float32Array(n + overlap);
  const r = noise(31);
  const on = 12;
  const off = 54;
  const beep = 74;
  // Hums as turning phasors: a sine a sample costs a few multiplies.
  const phasor = (hz: number) => ({ c: 1, s: 0, dc: Math.cos((TAU * hz) / rate), ds: Math.sin((TAU * hz) / rate) });
  const turn = (p: ReturnType<typeof phasor>) => {
    const c = p.c * p.dc - p.s * p.ds;
    p.s = p.c * p.ds + p.s * p.dc;
    p.c = c;
    return p.s;
  };
  const lights = phasor(120);
  const lights2 = phasor(240);
  const motor = phasor(98);
  const motor2 = phasor(196);
  let air = 0;
  let air2 = 0;
  let rumble = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    air += (r() - air) * 0.09;
    air2 += (air - air2) * 0.14;
    // A slow breath in the air, whole cycles over the loop.
    let s = air2 * 1.3 * (0.86 + 0.14 * Math.sin((TAU * 4 * i) / n));
    s += turn(lights) * 0.01 + turn(lights2) * 0.004;
    // The compressor: eased in and out, a low motor tone and a rumble.
    const running = Math.min(1, Math.max(0, (t - on) / 1.5)) * Math.min(1, Math.max(0, (off - t) / 2.5));
    rumble += (r() - rumble) * 0.03;
    const m1 = turn(motor);
    const m2 = turn(motor2);
    if (running > 0) s += running * (m1 * 0.045 + m2 * 0.02 + rumble * 0.5) * (0.92 + 0.08 * Math.sin(TAU * 1.7 * t));
    // Its thud as it starts, and its shudder as it stops.
    const since = t - on;
    if (since > 0 && since < 0.4) s += Math.exp(-since * 14) * Math.sin(TAU * 46 * since) * 0.16;
    const after = t - off;
    if (after > 0 && after < 1.2) s += Math.exp(-after * 4) * Math.sin(TAU * 31 * after) * Math.sin(TAU * 7 * after) * 0.09;
    // A distant beep, twice, with the room's echo.
    for (const [delay, gain] of [[0, 1], [0.07, 0.35], [0.16, 0.15]]) {
      for (const at of [beep, beep + 0.2]) {
        const u = t - at - delay;
        if (u > 0 && u < 0.11) s += Math.min(1, u / 0.004, (0.11 - u) / 0.01) * Math.sin(TAU * 1760 * u) * 0.028 * gain;
      }
    }
    data[i] = s;
  }
  for (let i = 0; i < overlap; i++) {
    const k = i / overlap;
    data[i] = data[i] * k + data[n + i] * (1 - k);
  }
  return render(ctx, seconds, (_t, i) => data[i], rate);
}

/**
 * A quiet bar: a few people talking low across the room (no words: voiced
 * sound through formants that move as speech does, in phrases, muffled by
 * the distance), the room's low hum, and now and then two glasses touching,
 * ice settling, a glass set down. Twenty seconds that loop, rendered at a
 * low rate (it is all below 4 kHz) and joined by cross-fading the tail into
 * the head, so the join is a lull like any other.
 */
function barLoop(ctx: BaseAudioContext) {
  const rate = 8000;
  const seconds = 20;
  const length = seconds * rate;
  const join = Math.round(rate * 0.6);
  const out = new Float32Array(length + join);
  const r = noise(31);
  // The room: a low, slow rumble.
  let a = 0;
  let b = 0;
  for (let i = 0; i < out.length; i++) {
    a += (r() - a) * 0.027;
    b += (a - b) * 0.04;
    out[i] = b * 0.8;
  }
  // Voices: phrases of syllables, each a glottal buzz through two resonances gliding toward a vowel.
  const voices = [
    { seed: 41, f0: 118, gain: 0.05 },
    { seed: 42, f0: 196, gain: 0.035 },
    { seed: 43, f0: 142, gain: 0.03 },
  ];
  const murmur = new Float32Array(out.length);
  for (const v of voices) {
    const rv = noise(v.seed);
    const rnd = () => (rv() + 1) / 2;
    let t = 0.3 + rnd() * 2;
    while (t < seconds + 0.3) {
      const end = t + 1.4 + rnd() * 2.6;
      const syllables: { at: number; len: number; f1: number; f2: number; amp: number }[] = [];
      for (let s = t; s < end; s += 0.16 + rnd() * 0.14) syllables.push({ at: s, len: 0.12 + rnd() * 0.12, f1: 320 + rnd() * 450, f2: 950 + rnd() * 1250, amp: 0.4 + rnd() * 0.6 });
      let phase = 0;
      let f1 = syllables[0].f1;
      let f2 = syllables[0].f2;
      let y1 = 0;
      let y2 = 0;
      let z1 = 0;
      let z2 = 0;
      const i0 = Math.floor(t * rate);
      const i1 = Math.min(murmur.length, Math.ceil((end + 0.3) * rate));
      let k = 0;
      // Everything that changes slowly (the syllable's loudness, the pitch, the resonances) is worked out a block at a time.
      for (let block = i0; block < i1; block += 32) {
        const time = block / rate;
        while (k < syllables.length - 1 && time > syllables[k].at + syllables[k].len) k++;
        const syl = syllables[k];
        const u = (time - syl.at) / syl.len;
        const env = u > 0 && u < 1 ? Math.sin(Math.PI * u) ** 1.5 * syl.amp * v.gain * 6 : 0;
        f1 += (syl.f1 - f1) * 0.25;
        f2 += (syl.f2 - f2) * 0.25;
        const r1 = Math.exp((-Math.PI * 90) / rate);
        const r2 = Math.exp((-Math.PI * 140) / rate);
        const a1 = 2 * r1 * Math.cos((TAU * f1) / rate);
        const a2 = -r1 * r1;
        const g1 = 1 - r1;
        const b1 = 2 * r2 * Math.cos((TAU * f2) / rate);
        const b2 = -r2 * r2;
        const g2 = (1 - r2) * 0.6;
        // Speech falls in pitch through a phrase, and wavers.
        const step = (v.f0 * (1.06 - (0.14 * (time - t)) / (end - t)) * (1 + 0.04 * Math.sin(time * 5.1 + v.seed))) / rate;
        const last = Math.min(i1, block + 32);
        for (let i = block; i < last; i++) {
          phase += step;
          if (phase >= 1) phase -= 1;
          const source = (1 - 2 * phase) * 0.6 + rv() * 0.25;
          const y = g1 * source + a1 * y1 + a2 * y2;
          y2 = y1;
          y1 = y;
          const z = g2 * source + b1 * z1 + b2 * z2;
          z2 = z1;
          z1 = z;
          murmur[i] += (y + z) * env;
        }
      }
      t = end + 0.5 + rnd() * 1.6;
    }
  }
  // Across the room: muffled.
  let m = 0;
  for (let i = 0; i < out.length; i++) {
    m += (murmur[i] - m) * 0.56;
    out[i] += m;
  }
  const at = (time: number, len: number, synth: (t: number) => number) => {
    const i0 = Math.round(time * rate);
    for (let i = 0; i < len * rate && i0 + i < out.length; i++) out[i0 + i] += synth(i / rate);
  };
  // Glass: a few inharmonic partials, the higher ones dying first.
  const ring = (f: number, t: number, decay: number) => Math.exp(-t * decay) * (Math.sin(TAU * f * t) + Math.sin(TAU * f * 2.32 * t) * 0.5 * Math.exp(-t * decay) + Math.sin(TAU * f * 2.71 * t) * 0.3 * Math.exp(-t * decay * 2));
  // Two glasses touching.
  at(3.6, 1.4, (t) => attack(t, 0.0006) * (ring(1380, t, 5) + ring(1460, Math.max(0, t - 0.003), 6) * 0.8) * 0.035);
  // Ice settling in a glass: a few small knocks, and the glass answering faintly.
  for (const [dt, f] of [[0, 2500], [0.07, 2800], [0.16, 2350], [0.21, 2650]]) at(11.4 + dt, 0.3, (t) => attack(t, 0.0004) * (Math.exp(-t * 90) * Math.sin(TAU * f * t) + Math.exp(-t * 22) * Math.sin(TAU * f * 0.5 * t) * 0.3) * 0.022);
  // A glass set down on the wood.
  at(16.3, 0.5, (t) => attack(t, 0.0008) * (Math.exp(-t * 35) * Math.sin(TAU * 170 * t) * 0.8 + ring(1300, t, 16) * 0.2) * 0.04);
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = out[i];
  for (let i = 0; i < join; i++) {
    const k = i / join;
    data[i] = out[i] * k + out[length + i] * (1 - k);
  }
  return buffer;
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

/** The sound of a place, under everything else: its loop, and whether birds call now and then. */
export type Ambience = "outdoors" | "lab" | "bar";

const AMBIENCES: Record<Ambience, { loop: (ctx: BaseAudioContext) => AudioBuffer; birds: boolean }> = {
  outdoors: { loop: outdoorsLoop, birds: true },
  lab: { loop: labLoop, birds: false },
  bar: { loop: barLoop, birds: false },
};

type Loop = { source: AudioBufferSourceNode; gain: GainNode };

export class Audio {
  readonly ctx: AudioContext | null;
  #effects: GainNode | null = null;
  #ambient: GainNode | null = null;
  #buffers: Record<Sound, AudioBuffer> | null = null;
  #wings: Loop | null = null;
  #feet: Loop | null = null;
  #chirps: AudioBuffer[] = [];
  #nextChirp = 8;
  #started = false;
  #ambience: Ambience = "outdoors";
  #place: Loop | null = null;
  #loops = new Map<Ambience, AudioBuffer>();

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
      this.#ambient = ctx.createGain();
      this.#ambient.connect(ctx.destination);
      this.setVolumes(effects, ambience);
      this.#buffers = synthesise(ctx);
      this.#wings = this.#loop(wingLoop(ctx), this.#effects);
      this.#feet = this.#loop(feetLoop(ctx), this.#effects);
      this.#chirps = [chirp(ctx, 21), chirp(ctx, 22), chirp(ctx, 23)];
      this.#playAmbience();
    } catch {
      this.#buffers = null;
    }
  }

  /** Changes to another place's sound, fading the old one out. */
  setAmbience(ambience: Ambience) {
    if (ambience === this.#ambience) return;
    this.#ambience = ambience;
    if (this.#started) this.#playAmbience();
  }

  #playAmbience() {
    const ctx = this.ctx;
    if (!ctx || !this.#ambient) return;
    const old = this.#place;
    if (old) {
      old.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
      old.source.stop(ctx.currentTime + 2);
    }
    // Each place's loop is synthesised the first time it is needed, and kept.
    let buffer = this.#loops.get(this.#ambience);
    if (!buffer) this.#loops.set(this.#ambience, (buffer = AMBIENCES[this.#ambience].loop(ctx)));
    this.#place = this.#loop(buffer, this.#ambient);
    this.#place.gain.gain.setTargetAtTime(1, ctx.currentTime, 0.4);
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
    if (!ctx || !this.#effects || !this.#ambient) return;
    // Volumes 0 to 10, on a gentle curve.
    this.#effects.gain.setTargetAtTime((effects / 10) ** 2 * 0.8, ctx.currentTime, 0.05);
    this.#ambient.gain.setTargetAtTime((ambience / 10) ** 2 * 0.5, ctx.currentTime, 0.2);
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
    if (this.#nextChirp <= 0 && this.#ambient && this.#chirps.length && AMBIENCES[this.#ambience].birds) {
      this.#nextChirp = 6 + Math.random() * 14;
      const source = ctx.createBufferSource();
      source.buffer = this.#chirps[Math.floor(Math.random() * this.#chirps.length)];
      source.playbackRate.value = 0.9 + Math.random() * 0.25;
      source.connect(this.#ambient);
      source.start();
    }
  }
}
