// Placeholder art for the Apple TV app, drawn by script into assets/ (see assets/README.md):
// the layered home-screen icon, the Top Shelf banners and the launch image. A bright sky, a
// hill, a berry and a cartoon fruit fly. Run: node scripts/placeholder-art.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Image, below, circle, ellipse, hex, intersect, mix, rect, segment } from './art.ts';
import type { RGBA } from './art.ts';

const assets = path.join(import.meta.dirname, '../assets');

const SKY_TOP = hex('#5fc3ff'), SKY_LOW = hex('#dff6ff');
const HILL_TOP = hex('#8fd660'), HILL_LOW = hex('#4c9a36');

function sky(img: Image) {
  const h = img.height;
  img.fill(() => -1, (_x, y) => mix(SKY_TOP, SKY_LOW, y / h));
  const sun = { x: img.width * 0.82, y: h * 0.2, r: h * 0.11 };
  for (let i = 4; i >= 1; i--) img.fill(circle(sun.x, sun.y, sun.r * (1 + i * 0.35)), hex('#fff6c4', 0.12));
  img.fill(circle(sun.x, sun.y, sun.r), hex('#fff2a8'));
}

/** Rolling hills along the bottom; `base` is where the front hill's crest sits, as a fraction of the height. */
function hills(img: Image, base: number) {
  const w = img.width, h = img.height;
  const back = (x: number) => h * (base - 0.1) + Math.sin((x / w) * 5.1 + 1.3) * h * 0.04;
  const front = (x: number) => h * base + Math.sin((x / w) * 3.3 + 0.4) * h * 0.06;
  img.fill(below(back), (_x, y) => mix(hex('#a9e27d'), hex('#6db84a'), (y - h * base) / (h * (1 - base)) + 0.5));
  img.fill(below(front), (_x, y) => mix(HILL_TOP, HILL_LOW, (y - h * base) / (h * (1 - base))));
}

/** A red berry of radius r with a leaf. */
function berry(img: Image, x: number, y: number, r: number) {
  const box: [number, number, number, number] = [x - r * 2, y - r * 2.4, x + r * 2, y + r * 1.4];
  img.fill(ellipse(x + r * 0.15, y + r * 0.9, r * 1.1, r * 0.25), hex('#2f6b22', 0.35), 1, box);
  img.fill(circle(x, y, r), (px, py) => mix(hex('#ff5a6a'), hex('#b5122b'), Math.min(1, Math.hypot(px - x + r * 0.35, py - y + r * 0.35) / (r * 1.6))), 1, box);
  img.fill(ellipse(x - r * 0.38, y - r * 0.4, r * 0.22, r * 0.14, -0.7), hex('#ffffff', 0.75), 1, box);
  img.fill(segment(x, y - r * 0.9, x + r * 0.15, y - r * 1.45, r * 0.12), hex('#5b3a1e'), 1, box);
  img.fill(ellipse(x + r * 0.55, y - r * 1.35, r * 0.5, r * 0.2, -0.5), hex('#4caf3c'), 1, box);
}

/**
 * A fruit fly seen from the side, facing left, `l` pixels from head to tail, centred on (x, y).
 * `flying` lifts the wings.
 */
