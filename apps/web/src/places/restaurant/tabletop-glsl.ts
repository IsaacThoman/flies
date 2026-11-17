// The look of the tabletop's own kinds, as GLSL. Each of these things is
// made with its vertex colour carrying where the vertex is on it (its
// coordinates across a sheet, or its offset from the middle of something
// round, and a height or a design: tabletop-shapes.ts), so the shader can
// draw print, petals, weave, holes and stains on it at any distance, fading
// what a pixel can't show. Things that are just a colour (the ketchup, the
// wax) use their vertex colour as it is.

import { JUICE_GLASS } from "@fly/world";
import { PART_KINDS } from "./kinds.ts";

const [S0] = PART_KINDS.tabletop.solid;
const [C0] = PART_KINDS.tabletop.clear;

/** The tabletop's own kinds. */
export const TOP = {
  /** Printed paper: the laminated menu (design 0), the sugar packets standing in the caddy (white 1, brown 2, pink 3, blue-banded white 5) and the torn one (4). Colour: across, along, design / 8. */
  print: S0,
  /** The bud vase's bloom. Colour: its offset from the middle (1 at the edge), height up it. */
  rose: S0 + 1,
  /** A shaker's steel cap (b 0 salt, 0.2 pepper), ground pepper (b 0.4), salt (b 0.6), and a crystal of sugar (b 1). Colour: offset from the middle / 40 mm. */
  shaker: S0 + 2,
  /** The heel of bread: crust, and crumb where it was cut. Colour: across it, along it. */
  bread: S0 + 3,
  /** The coiled basket. Colour: the way round, the distance along it from its middle / 400 mm. */
  wicker: S0 + 4,
  /** The checked napkin. Colour: where on it / 300 mm. */
  napkin: S0 + 5,
  /** The espresso cup and its saucer, with what the coffee left. Colour: offset from their middle / 120 mm, height / 70 mm. */
  china: S0 + 6,
  /** Ketchup: in the bottle, smeared, and dried to a crust (painted darker). */
  ketchup: S0 + 7,
  /** Juice dried in a ring on the marble. */
  dregs: C0,
  /** The tumbler's inside, filmed with juice above its level. Colour: blue, the height above the glass's foot / 120 mm. */
  inside: C0 + 1,
  /** Tinted glass, its colour showing: the votive. */
  tint: C0 + 2,
} as const;

/** A sugar packet standing in the caddy: across, up, and how deep its crimped seals are (mm). */
export const PACKET = { across: 55, up: 60, seal: 4.5 };

const k = (name: string, value: number) => `const int K_TOP_${name} = ${value};`;

const HEAD = /* glsl */ `
${k("PRINT", TOP.print)}
${k("ROSE", TOP.rose)}
${k("SHAKER", TOP.shaker)}
${k("BREAD", TOP.bread)}
${k("WICKER", TOP.wicker)}
${k("NAPKIN", TOP.napkin)}
${k("CHINA", TOP.china)}
${k("KETCHUP", TOP.ketchup)}
// A stripe of a repeating pattern, 1 in its middle half, its edges as soft as a pixel needs.
float topStripe(float x) {
  float t = abs(fract(x) - 0.5) * 2.0;
  float w = fwidth(x) * 2.0 + 0.02;
  return smoothstep(0.5 - w, 0.5 + w, t);
}
`;

