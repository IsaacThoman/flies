// Everything written on paper at the bench: the open notebook's two pages,
// the vials' labels and the strips of tape. Handwriting is squiggles, not
// words. Each kind of ink is drawn soft into a channel of its own (red for
// pen, green for red pen, blue for marker), and the paper's shader cuts it
// at half: so the strokes keep sharp, smooth edges however close the camera
// comes, as a font drawn from a distance field does.

import * as THREE from "three";
import { NOTEBOOK } from "@fly/world";
import { canvas2d, canvasTexture, random } from "../../scene/build.ts";
import { NOISE, WINDOW_LIGHT } from "./materials.ts";
import type { Sunbeam } from "./materials.ts";

const W = 2048;
const H = 1024;

/** The notebook's pages, open: their size (mm, as the world has the notebook) and where they are on the atlas (px). */
export const PAGES = { width: NOTEBOOK.hx * 2, height: NOTEBOOK.hz * 2, px: 0, py: 0, pw: Math.round((1014 * NOTEBOOK.hx) / NOTEBOOK.hz), ph: 1014 };
/** One page's width, mm, and the atlas's pixels to a millimetre of it. */
const PW = NOTEBOOK.hx;
const MM = PAGES.ph / PAGES.height;

/** Where each label and each strip of tape is on the atlas (px). */
const LABEL = { x: 1520, y: 0, w: 256, h: 164, columns: 2, rows: 5 };
const LABELS = LABEL.columns * LABEL.rows;
const TAPE = { x: 1520, y: 840, w: 528, h: 90, gap: 2 };

/** A rectangle of the atlas as uv: left, bottom, right, top. */
export type Region = { u0: number; v0: number; u1: number; v1: number };
const region = (x: number, y: number, w: number, h: number): Region => ({ u0: x / W, v0: 1 - (y + h) / H, u1: (x + w) / W, v1: 1 - y / H });
export const pagesRegion = region(PAGES.px, PAGES.py, PAGES.pw, PAGES.ph);
export const labelRegion = (i: number) => region(LABEL.x + (i % LABEL.columns) * LABEL.w, LABEL.y + Math.floor(i / LABEL.columns) * LABEL.h, LABEL.w, LABEL.h);
export const tapeRegion = (i: number) => region(TAPE.x, TAPE.y + i * (TAPE.h + TAPE.gap), TAPE.w, TAPE.h);

type Ink = "pen" | "red" | "marker";
const CHANNEL: Record<Ink, string> = { pen: "255, 0, 0", red: "0, 255, 0", marker: "0, 0, 255" };

/**
 * Strokes a path softly into an ink's channel: four passes, each a little
 * wider and a quarter as strong, so the channel falls from full on the
 * stroke's spine to nothing two pixels past its edge.
 */
function soft(g: CanvasRenderingContext2D, ink: Ink, width: number, draw: () => void) {
  g.save();
  g.globalCompositeOperation = "lighter";
  g.lineCap = "round";
  g.lineJoin = "round";
  for (let k = 0; k < 4; k++) {
    g.strokeStyle = `rgba(${CHANNEL[ink]}, 0.25)`;
    g.lineWidth = Math.max(0.5, width - 2 + k * 2);
    g.beginPath();
    draw();
    g.stroke();
  }
  g.restore();
}

/** A run of joined-up handwriting along a baseline: humps, loops, tall strokes and tails, in words. Returns where it ended. */
function scrawl(g: CanvasRenderingContext2D, rnd: ReturnType<typeof random>, ink: Ink, x: number, y: number, length: number, size: number, width: number) {
  const end = x + length;
  let pen = x;
  const slope = rnd.range(-0.012, 0.012);
  while (pen < end - size) {
    const letters = Math.floor(rnd.range(2, 8));
    const points: [number, number][] = [];
    let px = pen;
    for (let i = 0; i < letters && px < end; i++) {
      const kind = rnd.next();
      const w = size * rnd.range(0.55, 0.95);
      const tall = kind < 0.18 ? 2.1 : kind > 0.9 ? -1.4 : 1;
      const steps = 6;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        // A hump or a loop: up and back down, leaning forward.
        const up = Math.sin(t * Math.PI) * size * 0.9 * Math.abs(tall);
        const loop = kind > 0.45 && kind < 0.7 ? Math.sin(t * Math.PI * 2) * w * 0.25 : 0;
        points.push([px + t * w + loop + up * 0.18, y + (px - x) * slope - (tall < 0 ? -up * 0.8 : up)]);
      }
      px += w;
    }
    soft(g, ink, width, () => {
      points.forEach(([a, b], i) => (i === 0 ? g.moveTo(a, b) : g.lineTo(a, b)));
    });
    pen = px + size * rnd.range(0.7, 1.3);
  }
  return pen;
}