function fly(img: Image, x: number, y: number, l: number, flying = false) {
  const box: [number, number, number, number] = [x - l * 0.75, y - l * 0.75, x + l * 0.75, y + l * 0.6];
  const P = (u: number, v: number) => [x + u * l, y + v * l] as const;
  const at = (u: number, v: number, ru: number, rv: number, angle = 0) => { const [px, py] = P(u, v); return ellipse(px, py, ru * l, rv * l, angle); };
  const line = (u0: number, v0: number, u1: number, v1: number, w: number) => { const [a, b] = P(u0, v0), [c, d] = P(u1, v1); return segment(a, b, c, d, w * l); };
  const LEG = hex('#3b2616');
  if (!flying) img.fill(at(0.02, 0.36, 0.42, 0.05), hex('#1d3d17', 0.25), 1, box);
  // Legs: three a side, but from the side the near ones hide the far ones.
  for (const [hip, knee, foot] of [[-0.14, -0.22, -0.3], [-0.06, -0.04, -0.02], [0.02, 0.14, 0.24]]) {
    img.fill(line(hip, 0.08, knee, 0.2, 0.035), LEG, 1, box);
    img.fill(line(knee, 0.2, foot, 0.33, 0.03), LEG, 1, box);
  }
  // Abdomen with its stripes, thorax, head.
  const abdomen = at(0.21, 0.03, 0.27, 0.17, 0.12);
  img.fill(abdomen, (_px, py) => mix(hex('#f2c47c'), hex('#c98838'), (py - y + l * 0.15) / (l * 0.32)), 1, box);
  for (const u of [0.14, 0.24, 0.34]) {
    const [bx] = P(u, 0);
    img.fill(intersect(abdomen, rect(bx, box[1], bx + l * 0.045, box[3])), hex('#6f3f1d', 0.85), 1, box);
  }
  img.fill(at(-0.07, -0.02, 0.17, 0.145), (_px, py) => mix(hex('#d08a3e'), hex('#91561f'), (py - y + l * 0.15) / (l * 0.3)), 1, box);
  img.fill(at(-0.07, -0.08, 0.1, 0.05), hex('#ffffff', 0.18), 1, box);
  img.fill(line(-0.33, -0.08, -0.4, -0.2, 0.02), LEG, 1, box);
  img.fill(at(-0.27, -0.01, 0.12, 0.115), hex('#dba05a'), 1, box);
  // The big red eye.
  img.fill(at(-0.3, -0.03, 0.078, 0.09), (px, py) => mix(hex('#ff4a3d'), hex('#a3121d'), Math.hypot(px - P(-0.32, -0.06)[0], py - P(-0.32, -0.06)[1]) / (l * 0.13)), 1, box);
  img.fill(at(-0.325, -0.07, 0.02, 0.016), hex('#ffffff', 0.85), 1, box);
  // Wings, see-through, over the back.
  const wing = (u: number, v: number, angle: number, a: number) => {
    img.fill(at(u, v, 0.34, 0.12, angle), hex('#5a7d96', 0.55 * a), 1, box);
    img.fill(at(u, v, 0.325, 0.105, angle), hex('#e8f7ff', 0.5 * a), 1, box);
  };
  if (flying) { wing(0.1, -0.33, -1.0, 0.8); wing(0.16, -0.28, -0.75, 1); } else { wing(0.2, -0.13, -0.28, 0.8); wing(0.24, -0.1, -0.12, 1); }
}

function write(file: string, img: Image) {
  const out = path.join(assets, file);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, img.png());
  console.log(`${file} ${img.width}x${img.height}`);
}

const layer = (w: number, h: number, draw: (img: Image) => void) => { const img = new Image(w, h); draw(img); return img; };

// The home-screen icon: three layers, back to front, for the parallax effect. tvOS sizes: the
// App Store's 1280x768 and the home screen's 400x240 at 1x and 2x.
for (const [w, h] of [[1280, 768], [400, 240], [800, 480]]) {
  const dir = `tv-icon/${w}x${h}`;
  write(`${dir}/1-sky.png`, layer(w, h, (img) => { sky(img); hills(img, 0.74); }));
  write(`${dir}/2-berry.png`, layer(w, h, (img) => berry(img, w * 0.25, h * 0.72, h * 0.13)));
  write(`${dir}/3-fly.png`, layer(w, h, (img) => fly(img, w * 0.57, h * 0.5, h * 0.62)));
}

// Top Shelf banners: standard and wide, 1x and 2x. tvOS may crop the edges, so the fly is central.
for (const [variant, w1] of [['standard', 1920], ['wide', 2320]] as const) {
  for (const scale of [1, 2]) {
    const w = w1 * scale, h = 720 * scale;
    write(`top-shelf/${variant}/top-shelf${scale === 2 ? '@2x' : ''}.png`, layer(w, h, (img) => {
      sky(img);
      hills(img, 0.78);
      berry(img, w * 0.3, h * 0.8, h * 0.07);
      berry(img, w * 0.355, h * 0.83, h * 0.05);
      berry(img, w * 0.7, h * 0.85, h * 0.06);
      fly(img, w * 0.5, h * 0.42, h * 0.42, true);
    }));
  }
}

// The launch image: the fly on a quiet sky while the game loads.
const CALM: RGBA = hex('#bfe9ff');
for (const [w, h] of [[1920, 1080], [3840, 2160]]) {
  write(`splash/splash-${w}x${h}.png`, layer(w, h, (img) => {
    img.fill(() => -1, CALM);
    hills(img, 0.86);
    fly(img, w * 0.5, h * 0.5, h * 0.22);
  }));
}
