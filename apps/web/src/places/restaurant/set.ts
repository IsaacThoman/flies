// The restaurant's near pass. The room is too big to draw in detail all at
// once, and the Apple TV pays for every object and draw, so it is drawn in
// two levels: the room's shell and a stand-in for every area (areas.ts) are
// one room-wide mesh, always drawn (the fly's eyes see a copy of it); each
// area's detail is its own mesh or two, drawn only while the camera is near
// it, and while it is, its stand-in is folded away in the vertex shader by a
// mask (materials.ts). Per frame that is a loop over the areas, a few
// `visible` flags and a uniform. The area the camera is in also lends its
// things to the light as casters, for exact shadows from the street and the
// pendant (light.ts).

import * as THREE from "three";
import { BANQUETTE, BOTTLES, CHAIR, DINING_ROOM, ESPRESSO, HOST_STAND, PASS, RESTAURANT_SOLIDS, STATION, STOOL, RESTAURANT_START, START_TABLE, TABLES, TABLE_TOPS, ZINC_BAR, topPeak } from "@fly/world";
import type { Solid } from "@fly/world";
import { EYE_LAYER } from "../../eyes/eyes.ts";
import { canvasTexture, freeze } from "../../scene/build.ts";
import { WallClock } from "../../scene/clock.ts";
import type { Daylight } from "../../scene/light.ts";
import type { Weather } from "../../scene/weather.ts";
import type { SceneSet } from "../types.ts";
import { AREAS, DETAIL_REACH, distanceTo } from "./areas.ts";
import type { AreaSpec } from "./areas.ts";
import { Builder } from "./builder.ts";
import { CASTERS } from "./light.ts";
import { RIPPLES, clearMaterial, sharedUniforms, solidMaterial } from "./materials.ts";
import { buildShell } from "./shell.ts";
import { PARTS, owner } from "./parts.ts";
import type { PartName } from "./parts.ts";
import { buildShopGlass } from "./glass.ts";
import { buildGlows } from "./glows.ts";
import { Ventilation } from "./live.ts";
import { updateStreetLight } from "./traffic.ts";

/** How bright the pendant left on is, for a millimetre world (its light falls off as the distance squared). */
const PENDANT = 620_000;
/** Shown once the camera is this near an area, hidden again once it is this much further. */
const HYSTERESIS = 150;

