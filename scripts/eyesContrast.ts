// What the fly's eyes take from coloured things, measured in the game's own
// eyes (apps/web/src/eyes/eyes.ts) in a GPU Chromium: the fly held on a clear
// stretch of the picnic table at midday, a thing set down in front of it in
// the layer only the eyes see, and the same scene seen with it and without
// it. The facets that differ are the thing's; printed for each: how many,
// their light with it and without it, and the contrast (1 - with / without).
// For docs/simulation.md (The eyes).
//
//   node scripts/eyesContrast.ts [--url http://localhost:5173/]
//
// The things: a fingertip's size and shape (a flattened capsule 15 mm wide,
// 9 high and 27 long, lying 6 mm ahead of the head, pointing at it) in white,
// the Finger tool's skin (#eab39a; glossy as that skin is, and matte) and near
// black; the Build kit's colours as a dish (22 mm across, 5 high) and a tile
// (14 mm square, 0.5 high); and the ball's stripes as a 20 mm sphere. Each is
// a plain MeshStandardMaterial, not the tool's own mesh.

import type { ChildProcess } from "node:child_process";
import { parseArgs } from "node:util";
import type * as Three from "three";
import type { Game } from "../apps/web/src/game.ts";
import { KIT_COLOURS } from "../apps/web/src/scene/kit.ts";
import { openGame, readState, startServer, stopServer, waitFor, waitForGameTime } from "./play.ts";

const { values } = parseArgs({ options: { url: { type: "string", default: "" } } });
type Shape = "finger" | "dish" | "tile" | "ball";
const THINGS: [string, string, Shape, number][] = [
  ["white", "#ffffff", "finger", 0.55],
  ["skin", "#eab39a", "finger", 0.55],
  ["skin", "#eab39a", "finger", 1],
  ["near black", "#202020", "finger", 0.55],
  ...Object.entries(KIT_COLOURS).flatMap(([name, colour]) => [[`kit ${name}`, colour, "dish", 0.5], [`kit ${name}`, colour, "tile", 0.5]] as [string, string, Shape, number][]),
  ...["#b0183a", "#e0284a", "#4a2060", "#2c4a3a"].map((colour) => ["ball stripe", colour, "ball", 0.5] as [string, string, Shape, number]),
];
type Hooked = { __fly: Game; __three: typeof Three; __spot: { x: number; z: number; yaw: number }; __thing: Three.Mesh | null };

