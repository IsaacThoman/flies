// About the fly: what it is, honestly, where its wiring comes from, and,
// where the Apple TV tells it the weather outside, Apple Weather's
// attribution, which Apple requires of an app showing its data.

import type { RemoteButton, WeatherAttribution } from "@fly/contracts";
import { INK, INK_SOFT, Scroller, glassPanel, hintChip, hintWidth, iconButton, orb, pill, roundedRect, text, wrap } from "@fly/ui";
import type { HitMap } from "@fly/ui";
import type { Frame } from "../../display.ts";
import { backButton, fitPane } from "../layout.ts";
import type { Rect } from "../layout.ts";
import { drawMenuHints } from "./menu-screen.ts";
import { SCREEN_HITS } from "./types.ts";
import type { Point, Screen, Shell } from "./types.ts";

import NOTICES from "../notices.json" with { type: "json" };

type Block = { heading?: string; body: string };

export const ABOUT: readonly Block[] = [
  { heading: "A fruit fly on your screen", body: "A simulation of its whole central nervous system, its brain and nerve cord, chooses through what its body feels, moment by moment. The body supplies physics, a sustained-flight reflex and occasional take-offs while it walks." },
  { heading: "Its brain", body: "166,700 spiking neurons joined by 6.2 million connections, wired as they are in a real male fruit fly. Each neuron is a simple model of a nerve cell: it gathers input from the neurons that connect to it and fires when that input is strong enough, after Shiu and colleagues (Nature, 2024). In a browser it runs in the background; on the Apple TV it runs as native code." },
  { heading: "What it feels", body: "Sugar on its feet and its mouthparts. Touch, from a feather, a soap bubble bursting on it, a raindrop or a falling leaf landing on it, or bumping into things in the air. Air rushing past its antennae: a puff, a gust of wind, its own flight. Its antennae pressing against something on the left or the right. The weight on its legs while it stands. And light: the picture on each of the 1,772 facets of its eyes, rendered from where its head is. (With its eyes off in Settings, the game measures how fast anything nearby grows in each eye instead.) Each sense drives the sensory neurons that carry it in the real fly." },
  { heading: "What it does", body: "Each action is read from the fly's own neurons: walking from DNg100, steering from the two DNa02s, backing up from the moonwalker neurons, the escape jump from the giant fibre, flight effort from its wing muscles' motor neurons, grooming from DNg12, and feeding from MN9, which moves its proboscis. The stats in a corner (Settings, On screen), as In and out, show them all as they fire." },
  { heading: "Its nervous system, at work", body: "The X-ray (Settings, Screensaver; or View, Inside it) shows the fly as glass with its brain, nerve cord and nerves inside, and a picture in a corner shows them from above. Their shapes are measured from one real male's, in the same FlyEM dataset its wiring comes from. Each part glows with how fast the neurons of its region of the model fire, on that region's own scale, and nothing else lights it: blue for sensory neurons, amber for the neurons between, red for those that drive muscles and glands. Some never fire in this model and stay dark: the photoreceptors (its light enters one synapse in, at the lamina), smell, and most of the body's senses. A region glows with the average of all its neurons, so a command carried by a few, such as the giant fibre's escape, hardly shows; the motor neurons it sets firing do. The cord's own neurons light their whole side together for now. The shapes are an anatomical drawing: they don't show where each neuron is." },
  { heading: "What the body adds", body: "The model has no physics, so the game supplies it: the fly stays on the surface it walks on, slides along what it walks into, falls off edges, and in the air has weight, drag and the push of its wings. A gust carries it in the air as moving air would. It stays on the table. When it has pushed against a wall it faces for two seconds, the body turns it away. It lands on what it comes down on; when its brain makes it jump, the body picks the direction (away from the ball if the ball is in the air); and it shuffles its mouth onto food its brain has already decided to eat. Once the brain triggers take-off, a body reflex holds flight power for a while, standing in for missing biology. And now and then, while its brain walks it, the body takes it into the air of its own accord, since the model can't start a flight without a threat. None of these is shown as the brain's doing." },
  { heading: "Its world", body: "The sky follows the clock and the weather a forecast of its own, unless you choose them; an Apple TV that can tell the weather outside follows that instead, and the real sunrise and sunset. Left alone, the picnic has its goings-on: a gust, a gull's shadow, a leaf on the wind, a butterfly, a ladybird, a boat on the lake, a drop of juice or a crumb to find. None is aimed or timed at the fly. They reach it only as it sees, feels and tastes them, and what it does about them is its brain's." },
  { heading: "What it isn't", body: "It is a model, not a fly. It doesn't learn or smell anything. Made-up hunger and sleep drives change its sensory input, background activity and arousal; they stand in for biology the connectome alone doesn't provide. Which taste neurons count as 'sweet' was chosen by what they do in the model. At rest, a slowly wandering background in its eyes stands in for everything the wiring doesn't contain, and makes it wander; its turns lean to the left. Some senses do less than in a fly: pressing its antennae on a wall makes it groom them, but reaches no walking-backward or steering neurons, so a wall doesn't turn it by itself." },
  { heading: "Thanks", body: "The wiring, and the shapes its nervous system is drawn with, are the FlyEM male CNS connectome's, from Janelia Research Campus, published under CC-BY 4.0 (male-cns.janelia.org). The neuron model follows Shiu et al., 'A Drosophila computational brain model reveals sensorimotor processing', Nature 634 (2024)." },
];

