// Download bytes are measured. Wiring has no intermediate progress signal, so
// it uses an indeterminate bead. The player may explore the world during both.

import type { BrainDriver } from "@fly/contracts";
import { INK, INK_SOFT, font, glassPanel, pill, roundedRect, text, wrap } from "@fly/ui";
import type { HitMap } from "@fly/ui";
import { unmirrored } from "../brain/mirror.ts";
import type { BrainFailure, BrainSource } from "../brain/worker-driver.ts";
import type { LoadingLayout } from "./layout.ts";
import { drawWordmark } from "./wordmark.ts";

/** A brain that arrives over the network (worker-driver.ts): what the loading screen follows. */
export type Arriving = BrainDriver & { phase: "download" | "build" | "done"; progress: number; failure: BrainFailure | null; source: BrainSource; retry(): void };

/** The brain that arrives over the network, behind the mirror or not (brain/mirror.ts), or null for one that doesn't. */
export function arrival(brain: BrainDriver): Arriving | null {
  const inner = unmirrored(brain);
  return "source" in inner && "phase" in inner ? (inner as Arriving) : null;
}

/** Why it can't run when the page can't even draw the world: the browser lacks WebGL 2. */
export type PageFailure = "webgl";

/** What "Try again" is, as recorded in the hit map. */
export const LOADING_HITS = { retry: "retry", explore: "explore" } as const;

const format = (n: number) => Math.round(n).toLocaleString("en-US");
const megabytes = (bytes: number) => (bytes / 1e6).toFixed(1);

export function drawLoading(g: CanvasRenderingContext2D, t: number, brain: BrainDriver, layout: LoadingLayout, hits: HitMap) {
  const loading = arrival(brain);
  const phase = loading?.phase ?? (brain.status === "running" ? "done" : "build");
  const progress = loading?.progress ?? 0;
  const { wordmark } = layout;
  drawWordmark(g, wordmark.x, wordmark.y, wordmark.size);
  if (brain.status === "failed") {
    drawFailure(g, loading?.failure ?? "brain", brain.error ?? "", loading?.source ?? null, layout, hits);
    return;
  }
  const { x, y, w, h } = layout.panel;
  const cx = x + w / 2;
  glassPanel(g, x, y, w, h, 26);
  const running = brain.status === "running";
  const downloading = phase === "download";
  const title = running ? (loading?.source.storageFull ? "Awake · storage full" : "Awake") : downloading ? "Downloading brain" : "Waking brain";
  text(g, title, cx, y + 27, { size: 18, align: "center", color: INK_SOFT });
  // Bytes are measurable; initialization is not. Never turn elapsed time into
  // a neuron count or imply that a partial connectome can already decide.
  const amount = running ? `${format(brain.neurons)} neurons` : downloading && loading ? `${megabytes(loading.source.received)} / ${megabytes(loading.source.total)} MB` : "";
  text(g, amount, cx, y + 56, { size: 24, align: "center", color: INK });
  const bx = x + 32;
  const by = y + 69;
  const bw = w - 64;
  roundedRect(g, bx, by, bw, 8, 4);
  g.fillStyle = "rgba(10,60,120,0.2)";
  g.fill();
  if (downloading || running) {
    const fill = running ? 1 : Math.max(0, Math.min(1, progress));
    if (fill > 0) {
      roundedRect(g, bx, by, bw * fill, 8, Math.min(4, bw * fill / 2));
      g.fillStyle = "#78d85b";
      g.fill();
    }
  } else {
    // A moving bead means work, without promising how much is left.
    const at = (0.5 + 0.5 * Math.sin(t * 2)) * (bw - 18);
    roundedRect(g, bx + at, by, 18, 8, 4);
    g.fillStyle = "#9ee8ff";
    g.fill();
  }
  pill(g, cx - 65, y + 90, 130, 32, "Explore", { focused: true });
  hits.add(LOADING_HITS.explore, cx - 65, y + 90, 130, 32);
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
