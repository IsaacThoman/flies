// Every solid of the world as its felt shape, at its felt height, coloured
// and made of what it is: few-sided as a far stand-in (the room-wide mesh,
// set.ts, and what the fly's eyes see), finely as an area's detail. The
// parts (parts.ts) start from these and draw their own where they can do
// better.

import * as THREE from "three";
import { TABLES } from "@fly/world";
import type { Solid } from "@fly/world";
import { AREAS, areaOf } from "./areas.ts";
import type { Builder } from "./builder.ts";
import { footprintSize, segmentsFor, solidGeometry } from "./geometry.ts";
import { KIND } from "./kinds.ts";

type Look = { kind: number; color: THREE.ColorRepresentation };

/** What each solid is made of, by name. */
export const LOOKS: Readonly<Record<string, Look>> = {
  ledge: { kind: KIND.mahogany, color: "#ffffff" },
  mullion: { kind: KIND.paint, color: "#1d3027" },
  transom: { kind: KIND.paint, color: "#1d3027" },
  zinc: { kind: KIND.zinc, color: "#ffffff" },
  "bar front": { kind: KIND.mahogany, color: "#ffffff" },
  underbar: { kind: KIND.steel, color: "#ffffff" },
  "foot rail": { kind: KIND.brass, color: "#ffffff" },
  "back bar": { kind: KIND.mahogany, color: "#ffffff" },
  bracket: { kind: KIND.brass, color: "#ffffff" },
  shelf: { kind: KIND.mahogany, color: "#ffffff" },
  "stool foot": { kind: KIND.iron, color: "#ffffff" },
  "stool post": { kind: KIND.iron, color: "#ffffff" },
  stool: { kind: KIND.leather, color: "#7a2018" },
  pendant: { kind: KIND.enamel, color: "#173326" },
  cord: { kind: KIND.plain, color: "#151210" },
  bottle: { kind: KIND.bottleFar, color: "#2a3a26" },
  "bottle neck": { kind: KIND.bottleFar, color: "#2a3a26" },
  table: { kind: KIND.marble, color: "#ffffff" },
  spider: { kind: KIND.iron, color: "#ffffff" },
  pedestal: { kind: KIND.iron, color: "#ffffff" },
  "table foot": { kind: KIND.iron, color: "#ffffff" },
  "table leg": { kind: KIND.oak, color: "#ffffff" },
  apron: { kind: KIND.oak, color: "#ffffff" },
  "chair seat": { kind: KIND.cane, color: "#ffffff" },
  "chair leg": { kind: KIND.bentwood, color: "#ffffff" },
  "chair post": { kind: KIND.bentwood, color: "#ffffff" },
  "chair rail": { kind: KIND.bentwood, color: "#ffffff" },
  "sugar caddy": { kind: KIND.glass, color: "#f4f8ff" },
  "bud vase": { kind: KIND.glass, color: "#eef6f0" },
  "flower stem": { kind: KIND.flower, color: "#3c6a2a" },
  flower: { kind: KIND.flower, color: "#c8243a" },
  votive: { kind: KIND.glass, color: "#f6e8d8" },
  "sugar packet": { kind: KIND.paper, color: "#f2eadc" },
  shaker: { kind: KIND.glass, color: "#f4f6f8" },
  "glass foot": { kind: KIND.glass, color: "#f4f8ff" },
  "glass stem": { kind: KIND.glass, color: "#f4f8ff" },
  "wine glass": { kind: KIND.glass, color: "#f4f8ff" },
  ketchup: { kind: KIND.glossy, color: "#b0140e" },
  "ketchup neck": { kind: KIND.glossy, color: "#b0140e" },
  "ketchup cap": { kind: KIND.glossy, color: "#c8c8c0" },
  menu: { kind: KIND.paper, color: "#e8e0cc" },
  "bread basket": { kind: KIND.cane, color: "#ffffff" },
  bread: { kind: KIND.bread, color: "#b06a2c" },
  saucer: { kind: KIND.ceramic, color: "#f6f4ee" },
  "espresso cup": { kind: KIND.ceramic, color: "#f6f4ee" },
  "fruit bowl": { kind: KIND.ceramic, color: "#e9e4d8" },
  orange: { kind: KIND.fruit, color: "#f07c14" },
  lemon: { kind: KIND.fruit, color: "#f2cc2a" },
  peach: { kind: KIND.fruit, color: "#f09a5a" },
  board: { kind: KIND.oak, color: "#ffffff" },
  "lemon slice": { kind: KIND.fruit, color: "#f4e070" },
  knife: { kind: KIND.steel, color: "#ffffff" },
  "knife handle": { kind: KIND.glossy, color: "#1a1410" },
  "bar mat": { kind: KIND.rubber, color: "#1a1a1a" },
  "shaker tin": { kind: KIND.steel, color: "#ffffff" },
  "cake stand": { kind: KIND.ceramic, color: "#f4f2ec" },
  "cake plate": { kind: KIND.ceramic, color: "#f4f2ec" },
  cloche: { kind: KIND.glass, color: "#f4f8ff" },
  "cloche knob": { kind: KIND.glass, color: "#f4f8ff" },
  pass: { kind: KIND.steel, color: "#ffffff" },
  "heat lamp": { kind: KIND.steel, color: "#ffffff" },
  "ticket rail": { kind: KIND.steel, color: "#ffffff" },
  ticket: { kind: KIND.paper, color: "#f4f0e2" },
  "dessert plate": { kind: KIND.ceramic, color: "#f6f4ee" },
  plates: { kind: KIND.ceramic, color: "#f2f0ea" },
  "host stand": { kind: KIND.mahogany, color: "#ffffff" },
  menus: { kind: KIND.leather, color: "#2a1a12" },
  book: { kind: KIND.glossy, color: "#5a1414" },
  mints: { kind: KIND.glass, color: "#f4f8ff" },
  station: { kind: KIND.mahogany, color: "#ffffff" },
  "cutlery tray": { kind: KIND.oak, color: "#ffffff" },
  carafe: { kind: KIND.glass, color: "#f4f8ff" },
  "carafe neck": { kind: KIND.glass, color: "#f4f8ff" },
  tumbler: { kind: KIND.glass, color: "#f4f8ff" },
  banquette: { kind: KIND.leather, color: "#6a1a14" },
  "banquette back": { kind: KIND.leather, color: "#6a1a14" },
  mirror: { kind: KIND.mirror, color: "#ffffff" },
  chalkboard: { kind: KIND.chalk, color: "#ffffff" },
  print: { kind: KIND.print, color: "#ffffff" },
  "exit sign": { kind: KIND.exit, color: "#ffffff" },
};