/**
 * Apple Weather's attribution: its mark, that the game changes the data it
 * gives (Apple's terms for a "value-added" use), and the legal attribution as
 * text, since tvOS can't open the legal page.
 */
export function weatherBlock(a: WeatherAttribution): Block {
  return {
    heading: "\uF8FF Weather",
    body: `On "Now", the weather and the times of sunrise and sunset where your Apple TV is come from ${a.service}. The game turns them into its own weather and light, so what it shows is Apple's data, modified. ${a.legalText} Other data sources: ${a.legalPage}`,
  };
}

const BODY = 16;
const LINE = 23;
const HEADING = 19;

/** Keep the footer above button hints, even when a keyboard is used on a tall screen. */
function readingPane(frame: Frame): Rect {
  const pane = fitPane(frame, 620, 404, 8);
  pane.h = Math.min(pane.h, frame.design.height - frame.safe.bottom - 51 - pane.y);
  return pane;
}

export class AboutScreen implements Screen {
  readonly id = "about" as const;
  readonly #shell: Shell;
  #lines: { text: string; heading: boolean; bullet?: boolean }[] | null = null;
  #attributed = false;
  #notice = -1;
  #pageLabel = "";
  #aboutOffset = 0;
  #scroll = new Scroller(LINE * 3);
  #dirty = true;
  #pane: Rect;
  /** Where the page was when a finger went down on it, to drag it from. */
  #from = -1;

  constructor(shell: Shell) {
    this.#shell = shell;
    this.#pane = readingPane(shell.shape);
  }

