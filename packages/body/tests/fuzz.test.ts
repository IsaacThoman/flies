import { test } from "node:test";
import { DINER } from "../../world/tests/diner.ts";
import { fuzzBody, places } from "../../../scripts/fuzz/body.ts";
import type { PlaceId } from "../../../scripts/fuzz/body.ts";

for (const id of Object.keys(places) as PlaceId[]) {
  test(`body fuzz: ${id}, fixed seeds, five simulated minutes each`, () => {
    for (const seed of [1, 2, 3]) fuzzBody(id, seed, 300);
  });
}

test("body fuzz: a diner of slabs, rails just over the floor among them, fixed seeds", () => {
  for (const seed of [1, 2, 3]) fuzzBody("diner", seed, 300, seed === 3, DINER);
});

test("windowsill high-start seed 4 no longer reaches the perch behind the glass", () => {
  fuzzBody("windowsill", 4, 2017, true);
});
