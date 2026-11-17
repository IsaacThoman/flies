import assert from "node:assert/strict";
import { mulberry32 } from "@fly/brain";
import { World } from "@fly/world";
import { Life } from "../../apps/web/src/life.ts";
import { InProcessBrain } from "./brain.ts";
import { checkBody, checkReach, checkRecovery, places, randomStart, snapshot } from "./body.ts";
import type { PlaceId } from "./body.ts";

export function checkMove(life: Life, id: PlaceId) {
  const oldFoods = new Set(life.pantry.foods);
  life.move(places[id]);
  const start = places[id].start;
  assert.deepEqual(life.body.position, { x: start.x, y: life.world.heightAt(start.x, start.z, start.y), z: start.z });
  assert.deepEqual(life.body.velocity, { x: 0, y: 0, z: 0 });
  assert.equal(life.body.mode, "standing");
  assert.equal(life.body.yaw, start.yaw);
  assert.equal(life.eating, false);
  assert.equal(life.pantry.foods.length, places[id].patches.length);
  assert.ok(life.pantry.foods.every(f => f.kind === "patch" && f.amount === 1 && !oldFoods.has(f)), "old food survived move");
  checkBody(life.body, life.world);
}

export function fuzzLife(id: PlaceId, seed: number, duration: number, data: ArrayBuffer, progress?: (seconds: number) => void, driver?: InProcessBrain) {
  const random = mulberry32(seed);
  const brain = driver ?? new InProcessBrain(data, seed);
  const life = new Life(new World(places[id]), brain);
  const counts = { walked: 0, rested: 0, fed: 0, flight: 0, moves: 0, looms: 0, strokes: 0, gusts: 0, nearFood: 0, farFood: 0 };
  let walkedAt = 0;
  let restedAt = 0;
  let displacedAt = 0;
  let lastPosition = { ...life.body.position };
  let nextEvent = 0;
  let event = 0;
  let eventUntil = 0;
  let nextMove = 45 + random() * 60;
  let nextProbe = 0;
  let nextReport = 60;
  let steps = 0;
  let travel = 0;
  const moveModes = new Set<string>();
  const loom = { id: 1, position: { x: 0, y: 0, z: 0 }, r: 4 };
  try {
    while (life.time < duration - 1e-8) {
      const time = life.time;
      const dt = Math.min(duration - time, random() < 0.01 ? 0.2 : 1 / 30);
      if (time >= nextMove) {
        moveModes.add(life.eating ? "feeding" : life.body.mode);
        const others = (Object.keys(places) as PlaceId[]).filter(p => p !== id);
        const destination = others[Math.floor(random() * others.length)];
        checkMove(life, destination);
        // Excursions exercise the carry; return so this run's hours belong to its named place.
        checkMove(life, id);
        counts.moves++;
        nextMove = time + 90 + random() * 180;
        lastPosition = { ...life.body.position };
      }
      if (time >= nextEvent) {
        event = Math.floor(random() * 5);
        eventUntil = time + 0.3 + random() * 4;
        nextEvent = eventUntil + 2 + random() * 15;
        if (event === 0 || event === 1) {
          const p = event === 0 ? life.body.position : randomStart(life.world, random);
          life.pantry.drop(random() < 0.5 ? "honey" : "sugar", p.x, p.z, p.y);
          if (event === 0) counts.nearFood++; else counts.farFood++;
        }
        if (event === 2) counts.strokes++;
        if (event === 3) {
          counts.gusts++;
          Object.assign(life.stimuli.air, { x: (random() * 2 - 1) * 600, y: (random() * 2 - 1) * 50, z: (random() * 2 - 1) * 600 });
        }
        if (event === 4) {
          counts.looms++;
          Object.assign(loom.position, { x: life.body.position.x + 18, y: life.body.position.y + 8, z: life.body.position.z + 60 });
          life.stimuli.looming = [loom];
          life.stimuli.threat = loom.position;
        }
      }
      life.stimuli.stroke = event === 2 && time < eventUntil ? 0.4 + random() * 0.6 : 0;
      if (time >= eventUntil || event !== 3) Object.assign(life.stimuli.air, { x: 0, y: 0, z: 0 });
      if (event === 4 && time < eventUntil) {
        loom.position.z -= 80 * dt;
      } else {
        life.stimuli.looming = [];
        life.stimuli.threat = null;
      }
      life.step(dt, performance.now());
      checkBody(life.body, life.world);
      checkReach(life.body, life.world);
      assert.equal(life.sensed.light, undefined, "eyes must stay shut");
      assert.ok(life.intent.live, "live brain produced stale commands");
      const state = brain.state!;
      for (const [key, value] of Object.entries(state.command)) {
        assert.ok(Number.isFinite(value), `${key} command not finite`);
        assert.ok(value >= (key === "turn" ? -1 : 0) && value <= 1, `${key} command out of bounds`);
      }
      for (const key of ["simMs", "wallMs", "spikes", "active"] as const) assert.ok(Number.isFinite(state.stats[key]) && state.stats[key] >= 0, `${key} statistic not finite/nonnegative`);
      for (const value of [...Object.values(state.stats.rates), ...brain.regionRates]) assert.ok(Number.isFinite(value) && value >= 0, "rate not finite/nonnegative");
      for (const value of Object.values(life.sensed)) if (typeof value === "number") assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
      assert.ok(Number.isFinite(life.eaten));
      for (const food of life.pantry.foods) assert.ok(Number.isFinite(food.amount) && food.amount >= 0 && food.amount <= 1);
      const distance = Math.hypot(life.body.position.x - lastPosition.x, life.body.position.z - lastPosition.z);
      travel += distance;
      if (distance > 0.01 || Math.abs(life.body.turnRate) > 0.1) displacedAt = time;
      if (life.body.onFeet && Math.abs(life.body.groundSpeed) > 0.2 && distance > 0.001) { counts.walked += dt; walkedAt = time; }
      if (life.body.onFeet && Math.abs(life.body.groundSpeed) <= 0.2) { counts.rested += dt; restedAt = time; }
      if (life.eating) counts.fed += dt;
      if (!life.body.onFeet) counts.flight += dt;
      assert.ok(time - walkedAt < 600, "no walking in ten minutes");
      assert.ok(time - restedAt < 600, "no resting in ten minutes");
      assert.ok(time - displacedAt < 600, "frozen with a live brain for ten minutes");
      lastPosition = { ...life.body.position };
      if (time >= nextProbe) { checkRecovery(life.body, life.world); nextProbe = time + 60; }
      if (time >= nextReport) { progress?.(time); nextReport += 60; }
      steps++;
    }
    if (duration >= 600) {
      assert.ok(counts.walked > 0 && counts.rested > 0, "did not both walk and rest");
      assert.ok(life.eaten > 0, "never ate any food offered near it");
    }
  } catch (error) {
    throw new Error(`${id} life seed=${seed} step=${steps} time=${life.time}\nReplay: npm run fuzz -- --kind life --place ${id} --seeds ${seed} --duration ${duration}\nState: ${JSON.stringify({ body: snapshot(life.body), intent: life.intent, sensed: life.sensed, counts })}`, { cause: error });
  } finally {
    brain.dispose();
  }
  return { kind: "life", place: id, seed, seconds: duration, steps, travel, meals: life.meals, takeOffs: life.takeOffs, eaten: life.eaten, moveModes: [...moveModes], ...counts };
}