/** A path from points, for `soft`. */
const path = (g: CanvasRenderingContext2D, points: readonly (readonly [number, number])[]) => points.forEach(([a, b], i) => (i === 0 ? g.moveTo(a, b) : g.lineTo(a, b)));

/** The sign for a female (a circle over a cross) or a male (a circle and an arrow), as a geneticist writes a cross. */
function sex(g: CanvasRenderingContext2D, x: number, y: number, r: number, female: boolean, width: number) {
  soft(g, "pen", width, () => {
    g.moveTo(x + r, y);
    g.arc(x, y, r, 0, Math.PI * 2);
    if (female) {
      g.moveTo(x, y + r);
      g.lineTo(x, y + r * 2.2);
      g.moveTo(x - r * 0.55, y + r * 1.6);
      g.lineTo(x + r * 0.55, y + r * 1.6);
    } else {
      const a = -Math.PI / 4;
      const ex = x + Math.cos(a) * r * 2.1;
      const ey = y + Math.sin(a) * r * 2.1;
      g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      g.lineTo(ex, ey);
      g.moveTo(ex - r * 0.7, ey);
      g.lineTo(ex, ey);
      g.lineTo(ex, ey + r * 0.7);
    }
  });
}

function notebook(g: CanvasRenderingContext2D) {
  const rnd = random(404);
  const mm = (v: number) => v * MM;
  const pen = 0.5 * MM;
  const size = 3;
  /** Lines of writing on a page, on the ruled lines from `from`, leaving the last one short. */
  const write = (page: 0 | 1, from: number, lines: number, indent = 0, short = 0) => {
    const left = page * PW + 20 + indent;
    for (let i = 0; i < lines; i++) {
      const length = (i === lines - 1 ? rnd.range(28, 60) : rnd.range(80, 90)) - indent - short;
      scrawl(g, rnd, "pen", mm(left + rnd.range(0, 2)), mm(from + i * 8 - 0.6), mm(length), mm(size), pen);
    }
  };
  // The left page: a heading and a date, a few lines, a cross written out, and a table of counts.
  scrawl(g, rnd, "pen", mm(20), mm(13), mm(38), mm(3.6), pen * 1.2);
  soft(g, "pen", pen, () => path(g, [[mm(19), mm(15.4)], [mm(60), mm(15.8)]]));
  scrawl(g, rnd, "pen", mm(84), mm(13), mm(22), mm(2.8), pen);
  write(0, 30, 4);
  // The cross: a female over a balancer, times a male, each genotype over its line.
  const cy = 76;
  sex(g, mm(25), mm(cy), mm(3), true, pen);
  scrawl(g, rnd, "pen", mm(33), mm(cy - 3.5), mm(24), mm(2.6), pen);
  soft(g, "pen", pen, () => path(g, [[mm(33), mm(cy)], [mm(58), mm(cy)]]));
  scrawl(g, rnd, "pen", mm(35), mm(cy + 6.5), mm(18), mm(2.6), pen);
  soft(g, "pen", pen, () => path(g, [[mm(61), mm(cy - 2.5)], [mm(66), mm(cy + 2.5)], [mm(63.5), mm(cy)], [mm(61), mm(cy + 2.5)], [mm(66), mm(cy - 2.5)]]));
  sex(g, mm(74), mm(cy + 1), mm(3), false, pen);
  scrawl(g, rnd, "pen", mm(82), mm(cy - 3.5), mm(24), mm(2.6), pen);
  soft(g, "pen", pen, () => path(g, [[mm(82), mm(cy)], [mm(107), mm(cy)]]));
  scrawl(g, rnd, "pen", mm(85), mm(cy + 6.5), mm(16), mm(2.6), pen);
  // An arrow down to what came of it, circled in red.
  soft(g, "pen", pen, () => path(g, [[mm(64), mm(cy + 10)], [mm(64), mm(cy + 20)], [mm(61.5), mm(cy + 17)], [mm(64), mm(cy + 20)], [mm(66.5), mm(cy + 17)]]));
  scrawl(g, rnd, "pen", mm(46), mm(cy + 27), mm(36), mm(size), pen);
  soft(g, "red", pen * 1.1, () => g.ellipse(mm(64), mm(cy + 25.2), mm(22), mm(6.5), -0.04, 0, Math.PI * 2));
  // A table of counts: vials down the side, tally marks in the cells.
  const tx = 18;
  const ty = 116;
  const cw = [28, 22, 22, 22];
  soft(g, "pen", pen * 0.9, () => {
    let x = tx;
    for (const w of [0, ...cw]) {
      x += w;
      g.moveTo(mm(x), mm(ty));
      g.lineTo(mm(x + rnd.range(-0.4, 0.4)), mm(ty + 40));
    }
    for (let r = 0; r <= 4; r++) {
      g.moveTo(mm(tx), mm(ty + r * 10));
      g.lineTo(mm(tx + 94), mm(ty + r * 10 + rnd.range(-0.4, 0.4)));
    }
  });
  for (let r = 0; r < 4; r++) {
    scrawl(g, rnd, "pen", mm(tx + 3), mm(ty + r * 10 + 7.5), mm(18), mm(2.4), pen);
    let x = tx + 28;
    for (let c = 1; c < 4; c++) {
      if (r === 0) scrawl(g, rnd, "pen", mm(x + 3), mm(ty + 7.5), mm(12), mm(2.4), pen);
      else {
        // Tally marks: fours struck through.
        const n = Math.floor(rnd.range(3, 12));
        let mx = x + 3;
        for (let k = 0; k < n; k++) {
          const struck = k % 5 === 4;
          const sx = mx;
          soft(g, "pen", pen * 0.9, () => (struck ? path(g, [[mm(sx - 7.2), mm(ty + r * 10 + 6.8)], [mm(sx + 0.8), mm(ty + r * 10 + 3)]]) : path(g, [[mm(sx), mm(ty + r * 10 + 2.5)], [mm(sx - 0.4), mm(ty + r * 10 + 7.8)]])));
          mx += struck ? 2.6 : 1.8;
        }
      }
      x += cw[c];
    }
  }
  scrawl(g, rnd, "pen", mm(20), mm(ty + 49.4), mm(56), mm(size), pen);

  // The right page: a sketch of a fly, notes beside it, and lines of writing; the drop sits on the first of them.
  const fx = PW + 68;
  const fy = 30;
  soft(g, "pen", pen, () => {
    // Head, with its big eye.
    g.moveTo(mm(fx + 4), mm(fy - 15));
    g.ellipse(mm(fx), mm(fy - 15), mm(4), mm(3.2), 0, 0, Math.PI * 2);
    g.moveTo(mm(fx + 3.2), mm(fy - 15.4));
    g.ellipse(mm(fx + 1.4), mm(fy - 15.4), mm(1.8), mm(2.1), 0, 0, Math.PI * 2);
    // Thorax and abdomen, banded.
    g.moveTo(mm(fx + 5.4), mm(fy - 7));
    g.ellipse(mm(fx), mm(fy - 7), mm(5.4), mm(5.6), 0, 0, Math.PI * 2);
    g.moveTo(mm(fx + 4.6), mm(fy + 6));
    g.ellipse(mm(fx), mm(fy + 6), mm(4.6), mm(8), 0, 0, Math.PI * 2);
    for (let k = 0; k < 4; k++) {
      const y = fy + 2 + k * 3.2;
      g.moveTo(mm(fx - 4.2), mm(y));
      g.quadraticCurveTo(mm(fx), mm(y + 1.2), mm(fx + 4.2), mm(y));
    }
    // Wings, folded back over the abdomen and splayed a little, and three legs a side.
    for (const s of [-1, 1]) {
      g.moveTo(mm(fx + s * 2), mm(fy - 4));
      g.bezierCurveTo(mm(fx + s * 12), mm(fy), mm(fx + s * 13), mm(fy + 16), mm(fx + s * 6), mm(fy + 19));
      g.quadraticCurveTo(mm(fx + s * 2), mm(fy + 12), mm(fx + s * 2), mm(fy - 4));
      for (let k = 0; k < 3; k++) {
        const y = fy - 9 + k * 3;
        g.moveTo(mm(fx + s * 4.5), mm(y));
        g.lineTo(mm(fx + s * (9 + k)), mm(y - 3 + k * 4));
        g.lineTo(mm(fx + s * (12 + k * 1.5)), mm(y + 1 + k * 5));
      }
    }
  });
  // Notes pointing at it.
  soft(g, "pen", pen * 0.9, () => path(g, [[mm(fx + 7), mm(fy - 17)], [mm(fx + 16), mm(fy - 22)]]));
  scrawl(g, rnd, "pen", mm(fx + 17), mm(fy - 21), mm(26), mm(2.6), pen);
  soft(g, "pen", pen * 0.9, () => path(g, [[mm(fx - 12), mm(fy + 8)], [mm(fx - 24), mm(fy + 12)]]));
  scrawl(g, rnd, "pen", mm(PW + 20), mm(fy + 15.4), mm(22), mm(2.6), pen);
  write(1, 62, 7);
  write(1, 126, 4, 6, 10);
  // A word or two underlined in red, and a red tick.
  soft(g, "red", pen, () => path(g, [[mm(PW + 21), mm(79.6)], [mm(PW + 58), mm(79.2)]]));
  soft(g, "red", pen * 1.2, () => path(g, [[mm(PW + 96), mm(150)], [mm(PW + 99), mm(154)], [mm(PW + 106), mm(143)]]));
}

