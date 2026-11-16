// The rest of the room's things: the kitchen's pass, the host's stand by the
// door, the service station, the banquette, and what hangs on the walls (the
// mirror, the chalkboard, the print, the exit sign). Their shapes are in
// rest-*.ts; the looks only they have are here: the heat lamps' glow, gilt,
// bound covers and the edges of their pages, order slips, peppermints.

import { ON_HOST, PASS, STATION } from "@fly/world";
import type { Solid } from "@fly/world";
import type { Part } from "./parts.ts";
import { buildBanquette } from "./rest-banquette.ts";
import { buildPass } from "./rest-pass.ts";
import { REST_KIND } from "./rest-shapes.ts";
import { buildHost, buildStation } from "./rest-stands.ts";
import { buildWalls } from "./rest-walls.ts";

const f = (n: number) => n.toFixed(1);
const PASS_THINGS = new Set(["pass", "heat lamp", "ticket rail", "ticket", "dessert plate", "bracket"]);
const HOST_THINGS = new Set(["host stand", "menus", "book", "mints"]);
const STATION_THINGS = new Set(["station", "cutlery tray", "carafe", "carafe neck", "tumbler"]);

const menus = ON_HOST.menus;
const book = ON_HOST.book;

const HEAD = /* glsl */ `
${Object.entries(REST_KIND)
  .map(([name, value]) => `const int K_RST_${name.toUpperCase()} = ${value};`)
  .join("\n")}
`;