/** Long things that run through several areas: drawn in a piece for each. */
const LONG = new Set(["zinc", "bar front", "underbar", "foot rail", "back bar", "shelf", "banquette", "banquette back"]);

/** What a solid is made of (the oak four-tops' tops are oak, not marble). */
export function lookOf(solid: Solid): Look {
  if (solid.name === "table") {
    const t = TABLES.find((t) => Math.abs(t.x - solid.footprint.x) < 1 && Math.abs(t.z - solid.footprint.z) < 1);
    if (t?.kind === "four") return { kind: KIND.oak, color: "#ffffff" };
  }
  const look = LOOKS[solid.name];
  if (!look) throw new Error(`No look for ${solid.name}`);
  return look;
}

/** A long solid in pieces, one for each area it runs through (along z), each with its area. */
export function pieces(solid: Solid): { piece: Solid; area: number }[] {
  const f = solid.footprint;
  if (!LONG.has(solid.name) || f.kind !== "box") return [{ piece: solid, area: areaOf(solid) }];
  const out: { piece: Solid; area: number }[] = [];
  const z0 = f.z - f.hz;
  const z1 = f.z + f.hz;
  for (const a of AREAS) {
    if (f.x < a.x0 || f.x > a.x1 || (solid.bottom ?? 0) + 1 < a.y0 || (solid.bottom ?? 0) + 1 > a.y1) continue;
    const lo = Math.max(z0, a.z0);
    const hi = Math.min(z1, a.z1);
    if (hi - lo < 1) continue;
    out.push({ piece: { ...solid, footprint: { ...f, z: (lo + hi) / 2, hz: (hi - lo) / 2 } }, area: a.id });
  }
  return out;
}

/**
 * A solid drawn as its felt shape: few-sided as its area's stand-in (`far`),
 * finely as its area's detail (`near`). Things on the walls, in no area, are
 * drawn once with the shell.
 */
export function generic(b: Builder, solid: Solid, near: boolean, far: boolean) {
  const look = lookOf(solid);
  const size = footprintSize(solid);
  for (const { piece, area } of pieces(solid)) {
    if (area === 0) {
      if (near) b.shell(solidGeometry(piece, segmentsFor(size, true), 6, solid), look.color, look.kind);
      continue;
    }
    if (far) b.standIn(area, solidGeometry(piece, segmentsFor(size, false), 2, solid), look.color, look.kind);
    if (near) b.detail(area, solidGeometry(piece, segmentsFor(size, true), 6, solid), look.color, look.kind);
  }
}
