// The lab round the bench, in the far pass: a row of windows behind it with a
// black-topped bench under them, shelves of fly stocks and an incubator to the
// left, a sink, a whiteboard and the door to the right, a desk with a dark
// monitor and a fridge behind, fluorescent panels overhead. Soft and calm:
// a background. The day comes in at the windows: by day the sun lays their
// shapes across the floor and the far wall; at night only the lamp on the
// bench is on, and its light spills a little way into the dark room. A wall
// clock between the windows tells the real time.
// Five draws: the room, its pictures, what glows, the view outside, and the
// glass.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { canvas2d, canvasTexture, freeze, paint, random } from "../../scene/build.ts";
import type { ColorFn } from "../../scene/build.ts";
import { CLOCK_GLSL, WallClock, onDial } from "../../scene/clock.ts";
import type { Dial } from "../../scene/clock.ts";
import type { Daylight } from "../../scene/light.ts";
import type { SceneBackdrop } from "../types.ts";
import { FLOOR_Y, SHADE } from "./bench.ts";
import { BACK_Z, CEILING_Y, PANELS, SUNBEAM, WINDOWS, WINDOW_LIGHT, sunbeam } from "./materials.ts";
import type { Sunbeam } from "./materials.ts";

const FRONT_Z = 2700;
const LEFT_X = -2800;
const RIGHT_X = 3000;

/**
 * The wall clock's dial (mm), facing the room: on the pier between the left
 * and the middle windows, hung low over the bench under them, where it can be
 * read from a stool and is seen past the fly and from across the bench.
 */
const CLOCK: Dial = { centre: { x: -WINDOWS.xs[2] / 2, y: 290, z: BACK_Z + 28.5 }, up: { x: 0, y: 1, z: 0 }, right: { x: 1, y: 0, z: 0 }, radius: 104 };

/** The clock's face, drawn on its dial in the room's material: a black minute track and hour batons, black hands, a thin red second hand. */
const CLOCK_FACE = /* glsl */ `
{
  vec3 d = ${onDial(CLOCK)};
  vec2 q = d.xy;
  float px = length(fwidth(q));
  if (abs(d.z) < 0.5 && length(q) < 1.0) {
    vec3 h = uClockHands;
    float marks = max(clockTicks(q, 60.0, 0.83, 0.9, 0.016, px), clockTicks(q, 12.0, 0.64, 0.9, 0.06, px));
    float black = max(marks, max(max(clockHand(q, h.x, 0.5, 0.12, 0.085, 0.07, px), clockHand(q, h.y, 0.8, 0.14, 0.065, 0.05, px)), clockSpot(q, vec2(0.0), 0.07, px)));
    float red = max(clockHand(q, h.z, 0.86, 0.26, 0.022, 0.016, px), clockSpot(q, vec2(0.0), 0.04, px));
    // The hands stand off the dial: their soft shadow falls a little down and to the side, and the bezel's round the edge.
    vec2 s = q - vec2(0.025, -0.035);
    float soft = px + 0.04;
    float shadow = max(max(clockHand(s, h.x, 0.5, 0.12, 0.085, 0.07, soft), clockHand(s, h.y, 0.8, 0.14, 0.065, 0.05, soft)), clockHand(s, h.z, 0.86, 0.26, 0.022, 0.016, soft) * 0.5);
    float rim = smoothstep(0.86, 1.0, length(q));
    diffuseColor.rgb *= 1.0 - shadow * 0.28 - rim * 0.2;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.025), black);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72, 0.05, 0.04), red);
    #if NUM_HEMI_LIGHTS > 0
    // The glass over it shows the lit room, brightest across its upper half: by day a sheen, after dark next to nothing.
    float sheen = 0.03 + 0.07 * smoothstep(-0.3, 0.7, q.y - q.x * 0.35) * (1.0 - smoothstep(0.55, 0.95, abs(q.y - 0.25 + q.x * 0.35)));
    totalEmissiveRadiance += hemisphereLights[0].skyColor * sheen * (1.0 - rim);
    #endif
  }
}`;

/** Where each picture is on the room's atlas (px of a 2048 × 1024 canvas). */
const ATLAS = { w: 2048, h: 1024 };
type Rect = { x: number; y: number; w: number; h: number };
const PICTURES = {
  trays: { x: 0, y: 0, w: 512, h: 256 },
  board: { x: 512, y: 0, w: 512, h: 320 },
  binders: { x: 0, y: 256, w: 256, h: 256 },
  table: { x: 256, y: 256, w: 256, h: 180 },
  incubator: { x: 0, y: 512, w: 256, h: 512 },
  notices: { x: 256, y: 512, w: 256, h: 200 },
  white: { x: 512, y: 960, w: 32, h: 32 },
  scenery: { x: 1024, y: 0, w: 1024, h: 384 },
  mask: { x: 1024, y: 400, w: 1024, h: 384 },
} satisfies Record<string, Rect>;

const uvOf = (r: Rect) => ({ u0: r.x / ATLAS.w, v0: 1 - (r.y + r.h) / ATLAS.h, u1: (r.x + r.w) / ATLAS.w, v1: 1 - r.y / ATLAS.h });

