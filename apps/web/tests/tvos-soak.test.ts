import assert from "node:assert/strict";
import { test } from "node:test";
import { soakConfig } from "../../../scripts/tvosSoak.ts";
import { PLACES } from "../src/places/catalog.ts";
import { TIMES } from "../src/scene/light.ts";
import { WEATHERS } from "@fly/world";

test("the device soak visits every place, weather and daylight and divides wallpaper time among them", () => {
  const config = soakConfig(60);
  const logs = config.drive.filter((s) => s[0] === "log").map((s) => s[1]);
  for (const place of PLACES) for (const weather of WEATHERS) for (const time of TIMES) assert.ok(logs.includes(`${place.id} ${weather} ${time}`));
  let wallpaperMs = 0;
  config.drive.forEach((step, i) => {
    if (step[0] === "log" && step[1].endsWith(" wallpaper")) {
      assert.equal(config.drive[i + 1][0], "sleep");
      wallpaperMs += config.drive[i + 1][1] as number;
    }
  });
  assert.equal(wallpaperMs, 60 * 60000);
  const waits = config.drive.filter((s) => s[0] === "wait").map((s) => s[1] as Record<string, string>);
  // The first wait marks when the splash lifts.
  assert.deepEqual(waits[0], { ready: "true" });
  assert.ok(waits.some((s) => s.screen === "settings" && s.tab === "picture"));
  assert.ok(waits.some((s) => s.tab === "wallpaper"));
  // Stepping through Settings' place carries the fly to each place on the way: pin once, then the Place tool moves the pin.
  assert.equal(waits.filter((s) => s.focus === "place").length, 1);
  // The wallpaper's default minute must not race a wait's own default minute.
  assert.ok(config.drive.every((s) => s[0] !== "wait" || (s[1] as Record<string, string>).wallpaper !== "true" || (s[2] ?? 0) > 60000));
  assert.ok(waits.every((s) => !["pause", "wallpaper", "picture"].includes(s.screen)));
  assert.throws(() => soakConfig(1));
});