const COLOR = /* glsl */ `
if (rK >= K_TOP_PRINT && rK <= K_TOP_CHINA) {
  vec3 tc = diffuseColor.rgb;
  if (rK == K_TOP_PRINT) {
    float design = floor(tc.b * 8.0 + 0.5);
    if (design < 0.5) {
      // The laminated menu, 220 by 320 mm: a cream card, a dark band at its head, two columns of dishes and prices.
      vec2 mm = tc.rg * vec2(220.0, 320.0);
      float d = rDetail(mm * 0.6);
      vec3 c = vec3(0.9, 0.85, 0.74) * (0.96 + 0.06 * rFbm(mm * 0.05));
      c = mix(c, vec3(0.3, 0.06, 0.05), rBand(mm.y, 270.0, 298.0, 0.3) * rBand(mm.x, 14.0, 206.0, 0.3));
      c = mix(c, vec3(0.62, 0.47, 0.2), rBand(mm.y, 262.5, 263.5, 0.15) * rBand(mm.x, 40.0, 180.0, 0.3));
      float right = step(110.0, mm.x);
      float x0 = mix(16.0, 118.0, right);
      float line = (250.0 - mm.y) / 8.5;
      float row = floor(line);
      float inRow = rBand(fract(line), 0.32, 0.62, 0.05);
      float used = step(0.0, line) * step(mm.y, 250.0) * step(24.0, mm.y) * step(0.2, rHash(vec2(row, right + 3.0)));
      float len = 34.0 + rHash(vec2(row, right)) * 40.0;
      float words = step(0.16, fract((mm.x - x0) / (4.5 + 3.0 * rHash(vec2(row, floor((mm.x - x0) / 7.0))))));
      float dish = rBand(mm.x, x0, x0 + len, 0.2) * words;
      float price = rBand(mm.x, x0 + 80.0, x0 + 88.0, 0.2);
      float ink = inRow * used * max(dish, price);
      c = mix(c, vec3(0.3, 0.27, 0.24), mix(0.1 * used, ink, d) * 0.7);
      // The laminate runs past the card: clear plastic, the marble dulled through it.
      float edge = min(min(mm.x, 220.0 - mm.x), min(mm.y, 320.0 - mm.y));
      c = mix(vec3(0.62, 0.62, 0.6), c, smoothstep(2.6, 3.2, edge));
      diffuseColor.rgb = c;
      rRough = 0.14 + 0.2 * smoothstep(0.6, 0.9, rNoise(mm * vec2(0.08, 1.4))) * d;
      rCoat = 0.9;
      rCoatRough = 0.05;
    } else {
      // A sugar packet: paper, a band of colour across it with a round mark and pinstripes either side, crimped where it was sealed.
      bool lying = abs(design - 4.0) < 0.5;
      vec2 size = lying ? vec2(50.0, 36.0) : vec2(${PACKET.across.toFixed(1)}, ${PACKET.up.toFixed(1)});
      vec2 mm = tc.rg * size;
      float along = lying ? mm.x : mm.y;
      float span = lying ? size.x : size.y;
      vec3 paper = vec3(0.93, 0.92, 0.88);
      vec3 ink = vec3(0.62, 0.08, 0.06);
      vec3 mark = paper;
      if (abs(design - 2.0) < 0.5) {
        paper = vec3(0.58, 0.4, 0.23);
        ink = vec3(0.2, 0.1, 0.05);
        mark = vec3(0.86, 0.72, 0.46);
      } else if (abs(design - 3.0) < 0.5) {
        paper = vec3(0.93, 0.6, 0.66);
        ink = vec3(0.97, 0.95, 0.94);
        mark = vec3(0.8, 0.22, 0.38);
      } else if (design > 4.5) {
        ink = vec3(0.1, 0.22, 0.5);
      }
      float d = rDetail(mm * 1.3);
      vec3 c = paper * (0.95 + 0.07 * rFbm(mm * 1.3) * d);
      float band = rBand(along, span * 0.36, span * 0.64, 0.2);
      float pin = max(rBand(along, span * 0.3, span * 0.315, 0.08), rBand(along, span * 0.685, span * 0.7, 0.08));
      c = mix(c, ink, max(band, pin * 0.85));
      float r = length(mm - size * 0.5);
      c = mix(c, mark, (1.0 - smoothstep(4.6, 5.0, r)) * band);
      c = mix(c, ink, rBand(r, 2.4, 3.2, 0.15) * band);
      // The seals, crimped across: the far end and both long sides of the one lying flat, the top and bottom of those standing.
      vec2 to = min(mm, size - mm);
      bool end = lying && mm.x > size.x - 4.0;
      float seal = end || to.y < (lying ? 2.5 : ${PACKET.seal.toFixed(1)}) ? 1.0 : 0.0;
      float crimp = 0.5 + 0.5 * sin((end ? mm.y : mm.x) * 9.0);
      c *= 1.0 - seal * (0.12 + 0.16 * crimp) * rDetail(mm * 1.5);
      // A standing packet's sides are folds, shadowed in their crease.
      if (!lying) c *= 1.0 - (1.0 - smoothstep(0.0, 0.03, min(tc.r, 1.0 - tc.r))) * 0.3;
      // The torn end: paper fibres, whiter.
      if (lying) c = mix(c, vec3(0.97, 0.96, 0.93), (1.0 - smoothstep(4.0, 6.5, mm.x)) * (0.5 + 0.5 * rNoise(mm * 6.0)));
      diffuseColor.rgb = c;
      rRough = 0.82 - seal * 0.2;
    }
  }
  if (rK == K_TOP_ROSE) {
    // Petals: cupped round the side, spiralling in on top, their edges turned back and catching the light; sepals underneath.
    vec2 o = (tc.rg - 0.5) * 2.0;
    float rho = length(o);
    float th = atan(o.y, o.x);
    float h = tc.b;
    vec3 deep = vec3(0.26, 0.01, 0.04);
    vec3 petal = vec3(0.66, 0.04, 0.1);
    vec3 lip = vec3(0.86, 0.2, 0.26);
    vec3 c;
    float fold = 0.0;
    if (rN.y < -0.45) {
      float star = rho - (0.3 + 0.28 * pow(abs(cos(th * 2.5)), 4.0));
      c = mix(vec3(0.14, 0.26, 0.07), petal * 0.75, smoothstep(-0.03, 0.03, star));
      c = mix(c, vec3(0.2, 0.32, 0.1), 1.0 - smoothstep(0.08, 0.12, rho));
    } else if (rN.y < 0.55 && h < 0.5) {
      float f = fract(th / 6.2832 * 5.0 + 0.15);
      float which = floor(th / 6.2832 * 5.0 + 0.15);
      float edge = 0.38 + 0.08 * sin(f * 3.14159);
      fold = (1.0 - smoothstep(0.0, 0.1, f)) + smoothstep(edge - 0.02, edge, h) * 0.6;
      vec3 own = mix(vec3(0.78, 0.1, 0.14), vec3(0.44, 0.02, 0.12), rHash1(which + 3.0)) * (0.8 + 0.4 * rHash1(which + 9.0));
      c = mix(deep, own, smoothstep(0.0, 0.35, h));
      c *= 1.0 - 0.1 * rBand(fract(f * 7.0), 0.45, 0.55, 0.06) * smoothstep(0.1, 0.3, h);
      c = mix(c, lip, smoothstep(edge - 0.1, edge, h) * 0.5);
    } else {
      // Petals laid round in a spiral, each a broad rounded blade a little smaller than the last and lying over it:
      // find the topmost one here, how near its edge is, and how near the edge of the one over it.
      float edgeD = 0.0;
      float over = 1.0;
      float which = 0.0;
      for (int i = 15; i >= 0; i--) {
        float fi = float(i);
        float w = 2.3 - fi * 0.075;
        float dth = abs(mod(th - fi * 2.39996 + 3.14159, 6.28318) - 3.14159);
        if (dth > w) continue;
        float q = dth / w;
        float e = (1.1 - fi * 0.06) * (1.0 - 0.6 * pow(q, 2.2)) - rho;
        if (e >= 0.0) {
          edgeD = e;
          which = fi;
          break;
        }
        over = min(over, -e);
      }
      float under = 1.0 - smoothstep(0.0, 0.09, over);
      fold = under * 0.85;
      // Each petal its own red: some toward crimson, some toward a cooler plum, the outer ones paler and a few bruised at the edge.
      float hue = rHash1(which + 11.0);
      vec3 own = mix(vec3(0.8, 0.1, 0.13), vec3(0.46, 0.02, 0.14), hue) * (0.8 + 0.4 * rHash1(which + 5.0));
      c = mix(own, deep, which / 15.0 * 0.6 + (1.0 - smoothstep(0.0, 0.18, rho)) * 0.5);
      c = mix(c, lip, (1.0 - smoothstep(0.0, 0.035, edgeD)) * 0.55);
      c = mix(c, vec3(0.28, 0.08, 0.06), (1.0 - smoothstep(0.0, 0.02, edgeD)) * step(0.75, rHash1(which + 23.0)) * 0.7);
      // Veins fanning from each petal's base.
      c *= 1.0 - 0.12 * rBand(fract(th * 9.0 + which * 0.37), 0.45, 0.55, 0.05) * smoothstep(0.1, 0.6, rho);
    }
    float d = rDetail(vec2(th * 40.0, rho * 30.0));
    c *= 1.0 - fold * 0.6;
    c *= 0.9 + 0.1 * rNoise(vec2(th * 40.0, rho * 30.0 + h * 20.0)) * d;
    diffuseColor.rgb = c;
    rAO *= 1.0 - fold * 0.35;
    rRough = 0.62;
  }
  if (rK == K_TOP_SHAKER) {
    if (tc.b < 0.3) {
      // A steel cap: brushed round, holes in its crown (six small for salt, three for pepper), salt caked at them.
      vec2 o = (tc.rg - 0.5) * 40.0;
      float r = length(o);
      bool pepper = tc.b > 0.1;
      float n = pepper ? 3.0 : 6.0;
      float hr = pepper ? 0.85 : 0.6;
      float a = atan(o.y, o.x);
      float sa = (floor(a / 6.2832 * n + 0.5) / n) * 6.2832;
      vec2 at = vec2(cos(sa), sin(sa)) * 5.5;
      float hole = max(1.0 - smoothstep(hr - 0.12, hr + 0.12, r), 1.0 - smoothstep(hr - 0.12, hr + 0.12, length(o - at)));
      float d = rDetail(o * 2.0);
      float brush = rNoise(vec2(r * 6.0, a * 2.0)) * d;
      vec3 c = vec3(0.78, 0.79, 0.8) * (0.92 + 0.12 * brush);
      float caked = (1.0 - smoothstep(0.0, 1.6, min(r, length(o - at)) - hr)) * step(0.55, rNoise(o * 3.0)) * (pepper ? 0.0 : 1.0) * d;
      c = mix(c, vec3(0.92), caked);
      diffuseColor.rgb = mix(c, vec3(0.015), hole);
      rMetal = (1.0 - hole) * (1.0 - caked);
      rRough = 0.26 + 0.12 * brush + caked * 0.5;
    } else if (tc.b > 0.8) {
      // A crystal of sugar: clear, so the room's light comes through it and out of every face, brightest at its edges; now and then a facet flashes.
      diffuseColor.rgb = vec3(0.97, 0.96, 0.94);
      float flash = step(0.86, rHash(floor(vWorld.xz * 2.5) + rN.xz * 3.0));
      rEmit += diffuseColor.rgb * (rRoomLight(vWorld, vec3(0.0, 1.0, 0.0)) * 0.6 + rKeyLight(vWorld) * 0.12) * (1.0 + flash);
      rRough = 0.1;
      rCoat = 1.0;
      rCoatRough = 0.03;
    } else {
      // Salt or ground pepper packed in a shaker: grains a third of a millimetre across, crowded against the glass and heaped on top,
      // each its own shade, dark in the gaps between. Laid out round the side by the way round and up, on top by where.
      bool salt = tc.b > 0.5;
      vec2 o = (tc.rg - 0.5) * 40.0;
      vec2 uv = (rN.y > 0.6 ? o : vec2(atan(o.y, o.x) * length(o), vWorld.y)) / (salt ? 0.3 : 0.38);
      uv.x += rHash1(floor(uv.y)) * 0.8;
      uv.y += rHash1(floor(uv.x) + 3.0) * 0.6;
      vec2 cell = floor(uv);
      vec2 fq = min(fract(uv), 1.0 - fract(uv));
      float e = min(fq.x, fq.y);
      float h = rHash(cell + (rN.y > 0.6 ? 31.0 : 0.0));
      float d = rDetail(uv * 1.4);
      float gap = (1.0 - smoothstep(0.02, 0.12, e)) * d;
      vec3 c;
      if (salt) {
        c = vec3(0.92, 0.92, 0.9) * mix(0.86, 0.62 + 0.38 * h, d) * (1.0 - gap * 0.6);
        rEmit += c * (rRoomLight(vWorld, rN) * 0.12 * step(0.85, h) * d + rKeyLight(vWorld) * (0.07 + 0.2 * step(0.85, h) * d));
        rRough = 0.3 + gap * 0.4;
        rCoat = 0.5;
      } else {
        vec3 grain = h < 0.55 ? vec3(0.05, 0.045, 0.04) : h < 0.75 ? vec3(0.3, 0.29, 0.27) : h < 0.9 ? vec3(0.3, 0.19, 0.1) : vec3(0.52, 0.44, 0.32);
        c = mix(vec3(0.14, 0.12, 0.1), grain, d) * (1.0 - gap * 0.6);
        rRough = 0.85;
      }
      diffuseColor.rgb = c;
      rAO *= 1.0 - gap * 0.4;
    }
  }
  if (rK == K_TOP_BREAD) {
    // A heel of baguette: crust, darker on the crown, opened pale along its slashes and dusted with flour; the crumb where it was cut.
    vec2 q = (tc.rg - 0.5) * 2.0;
    vec2 cp = vWorld.xz * 0.8 + vWorld.y * 0.5;
    float d = rDetail(cp);
    vec3 crust = mix(vec3(0.7, 0.44, 0.19), vec3(0.4, 0.19, 0.07), smoothstep(0.2, 0.95, 1.0 - length(q)));
    float slash = fract(q.x * 1.4 + q.y * 0.8 + 0.25);
    float score = rBand(slash, 0.08, 0.24, 0.04) * (1.0 - smoothstep(0.55, 0.75, abs(q.y)));
    crust = mix(crust, vec3(0.82, 0.62, 0.36), score * 0.75);
    float crackle = 1.0 - smoothstep(0.0, 0.04 + fwidth(rNoise(cp * 1.6)) * 2.0, abs(rNoise(cp * 1.6) - 0.5));
    float blister = smoothstep(0.7, 0.85, rNoise(cp * 3.1 + 7.0));
    crust *= (1.0 - crackle * 0.18 * d) * (1.0 + (rNoise(cp * 0.35) - 0.5) * 0.3) * (1.0 - blister * 0.25 * d);
    crust = mix(crust, vec3(0.9, 0.86, 0.78), smoothstep(0.6, 0.85, rFbm(cp * 0.4)) * 0.35);
    vec2 bp = vec2(q.y * 45.0, vWorld.y) * 0.9;
    float bd = rDetail(bp);
    float holes = smoothstep(0.6, 0.72, rNoise(bp)) * 0.7 + smoothstep(0.7, 0.8, rNoise(bp * 2.3 + 4.0)) * 0.5;
    vec3 crumb = vec3(0.93, 0.85, 0.66) * (1.0 - holes * 0.45 * bd) * (0.94 + 0.08 * rNoise(bp * 5.0) * bd);
    float cut = smoothstep(0.6, 0.64, q.x);
    float rim = rBand(q.x, 0.57, 0.63, 0.012);
    diffuseColor.rgb = mix(mix(crust, crumb, cut), vec3(0.42, 0.22, 0.09), rim * 0.8);
    rRough = mix(0.72, 0.92, cut);
    rAO *= 1.0 - holes * 0.3 * bd * cut;
  }
  if (rK == K_TOP_WICKER) {
    // A coiled basket: round coils of straw one above the next, stitched over with a cane strand.
    float coil = tc.g * 400.0 / 3.4;
    float fc = fract(coil);
    float bulge = sin(fc * 3.14159);
    float st = fract(tc.r * 140.0 + floor(coil) * 0.5);
    float stitch = rBand(st, 0.34, 0.62, 0.06);
    vec3 straw = vec3(0.6, 0.43, 0.22) * (0.85 + 0.3 * rHash(vec2(floor(coil), 1.0)));
    vec3 c = straw * (0.5 + 0.5 * bulge);
    c = mix(c, vec3(0.74, 0.57, 0.33) * (0.6 + 0.4 * sin(st * 3.14159)), stitch * 0.85);
    float d = rDetail(vec2(coil, tc.r * 140.0));
    diffuseColor.rgb = mix(straw * 0.72, c, d);
    rAO *= mix(1.0, 0.55 + 0.45 * max(bulge, stitch), d);
    rRough = 0.68;
    rCoat = 0.15;
  }
  if (rK == K_TOP_NAPKIN) {
    // Red and white check, woven: where the red threads cross, red; where they cross the white, pink.
    vec2 m = (tc.rg - 0.5) * 300.0;
    float a = topStripe(m.x / 8.0);
    float b = topStripe(m.y / 8.0);
    vec2 wp = m * 3.0;
    float d = rDetail(wp);
    vec3 white = vec3(0.88, 0.86, 0.82);
    vec3 c = mix(mix(white, vec3(0.76, 0.42, 0.4), max(a, b)), vec3(0.56, 0.08, 0.08), a * b);
    float weave = abs(fract(wp.x) - 0.5) + abs(fract(wp.y) - 0.5);
    diffuseColor.rgb = c * (0.92 + 0.12 * weave * d);
    rRough = 0.95;
  }
  if (rK == K_TOP_CHINA) {
    // White glaze. In the cup the coffee's dregs, sugary, dried paler at their edge, and the line it stood at; a drip down its side; a stain in the saucer.
    vec2 o = (tc.rg - 0.5) * 120.0;
    float rho = length(o);
    float y = 760.0 + tc.b * 70.0;
    float a = atan(o.y, o.x);
    vec3 brew = vec3(0.14, 0.07, 0.03);
    float coffee = 0.0;
    float gloss = 0.0;
    if (y > 775.5) {
      bool inside = (rN.y > 0.5 || dot(rN.xz, o) < 0.0) && rho < 28.5;
      if (inside) {
        float onFloor = 1.0 - smoothstep(776.3, 777.5, y);
        float edge = 13.0 + 1.6 * sin(a * 3.0 + 1.0) + 0.8 * sin(a * 7.0 + 2.0);
        float sludge = (1.0 - smoothstep(edge - 0.7, edge + 0.5, rho)) * onFloor;
        float tide = rBand(rho, edge - 0.4, edge + 1.6, 0.35) * onFloor;
        float line = rBand(y, 789.0, 790.0, 0.3) * (0.7 + 0.3 * sin(a * 9.0));
        float wash = (1.0 - smoothstep(777.0, 789.5, y)) * (1.0 - onFloor * 0.6) * 0.35;
        vec2 gp = o * 3.0;
        float grains = step(0.9, rHash(floor(gp))) * rDetail(gp) * (1.0 - smoothstep(9.0, 11.0, rho));
        coffee = max(max(sludge, tide * 0.6), max(line * 0.7, wash));
        brew = mix(brew, vec3(0.42, 0.27, 0.14), tide * (1.0 - sludge));
        brew = mix(brew, vec3(0.9, 0.82, 0.7), grains * sludge * 0.8);
        gloss = sludge;
      } else {
        float da = abs(mod(a - 0.9 + 3.14159, 6.2832) - 3.14159) * rho;
        float width = 0.9 + 0.5 * smoothstep(800.0, 797.0, y);
        coffee = (1.0 - smoothstep(width - 0.3, width + 0.2, da)) * smoothstep(796.0, 798.0, y) * 0.8;
      }
    } else {
      float run = rBand(rho, 30.0, 44.0 + 4.0 * sin(a * 2.0), 1.5) * smoothstep(0.3, 0.9, cos(a - 2.4));
      coffee = run * 0.35 + rBand(rho, 43.0, 44.5, 0.4) * smoothstep(0.5, 0.95, cos(a - 2.4)) * 0.4;
    }
    diffuseColor.rgb = mix(vec3(0.95, 0.94, 0.91), brew, coffee);
    rRough = 0.08 + coffee * 0.25 * (1.0 - gloss);
    rCoat = 1.0;
    rCoatRough = 0.04;
  }
}
if (rK == K_TOP_KETCHUP) {
  // Ketchup: thick and glossy, lumpy at a fly's scale; where it has dried (painted darker), dull and cracked.
  vec3 c = diffuseColor.rgb;
  float dried = 1.0 - smoothstep(0.06, 0.12, c.r);
  vec2 kp = (vWorld.xz + vWorld.yy * 0.7) * 1.4;
  float d = rDetail(kp);
  rBump = vec3(rNoise(kp * 0.5) - 0.5, 0.0, rNoise(kp * 0.5 + 3.3) - 0.5) * mix(0.08, 0.3, dried) * d;
  float crack = (1.0 - smoothstep(0.0, 0.04, abs(rNoise(kp * 1.5) - 0.5))) * dried * d;
  diffuseColor.rgb = c * (0.92 + 0.14 * rNoise(kp * 0.3)) * (1.0 - crack * 0.3);
  rRough = mix(0.1, 0.6, dried);
  rCoat = mix(0.9, 0.15, dried);
  rCoatRough = 0.04;
}
`;

