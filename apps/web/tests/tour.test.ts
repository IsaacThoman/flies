// Going round the places happens only in the screensaver, at home, when the
// player chose it, after so long watched in one place; never in play, on a
// visit or at a table.

import assert from "node:assert/strict";
import { test } from "node:test";
import { PLACES, nextPlace } from "../src/places/catalog.ts";
import { PLACE_TURN, Tour } from "../src/places/tour.ts";

test("watched at home, going round, it moves on after twenty minutes in one place, to the next, and starts counting again", () => {
  assert.equal(PLACE_TURN, 20 * 60);
  const tour = new Tour();
  for (let t = 0; t < PLACE_TURN - 1; t += 10) assert.equal(tour.next(10, "picnic", true, true, true), null);
  assert.equal(tour.next(2, "picnic", true, true, true), nextPlace("picnic"));
  tour.arrived();
  assert.equal(tour.next(1, nextPlace("picnic"), true, true, true), null);
  // Round them all, back to the first.
  assert.equal(nextPlace(PLACES.at(-1)!.id), PLACES[0].id);
});

test("in play, on a visit or at a table, or staying home, it is never carried on, and play doesn't count", () => {
  const cases: [watching: boolean, home: boolean, turns: boolean][] = [[false, true, true], [true, false, true], [true, true, false], [false, false, false]];
  for (const [watching, home, turns] of cases) {
    const tour = new Tour();
    for (let i = 0; i < 100; i++) assert.equal(tour.next(60, "lab", watching, home, turns), null, JSON.stringify({ watching, home, turns }));
  }
  // Played between screensavers: only watching counts.
  const tour = new Tour();
  tour.next(PLACE_TURN - 5, "lab", true, true, true);
  assert.equal(tour.next(3600, "lab", false, true, true), null);
  assert.equal(tour.next(4, "lab", true, true, true), null);
  assert.equal(tour.next(2, "lab", true, true, true), nextPlace("lab"));
});

test("a shorter turn, for scripts, is the same rule", () => {
  const tour = new Tour();
  tour.turn = 2;
  assert.equal(tour.next(1.5, "kitchen", true, true, true), null);
  assert.equal(tour.next(1, "kitchen", true, true, true), nextPlace("kitchen"));
});