  enter() {
    if (this.#notice >= 0) this.#lines = null;
    this.#notice = -1;
    this.#scroll.offset = 0;
    this.#dirty = true;
    // The attribution arrives with the host's first answer: lay the page out again with it.
    if (!this.#attributed && this.#shell.weatherAttribution()) this.#lines = null;
  }

  layout(frame: Frame) {
    this.#pane = readingPane(frame);
    // Wrapped again to the new width.
    this.#lines = null;
    this.#dirty = true;
  }

  #showNotice(index: number) {
    if (this.#notice < 0 && index >= 0) this.#aboutOffset = this.#scroll.offset;
    this.#notice = index;
    this.#pageLabel = index < 0 ? "" : `${index + 1} / ${NOTICES.length}`;
    this.#lines = null;
    this.#scroll.offset = index < 0 ? this.#aboutOffset : 0;
    this.#dirty = true;
  }

  #back() {
    if (this.#notice >= 0) this.#showNotice(-1);
    else this.#shell.back();
  }

  press(button: RemoteButton, repeat: boolean) {
    if (button === "up" || button === "down") {
      this.#scroll.step(button === "up" ? -1 : 1);
    } else if ((button === "left" || button === "right") && !repeat) {
      if (this.#notice < 0) this.#showNotice(0);
      else this.#showNotice((this.#notice + (button === "left" ? NOTICES.length - 1 : 1)) % NOTICES.length);
    } else if (button === "select" && !repeat && this.#notice < 0) {
      this.#showNotice(0);
    } else if ((button === "back" || button === "select") && !repeat) this.#back();
    this.#dirty = true;
  }

  point(p: Point) {
    const scroll = this.#scroll;
    if (p.type === "down") this.#from = scroll.offset;
    else if (p.type === "drag" && this.#from >= 0) scroll.offset = Math.max(0, Math.min(scroll.max, this.#from - p.dy));
    else if (p.type === "wheel") scroll.offset = Math.max(0, Math.min(scroll.max, scroll.offset + p.dy));
    else if (p.type === "up") {
      this.#from = -1;
      if (p.tap && p.hit?.kind === "notice") {
        if (this.#notice < 0) this.#showNotice(0);
        else this.#showNotice((this.#notice + (p.hit.index === 0 ? NOTICES.length - 1 : 1)) % NOTICES.length);
      } else if (p.tap && (!p.hit || p.hit.kind === SCREEN_HITS.back)) {
        this.#back();
      }
    } else if (p.type === "cancel") this.#from = -1;
    this.#dirty = true;
  }

  publish(data: DOMStringMap) {
    data.acknowledgement = this.#notice < 0 ? "" : String(this.#notice);
    data.aboutScroll = String(this.#scroll.offset);
  }

  update() {
    const d = this.#dirty;
    this.#dirty = false;
    return d || true;
  }

  draw(g: CanvasRenderingContext2D, t: number, hits: HitMap) {
    const { x, y, w, h } = this.#pane;
    // Narrower than the TV's, the text comes nearer the pane's edges.
    const pad = w < 620 ? 24 : 40;
    if (!this.#lines) {
      this.#lines = [];
      const attribution = this.#shell.weatherAttribution();
      this.#attributed = !!attribution;
      const blocks = this.#notice >= 0 ? [NOTICES[this.#notice]] : attribution ? [...ABOUT, weatherBlock(attribution)] : ABOUT;
      for (const block of blocks) {
        if (block.heading) wrap(g, block.heading, w - 2 * pad - 18, HEADING).forEach((line, i) => this.#lines!.push({ text: line, heading: true, bullet: i === 0 }));
        const body = this.#notice >= 3 ? block.body.split(/\n{2,}/).map((p) => p.replace(/\n/g, " ")).join("\n\n") : block.body;
        for (const line of noticeWrap(g, body, w - 2 * pad, BODY)) this.#lines.push({ text: line, heading: false });
        this.#lines.push({ text: "", heading: false });
      }
      const content = this.#lines.reduce((sum, l) => sum + (l.heading ? LINE + 6 : LINE), 0);
      this.#scroll.setExtent(content, h - 150);
    }
    hits.add(SCREEN_HITS.panel, x, y, w, h);
    glassPanel(g, x, y, w, h, 28);
    text(g, this.#notice < 0 ? "About the fly" : "Acknowledgements", x + w / 2 + (this.#shell.glyphs === null ? 16 : 0), y + 44, { size: this.#notice < 0 ? 26 : w < 420 ? 18 : 24, align: "center", color: INK });
    if (this.#shell.glyphs === null) {
      const b = backButton(this.#pane, y + 44);
      iconButton(g, b.x, b.y, b.r, "back");
      hits.add(SCREEN_HITS.back, b.x - 24, b.y - 24, 48, 48);
    }
    // The page, clipped to its window.
    const top = y + 70;
    const bottom = y + h - 66;
    let ly = top + 22 - this.#scroll.offset;
    for (const line of this.#lines) {
      // Whole lines only: the Apple TV's canvas has no clipping.
      if (ly - 16 > top && ly < bottom) {
        if (line.heading) {
          if (line.bullet) orb(g, x + pad + 4, ly - 6, 6, "green");
          text(g, line.text, x + pad + 18, ly, { size: HEADING, color: "#0a6fc0" });
        } else text(g, line.text, x + pad, ly, { size: BODY, weight: 400, color: INK });
      }
      ly += line.heading ? LINE + 6 : LINE;
    }
    // How far down the page is.
    if (this.#scroll.max > 0) {
      const track = bottom - top - 20;
      const thumb = Math.max(30, track * ((h - 150) / (h - 150 + this.#scroll.max)));
      const at = top + 10 + (track - thumb) * (this.#scroll.offset / this.#scroll.max);
      roundedRect(g, x + w - 18, at, 6, thumb, 3);
      g.fillStyle = "rgba(20, 110, 190, 0.5)";
      g.fill();
    }
    text(g, this.#scroll.offset < this.#scroll.max ? "▼ more" : "", x + w - 40, bottom + 8, { size: 12, color: INK_SOFT, align: "right" });
    const foot = y + h - 46;
    if (this.#notice < 0) {
      const bw = Math.min(230, w - 48);
      pill(g, x + (w - bw) / 2, foot, bw, 34, "Acknowledgements →", { focused: this.#shell.glyphs !== null, size: 15 });
      hits.add("notice", x + (w - bw) / 2, foot - 7, bw, 48, 0);
    } else {
      pill(g, x + 24, foot, 48, 34, "←", { size: 20 });
      pill(g, x + w - 72, foot, 48, 34, "→", { size: 20 });
      hits.add("notice", x + 24, foot - 7, 48, 48, 0);
      hits.add("notice", x + w - 72, foot - 7, 48, 48, 1);
      text(g, this.#pageLabel, x + w / 2, foot + 23, { size: 14, align: "center", color: INK_SOFT });
    }
    if (this.#notice < 0) drawMenuHints(g, t, this.#shell);
    else if (this.#shell.glyphs) {
      const set = this.#shell.glyphs;
      const total = hintWidth(g, "Scroll", 13, "upDown", set) + hintWidth(g, "Notice", 13, "leftRight", set) + hintWidth(g, "Back", 13, "back", set) + 20;
      const frame = this.#shell.shape;
      const hy = frame.design.height - frame.safe.bottom - 26;
      let hx = frame.safe.left + (frame.design.width - frame.safe.left - frame.safe.right - total) / 2;
      hx += hintChip(g, hx, hy, "upDown", "Scroll", t, 13, set) + 10;
      hx += hintChip(g, hx, hy, "leftRight", "Notice", t, 13, set) + 10;
      hintChip(g, hx, hy, "back", "Back", t, 13, set);
    }
  }
}

/** Licence URLs have no spaces; split long tokens without discarding any characters. */
export function noticeWrap(g: CanvasRenderingContext2D, body: string, width: number, size: number): string[] {
  return wrap(g, body, width, size, 400).flatMap((line) => {
    if (g.measureText(line).width <= width) return [line];
    const pieces: string[] = [];
    let part = "";
    for (const char of line) {
      if (part && g.measureText(part + char).width > width) { pieces.push(part); part = ""; }
      part += char;
    }
    if (part) pieces.push(part);
    return pieces;
  });
}
