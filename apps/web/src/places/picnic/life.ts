// The picnic's goings-on, run each frame of the fly's life. When it rains,
// drops splash on the table and ring the lemonade's pool, and now and then
// one lands on the fly. While nobody is using the remote, now and then (pace.ts)
// a gust blows, a gull glides over and its shadow sweeps the table, a leaf
// comes down on the wind, a butterfly or a ladybird visits, a sailboat
// crosses the lake, or there is something new on the table to find. Each
// reaches the fly only through its senses (places/types.ts, Felt): the wind
// it feels, a drop or a leaf landing on it, what it sees. None is timed to it
// or aimed at it. At a table with others the table says when each comes,
// and its chances are the table's, so every device sees the same visit. The
// visitors keep clear of whichever fly is nearest them, this device's others
// among them, and a falling leaf brushes any of this device's flies.

import * as THREE from "three";
import type { Food, Vec3, World } from "@fly/world";
import { BREEZE, PATCHES, Pace, SOLIDS, TABLE_RADIUS } from "@fly/world";
import type { Happening } from "@fly/world";
import { paint } from "../../scene/build.ts";
import type { Daylight } from "../../scene/light.ts";
import { SHADE, shaded } from "../../scene/shade.ts";
import type { Weather } from "../../scene/weather.ts";
import type { Around, Felt } from "../types.ts";
import { outside } from "./outside.ts";
import { Rain } from "./rain.ts";
import { Butterfly, Ladybird, Leaves } from "./visitors.ts";

const TAU = Math.PI * 2;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const range = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/** The way the breeze blows over the picnic (toward +x and a little toward the lake, as the bubbles drift). */
export const BREEZE_ANGLE = Math.atan2(BREEZE.z, BREEZE.x);
/** How hard a raindrop landing on the fly touches it (a bubble bursting on it is 0.3), and on average how many seconds pass between one and the next in light rain. */
export const RAIN_TOUCH = 0.25;
export const RAIN_HIT_EVERY = 40;
/** Splashes a second in light rain: round the fly (within 70 mm, where the camera mostly looks, and more within 18 mm, where it looks close up), over the rest of the table, and into the lemonade's pool. */
const SPLASH_RATE = { near: 24, close: 5, far: 10, pool: 1.6 };
/** The gull's shadow, half its length and half its span, mm: a small gull, 80 cm across the wings. */
const GULL_SHADOW = { length: 220, span: 410 };
/** How long things to find last, s, before they dry up or are blown away. */
const JUICE_LASTS = [600, 840] as const;
const CRUMB_LASTS = [900, 1500] as const;

type Found = { food: Food | null; mesh: THREE.Mesh; age: number; lasts: number; from: THREE.Vector3; to: THREE.Vector3; arrive: number; kind: "juice" | "crumb" };

/** The gull's shadow, drawn the first time the picnic is built and kept: every visit casts the same one. */
let gull: THREE.CanvasTexture | null = null;

/** The gull's shadow from above, wings spread, its length along x: white where it shades, soft at the edge as a shadow from high up is. */
function gullShadow() {
  if (gull) return gull;
  const S = 128;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, S, S);
  g.filter = "blur(3px)";
  g.fillStyle = "#fff";
  // Body and tail along x (head at the right), the wings swept back across y.
  g.beginPath();
  g.ellipse(70, 64, 34, 7, 0, 0, TAU);
  g.fill();
  g.beginPath();
  g.moveTo(40, 58);
  g.lineTo(24, 54);
  g.lineTo(24, 74);
  g.lineTo(40, 70);
  g.fill();
  g.beginPath();
  g.moveTo(80, 62);
  g.quadraticCurveTo(76, 30, 52, 6);
  g.quadraticCurveTo(64, 30, 62, 62);
  g.moveTo(80, 66);
  g.quadraticCurveTo(76, 98, 52, 122);
  g.quadraticCurveTo(64, 98, 62, 66);
  g.fill();
  const texture = new THREE.CanvasTexture(canvas);
  // Sampled only where a shadow can fall (scene/shade.ts), where a mipmap level couldn't be chosen; it's soft anyway.
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  gull = texture;
  return texture;
}