/** The timer's display: four seven-segment digits at nought and a colon. */
function display(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const dw = w * 0.17;
  const dh = h * 0.56;
  const top = y + h * 0.22;
  const width = h * 0.07;
  for (let i = 0; i < 4; i++) {
    const left = x + w * 0.1 + i * dw * 1.22 + (i > 1 ? w * 0.06 : 0);
    const segments: [number, number, number, number][] = [
      [0, 0, 1, 0], [1, 0, 1, 0.5], [1, 0.5, 1, 1], [0, 1, 1, 1], [0, 0.5, 0, 1], [0, 0, 0, 0.5],
    ];
    soft(g, "marker", width, () => {
      for (const [x0, y0, x1, y1] of segments) {
        g.moveTo(left + x0 * dw * 0.8 + width, top + y0 * dh);
        g.lineTo(left + x1 * dw * 0.8 + width, top + y1 * dh);
      }
    });
  }
  soft(g, "marker", width * 1.2, () => {
    for (const k of [0.33, 0.7]) {
      g.moveTo(x + w * 0.5, top + dh * k);
      g.lineTo(x + w * 0.5, top + dh * k + 0.1);
    }
  });
}

/** The timer's display is the last of the label cells. */
export const DISPLAY = LABELS - 1;

/** Vial labels: a stock's genotype and a date in marker, some with a coloured dot. */
function labels(g: CanvasRenderingContext2D) {
  const rnd = random(77);
  display(g, LABEL.x + (DISPLAY % LABEL.columns) * LABEL.w, LABEL.y + Math.floor(DISPLAY / LABEL.columns) * LABEL.h, LABEL.w, LABEL.h);
  for (let i = 0; i < DISPLAY; i++) {
    const x = LABEL.x + (i % LABEL.columns) * LABEL.w;
    const y = LABEL.y + Math.floor(i / LABEL.columns) * LABEL.h;
    const k = LABEL.w / 34;
    scrawl(g, rnd, "marker", x + 3 * k, y + 8 * k, rnd.range(18, 27) * k, 3 * k, 0.55 * k);
    scrawl(g, rnd, "marker", x + 3 * k, y + 14.5 * k, rnd.range(12, 24) * k, 2.6 * k, 0.5 * k);
    scrawl(g, rnd, "pen", x + 3 * k, y + 19.5 * k, rnd.range(8, 13) * k, 1.8 * k, 0.35 * k);
    if (rnd.next() < 0.5) soft(g, "red", 2.4 * k, () => g.arc(x + 29 * k, y + 18 * k, 0.4 * k, 0, Math.PI * 2));
  }
}

