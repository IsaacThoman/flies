import assert from "node:assert/strict";
import { test } from "node:test";
import { HitMap } from "@fly/ui";
import type { BrainDriver } from "@fly/contracts";
import { TV_FRAME } from "../src/display.ts";
import { loadingLayout } from "../src/ui/layout.ts";
import { drawLoading } from "../src/ui/loading.ts";
import { blankCanvas, writtenOn } from "./canvas.ts";

test("download progress counts bytes, and a long wait never invents wired neurons", () => {
  for (const phase of ["download", "build"] as const) {
    const brain = { status: "loading", phase, progress: 0.5, source: { received: 7e6, total: 14e6 }, neurons: 0 } as unknown as BrainDriver;
    const g = blankCanvas();
    const hits = new HitMap();
    drawLoading(g, 3600, brain, loadingLayout(TV_FRAME), hits);
    const words = writtenOn(g).map((w) => w.text);
    assert.ok(!words.some((word) => word.includes("neurons")));
    assert.ok(words.includes(phase === "download" ? "7.0 / 14.0 MB" : "Waking brain"));
    assert.ok(words.includes("Explore"));
    assert.equal(hits.get(hits.count - 1)?.kind, "explore");
  }
});