/** The floor's soft shadows under everything standing on it, painted once from the layout: 1 lit, darker beneath. */
function floorShadows() {
  const W = 1024;
  const H = Math.round((W * DINING_ROOM.hz) / DINING_ROOM.hx);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, W, H);
  const k = W / (DINING_ROOM.hx * 2);
  const px = (x: number) => (x + DINING_ROOM.hx) * k;
  // The canvas's first row is the texture's last (it is flipped as it is uploaded): +z at the top.
  const pz = (z: number) => (DINING_ROOM.hz - z) * k;
  const blob = (x: number, z: number, r: number, strength: number, soft = 1.6) => {
    const grad = g.createRadialGradient(px(x), pz(z), r * k * 0.3, px(x), pz(z), r * k * soft);
    grad.addColorStop(0, `rgba(0,0,0,${strength})`);
    grad.addColorStop(0.5, `rgba(0,0,0,${strength * 0.45})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(px(x) - r * k * soft, pz(z) - r * k * soft, r * k * soft * 2, r * k * soft * 2);
  };
  const strip = (x0: number, z0: number, x1: number, z1: number, strength: number, spread: number) => {
    g.save();
    g.filter = `blur(${spread * k}px)`;
    g.fillStyle = `rgba(0,0,0,${strength})`;
    g.fillRect(px(x0), pz(z1), (x1 - x0) * k, (z1 - z0) * k);
    g.restore();
  };
  for (const t of TABLES) {
    const r = t.kind === "four" ? TABLE_TOPS.four.half : t.kind === "round" ? TABLE_TOPS.round.r : TABLE_TOPS.square.half;
    blob(t.x, t.z, r, 0.32, 1.5);
    if (t.kind === "four") for (const sx of [-1, 1]) for (const sz of [-1, 1]) blob(t.x + sx * (r - 50), t.z + sz * (r - 50), 30, 0.6, 2.2);
    else blob(t.x, t.z, t.kind === "round" ? 230 : 260, 0.45, 1.25);
    for (const c of t.chairs) {
      if (c.upturned !== undefined) continue;
      blob(c.x, c.z, CHAIR.seat.r, 0.22, 1.4);
      const s = Math.sin(c.yaw);
      const co = Math.cos(c.yaw);
      for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) blob(c.x + s * a * CHAIR.leg.at + co * b * CHAIR.leg.at, c.z + co * a * CHAIR.leg.at - s * b * CHAIR.leg.at, 18, 0.55, 2.2);
    }
  }
  for (const z of STOOL.zs) blob(STOOL.x, z, STOOL.foot.r, 0.5, 1.3);
  const bar = ZINC_BAR;
  strip(bar.front.x + bar.front.hx - 20, bar.zinc.z - bar.front.hz, bar.front.x + bar.front.hx + 30, bar.zinc.z + bar.front.hz, 0.6, 60);
  strip(bar.underbar.x - bar.underbar.hx, bar.underbar.z0, bar.back.x1, bar.underbar.z1, 0.35, 80);
  strip(bar.back.x1 - 20, bar.back.z0, bar.back.x1 + 20, bar.back.z1, 0.5, 50);
  strip(BANQUETTE.x0 - 20, BANQUETTE.z0, BANQUETTE.x0 + 20, BANQUETTE.z1, 0.55, 60);
  strip(HOST_STAND.x - HOST_STAND.hx - 15, HOST_STAND.z - HOST_STAND.hz - 15, HOST_STAND.x + HOST_STAND.hx + 15, HOST_STAND.z + HOST_STAND.hz + 15, 0.55, 50);
  strip(STATION.x - STATION.hx - 15, STATION.z - STATION.hz, STATION.x + STATION.hx + 15, STATION.z + STATION.hz + 15, 0.55, 50);
  strip(PASS.x0, -DINING_ROOM.hz, PASS.x1, -DINING_ROOM.hz + 20, 0.35, 40);
  return canvasTexture(canvas, { srgb: false });
}

/** How much light a caster lets through, and in what colour (and how much it gathers it to a line). */
const TINTS: Readonly<Record<string, [number, number, number, number]>> = {
  "wine glass": [0.86, 0.66, 0.7, 0.5],
  "glass foot": [0.9, 0.9, 0.9, 0.2],
  "glass stem": [0.85, 0.85, 0.85, 0],
  shaker: [0.55, 0.55, 0.55, 0.2],
  "bud vase": [0.7, 0.85, 0.72, 0.8],
  votive: [0.6, 0.5, 0.42, 0.2],
  "sugar caddy": [0.42, 0.42, 0.42, 0.1],
  carafe: [0.86, 0.9, 0.9, 0.6],
  "carafe neck": [0.86, 0.9, 0.9, 0.3],
  tumbler: [0.85, 0.88, 0.88, 0.5],
  cloche: [0.9, 0.9, 0.9, 0.3],
  "cloche knob": [0.85, 0.85, 0.85, 0],
  mints: [0.75, 0.75, 0.75, 0.2],
  bottle: [0.25, 0.3, 0.2, 0.4],
  "bottle neck": [0.3, 0.35, 0.25, 0],
};

type Lit = { cast: Float32Array<ArrayBuffer>; tint: Float32Array<ArrayBuffer>; bottom: Float32Array<ArrayBuffer>; box: THREE.Vector4; y: THREE.Vector2; rings: Float32Array<ArrayBuffer> };

/** The things standing on an area's top that cast exact shadows (the tallest, as many as there is room for), and the rings on its marble. */
function lighting(area: AreaSpec, surface: number): Lit {
  const things = RESTAURANT_SOLIDS.filter((s) => {
    const f = s.footprint;
    const bottom = s.bottom ?? 0;
    return f.x > area.x0 && f.x < area.x1 && f.z > area.z0 && f.z < area.z1 && bottom >= surface - 1 && bottom < surface + 400 && !s.name.startsWith("chair") && topPeak(s.top) - bottom > 25;
  }).sort((a, b) => topPeak(b.top) - topPeak(a.top)).slice(0, CASTERS);
  const lit: Lit = { cast: new Float32Array(CASTERS * 4), tint: new Float32Array(CASTERS * 4), bottom: new Float32Array(CASTERS), box: new THREE.Vector4(area.x0, area.x1, area.z0, area.z1), y: new THREE.Vector2(surface - 6, surface + 420), rings: new Float32Array(24) };
  things.forEach((s: Solid, i) => {
    const f = s.footprint;
    const r = f.kind === "circle" ? f.r : f.kind === "ellipse" ? Math.max(f.rx, f.rz) * 0.85 : (f.hx + f.hz) / 2;
    lit.cast.set([f.x, f.z, r, topPeak(s.top)], i * 4);
    lit.tint.set(TINTS[s.name] ?? [0, 0, 0, 0], i * 4);
    lit.bottom[i] = s.bottom ?? 0;
  });
  return lit;
}

/** The surface an area's things stand on, if it has one worth shadows. */
function surfaceOf(area: AreaSpec): number | null {
  if (TABLES.some((t) => t.id === area.name)) return TABLE_TOPS.round.top;
  if (area.name.startsWith("bar ")) return ZINC_BAR.zinc.top;
  if (area.name === "pass") return PASS.shelf.top;
  if (area.name === "host") return HOST_STAND.top;
  if (area.name === "station") return STATION.top;
  if (area.name === "ledge") return BOTTLES[BOTTLES.length - 1].on;
  return null;
}

/** Rings left on each marble table, by area: wine, coffee, water. The start table's wine ring is where the world's food is. */
function rings(area: AreaSpec, lit: Lit, seed: number) {
  const t = TABLES.find((t) => t.id === area.name);
  if (!t || t.kind === "four") return;
  const list: [number, number, number, number][] = [];
  if (t.id === "window") list.push([START_TABLE.ring.x, START_TABLE.ring.z, START_TABLE.ring.r, 0], [t.x + 150, t.z + 170, 31, 1], [t.x - 40, t.z - 210, 38, 2]);
  else if (t.id === "banquette") list.push([ESPRESSO.x - 90, ESPRESSO.z + 120, 30, 1], [t.x - 160, t.z - 80, 36, 2]);
  else {
    const a = seed * 2.3;
    list.push([t.x + Math.cos(a) * 140, t.z + Math.sin(a) * 140, 33, seed % 2], [t.x + Math.cos(a + 2.4) * 180, t.z + Math.sin(a + 2.4) * 180, 36, 2]);
  }
  list.slice(0, 6).forEach((r, i) => lit.rings.set(r, i * 4));
}

export function buildRestaurant(): SceneSet {
  const group = new THREE.Group();
  // The clock over the bar tells the real time.
  const clock = new WallClock();
  const shared = sharedUniforms(floorShadows(), clock);
  const mask = { value: 0 };
  const solid = solidMaterial(shared, mask);
  const clear = clearMaterial(shared, mask);
  const eyeSolid = solidMaterial(shared, { value: 0 }, true);

  // The shop front's glass, with the rain on it: the street's (glass.ts), between the frames.
  const glass = buildShopGlass();
  group.add(glass.mesh);
  const glows = buildGlows(shared.uNight);
  group.add(glows.mesh);
  // The fly's eyes see the shell and every stand-in, none folded away, and the openings bright: the far mesh again, once it is built.
  const eye = new THREE.Mesh(new THREE.BufferGeometry(), eyeSolid);
  eye.layers.set(EYE_LAYER);
  eye.frustumCulled = false;
  freeze(eye);
  group.add(eye);

  type Shown = { spec: AreaSpec; group: THREE.Group; shown: boolean; lit: Lit | null };
  const areas: Shown[] = [];
  const b = new Builder(solid, clear);
  const owned = new Map<PartName, Solid[]>();
  for (const s of RESTAURANT_SOLIDS) {
    const part = owner(s);
    if (part) owned.set(part, [...(owned.get(part) ?? []), s]);
  }
  const order = new Map([[clear, 3]]);
  // The room is built in steps, a frame's work each behind the veil (SceneSet.more): the shell, each part, then the far mesh and each area's detail merged.
  const steps: (() => void)[] = [
    () => buildShell(b),
    ...Object.entries(PARTS).map(([name, part]) => () => part.build(b, owned.get(name as PartName) ?? [])),
    () => {
      const far = b.far.build(group, order);
      for (const m of far) m.frustumCulled = false;
      eye.geometry.dispose();
      eye.geometry = far.find((m) => m.material === solid)!.geometry;
    },
    // A few areas' detail at a time.
    ...Array.from({ length: Math.ceil(AREAS.length / 5) }, (_, k) => () => {
      for (const spec of AREAS.slice(k * 5, k * 5 + 5)) {
        const holder = new THREE.Group();
        freeze(holder);
        holder.visible = false;
        b.near.get(spec.id)?.build(holder, order);
        group.add(holder);
        const surface = surfaceOf(spec);
        const lit = surface === null ? null : lighting(spec, surface);
        if (lit) rings(spec, lit, spec.id);
        areas.push({ spec, group: holder, shown: false, lit });
      }
    }),
  ];
  let step = 0;
  let casting: Lit | null = null;
  const noLight: Lit = { cast: new Float32Array(CASTERS * 4), tint: new Float32Array(CASTERS * 4), bottom: new Float32Array(CASTERS), box: new THREE.Vector4(1, -1, 1, -1), y: new THREE.Vector2(1, -1), rings: new Float32Array(24) };
  const useLight = (lit: Lit) => {
    if (casting === lit) return;
    casting = lit;
    shared.uCast.value = lit.cast;
    shared.uCastTint.value = lit.tint;
    shared.uCastBottom.value = lit.bottom;
    shared.uCastBox.value = lit.box;
    shared.uCastY.value = lit.y;
    shared.uRings.value = lit.rings;
  };
  useLight(noLight);

  const eyeAt = new THREE.Vector3();
  // Where the fly was last seen living, for the camera's focus.
  const flyAt = new THREE.Vector3(RESTAURANT_START.x, RESTAURANT_START.y, RESTAURANT_START.z);
  const ventilation = new Ventilation();
  const glow = new THREE.Color();
  let nextRipple = 0;
  const ripples = shared.uRipples.value;

  return {
    group,
    materials: [solid, clear, eyeSolid],
    seen: [eye],
    more() {
      if (step < steps.length) steps[step++]();
      return step < steps.length;
    },
    update(time: number, light: Daylight, weather: Weather, camera?: THREE.Camera) {
      shared.uTime.value = time;
      clock.update();
      const night = light.stars;
      shared.uNight.value = night;
      updateStreetLight(time, light, weather);
      glass.update(time, light, weather);
      // The one pendant left on for the night, lit as the evening comes.
      const lit = THREE.MathUtils.smoothstep(night, 0.15, 0.6);
      shared.uPendant.value.w = PENDANT * lit;
      shared.uFridge.value.setRGB(0.55, 0.68, 0.85);
      shared.uExit.value.setRGB(0.02, 0.5, 0.18);
      shared.uKitchen.value.setRGB(0.05, 0.055, 0.06).multiplyScalar(0.6 + night);
      shared.uHeat.value.setRGB(0.5, 0.12, 0.03).multiplyScalar(0.4 + 0.6 * night);
      // The sky through the glass by day, and the street's glow after dark.
      glow.copy(light.skyColor).lerp(light.horizon, 0.3).multiplyScalar(3.4 * (1 - night) + 0.05);
      shared.uWindow.value.copy(glow);
      shared.uSunSoft.value = 0.03 + 0.12 * Math.max(0, 1 - light.sunIntensity / 3) + 0.1 * night;
      shared.uOpening.value = 0.25 + 1.1 * (1 - night);

      if (!camera) return;
      eyeAt.setFromMatrixPosition(camera.matrixWorld);
      glows.update(lit, eyeAt.distanceTo(flyAt));
      let bits = 0;
      let nearest: Shown | null = null;
      let nearestD = Infinity;
      for (let i = 0; i < areas.length; i++) {
        const a = areas[i];
        const d = distanceTo(a.spec, eyeAt.x, eyeAt.y, eyeAt.z);
        const show = d < DETAIL_REACH + (a.shown ? HYSTERESIS : 0);
        if (show !== a.shown) {
          a.shown = show;
          a.group.visible = show;
        }
        if (show) bits |= 1 << a.spec.id;
        if (a.lit && d < nearestD) {
          nearestD = d;
          nearest = a;
        }
      }
      mask.value = bits;
      useLight(nearest && nearestD < DETAIL_REACH ? nearest.lit! : noLight);
    },
    live(dt, around) {
      flyAt.set(around.fly.x, around.fly.y, around.fly.z);
      ventilation.step(dt, around);
    },
    ripple(x: number, z: number, strength: number) {
      ripples.set([x, z, shared.uTime.value, strength], nextRipple * 4);
      nextRipple = (nextRipple + 1) % RIPPLES;
    },
  };
}