const CLEAR_HEAD = /* glsl */ `
const int K_TOP_DREGS = ${TOP.dregs};
const int K_TOP_INSIDE = ${TOP.inside};
const int K_TOP_TINT = ${TOP.tint};
float topStain;
`;

const CLEAR_COLOR = /* glsl */ `
topStain = 0.0;
if (rK == K_TOP_DREGS) {
  // Dried juice: a stain the marble shows through, as opaque as it is dark, densest at the edge it dried to; satin, not wet.
  rAlpha = mix(0.72, 0.22, smoothstep(0.08, 0.45, diffuseColor.g));
  rRough = 0.38;
}
if (rK == K_TOP_INSIDE) {
  // Juice left a film on the glass above where it stands, thinning upward, and a line of pulp at its level.
  float y = diffuseColor.b * 120.0;
  topStain = (1.0 - smoothstep(${(JUICE_GLASS.well + 0.5).toFixed(1)}, ${(JUICE_GLASS.well + 16).toFixed(1)}, y)) * 0.35 + rBand(y, ${(JUICE_GLASS.well + 0.3).toFixed(1)}, ${(JUICE_GLASS.well + 1.8).toFixed(1)}, 0.3) * 0.35;
  diffuseColor.rgb = mix(vec3(0.03), vec3(0.5, 0.2, 0.02), topStain);
}
if (rK == K_TOP_TINT) diffuseColor.rgb *= 0.35;
`;

const CLEAR_FINAL = /* glsl */ `
if (rK == K_TOP_DREGS) rAlpha = min(1.0, rAlpha + edge * 0.08);
if (rK == K_TOP_INSIDE) rAlpha = 0.04 + edge * 0.7 + min(dot(outgoingLight, vec3(0.1)), 0.15) + topStain * 0.45;
if (rK == K_TOP_TINT) rAlpha = 0.14 + edge * 0.6 + min(dot(outgoingLight, vec3(0.1)), 0.15);
`;

export const TABLETOP_SOLID = { head: HEAD, color: COLOR };
export const TABLETOP_CLEAR = { head: CLEAR_HEAD, color: CLEAR_COLOR, final: CLEAR_FINAL };
