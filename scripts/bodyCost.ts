// Compares ordinary body frames against a git revision, on identical geometry
// and precomputed starts. Setup is outside the timer; run order alternates.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { mulberry32 } from "@fly/brain";
import { FlyBody, createIntent } from "@fly/body";
import { World } from "@fly/world";
import { places, randomStart, still } from "./fuzz/body.ts";
import type { PlaceId } from "./fuzz/body.ts";

const { values } = parseArgs({ options: {
  baseline: { type: "string", default: "origin/dev" },
  steps: { type: "string", default: "5000" },
  rounds: { type: "string", default: "9" },
} });
const steps = Number(values.steps);
const rounds = Number(values.rounds);
if (!Number.isSafeInteger(steps) || steps < 1000 || !Number.isSafeInteger(rounds) || rounds < 3) throw new Error("Use at least 1000 steps and 3 rounds");
const ref = execFileSync("git", ["rev-parse", values.baseline], { encoding: "utf8" }).trim();
const temp = mkdtempSync(join(tmpdir(), "fly-body-cost-"));
try {
  for (const [file, source] of Object.entries({ "motion.ts": "packages/body/src/motion.ts", "behavior.ts": "packages/body/src/behavior.ts", "world.ts": "packages/world/src/world.ts", "shapes.ts": "packages/world/src/shapes.ts" })) {
    const code = execFileSync("git", ["show", `${ref}:${source}`], { encoding: "utf8" });
    writeFileSync(join(temp, file), code.replaceAll('"@fly/world"', '"./world.ts"'));
  }
  const { FlyBody: BeforeBody } = await import(pathToFileURL(join(temp, "motion.ts")).href) as { FlyBody: typeof FlyBody };
  const { World: BeforeWorld } = await import(pathToFileURL(join(temp, "world.ts")).href) as { World: typeof World };
  const walking = { ...createIntent(), live: true, walking: true, speed: 10, yawRate: 0.7 };
  const flying = { ...createIntent(), live: true, wings: 0.6, airYawRate: 0.7 };
  console.log(JSON.stringify({ baseline: ref, steps, rounds, unit: "CPU microseconds/step", timer: typeof process.threadCpuUsage === "function" ? "threadCpuUsage" : "cpuUsage", dt: 1 / 60, node: process.version }));
  for (const id of Object.keys(places) as PlaceId[]) {
    const afterWorld = new World(places[id]);
    const beforeWorld = new BeforeWorld(places[id]);
    for (const mode of ["walking", "flying"] as const) {
      const random = mulberry32(42);
      const starts = Array.from({ length: steps }, () => ({ ...randomStart(afterWorld, random), lift: 10 + random() * 150, vx: (random() * 2 - 1) * 340, vy: (random() * 2 - 1) * 620, vz: (random() * 2 - 1) * 340 }));
      const samples = { before: [] as number[], after: [] as number[] };
      let checksum = 0;
      const bodiesByVersion = {
        before: starts.map(start => new BeforeBody(beforeWorld, start)),
        after: starts.map(start => new FlyBody(afterWorld, start)),
      };
      for (let round = -2; round < rounds; round++) {
        const order = round % 2 === 0 ? ["before", "after"] as const : ["after", "before"] as const;
        for (const version of order) {
          const bodies = bodiesByVersion[version];
          for (let i = 0; i < bodies.length; i++) {
            const body = bodies[i];
            const start = starts[i];
            body.place(start.x, start.z, start.yaw);
            body.blocked = false;
            if (mode === "flying") {
              body.position.y += start.lift;
              body.mode = "airborne";
              body.velocity.x = start.vx;
              body.velocity.y = start.vy;
              body.velocity.z = start.vz;
            }
          }
          global.gc?.();
          const intent = mode === "walking" ? walking : flying;
          const start = process.threadCpuUsage?.() ?? process.cpuUsage();
          for (const body of bodies) body.step(intent, still, 1 / 60);
          const end = process.threadCpuUsage?.() ?? process.cpuUsage();
          const elapsed = end.user + end.system - start.user - start.system;
          for (const body of bodies) checksum += body.position.y;
          if (round >= 0) samples[version].push(elapsed / steps);
        }
      }
      const median = (xs: number[]) => xs.toSorted((a, b) => a - b)[Math.floor(xs.length / 2)];
      const before = median(samples.before);
      const after = median(samples.after);
      console.log(JSON.stringify({ place: id, mode, before, after, ratio: after / before, samples, checksum }));
    }
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