/** Strips of labelling tape on the bench, written on in marker. */
function tape(g: CanvasRenderingContext2D) {
  const rnd = random(9);
  for (let i = 0; i < 2; i++) {
    const y = TAPE.y + i * (TAPE.h + TAPE.gap);
    let x = TAPE.x + 24;
    while (x < TAPE.x + TAPE.w - 90) x = scrawl(g, rnd, "marker", x, y + TAPE.h * 0.68, rnd.range(60, 140), TAPE.h * 0.3, 5) + 18;
  }
}

export function paperTexture() {
  const { canvas, g } = canvas2d(W, H);
  g.fillStyle = "#000000";
  g.fillRect(0, 0, W, H);
  notebook(g);
  labels(g);
  tape(g);
  return canvasTexture(canvas, { srgb: false });
}

/**
 * Paper: vertex colours tint it, the atlas's channels are its inks, and the
 * notebook's pages are ruled in pale blue with a red margin, darkening into
 * the fold between them. Fibres of the paper show close up.
 */
export function paperMaterial(map: THREE.Texture, beam: Sunbeam): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, map, roughness: 0.82, metalness: 0, envMapIntensity: 0.35 });
  const p = pagesRegion;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, beam);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWorld;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vWorld;\n${NOISE}\n${INK}`)
      .replace("#include <lights_pars_begin>", `#include <lights_pars_begin>\n${WINDOW_LIGHT}`)
      .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\nreflectedLight.directDiffuse += uSunColor * uSunBeam * labWindowLight(vWorld, normalize((vec4(normal, 0.0) * viewMatrix).xyz)) * BRDF_Lambert(diffuseColor.rgb);")
      .replace(
        "#include <map_fragment>",
        /* glsl */ `{
  vec3 ink = vec3(1.0);
  vec2 uv = vMapUv;
  // The notebook's pages: ruled lines, the margin, and the fold.
  if (uv.x < ${p.u1.toFixed(5)} && uv.y > ${p.v0.toFixed(5)}) {
    vec2 mm = vec2((uv.x - ${p.u0.toFixed(5)}) / ${(p.u1 - p.u0).toFixed(5)} * ${PAGES.width.toFixed(1)}, (${p.v1.toFixed(5)} - uv.y) / ${(p.v1 - p.v0).toFixed(5)} * ${PAGES.height.toFixed(1)});
    float px = max(fwidth(mm.y), 1e-4);
    float rule = mm.y > 20.0 && mm.y < ${(PAGES.height - 4).toFixed(1)} ? 1.0 - smoothstep(0.08, 0.08 + px, abs(fract((mm.y - 22.0) / 8.0 + 0.5) - 0.5) * 8.0) : 0.0;
    float pageX = mm.x < ${PW.toFixed(1)} ? mm.x : mm.x - ${PW.toFixed(1)};
    float margin = 1.0 - smoothstep(0.09, 0.09 + max(fwidth(mm.x), 1e-4), abs(pageX - 16.0));
    ink = mix(ink, vec3(0.62, 0.76, 0.93), rule * 0.85);
    ink = mix(ink, vec3(0.93, 0.48, 0.5), margin * 0.8);
    float fold = abs(mm.x - ${PW.toFixed(1)});
    ink *= 1.0 - 0.22 * exp(-fold * 0.45) - 0.06 * exp(-fold * 0.08);
  }
  vec3 t = texture2D(map, uv).rgb;
  ink = labInk(ink, t);
  // Fibres: faint streaks and flecks in the paper.
  float fibre = labNoise(vec3(vWorld.x * 3.0, vWorld.y, vWorld.z * 0.9) * 2.0);
  ink *= 0.975 + fibre * 0.03;
  diffuseColor.rgb *= ink;
}`,
      );
  };
  material.customProgramCacheKey = () => "lab-paper";
  return material;
}

/** Cuts each ink channel at half, as sharp as one pixel, and lays the inks over the paper. Shared with the drop that magnifies the page. */
export const INK = /* glsl */ `
vec3 labInk(vec3 paper, vec3 t) {
  vec3 w = max(fwidth(t) * 0.8, vec3(0.03));
  vec3 cut = smoothstep(vec3(0.5) - w, vec3(0.5) + w, t);
  vec3 c = mix(paper, vec3(0.07, 0.11, 0.3), cut.r * 0.94);
  c = mix(c, vec3(0.75, 0.12, 0.12), cut.g * 0.9);
  c = mix(c, vec3(0.07, 0.07, 0.09), cut.b * 0.95);
  return c;
}`;