/** The pictures on the room's walls and the view from its windows, painted once. */
function roomAtlas() {
  const { canvas, g } = canvas2d(ATLAS.w, ATLAS.h);
  const rnd = random(61);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, ATLAS.w, ATLAS.h);

  // Trays of fly stocks on a shelf, seen from the front: plugs over rows of vials with food at the bottom.
  {
    const r = PICTURES.trays;
    g.fillStyle = "#7c6a52";
    g.fillRect(r.x, r.y, r.w, r.h);
    for (let row = 0; row < 2; row++) {
      const top = r.y + row * 128;
      g.fillStyle = "#c9b28c";
      g.fillRect(r.x, top + 112, r.w, 16);
      for (let i = 0; i < 20; i++) {
        const x = r.x + 4 + i * 25.4;
        g.fillStyle = "rgba(225, 235, 240, 0.85)";
        g.fillRect(x, top + 20, 21, 92);
        g.fillStyle = ["#d9b25c", "#c99a46", "#e0c070"][Math.floor(rnd.next() * 3)];
        g.fillRect(x + 1, top + 86, 19, 26);
        g.fillStyle = ["#eadcb8", "#f2efe6", "#f0d67a", "#e3c995", "#cfe0f0"][Math.floor(rnd.next() * 5)];
        g.fillRect(x - 1, top + 6, 23, 22);
        g.fillStyle = "rgba(255,255,255,0.9)";
        g.fillRect(x + 2, top + 44, 17, 20);
      }
    }
  }
  // The whiteboard: crosses, a fly, boxes and arrows in coloured marker, half rubbed out.
  {
    const r = PICTURES.board;
    g.fillStyle = "#f6f7f6";
    g.fillRect(r.x, r.y, r.w, r.h);
    g.lineCap = "round";
    g.lineJoin = "round";
    const scribble = (x: number, y: number, w: number, color: string, size = 9) => {
      g.strokeStyle = color;
      g.lineWidth = 2.2;
      g.beginPath();
      for (let t = 0; t <= w; t += 2) {
        const yy = y - Math.abs(Math.sin(t * 0.55 + rnd.next() * 0.4)) * size * (rnd.next() < 0.1 ? 1.8 : 1);
        if (t === 0) g.moveTo(x + t, yy);
        else g.lineTo(x + t, yy);
        if (rnd.next() < 0.06) {
          g.stroke();
          g.beginPath();
          t += 8;
          g.moveTo(x + t, y);
        }
      }
      g.stroke();
    };
    for (let i = 0; i < 6; i++) scribble(r.x + 30, r.y + 40 + i * 26, 150 + rnd.range(0, 60), i % 3 === 0 ? "#2b55b0" : "#2a2a2a");
    g.strokeStyle = "rgba(160, 160, 170, 0.35)";
    g.lineWidth = 18;
    g.beginPath();
    g.moveTo(r.x + 260, r.y + 60);
    g.bezierCurveTo(r.x + 330, r.y + 40, r.x + 380, r.y + 90, r.x + 470, r.y + 70);
    g.stroke();
    g.strokeStyle = "#c0392b";
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(r.x + 360, r.y + 190, 40, 26, 0, 0, Math.PI * 2);
    g.moveTo(r.x + 360, r.y + 164);
    g.lineTo(r.x + 360, r.y + 120);
    g.moveTo(r.x + 330, r.y + 175);
    g.quadraticCurveTo(r.x + 300, r.y + 150, r.x + 290, r.y + 175);
    g.moveTo(r.x + 390, r.y + 175);
    g.quadraticCurveTo(r.x + 420, r.y + 150, r.x + 430, r.y + 175);
    g.stroke();
    g.strokeStyle = "#1e7a4a";
    g.strokeRect(r.x + 40, r.y + 220, 120, 60);
    g.beginPath();
    g.moveTo(r.x + 160, r.y + 250);
    g.lineTo(r.x + 280, r.y + 250);
    g.lineTo(r.x + 268, r.y + 242);
    g.stroke();
    scribble(r.x + 52, r.y + 258, 90, "#1e7a4a", 7);
    g.fillStyle = "#c8cdd2";
    g.fillRect(r.x, r.y, r.w, 6);
    g.fillRect(r.x, r.y + r.h - 10, r.w, 10);
  }
  // Binders on a shelf: coloured spines, each with a white label.
  {
    const r = PICTURES.binders;
    g.fillStyle = "#3b3b3b";
    g.fillRect(r.x, r.y, r.w, r.h);
    let x = r.x;
    while (x < r.x + r.w) {
      const w = rnd.range(18, 30);
      g.fillStyle = ["#2f5f9e", "#b23a3a", "#2e7d5b", "#e0b03a", "#5a5a66", "#8a4d9c", "#e8e8e4"][Math.floor(rnd.next() * 7)];
      g.fillRect(x, r.y + rnd.range(0, 16), w - 2, r.h);
      g.fillStyle = "rgba(255,255,255,0.85)";
      g.fillRect(x + w * 0.2, r.y + 60, w * 0.55, 46);
      g.fillStyle = "rgba(0,0,0,0.25)";
      g.fillRect(x + w * 0.35, r.y + 190, w * 0.25, w * 0.25);
      x += w;
    }
  }
  // A poster of coloured squares in rows.
  {
    const r = PICTURES.table;
    g.fillStyle = "#fbfbf8";
    g.fillRect(r.x, r.y, r.w, r.h);
    const colors = ["#e88a7a", "#f3c26b", "#f6e58d", "#9fd6a0", "#8cc6e8", "#b8a6e0", "#e8b3cf"];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 18; col++) {
        if (row === 0 && col > 0 && col < 17) continue;
        if ((row === 1 || row === 2) && col > 1 && col < 12) continue;
        g.fillStyle = colors[(col + (row > 3 ? 3 : 0)) % colors.length];
        g.fillRect(r.x + 10 + col * 13.2, r.y + 18 + row * 19, 12, 17.5);
      }
    }
  }
  // Inside the incubator: wire shelves of vial trays under a warm light.
  {
    const r = PICTURES.incubator;
    const grad = g.createLinearGradient(0, r.y, 0, r.y + r.h);
    grad.addColorStop(0, "#fff3dc");
    grad.addColorStop(1, "#e6d9c4");
    g.fillStyle = grad;
    g.fillRect(r.x, r.y, r.w, r.h);
    for (let s = 0; s < 4; s++) {
      const y = r.y + 40 + s * 120;
      g.fillStyle = "#b5b8bb";
      g.fillRect(r.x + 6, y + 80, r.w - 12, 6);
      for (let i = 0; i < 10; i++) {
        const x = r.x + 14 + i * 23;
        g.fillStyle = "rgba(220, 232, 238, 0.9)";
        g.fillRect(x, y + 20, 18, 60);
        g.fillStyle = "#d4a84f";
        g.fillRect(x + 1, y + 62, 16, 18);
        g.fillStyle = ["#eadcb8", "#f2efe6", "#f0d67a"][i % 3];
        g.fillRect(x - 1, y + 10, 20, 16);
      }
    }
  }
  // A cork board of notices: sheets of squiggles, a yellow note, pins.
  {
    const r = PICTURES.notices;
    g.fillStyle = "#b98b5a";
    g.fillRect(r.x, r.y, r.w, r.h);
    for (let i = 0; i < 7; i++) {
      const x = r.x + rnd.range(8, r.w - 70);
      const y = r.y + rnd.range(8, r.h - 80);
      g.fillStyle = i === 3 ? "#f7e27a" : "#fbfbf6";
      g.fillRect(x, y, i === 3 ? 44 : 58, i === 3 ? 44 : 74);
      g.fillStyle = "rgba(60, 60, 70, 0.55)";
      for (let l = 0; l < 6; l++) g.fillRect(x + 6, y + 10 + l * 9, rnd.range(20, 44), 2);
      g.fillStyle = ["#d33", "#33a", "#2a2"][i % 3];
      g.beginPath();
      g.arc(x + 24, y + 4, 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  // The view from the windows: a lawn and a path, trees, and a building across the way, on a pale sky.
  {
    const r = PICTURES.scenery;
    const m = PICTURES.mask;
    g.fillStyle = "#b9d3ea";
    g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = "#000000";
    g.fillRect(m.x, m.y, m.w, m.h);
    // The sky's mask: everywhere the scenery isn't.
    g.fillStyle = "#00ff00";
    g.fillRect(m.x, m.y, m.w, m.h);
    const both = (draw: (ox: number, oy: number, mask: boolean) => void) => {
      draw(r.x, r.y, false);
      draw(m.x, m.y, true);
    };
    // The building: four storeys of pale stone and glass.
    both((ox, oy, mask) => {
      g.fillStyle = mask ? "#000000" : "#cdbfac";
      g.fillRect(ox + 300, oy + 70, 560, 250);
      g.fillStyle = mask ? "#000000" : "#a99a86";
      g.fillRect(ox + 290, oy + 62, 580, 12);
    });
    for (let f = 0; f < 4; f++) {
      for (let w = 0; w < 14; w++) {
        const x = 314 + w * 39;
        const y = 92 + f * 56;
        g.fillStyle = rnd.next() < 0.5 ? "#4f6378" : "#5d7389";
        g.fillRect(r.x + x, r.y + y, 28, 36);
        g.fillStyle = "rgba(255,255,255,0.18)";
        g.fillRect(r.x + x, r.y + y, 28, 9);
        if (rnd.next() < 0.3) {
          g.fillStyle = "#ff0000";
          g.fillRect(m.x + x, m.y + y, 28, 36);
        }
      }
    }
    // The lawn and a path across it.
    both((ox, oy, mask) => {
      g.fillStyle = mask ? "#000000" : "#77a052";
      g.fillRect(ox, oy + 300, r.w, r.h - 300);
      if (!mask) {
        g.fillStyle = "#b9ae9a";
        g.beginPath();
        g.moveTo(ox, oy + 352);
        g.quadraticCurveTo(ox + 500, oy + 318, ox + r.w, oy + 336);
        g.lineTo(ox + r.w, oy + 352);
        g.quadraticCurveTo(ox + 500, oy + 334, ox, oy + 372);
        g.fill();
      }
    });
    // Trees: round crowns of leaves in a few greens, lit from above, trunks below.
    for (let t = 0; t < 16; t++) {
      const x = rnd.range(-20, r.w + 20);
      const base = rnd.range(296, 312);
      const size = rnd.range(46, 92) * (x > 280 && x < 880 ? 0.85 : 1.15);
      both((ox, oy, mask) => {
        g.fillStyle = mask ? "#000000" : "#5a4632";
        g.fillRect(ox + x - 4, oy + base - size * 0.9, 8, size * 0.9);
      });
      for (let k = 0; k < 14; k++) {
        const cx = x + rnd.range(-0.6, 0.6) * size;
        const cy = base - size * 1.05 + rnd.range(-0.55, 0.45) * size;
        const cr = size * rnd.range(0.28, 0.48);
        const lit = (base - size * 1.4 - cy) / size;
        both((ox, oy, mask) => {
          g.fillStyle = mask ? "#000000" : ["#3f6b34", "#4f7d3a", "#5f8f44", "#6d9c4c"][Math.max(0, Math.min(3, Math.floor(1.6 - lit * 2.2 + rnd.next())))];
          g.beginPath();
          g.arc(ox + cx, oy + cy, cr, 0, Math.PI * 2);
          g.fill();
        });
      }
    }
    // A street lamp by the path, lit at night.
    both((ox, oy, mask) => {
      g.fillStyle = mask ? "#000000" : "#3c4046";
      g.fillRect(ox + 210, oy + 200, 5, 130);
      g.fillStyle = mask ? "#ff0000" : "#e8e2c8";
      g.fillRect(ox + 204, oy + 194, 17, 9);
    });
  }
  g.fillStyle = "#ffffff";
  g.fillRect(PICTURES.white.x, PICTURES.white.y, PICTURES.white.w, PICTURES.white.h);
  return canvasTexture(canvas);
}

/** A piece of the room for a textured batch: its uv moved into a picture. */
function pictured(geometry: THREE.BufferGeometry, r: Rect, tint: THREE.ColorRepresentation | ColorFn = "#ffffff") {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
  const { u0, v0, u1, v1 } = uvOf(r);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  const painted = paint(g, tint);
  painted.setAttribute("uv", uv);
  return painted;
}

/** A box between two corners, mm. */
const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
/** A picture on a wall facing +z (or turned to face another way). */
const facing = (w: number, h: number, x: number, y: number, z: number, turn = 0) => new THREE.PlaneGeometry(w, h).rotateY(turn).translate(x, y, z);

/** The room's materials: their floor and ceiling tiled, and the sun through the windows laid across them; the one with the clock's dial in it, its hands. */
function roomShader(material: THREE.Material, beam: Sunbeam, key: string, hands?: WallClock["hands"]) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, beam);
    if (hands) shader.uniforms.uClockHands = hands;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWorld;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vWorld;\n${WINDOW_LIGHT}\n${hands ? CLOCK_GLSL : ""}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${hands ? CLOCK_FACE : ""}`)
      .replace(
        "#include <map_fragment>",
        /* glsl */ `#include <map_fragment>
vec3 faceNormal = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
{
  // Floor tiles and ceiling tiles: thin joints a tile apart.
  float px = max(fwidth(vWorld.x), fwidth(vWorld.z));
  if (abs(faceNormal.y) > 0.9) {
    float tile = vWorld.y < 0.0 ? 305.0 : 600.0;
    vec2 g = abs(fract(vWorld.xz / tile + 0.5) - 0.5) * tile;
    float joint = 1.0 - smoothstep(1.5, 1.5 + px * 1.5, min(g.x, g.y));
    diffuseColor.rgb *= 1.0 - joint * (vWorld.y < 0.0 ? 0.12 : 0.18);
  }
}`,
      )
      .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\nreflectedLight.directDiffuse += uSunColor * uSunBeam * labWindowLight(vWorld, faceNormal) * BRDF_Lambert(diffuseColor.rgb);");
  };
  material.customProgramCacheKey = () => key;
}

const OUTSIDE_VS = /* glsl */ `
varying vec3 vWorld;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const OUTSIDE_FS = /* glsl */ `
uniform sampler2D map;
uniform vec3 high; uniform vec3 low; uniform vec3 sunDir; uniform vec3 sunColor;
uniform float glow; uniform float stars; uniform float time;
uniform vec4 scenery; uniform vec4 mask; uniform vec4 band;
varying vec3 vWorld;
varying vec2 vUv;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec3 d = normalize(vWorld - cameraPosition);
  float h = d.y;
  float day = 1.0 - stars;
  // The sky: pale low down, deeper higher up, with the sun's glow and soft clouds drifting.
  vec3 sky = mix(low, high, smoothstep(-0.05, 0.55, h));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  sky += sunColor * (pow(s, 5.0) * glow * 0.6 + pow(s, 60.0) * 0.4) * day;
  vec2 cp = d.xz / max(h + 0.25, 0.05) * 2.2 + vec2(time * 0.004, 0.0);
  float cloud = smoothstep(0.5, 0.85, noise(cp) * 0.6 + noise(cp * 2.3) * 0.3 + noise(cp * 5.1) * 0.1);
  sky = mix(sky, mix(low, vec3(1.0), 0.6 * day + 0.1), cloud * 0.55 * smoothstep(0.0, 0.12, h));
  // Stars, faintly, at night.
  vec2 cell = floor(d.xy / max(d.z * -1.0, 0.2) * 260.0);
  sky += vec3(step(0.997, hash(cell)) * stars * 0.8 * smoothstep(0.05, 0.3, h));
  // The scenery, where it is, tinted by the light of the day, with windows and a lamp lit at night.
  vec2 p = (vWorld.xy - band.xy) / band.zw;
  vec3 c = sky;
  if (p.x > 0.0 && p.x < 1.0 && p.y < 1.0) {
    vec2 q = vec2(p.x, max(p.y, 0.0));
    vec3 there = texture2D(map, scenery.xy + q * scenery.zw).rgb;
    vec3 m = texture2D(map, mask.xy + q * mask.zw).rgb;
    vec3 tint = mix(vec3(0.06, 0.08, 0.15), mix(vec3(1.0), low * 1.15, 0.3), day);
    vec3 lit = there * tint + vec3(1.0, 0.8, 0.5) * m.r * stars * 0.9;
    // Haze toward the far things, more by day.
    lit = mix(lit, low, 0.22 * day);
    c = mix(lit, sky, m.g * step(0.0, p.y));
  } else if (p.y < 0.0) c = mix(vec3(0.3, 0.42, 0.22), vec3(0.04, 0.05, 0.08), stars) * mix(vec3(1.0), low, 0.3);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

export function buildRoom(light: Daylight): SceneBackdrop {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(light.haze.getHex(), 2600, 18_000);
  scene.matrixWorldAutoUpdate = true;
  const rnd = random(88);
  const atlas = roomAtlas();
  const day = { value: 1 };
  const beam = sunbeam();
  beam.uSunDir.value = light.sunDirection;
  beam.uSunColor.value = light.sunColor;

  const clock = new WallClock();
  const room = new THREE.MeshLambertMaterial({ vertexColors: true });
  roomShader(room, beam, "lab-room", clock.hands);
  const pictures = new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true });
  roomShader(pictures, beam, "lab-pictures");
  // What gives light: the panels overhead by day, the incubator's light by day, little lights always.
  const glows = new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true, fog: false });
  glows.onBeforeCompile = (shader) => {
    shader.uniforms.uDay = day;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute float always;\nvarying float vAlways;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvAlways = always;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uDay;\nvarying float vAlways;")
      .replace("#include <opaque_fragment>", "outgoingLight *= mix(mix(0.08, 1.0, uDay), 1.0, vAlways);\n#include <opaque_fragment>");
  };
  glows.customProgramCacheKey = () => "lab-glows";
  const glassMaterial = new THREE.MeshBasicMaterial({ color: "#cfe0ee", transparent: true, opacity: 0.08, depthWrite: false });

  const solid: THREE.BufferGeometry[] = [];
  const pics: THREE.BufferGeometry[] = [];
  const lit: THREE.BufferGeometry[] = [];
  const panes: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, color: THREE.ColorRepresentation | ColorFn) => solid.push(paint(g, color));
  const glow = (g: THREE.BufferGeometry, color: THREE.ColorRepresentation | ColorFn, always: boolean, r: Rect = PICTURES.white) => {
    const piece = pictured(g, r, color);
    piece.setAttribute("always", new THREE.BufferAttribute(new Float32Array(piece.attributes.position.count).fill(always ? 1 : 0), 1));
    lit.push(piece);
  };

  const wall = "#d8d4ca";
  const trim = "#8d9196";
  // The floor, walls and ceiling, with a dark cove base along the walls.
  add(box(LEFT_X, RIGHT_X, FLOOR_Y - 20, FLOOR_Y, BACK_Z, FRONT_Z), (p) => new THREE.Color("#c9c4b8").lerp(new THREE.Color("#b5b0a5"), Math.abs(Math.sin(p.x * 0.0011 + p.z * 0.0007))));
  add(box(LEFT_X, RIGHT_X, CEILING_Y, CEILING_Y + 20, BACK_Z, FRONT_Z), "#ecebe6");
  add(box(LEFT_X - 20, LEFT_X, FLOOR_Y, CEILING_Y, BACK_Z, FRONT_Z), wall);
  add(box(RIGHT_X, RIGHT_X + 20, FLOOR_Y, CEILING_Y, BACK_Z, FRONT_Z), wall);
  add(box(LEFT_X, RIGHT_X, FLOOR_Y, CEILING_Y, FRONT_Z, FRONT_Z + 20), wall);
  for (const [x0, x1, z0, z1] of [[LEFT_X, RIGHT_X, BACK_Z, BACK_Z + 12], [LEFT_X, RIGHT_X, FRONT_Z - 12, FRONT_Z], [LEFT_X, LEFT_X + 12, BACK_Z, FRONT_Z], [RIGHT_X - 12, RIGHT_X, BACK_Z, FRONT_Z]]) add(box(x0, x1, FLOOR_Y, FLOOR_Y + 100, z0, z1), "#4a4c50");

  // The back wall, built round its three windows; their frames, sills and blinds; the glass.
  {
    const edges = [LEFT_X, ...WINDOWS.xs.flatMap((x) => [x - WINDOWS.hw, x + WINDOWS.hw]), RIGHT_X];
    for (let i = 0; i < edges.length; i += 2) add(box(edges[i], edges[i + 1], FLOOR_Y, CEILING_Y, BACK_Z - 120, BACK_Z), wall);
    for (const x of WINDOWS.xs) {
      add(box(x - WINDOWS.hw, x + WINDOWS.hw, FLOOR_Y, WINDOWS.y0, BACK_Z - 120, BACK_Z), wall);
      add(box(x - WINDOWS.hw, x + WINDOWS.hw, WINDOWS.y1, CEILING_Y, BACK_Z - 120, BACK_Z), wall);
      // Frame, a mullion and a transom.
      add(box(x - WINDOWS.hw, x + WINDOWS.hw, WINDOWS.y0 - 10, WINDOWS.y0 + 40, BACK_Z - 90, BACK_Z - 50), trim);
      add(box(x - WINDOWS.hw, x + WINDOWS.hw, WINDOWS.y1 - 40, WINDOWS.y1, BACK_Z - 90, BACK_Z - 50), trim);
      for (const fx of [x - WINDOWS.hw, x, x + WINDOWS.hw]) add(box(fx - 25, fx + 25, WINDOWS.y0, WINDOWS.y1, BACK_Z - 90, BACK_Z - 50), trim);
      add(box(x - WINDOWS.hw, x + WINDOWS.hw, 1080, 1115, BACK_Z - 90, BACK_Z - 50), trim);
      // A deep white sill.
      add(box(x - WINDOWS.hw - 30, x + WINDOWS.hw + 30, WINDOWS.y0 - 25, WINDOWS.y0, BACK_Z - 100, BACK_Z + 90), "#f1f0eb");
      // Blinds, let down over the top of the window, their slats tilted.
      for (let y = WINDOWS.blinds + 12; y < WINDOWS.y1 - 30; y += 24) {
        const slat = new THREE.BoxGeometry(WINDOWS.hw * 2 - 40, 1.5, 25).rotateX(0.5).translate(x, y, BACK_Z + 30);
        add(slat, "#eceae4");
      }
      add(box(x - WINDOWS.hw + 10, x + WINDOWS.hw - 10, WINDOWS.y1 - 30, WINDOWS.y1, BACK_Z + 10, BACK_Z + 60), "#e2e0da");
      panes.push(facing(WINDOWS.hw * 2, WINDOWS.y1 - WINDOWS.y0, x, (WINDOWS.y0 + WINDOWS.y1) / 2, BACK_Z - 70));
    }
  }
  // The bench under the windows: grey cabinets, a black epoxy top, and what stands on it.
  {
    const z0 = BACK_Z;
    const z1 = BACK_Z + 760;
    add(box(-2550, 2350, FLOOR_Y, -30, z0, z1 - 20), "#c4c7ca");
    for (let x = -2500; x < 2300; x += 600) {
      add(box(x + 8, x + 592, FLOOR_Y + 110, -60, z1 - 22, z1 - 10), "#7fa3a6");
      add(box(x + 260, x + 340, -110, -95, z1 - 10, z1), trim);
    }
    add(box(-2560, 2360, -30, 0, z0, z1), "#2b2d30");
    // A covered microscope, a few bottles, trays of vials, a plant on the sill.
    const cover = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(170, 380, 150).translate(-1500, 0, z0 + 400);
    add(cover, "#dfe6ea");
    for (let i = 0; i < 7; i++) {
      const x = 380 + i * 95 + rnd.range(-15, 15);
      const r = rnd.range(30, 48);
      const h = rnd.range(150, 260);
      add(new THREE.CylinderGeometry(r, r, h, 16).translate(x, h / 2, z0 + 260 + rnd.range(-60, 60)), ["#8a5a2a", "#e9e9e4", "#5d7f96", "#c9d9e0", "#3d6b4f"][i % 5]);
      add(new THREE.CylinderGeometry(r * 0.45, r * 0.45, 30, 12).translate(x, h + 15, z0 + 260), ["#2f6fb5", "#d23a3a", "#2b2b2b"][i % 3]);
    }
    for (let i = 0; i < 3; i++) {
      const x = -700 + i * 320;
      add(box(x - 140, x + 140, 0, 90, z0 + 180, z0 + 520), "#c9b08a");
      pics.push(pictured(facing(280, 90, x, 45, z0 + 521), PICTURES.trays));
    }
    add(new THREE.CylinderGeometry(70, 55, 120, 16).translate(1550, WINDOWS.y0 + 60, BACK_Z + 10), "#b8643a");
    for (let k = 0; k < 26; k++) {
      const a = rnd.range(0, Math.PI * 2);
      const r = rnd.range(30, 110);
      const leaf = new THREE.SphereGeometry(rnd.range(26, 38), 8, 6).scale(1, 0.55, 1).translate(1550 + Math.cos(a) * r, WINDOWS.y0 + 150 + rnd.range(-20, 140) - (r > 80 ? rnd.range(60, 220) : 0), BACK_Z + 10 + Math.sin(a) * r * 0.6);
      add(leaf, ["#3f7f3a", "#56994a", "#2f6a30"][k % 3]);
    }
    // The gas cylinder, chained to the wall at the end of the bench, with its regulator.
    add(new THREE.CylinderGeometry(115, 115, 1380, 24).translate(2620, FLOOR_Y + 690, BACK_Z + 200), "#5f6c74");
    add(new THREE.SphereGeometry(115, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(2620, FLOOR_Y + 1380, BACK_Z + 200), "#5f6c74");
    add(box(2580, 2660, FLOOR_Y + 1480, FLOOR_Y + 1560, BACK_Z + 160, BACK_Z + 240), "#b9bcbf");
    add(new THREE.TorusGeometry(120, 6, 6, 24, Math.PI).rotateX(Math.PI / 2).translate(2620, FLOOR_Y + 1100, BACK_Z + 200), "#9a9da1");
  }
  // The wall clock: a white dial in a dark case with a rounded bezel. Its face is drawn on the dial by the room's material.
  {
    const { x, y, z } = CLOCK.centre;
    const r = CLOCK.radius;
    add(new THREE.CylinderGeometry(r + 9, r + 11, z - BACK_Z - 1, 48).rotateX(Math.PI / 2).translate(x, y, (z + BACK_Z - 1) / 2), "#25272a");
    add(new THREE.TorusGeometry(r + 5, 6, 8, 48).translate(x, y, z + 0.5), "#2e3033");
    add(new THREE.CircleGeometry(r + 4, 48).translate(x, y, z), "#f6f5f0");
  }
  // The left wall: shelves of fly stocks, a poster, and the incubator.
  {
    const x0 = LEFT_X;
    for (const z of [-1500, -600]) {
      for (const dz of [-440, 440]) add(box(x0, x0 + 460, FLOOR_Y, 1100, z + dz - 15, z + dz + 15), "#9ea3a8");
      for (let s = 0; s < 5; s++) {
        const y = FLOOR_Y + 120 + s * 380;
        add(box(x0, x0 + 460, y - 15, y, z - 450, z + 450), "#aeb3b8");
        if (y + 200 < 1100) {
          add(box(x0 + 40, x0 + 420, y, y + 200, z - 420, z + 420), "#c4ab83");
          pics.push(pictured(facing(840, 200, x0 + 421, y + 100, z, Math.PI / 2), PICTURES.trays));
        }
      }
    }
    pics.push(pictured(facing(560, 400, x0 + 6, 1250, -1050, Math.PI / 2), PICTURES.table));
    // The incubator: a tall white cabinet with a glass door, lit inside, and its display.
    const z = 900;
    add(box(x0, x0 + 760, FLOOR_Y, 1050, z - 420, z + 420), "#eeeeea");
    add(box(x0 + 760, x0 + 790, FLOOR_Y + 80, 920, z - 380, z + 380), "#d5d6d4");
    glow(facing(660, 860, x0 + 792, 450, z, Math.PI / 2), "#fff8ea", false, PICTURES.incubator);
    add(box(x0 + 790, x0 + 830, 300, 700, z + 330, z + 350), trim);
    add(box(x0 + 761, x0 + 772, 950, 1020, z - 200, z + 200), "#2a2c30");
    glow(facing(90, 34, x0 + 773, 985, z + 120, Math.PI / 2), "#ff6a4a", true);
    glow(facing(16, 16, x0 + 773, 985, z - 140, Math.PI / 2), "#7dffa0", true);
  }
  // The right wall: the sink, a towel dispenser, the whiteboard, the door and a lab coat.
  {
    const x1 = RIGHT_X;
    add(box(x1 - 700, x1, FLOOR_Y, -30, -900, 700), "#c4c7ca");
    for (let z = -880; z < 680; z += 520) {
      add(box(x1 - 712, x1 - 700, FLOOR_Y + 110, -60, z + 8, z + 512), "#7fa3a6");
      add(box(x1 - 722, x1 - 712, -150, -60, z + 240, z + 270), trim);
    }
    add(box(x1 - 710, x1, -30, 0, -910, 710), "#2b2d30");
    add(box(x1 - 560, x1 - 140, -6, 1, -380, 220), "#8f969c");
    add(box(x1 - 540, x1 - 160, -4, 2, -360, 200), "#5d6368");
    const tap = new THREE.CatmullRomCurve3([new THREE.Vector3(x1 - 90, 0, -80), new THREE.Vector3(x1 - 90, 330, -80), new THREE.Vector3(x1 - 160, 400, -80), new THREE.Vector3(x1 - 260, 330, -80)]);
    add(new THREE.TubeGeometry(tap, 20, 14, 8), "#c9ccd0");
    add(box(x1 - 260, x1, 520, 900, 380, 640), "#f2f2ef");
    add(box(x1 - 120, x1, 400, 560, -560, -460), "#e7e7e3");
    add(box(x1 - 30, x1, 410, 1390, -2420, -880), "#b8bcc0");
    pics.push(pictured(facing(1500, 940, x1 - 32, 900, -1650, -Math.PI / 2), PICTURES.board));
    // The door, with its narrow window, its handle and frame.
    add(box(x1 - 40, x1, FLOOR_Y, 1250, 1180, 2280), "#9a7652");
    add(box(x1 - 60, x1, 1250, 1310, 1140, 2320), trim);
    for (const z of [1140, 2280]) add(box(x1 - 60, x1, FLOOR_Y, 1310, z, z + 40), trim);
    add(box(x1 - 44, x1 - 40, 300, 1000, 1880, 2020), "#2c3540");
    add(box(x1 - 90, x1 - 40, 120, 145, 1250, 1400), "#c9ccd0");
    // A white coat on a hook by the door.
    add(new THREE.CylinderGeometry(150, 260, 1100, 12, 1, false, Math.PI, Math.PI).scale(1, 1, 0.45).translate(x1 - 70, 520, 900), "#f4f4f1");
    add(new THREE.SphereGeometry(110, 12, 8).scale(1.2, 0.6, 0.6).translate(x1 - 70, 1080, 900), "#f4f4f1");
  }
  // The front wall: a desk with a dark monitor, binders on a shelf, a notice board, and the fridge.
  {
    const z1 = FRONT_Z;
    add(box(-2300, -300, -170, -140, z1 - 760, z1), "#b8a487");
    for (const x of [-2280, -320]) add(box(x - 20, x + 20, FLOOR_Y, -170, z1 - 740, z1 - 20), trim);
    add(box(-2280, -1700, FLOOR_Y + 60, -170, z1 - 700, z1 - 30), "#c4c7ca");
    // The monitor: switched off, its screen a dark glass with a faint reflection, a small light to say it is asleep.
    add(box(-1500, -900, 30, 400, z1 - 420, z1 - 400), "#1d1f22");
    add(box(-1240, -1160, -140, 30, z1 - 400, z1 - 360), "#2a2c2f");
    add(box(-1330, -1070, -140, -128, z1 - 460, z1 - 300), "#2a2c2f");
    solid.push(
      paint(facing(580, 350, -1200, 215, z1 - 421, Math.PI), (p) => new THREE.Color("#0c0e12").lerp(new THREE.Color("#2a3140"), Math.max(0, (p.y - 40) / 360) * 0.6 * Math.max(0, 1 - Math.abs(p.x + 1100) / 400))),
    );
    glow(facing(8, 8, -940, 45, z1 - 424, Math.PI), "#ffb44a", true);
    add(box(-1400, -1000, -140, -125, z1 - 640, z1 - 480), "#2a2c2f");
    add(new THREE.CylinderGeometry(40, 36, 100, 16).translate(-700, -90, z1 - 560), "#d24e3a");
    add(box(-2050, -1750, -140, -105, z1 - 600, z1 - 380), "#f4f4f0");
    // An office chair, pushed back.
    add(new THREE.CylinderGeometry(240, 240, 70, 16).translate(-1150, -400, z1 - 1050), "#2b3440");
    add(box(-1380, -920, -380, 240, z1 - 1260, z1 - 1200), "#2b3440");
    add(new THREE.CylinderGeometry(20, 20, 400, 8).translate(-1150, -640, z1 - 1050), trim);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      add(box(-20, 20, FLOOR_Y + 40, FLOOR_Y + 70, 0, 300).rotateY(a).translate(-1150, 0, z1 - 1050), "#2a2c2f");
    }
    // Binders on a wall shelf, and a notice board.
    add(box(-2200, -400, 560, 580, z1 - 300, z1), trim);
    pics.push(pictured(facing(1800, 300, -1300, 730, z1 - 160, Math.PI), PICTURES.binders));
    pics.push(pictured(facing(900, 700, 600, 700, z1 - 6, Math.PI), PICTURES.notices));
    // The fridge, its compressor humming now and then.
    add(box(1300, 2100, FLOOR_Y, 1050, z1 - 720, z1 - 20), "#f3f3f0");
    add(box(1310, 2090, 640, 650, z1 - 724, z1 - 718), "#d0d1cf");
    add(box(1360, 1390, 100, 560, z1 - 760, z1 - 724), trim);
    add(box(1360, 1390, 700, 960, z1 - 760, z1 - 724), trim);
    glow(facing(14, 14, 2040, 1000, z1 - 725, Math.PI), "#62ff8a", true);
  }
  // The ceiling's lights: louvred panels, glowing by day.
  for (const [x, z] of PANELS) {
    add(box(x - 320, x + 320, CEILING_Y - 30, CEILING_Y, z - 620, z + 620), "#d9dad8");
    const panel = new THREE.PlaneGeometry(600, 1180, 1, 16).rotateX(Math.PI / 2).translate(x, CEILING_Y - 31, z);
    glow(panel, (p) => (Math.abs(Math.sin(((p.z - z) / 1180) * Math.PI * 8)) < 0.2 ? "#c9ced6" : "#f7f9ff"), false);
  }
  // A grille for the air, over the bench.
  add(box(-300, 300, CEILING_Y - 8, CEILING_Y, 1100, 1500), "#cfd1d0");
  for (let i = 0; i < 12; i++) add(box(-290, 290, CEILING_Y - 12, CEILING_Y - 8, 1110 + i * 33, 1120 + i * 33), "#9b9e9f");

  const meshes: THREE.Mesh[] = [];
  const build = (pieces: THREE.BufferGeometry[], material: THREE.Material) => {
    const geometry = mergeGeometries(pieces);
    for (const piece of pieces) piece.dispose();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    freeze(mesh);
    scene.add(mesh);
    meshes.push(mesh);
    return mesh;
  };
  build(solid, room);
  build(pics, pictures);
  build(lit, glows);
  const glassMesh = build(panes, glassMaterial);
  glassMesh.renderOrder = 2;

  // The view outside: one big plane far beyond the windows, where the sky and the scenery are worked out.
  const band = { x: -36_000, y: -9_000, w: 72_000, h: 28_000 };
  const uv = (r: Rect) => {
    const { u0, v0, u1, v1 } = uvOf(r);
    return new THREE.Vector4(u0, v0, u1 - u0, v1 - v0);
  };
  const outsideUniforms = {
    map: { value: atlas },
    high: { value: new THREE.Color() },
    low: { value: new THREE.Color() },
    sunDir: { value: light.sunDirection },
    sunColor: { value: light.sunColor },
    glow: { value: light.glow },
    stars: { value: light.stars },
    time: { value: 0 },
    scenery: { value: uv(PICTURES.scenery) },
    mask: { value: uv(PICTURES.mask) },
    band: { value: new THREE.Vector4(band.x, band.y, band.w, band.h) },
  };
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(240_000, 140_000).translate(0, 50_000, -30_000), new THREE.ShaderMaterial({ uniforms: outsideUniforms, vertexShader: OUTSIDE_VS, fragmentShader: OUTSIDE_FS, fog: false }));
  freeze(outside);
  outside.renderOrder = -1;
  scene.add(outside);

  // The light in the room: the panels (the hemisphere), the window (the sun), and the lamp on the bench at night.
  const hemi = new THREE.HemisphereLight(light.skyColor, light.groundColor, light.hemiIntensity);
  const window = new THREE.DirectionalLight(light.sunColor, light.sunIntensity);
  const lamp = new THREE.PointLight("#ffcf96", 0, 0, 2);
  lamp.position.set(SHADE.x, SHADE.y - 40, SHADE.z);
  scene.add(hemi, window, lamp);

  return {
    scene,
    update(time, _camera, daylight) {
      clock.update();
      const dark = Math.min(1, Math.max(0, (daylight.stars - 0.25) / 0.6));
      const night = dark * dark * (3 - 2 * dark);
      day.value = 1 - night;
      hemi.color.copy(daylight.skyColor);
      hemi.groundColor.copy(daylight.groundColor);
      hemi.intensity = daylight.hemiIntensity * 0.95;
      window.color.copy(daylight.sunColor);
      window.intensity = daylight.sunIntensity * 0.35 * (1 - night);
      window.position.copy(daylight.sunDirection);
      beam.uSunBeam.value = daylight.sunIntensity * SUNBEAM * (1 - night);
      lamp.intensity = night * 900_000;
      (scene.fog as THREE.Fog).color.copy(daylight.haze);
      outsideUniforms.high.value.copy(daylight.water);
      outsideUniforms.low.value.copy(daylight.cloud);
      outsideUniforms.glow.value = daylight.glow;
      outsideUniforms.stars.value = daylight.stars;
      outsideUniforms.time.value = time;
    },
  };
}