const COLOR = /* glsl */ `
if (rK == K_RST_HEAT) {
  diffuseColor.rgb = vec3(0.1, 0.04, 0.03);
  rRough = 0.45;
  rMetal = 0.5;
}
if (rK == K_RST_TRAY) {
  float figure;
  vec2 gp = abs(rN.y) > 0.6 ? vWorld.xz : abs(rN.z) >= abs(rN.x) ? vec2(vWorld.x, vWorld.y + vWorld.z * 0.05) : vec2(vWorld.z, vWorld.y + vWorld.x * 0.05);
  diffuseColor.rgb *= rWood(gp, vec3(0.62, 0.44, 0.27), vec3(0.36, 0.23, 0.12), 120.0, figure);
  rRough = 0.5 + figure * 0.1;
  rCoat = 0.35;
}
if (rK == K_RST_POLISH) {
  vec3 rr = reflect(normalize(vWorld - cameraPosition), rN);
  float sky = smoothstep(-0.05, 0.4, rr.y);
  diffuseColor.rgb = mix(vec3(0.16, 0.15, 0.14), vec3(0.8, 0.81, 0.83), sky) + smoothstep(0.9, 0.99, rr.y) * 0.3;
  rRough = 0.25;
  rCoat = 1.0;
  rCoatRough = 0.05;
}
if (rK == K_RST_GILT) {
  // Gold leaf over red bole, rubbed through where hands and cloths have gone; the hollows darker in the vertex colour.
  vec2 gp = abs(rN.x) > 0.5 ? vWorld.zy : vWorld.xy;
  float d = rDetail(gp * 0.8);
  float wear = smoothstep(0.55, 0.8, rFbm(gp * 0.012) * 0.7 + rNoise(gp * 0.08) * 0.3) * smoothstep(0.8, 0.98, diffuseColor.g) * 0.7;
  float speck = rNoise(gp * 0.8) * d;
  diffuseColor.rgb *= mix(vec3(0.86, 0.64, 0.32), vec3(0.42, 0.15, 0.08), wear * 0.85) * (0.9 + 0.15 * speck);
  rMetal = mix(0.95, 0.15, wear);
  rRough = 0.32 + wear * 0.35 + speck * 0.08;
}
if (rK == K_RST_COVER) {
  // Pebbled leather or book cloth, a little sheen, rubbed paler at the edges.
  vec2 cp = (abs(rN.y) > 0.5 ? vWorld.xz : vec2(vWorld.x + vWorld.z, vWorld.y)) * 1.3;
  float d = rDetail(cp);
  float grain = rNoise(cp) * 0.6 + rNoise(cp * 2.3 + 4.0) * 0.4;
  diffuseColor.rgb *= 0.9 + (grain - 0.5) * 0.3 * d;
  rBump = vec3(rNoise(cp + 3.0) - 0.5, 0.0, rNoise(cp + 7.0) - 0.5) * 0.3 * d;
  rRough = 0.55 - grain * 0.1;
  rCoat = 0.3;
  rCoatRough = 0.25;
  if (rN.y > 0.5) {
    // The top menu: two blind-tooled rules round its cover.
    vec2 m = abs(vWorld.xz - vec2(${f(menus.x)}, ${f(menus.z)})) - vec2(${f(menus.hx)}, ${f(menus.hz)});
    float inset = -max(m.x, m.y);
    float onMenu = step(0.0, inset) * step(abs(vWorld.y - ${f(ON_HOST.menus.thick + 1100)}), 0.3);
    float rules = rBand(inset, 9.0, 10.2, 0.25) + rBand(inset, 12.2, 12.7, 0.2);
    diffuseColor.rgb *= 1.0 - rules * onMenu * 0.5;
    // The book: leather corners and spine over its cloth, the cloth's weave between.
    vec2 k = vWorld.xz - vec2(${f(book.x - book.hx)}, ${f(book.z - book.hz)});
    vec2 kk = vec2(${f(book.hx * 2)}, ${f(book.hz * 2)}) - k;
    float onBook = step(0.0, min(min(k.x, k.y), min(kk.x, kk.y))) * step(abs(vWorld.y - ${f(1100 + book.thick)}), 0.3);
    float corner = step(min(min(k.x + k.y, k.x + kk.y), min(kk.x + k.y, kk.x + kk.y)), 46.0);
    float spine = step(kk.x, 38.0);
    float hide = max(corner, spine);
    vec2 wv = vWorld.xz * 4.0;
    float weave = (abs(fract(wv.x) - 0.5) + abs(fract(wv.y) - 0.5)) * rDetail(wv);
    diffuseColor.rgb *= mix(vec3(1.0), mix(vec3(0.95 + weave * 0.2), vec3(0.5, 0.36, 0.3), hide), onBook);
    rRough = mix(rRough, mix(0.8, 0.45, hide), onBook);
    rBump *= mix(1.0, hide, onBook);
  }
}
if (rK == K_RST_PAGES) {
  // The edges of the leaves: a stripe of each, a little uneven.
  float l = vWorld.y * 3.0;
  float d = rDetail(vec2(l));
  diffuseColor.rgb *= 0.92 + 0.08 * rNoise(vec2(l, (vWorld.x + vWorld.z) * 0.03)) * d - 0.06 * d * step(0.5, fract(l));
  rRough = 0.85;
}
if (rK == K_RST_SLIP) {
  // An order slip, its corner in the vertex colour: the ticket's number heavy at its head, rows of something illegible under it, a rule, a total.
  vec2 s = diffuseColor.rg;
  float seed = diffuseColor.b;
  vec2 mm = s * vec2(80.0, 135.0);
  float down = 135.0 - mm.y - 12.0;
  float row = floor(down / 6.0);
  float inRow = rBand(fract(down / 6.0), 0.35, 0.68, 0.05);
  float len = 20.0 + 42.0 * rHash1(row * 7.0 + seed * 31.0);
  // Words of a few letters, each letter a few strokes.
  float words = smoothstep(0.3, 0.42, rNoise(vec2(mm.x * 0.35, row * 5.0 + seed * 17.0))) * (0.55 + 0.45 * step(0.35, rNoise(vec2(mm.x * 2.2, row * 3.0 + down * 0.4))));
  float ink = inRow * rBand(mm.x, 8.0, 8.0 + len, 0.4) * words * step(1.0, row) * step(row, 13.0) * step(0.0, down);
  float head = rBand(down, 0.0, 6.0, 0.3) * rBand(mm.x, 8.0, 34.0 + seed * 12.0, 0.4) * smoothstep(0.3, 0.45, rNoise(vec2(mm.x * 0.3, seed * 9.0)));
  float rule = rBand(down, 87.0, 87.6, 0.2) * rBand(mm.x, 6.0, 74.0, 0.3);
  float total = rBand(down, 91.0, 97.0, 0.3) * rBand(mm.x, 46.0, 70.0, 0.4) * words;
  float d = rDetail(mm * 0.5);
  float printed = clamp(ink + head + rule + total, 0.0, 1.0) * step(0.5, rN.z) * d;
  vec3 paper = vec3(0.93, 0.91, 0.84) * (0.96 + 0.04 * rNoise(mm * 0.2));
  diffuseColor.rgb = mix(paper, vec3(0.12, 0.12, 0.14), printed * 0.85);
  rRough = 0.9;
}
if (rK == K_RST_MINT) {
  // A peppermint: red wedges turning round a white middle, glossy with sugar.
  vec2 l = (diffuseColor.rg - 0.5) * 24.0;
  float r = length(l);
  float a = atan(l.y, l.x) + diffuseColor.b * 6.2832;
  float w = fract(a / 6.2832 * 8.0 + r * 0.03);
  float red = rBand(w, 0.08, 0.5, 0.03) * smoothstep(1.2, 2.8, r);
  diffuseColor.rgb = mix(vec3(0.9, 0.88, 0.85), vec3(0.7, 0.03, 0.05), red);
  rRough = 0.22;
  rCoat = 0.8;
  rCoatRough = 0.1;
}
`;

const EMISSIVE = /* glsl */ `
// Hottest along the underside, where the reflector sends their heat down onto the pass.
if (rK == K_RST_HEAT) rEmit += vec3(1.0, 0.1, 0.02) * uHeat.r * (0.3 + 0.5 * max(0.0, -rN.y));
`;

/** The pass's plates and the station's: one name, told apart by what they stand on. */
const onPass = (s: Solid) => s.name === "plates" && Math.abs((s.bottom ?? 0) - PASS.shelf.top) < 1;
const onStation = (s: Solid) => s.name === "plates" && Math.abs((s.bottom ?? 0) - STATION.top) < 1;

export const rest: Part = {
  build(b, solids) {
    buildPass(b, solids.filter((s) => PASS_THINGS.has(s.name) || onPass(s)));
    buildHost(b, solids.filter((s) => HOST_THINGS.has(s.name)));
    buildStation(b, solids.filter((s) => STATION_THINGS.has(s.name) || onStation(s)));
    buildBanquette(b, solids.filter((s) => s.name.startsWith("banquette")));
    buildWalls(b);
  },
  solid: { head: HEAD, color: COLOR, emissive: EMISSIVE },
};