let url = values.url;
let server: ChildProcess | null = null;
if (!url) {
  const started = await startServer();
  url = started.url;
  server = started.server;
}
const { browser, page } = await openGame({ url: `${url}${url.includes("?") ? "&" : "?"}alone`, steady: true });
const press = async (key: string, times = 1) => {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
    await waitForGameTime(page, 0.15);
  }
};
try {
  await waitFor(page, "brain=running", 180_000);
  await waitFor(page, "screen=title");
  await press("Enter");
  await waitFor(page, "screen=play");
  // The Sky: Select steps its weather, Up and Down its time of day.
  for (let i = 0; i < 12 && (await readState(page)).tool !== "sky"; i++) {
    const at = (await readState(page)).tool;
    await page.keyboard.press("ArrowRight");
    await waitFor(page, `tool~^(?!${at}$)`);
  }
  await press("Enter");
  await waitFor(page, "weather=clear");
  await press("ArrowDown", 2);
  await waitFor(page, "time=noon");
  await page.evaluate(async () => {
    const g = globalThis as unknown as Hooked;
    // The game's own three.js, so that its renderer draws what is made here.
    const three = performance.getEntriesByType("resource").map((e) => e.name).find((name) => /deps\/three(\.module)?\.js/.test(name));
    if (!three) throw new Error("three.js wasn't loaded as a module");
    g.__three = (await import(/* @vite-ignore */ three)) as typeof Three;
    const game = g.__fly;
    const world = game.life.world;
    // A clear stretch of the picnic table: nothing standing within 60 mm, and well inside its edge.
    for (let r = 0; r < 300 && !g.__spot; r += 10) {
      for (let a = 0; a < 16 && !g.__spot; a++) {
        const x = Math.cos((a / 16) * Math.PI * 2) * r;
        const z = Math.sin((a / 16) * Math.PI * 2) * r;
        let clear = world.onTable(x, z) && world.onTable(x * 1.3 + 80, z * 1.3 + 80) && world.onTable(x * 1.3 - 80, z * 1.3 - 80);
        for (let k = 0; k < 64 && clear; k++) clear = world.heightAt(x + Math.cos(k) * (k % 8) * 9, z + Math.sin(k) * (k % 8) * 9) === 0;
        if (clear) g.__spot = { x, z, yaw: Math.atan2(-x, -z) };
      }
    }
    if (!g.__spot) throw new Error("no clear spot on the table");
    // Held where it was set down, its brain running on: the same scene for every look.
    const body = game.life.body;
    const step = body.step.bind(body);
    body.step = (...a: Parameters<typeof body.step>) => {
      step(...a);
      game.life.setDown(g.__spot.x, g.__spot.z, g.__spot.yaw);
    };
  });
  /** The fly's next complete picture of its facets. */
  const picture = async () => {
    const after = Number((await readState(page)).eyesUpdates);
    await waitFor(page, `eyesUpdates>${after + 1}`);
    return page.evaluate(() => {
      const light = (globalThis as unknown as Hooked).__fly.eyes.light!;
      return [...light.left, ...light.right];
    });
  };
  await waitForGameTime(page, 6);
  const bare = await picture();
  console.log(`Midday on the picnic table, eyes' gain ${(await readState(page)).eyesGain}: all ${bare.length} facets average ${(bare.reduce((s, x) => s + x, 0) / bare.length).toFixed(2)}`);
  for (const [name, colour, shape, roughness] of THINGS) {
    await page.evaluate(([colour, shape, roughness]) => {
      const g = globalThis as unknown as Hooked;
      const THREE = g.__three;
      const s = g.__spot;
      // Each: its geometry, how high its middle is, and how far ahead of the fly's middle.
      const made: Record<Shape, [Three.BufferGeometry, number, number]> = {
        finger: [new THREE.CapsuleGeometry(6, 24, 6, 12).rotateX(Math.PI / 2).scale(1.25, 0.75, 1), 4.5, 21],
        dish: [new THREE.CylinderGeometry(11, 11, 5, 24), 2.5, 17],
        tile: [new THREE.BoxGeometry(14, 0.5, 14), 0.25, 11],
        ball: [new THREE.SphereGeometry(10, 24, 16), 10, 25],
      };
      const [geometry, y, ahead] = made[shape as Shape];
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: colour as string, roughness: roughness as number, metalness: 0 }));
      mesh.position.set(s.x + Math.sin(s.yaw) * ahead, y, s.z + Math.cos(s.yaw) * ahead);
      mesh.rotation.y = s.yaw;
      mesh.layers.set(1);
      g.__fly.stage.scene.add(mesh);
      g.__thing = mesh;
    }, [colour, shape, roughness] as const);
    const withIt = await picture();
    await page.evaluate(() => {
      const g = globalThis as unknown as Hooked;
      g.__thing?.removeFromParent();
      g.__thing = null;
    });
    const without = await picture();
    let n = 0;
    let lit = 0;
    let behind = 0;
    for (let i = 0; i < withIt.length; i++) {
      if (Math.abs(withIt[i] - without[i]) <= 0.01) continue;
      n++;
      lit += withIt[i];
      behind += without[i];
    }
    console.log(`${`${name} ${colour} (${shape}${roughness === 1 ? ", matte" : ""})`.padEnd(36)} ${String(n).padStart(4)} facets: ${(lit / n).toFixed(2)} against ${(behind / n).toFixed(2)}, contrast ${(1 - lit / behind).toFixed(2)}`);
  }
} finally {
  await browser.close();
  if (server) await stopServer(server);
}
