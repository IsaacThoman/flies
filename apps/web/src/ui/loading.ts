// The loading screen while the brain wakes: the world is already there behind
// it, and the brain's size counts up as its bytes arrive and it is wired
// together. If it can't wake, it says why, in a word or two, and offers to try
// again: Select, or a tap or a click on the button (recorded in `hits`).

import type { BrainDriver } from "@fly/contracts";
import { INK, INK_SOFT, font, glassPanel, pill, roundedRect, text, wrap } from "@fly/ui";
import type { HitMap } from "@fly/ui";
import type { BrainFailure, BrainSource } from "../brain/worker-driver.ts";
import type { LoadingLayout } from "./layout.ts";
import { drawWordmark } from "./wordmark.ts";

/** The connectome's size, known before it arrives (packages/brain/README.md). */
export const NEURONS = 166_700;
export const CONNECTIONS = 6_242_118;

/** A brain that arrives over the network (worker-driver.ts): what the loading screen follows. */
type Arriving = BrainDriver & { phase: "download" | "build" | "done"; progress: number; failure: BrainFailure | null; source: BrainSource; retry(): void };

export const arriving = (brain: BrainDriver): brain is Arriving => "source" in brain && "phase" in brain;

/** Why it can't run when the page can't even draw the world: the browser lacks WebGL 2. */
export type PageFailure = "webgl";

/** What "Try again" is, as recorded in the hit map. */
export const LOADING_HITS = { retry: "retry" } as const;

const format = (n: number) => Math.round(n).toLocaleString("en-US");
const megabytes = (bytes: number) => (bytes / 1e6).toFixed(1);

export function drawLoading(g: CanvasRenderingContext2D, t: number, brain: BrainDriver, layout: LoadingLayout, hits: HitMap) {
  const loading = arriving(brain) ? brain : null;
  const phase = loading?.phase ?? (brain.status === "running" ? "done" : "build");
  const progress = loading?.progress ?? 0;
  const { wordmark } = layout;
  drawWordmark(g, wordmark.x, wordmark.y, wordmark.size, t);
  if (brain.status === "failed") {
    drawFailure(g, loading?.failure ?? "brain", brain.error ?? "", loading?.source ?? null, layout, hits);
    return;
  }
  const { x, y, w, h } = layout.panel;
  const cx = x + w / 2;
  glassPanel(g, x, y, w, h, 26);
  const running = brain.status === "running";
  const fill = running ? 1 : phase === "download" ? progress * 0.9 : 0.9 + 0.1 * (1 - Math.exp(-t * 0.5));
  const title = running ? (loading?.source.storageFull ? "Awake! (not kept: storage full)" : "Awake!") : phase === "download" ? "Waking the fly's brain" : "Wiring up its neurons";
  text(g, title, cx, y + 36, { size: 19, align: "center", color: INK_SOFT });
  text(g, `${format(running ? brain.neurons : NEURONS * fill)} neurons`, cx, y + 76, { size: 34, align: "center", color: INK });
  // The progress bar: a glossy tube filling with green, with the bytes under it while they come over the network.
  const bx = x + Math.min(40, w / 11);
  const by = y + 92;
  const bw = w - 2 * (bx - x);
  roundedRect(g, bx, by, bw, 14, 7);
  g.fillStyle = "rgba(10, 60, 120, 0.25)";
  g.fill();
  roundedRect(g, bx, by, Math.max(14, bw * fill), 14, 7);
  const grad = g.createLinearGradient(0, by, 0, by + 14);
  grad.addColorStop(0, "#c9ff9c");
  grad.addColorStop(0.5, "#5fd13a");
  grad.addColorStop(1, "#2f9d22");
  g.fillStyle = grad;
  g.fill();
  roundedRect(g, bx + 4, by + 2, Math.max(6, bw * fill - 8), 4, 2);
  g.fillStyle = "rgba(255,255,255,0.6)";
  g.fill();
  if (loading && phase === "download" && loading.source.from === "network") {
    text(g, `${megabytes(loading.source.received)} of ${megabytes(loading.source.total)} MB`, cx, by + 30, { size: 13, align: "center", color: INK_SOFT });
  }
}

/** What to say for each way it can fail: a heading, and a line on what happens next. */
function explain(failure: BrainFailure | PageFailure, error: string, source: BrainSource | null): [string, string] {
  switch (failure) {
    case "offline":
      return ["You're offline", `Its brain (${megabytes(source?.total ?? 0)} MB) comes down once. It wakes when you're back online.`];
    case "download":
      return ["The download stopped", source && source.received > 0 ? `${megabytes(source.received)} of ${megabytes(source.total)} MB arrived. It carries on from there.` : "The server couldn't be reached."];
    case "missing":
      return ["Its brain isn't on this server", error];
    case "damaged":
      return ["Its brain arrived damaged", "It will be fetched again."];
    case "memory":
      return ["Not enough memory for its brain", "Close other tabs or apps, then try again."];
    case "unsupported":
      return ["This browser can't run its brain", /DecompressionStream/.test(error) ? "It needs a newer browser, one that can unzip files itself." : "It needs a browser whose workers can load modules."];
    case "webgl":
      return ["This browser can't draw its world", "It needs WebGL 2. Try another browser, or turn on graphics acceleration."];
    default:
      return ["The fly's brain didn't wake", error];
  }
}

/** The failure panel, over the world or (without WebGL) over nothing at all. */
export function drawFailure(g: CanvasRenderingContext2D, failure: BrainFailure | PageFailure, error: string, source: BrainSource | null, layout: LoadingLayout, hits: HitMap) {
  const { x, y, w } = layout.failure;
  const cx = x + w / 2;
  const [heading, line] = explain(failure, error, source);
  glassPanel(g, x, y, w, layout.failure.h, 26);
  // Narrower than the TV's, the heading comes down a size to fit.
  g.font = font(22);
  const size = Math.min(22, Math.floor((22 * (w - 32)) / Math.max(1, g.measureText(heading).width)));
  text(g, heading, cx, y + 40, { size, align: "center", color: INK });
  const lines = wrap(g, line, w - 60, 13);
  for (let i = 0; i < Math.min(2, lines.length); i++) text(g, lines[i], cx, y + 66 + i * 18 - (lines.length > 1 ? 6 : 0), { size: 13, align: "center", color: INK_SOFT });
  const b = layout.retry;
  pill(g, b.x, b.y, b.w, b.h, "Try again", { focused: true });
  hits.add(LOADING_HITS.retry, b.x, b.y, b.w, b.h);
}