export class Goings {
  readonly group = new THREE.Group();
  readonly rain = new Rain();
  /** What of it the fly's eyes can see. */
  readonly seen: THREE.Object3D[];
  readonly #ripple: (x: number, z: number, strength: number) => void;
  readonly #pace = new Pace({ next: Math.random, range });
  readonly #butterfly = new Butterfly();
  readonly #ladybird = new Ladybird();
  readonly #leaves = new Leaves();
  readonly #gust = { on: false, t: 0, length: 0, peak: 0, angle: 0, crumb: -1 };
  readonly #gull = { t: 0, length: 0, speed: 0, height: 0, heading: 0, x: 0, z: 0 };
  readonly #boat = { speed: 0 };
  readonly #found: Found[] = [];
  readonly #shadowMap = gullShadow();
  #light: Daylight | null = null;
  #world: World | null = null;
  #fly: Readonly<Vec3> = { x: 0, y: 0, z: 0 };
  #wind = { x: 0, z: 0 };
  #splashes = { near: 0, close: 0, far: 0, pool: 0 };
  #time = 0;
  #last = -1;
  /** This visit's chances: the device's own, or the table's (`happen`). */
  #random: () => number = Math.random;
  #around: Around | null = null;

  constructor(ripple: (x: number, z: number, strength: number) => void) {
    this.#ripple = ripple;
    outside.gust.x = outside.gust.z = outside.gust.strength = 0;
    outside.gull.on = false;
    outside.boat.on = false;
    SHADE.uShadeSize.value.z = 0;
    SHADE.uShadeMap.value = this.#shadowMap;
    // Things to find: two drops of juice and two crumbs at most at once.
    const juice = shaded(new THREE.MeshStandardMaterial({ color: "#b8001f", roughness: 0.08, envMapIntensity: 1.6 }));
    const crumb = shaded(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
    const bead = new THREE.SphereGeometry(1, 14, 7, 0, TAU, 0, Math.PI / 2).scale(1.15, 0.42, 1.15);
    const lump = new THREE.IcosahedronGeometry(0.8, 1);
    {
      const pos = lump.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const k = 0.8 + 0.35 * Math.abs(Math.sin(pos.getX(i) * 7.1 + pos.getZ(i) * 4.3));
        pos.setXYZ(i, pos.getX(i) * k, Math.max(0, pos.getY(i) + 0.25) * 0.5 * k, pos.getZ(i) * k);
      }
    }
    const crumbGeometry = paint(lump, (p) => (p.y > 0.3 ? "#e9b464" : Math.sin(p.x * 9 + p.z * 7) > 0.4 ? "#b5722e" : "#d39446"));
    for (const kind of ["juice", "juice", "crumb", "crumb"] as const) {
      const mesh = new THREE.Mesh(kind === "juice" ? bead : crumbGeometry, kind === "juice" ? juice : crumb);
      mesh.visible = false;
      this.#found.push({ food: null, mesh, age: 0, lasts: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), arrive: 0, kind });
    }
    this.seen = [this.#butterfly.mesh, this.#ladybird.mesh, this.#leaves.resting, this.#leaves.loose, ...this.#found.map((f) => f.mesh)];
    this.group.add(this.rain.group, ...this.seen);
  }

  /** The visible part, each frame: the rain and the gull's shadow follow the light and the weather. */
  update(time: number, light: Daylight, weather: Weather) {
    const dt = this.#last < 0 ? 0 : Math.min(0.1, Math.max(0, time - this.#last));
    this.#last = time;
    this.#light = light;
    // Rain slants with the day's breeze and with a gust.
    const breeze = weather.wind * 320;
    this.#wind.x = Math.cos(BREEZE_ANGLE) * breeze + outside.gust.x;
    this.#wind.z = Math.sin(BREEZE_ANGLE) * breeze + outside.gust.z;
    this.rain.update(time, dt, light, weather, this.#wind);
    const sun = light.sunDirection;
    if (sun.y > 0.05) SHADE.uShadeSun.value.set(sun.x / sun.y, 1, sun.z / sun.y);
  }

  #range(lo: number, hi: number) {
    return lo + this.#random() * (hi - lo);
  }

  /** At a table with others: the table says this happens now, with this random stream. Something already about isn't started again. */
  happen(kind: Happening, random: () => number) {
    const around = this.#around;
    const busy = (kind === "butterfly" && this.#butterfly.active) || (kind === "ladybird" && this.#ladybird.active) || (kind === "gull" && outside.gull.on) || (kind === "boat" && outside.boat.on) || (kind === "leaf" && !this.#leaves.free) || (kind === "gust" && this.#gust.on);
    if (!around || busy) return;
    this.#random = this.#butterfly.random = this.#ladybird.random = this.#leaves.random = random;
    this.#start(kind, around);
  }

  /** The fly a visitor at `p` keeps clear of: the nearest of this device's and, at a table with others, everyone else's. */
  #nearest(p: Vec3, around: Around): Readonly<Vec3> {
    let best = around.fly;
    let d = Math.hypot(p.x - best.x, p.z - best.z);
    const company = around.company;
    for (let i = 0; i < company.length; i++) {
      const o = company[i];
      const e = Math.hypot(p.x - o.x, p.z - o.z);
      if (e < d) {
        d = e;
        best = o;
      }
    }
    const others = around.shared?.others;
    if (!others) return best;
    for (let i = 0; i < others.length; i++) {
      const o = others[i];
      const e = Math.hypot(p.x - o.x, p.z - o.z);
      if (e < d) {
        d = e;
        best = o;
      }
    }
    return best;
  }

  live(dt: number, around: Around) {
    this.#time += dt;
    this.#around = around;
    const { world, fly, felt, weather } = around;
    this.#world = world;
    // Visits are planned round one fly: this one, or at a table with others the one every device agrees on.
    this.#fly = around.shared ? around.shared.anchor : fly;
    this.#pace.gustiness = 0.4 + weather.wind * 1.6;
    // At a table, the table's pace says when; alone, this one's.
    const next = around.shared ? null : this.#pace.tick(dt, around.quiet, (h) => this.#can(h, weather));
    if (next) {
      this.#random = this.#butterfly.random = this.#ladybird.random = this.#leaves.random = Math.random;
      this.#start(next, around);
    }

    this.#stepGust(dt);
    felt.air.x += outside.gust.x;
    felt.air.z += outside.gust.z;
    const brushed = this.#leaves.step(dt, this.#time, world, fly, outside.gust);
    if (brushed > 0) felt.touch = Math.max(felt.touch, brushed);
    this.#butterfly.step(dt, this.#time, world, this.#nearest(this.#butterfly.looming.position, around));
    this.#ladybird.step(dt, this.#time, world, this.#nearest(this.#ladybird.looming.position, around));
    if (weather.rain > 0.3) this.#ladybird.hurryOff();
    this.#stepGull(dt, weather);
    this.#stepBoat(dt, weather);
    this.#stepFound(dt, around);
    this.#rainOn(dt, around);
    if (this.#butterfly.active) felt.looming.push(this.#butterfly.looming);
    if (this.#ladybird.active) felt.looming.push(this.#ladybird.looming);
    if (this.#leaves.state === "falling") felt.looming.push(this.#leaves.looming);
  }

  /** What this frame's goings-on do to another fly, at `at`: the gust, a falling leaf brushing it, a raindrop now and then, and what it could see coming. */
  feel(dt: number, at: Readonly<Vec3>, felt: Felt) {
    felt.air.x += outside.gust.x;
    felt.air.z += outside.gust.z;
    const brushed = this.#leaves.brush(at);
    if (brushed > 0) felt.touch = Math.max(felt.touch, brushed);
    const rain = this.#around?.weather.rain ?? 0;
    if (rain >= 0.01 && Math.random() < (dt * rain) / RAIN_HIT_EVERY) {
      felt.touch = Math.max(felt.touch, RAIN_TOUCH);
      this.rain.splash(at.x, at.y + 0.9, at.z, 0.9);
    }
    if (this.#butterfly.active) felt.looming.push(this.#butterfly.looming);
    if (this.#ladybird.active) felt.looming.push(this.#ladybird.looming);
    if (this.#leaves.state === "falling") felt.looming.push(this.#leaves.looming);
  }

  /** Whether each can happen now: by the time of day, the weather, and whether one is already about. */
  #can(h: Happening, weather: Weather) {
    const light = this.#light;
    const day = !!light && light.stars < 0.2;
    const dry = weather.rain < 0.02;
    switch (h) {
      case "gust":
        return !this.#gust.on;
      case "gull":
        return !outside.gull.on && day && light.sunUp > 0.25 && weather.cloud < 0.35 && dry && weather.mist < 0.4;
      case "leaf":
        return this.#leaves.free && !this.#gust.on && weather.rain < 0.4;
      case "butterfly":
        return !this.#butterfly.active && day && light.sunUp > 0.1 && dry && weather.cloud < 0.7 && weather.mist < 0.4 && weather.wet < 0.5;
      case "ladybird":
        return !this.#ladybird.active && day && dry && weather.wet < 0.3;
      case "juice":
        return this.#found.some((f) => f.kind === "juice" && !f.mesh.visible);
      case "boat":
        return !outside.boat.on && day && weather.rain < 0.2 && weather.mist < 0.5;
    }
  }

  #start(h: Happening, around: Around) {
    const { world, weather } = around;
    const fly = around.shared ? around.shared.anchor : around.fly;
    switch (h) {
      case "gust":
        this.#startGust(weather, 1);
        // Now and then a gust brings a crumb tumbling across the table.
        if (this.#random() < 0.35) this.#gust.crumb = this.#range(0.8, 2.5);
        break;
      case "leaf":
        // A leaf comes down on a gust of its own.
        this.#startGust(weather, 1.25);
        this.#leaves.start(world, fly, { x: Math.cos(this.#gust.angle) * this.#gust.peak, z: Math.sin(this.#gust.angle) * this.#gust.peak, strength: 1 });
        break;
      case "butterfly":
        this.#butterfly.start(world, fly);
        break;
      case "ladybird":
        this.#ladybird.start(fly);
        break;
      case "gull":
        this.#startGull();
        break;
      case "juice":
        this.#juice(around);
        break;
      case "boat": {
        const from = this.#random() < 0.5 ? -1 : 1;
        Object.assign(outside.boat, { on: true, x: from * 270_000, z: this.#range(-250_000, -160_000), heading: from < 0 ? Math.PI / 2 : -Math.PI / 2, heel: 0 });
        this.#boat.speed = this.#range(1600, 2600) * -from;
        break;
      }
    }
  }

  #startGust(weather: Weather, strength: number) {
    const g = this.#gust;
    g.on = true;
    g.t = 0;
    g.length = this.#range(4, 10);
    g.peak = this.#range(220, 520) * (0.5 + weather.wind) * strength;
    g.angle = BREEZE_ANGLE + this.#range(-0.6, 0.6);
    g.crumb = -1;
  }

  /** A gust rises over a second or two, blows unsteadily, and dies away. */
  #stepGust(dt: number) {
    const g = this.#gust;
    const out = outside.gust;
    if (!g.on) {
      out.x = out.z = out.strength = 0;
      return;
    }
    g.t += dt;
    const swell = smooth(0, 1.6, g.t) * (1 - smooth(g.length - 2.5, g.length, g.t));
    const flutter = 1 + 0.28 * Math.sin(g.t * 6.3) * Math.sin(g.t * 2.9 + 1);
    const speed = g.peak * swell * flutter;
    const angle = g.angle + 0.3 * Math.sin(g.t * 0.8);
    out.x = Math.cos(angle) * speed;
    out.z = Math.sin(angle) * speed;
    out.strength = Math.min(1, speed / 600);
    if (g.crumb > 0 && g.t >= g.crumb) {
      g.crumb = -1;
      this.#crumb(angle);
    }
    if (g.t >= g.length) g.on = false;
  }

  /** A gull gliding high over, its shadow crossing the table somewhere (wherever its line takes it). */
  #startGull() {
    const g = this.#gull;
    const r = Math.sqrt(this.#random()) * 220;
    const a = this.#random() * TAU;
    g.x = Math.cos(a) * r;
    g.z = Math.sin(a) * r;
    g.heading = this.#random() * TAU;
    g.speed = this.#range(750, 1150);
    g.height = this.#range(6000, 9000);
    g.length = 60_000 / g.speed;
    g.t = 0;
    outside.gull.on = true;
  }

  #stepGull(dt: number, weather: Weather) {
    const out = outside.gull;
    if (!out.on) return;
    const g = this.#gull;
    const light = this.#light;
    g.t += dt;
    const s = (g.t - g.length / 2) * g.speed;
    const cx = Math.cos(g.heading);
    const cz = Math.sin(g.heading);
    const shadowX = g.x + cx * s;
    const shadowZ = g.z + cz * s;
    const sun = SHADE.uShadeSun.value;
    out.x = shadowX + sun.x * g.height;
    out.y = g.height;
    out.z = shadowZ + sun.z * g.height;
    out.heading = g.heading;
    // Gliding, with a few beats now and then.
    out.flap = Math.max(0, Math.sin(g.t * 0.45) - 0.75) * 4;
    const sunlit = light ? Math.min(1, light.sunIntensity / 1.2) : 0;
    SHADE.uShadeAt.value.set(shadowX, shadowZ, cx, cz);
    SHADE.uShadeSize.value.set(GULL_SHADOW.length, GULL_SHADOW.span, Math.abs(s) < 1600 ? 0.85 * (1 - weather.cloud) ** 2 * (1 - weather.mist) * sunlit : 0);
    if (g.t >= g.length) {
      out.on = false;
      SHADE.uShadeSize.value.z = 0;
    }
  }

  #stepBoat(dt: number, weather: Weather) {
    const b = outside.boat;
    if (!b.on) return;
    b.x += this.#boat.speed * dt;
    b.heel = 0.12 + weather.wind * 0.15 + outside.gust.strength * 0.12;
    if (Math.abs(b.x) > 280_000) b.on = false;
  }

  /** A drop of juice seeping from the foot of a strawberry onto the cloth. */
  #juice(around: Around) {
    const slot = this.#found.find((f) => f.kind === "juice" && !f.mesh.visible);
    if (!slot) return;
    const berries = SOLIDS.filter((s) => s.name === "strawberry" || s.name === "strawberry half");
    for (let tries = 0; tries < 10; tries++) {
      const berry = berries[Math.floor(this.#random() * berries.length)];
      const f = berry.footprint as { x: number; z: number; rx: number; rz: number; angle: number };
      const t = this.#random() * TAU;
      const u = Math.cos(t) * (f.rx + 1.8);
      const v = Math.sin(t) * (f.rz + 1.8);
      const x = f.x + u * Math.cos(f.angle) + v * Math.sin(f.angle);
      const z = f.z - u * Math.sin(f.angle) + v * Math.cos(f.angle);
      if (around.world.heightAt(x, z) > 0.3) continue;
      const lasts = this.#range(...JUICE_LASTS);
      slot.food = around.pantry.add("strawberry juice", x, z, 1.1, 0.8, undefined, lasts + 20);
      slot.to.set(x, slot.food.y, z);
      slot.from.copy(slot.to);
      this.#show(slot, lasts, 4);
      return;
    }
  }

  /** A crumb blown in on a gust, tumbling to rest somewhere clear and level on the table, not by the fly. */
  #crumb(angle: number) {
    const slot = this.#found.find((f) => f.kind === "crumb" && !f.mesh.visible);
    const world = this.#world;
    if (!slot || !world) return;
    const level = (x: number, z: number) => world.onTable(x, z) && world.heightAt(x, z) < 0.05;
    for (let tries = 0; tries < 10; tries++) {
      const r = Math.sqrt(this.#random()) * 270;
      const a = this.#random() * TAU;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.hypot(x - this.#fly.x, z - this.#fly.z) < 30) continue;
      slot.to.set(x, 0, z);
      slot.from.set(x - Math.cos(angle) * 30, 0, z - Math.sin(angle) * 30);
      let clear = true;
      for (let k = 0; k <= 6 && clear; k++) clear = level(slot.from.x + (x - slot.from.x) * (k / 6), slot.from.z + (z - slot.from.z) * (k / 6));
      if (!clear) continue;
      slot.food = null;
      this.#show(slot, this.#range(...CRUMB_LASTS), 1.3);
      return;
    }
  }

  #show(slot: Found, lasts: number, arrive: number) {
    slot.age = 0;
    slot.lasts = lasts;
    slot.arrive = arrive;
    slot.mesh.visible = true;
    slot.mesh.position.copy(slot.from);
    slot.mesh.scale.setScalar(0.001);
  }

  #stepFound(dt: number, around: Around) {
    const { world, pantry, fly } = around;
    for (const f of this.#found) {
      if (!f.mesh.visible) continue;
      f.age += dt;
      const k = Math.min(1, f.age / f.arrive);
      if (f.kind === "crumb") {
        // Tumbling in; it is food once it lies still, unless it came to rest in something or under the fly.
        if (!f.food) {
          f.mesh.position.lerpVectors(f.from, f.to, smooth(0, 1, k));
          f.mesh.position.y = world.heightAt(f.mesh.position.x, f.mesh.position.z);
          f.mesh.rotation.set(k * 9, 0, k * 4);
          f.mesh.scale.setScalar(1);
          // Rolling to a stop against the fly, it stops short of it.
          if (k >= 1 || Math.hypot(f.mesh.position.x - fly.x, f.mesh.position.z - fly.z) < 3) {
            const { x, z } = f.mesh.position;
            f.food = pantry.add("biscuit crumb", x, z, 0.9, 0.5, undefined, Math.max(0.001, f.lasts + 20 - f.age));
          }
          continue;
        }
      }
      const food = f.food;
      // Eaten up, or dried up or blown away at last.
      if (!food || !pantry.foods.includes(food) || f.age > f.lasts + 20) {
        if (food) pantry.remove(food);
        f.food = null;
        f.mesh.visible = false;
        continue;
      }
      const going = 1 - smooth(f.lasts, f.lasts + 20, f.age);
      f.mesh.scale.setScalar(Math.max(0.001, (f.kind === "juice" ? smooth(0, 1, k) : 1) * going * (0.35 + 0.65 * Math.cbrt(food.amount))));
      f.mesh.position.set(food.x, food.y, food.z);
    }
  }

  /** Rain landing: splashes round the fly and over the table, rings in the lemonade, and now and then a drop on the fly. */
  #rainOn(dt: number, around: Around) {
    const rain = around.weather.rain;
    if (rain < 0.01) return;
    const { world, fly, felt } = around;
    const s = this.#splashes;
    s.near += dt * SPLASH_RATE.near * rain;
    s.close += dt * SPLASH_RATE.close * rain;
    s.far += dt * SPLASH_RATE.far * rain;
    s.pool += dt * SPLASH_RATE.pool * rain;
    for (; s.near >= 1; s.near--) {
      const r = Math.sqrt(Math.random()) * 70;
      const a = Math.random() * TAU;
      this.#land(world, fly.x + Math.cos(a) * r, fly.z + Math.sin(a) * r);
    }
    // Close by (but not on it: a drop on the fly is felt, below).
    for (; s.close >= 1; s.close--) {
      const r = 3 + Math.random() * 15;
      const a = Math.random() * TAU;
      this.#land(world, fly.x + Math.cos(a) * r, fly.z + Math.sin(a) * r);
    }
    for (; s.far >= 1; s.far--) {
      const r = Math.sqrt(Math.random()) * TABLE_RADIUS;
      const a = Math.random() * TAU;
      this.#land(world, Math.cos(a) * r, Math.sin(a) * r);
    }
    for (; s.pool >= 1; s.pool--) {
      const r = Math.sqrt(Math.random()) * POOL.r;
      const a = Math.random() * TAU;
      this.#ripple(POOL.x + Math.cos(a) * r, POOL.z + Math.sin(a) * r, range(0.5, 1));
      this.rain.splash(POOL.x + Math.cos(a) * r, world.heightAt(POOL.x, POOL.z) + 0.1, POOL.z + Math.sin(a) * r, 0.55);
    }
    if (Math.random() < (dt * rain) / RAIN_HIT_EVERY) {
      felt.touch = Math.max(felt.touch, RAIN_TOUCH);
      this.rain.splash(fly.x, fly.y + 0.9, fly.z, 0.9);
    }
  }

  #land(world: Around["world"], x: number, z: number) {
    if (!world.onTable(x, z)) return;
    this.rain.splash(x, world.heightAt(x, z), z, range(0.9, 1.5));
  }
}

const POOL = PATCHES.find((p) => p.pool)!;
