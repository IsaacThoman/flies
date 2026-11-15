// About the fly: what it is, honestly, and where its wiring comes from.

import type { RemoteButton } from "@fly/contracts";
import { INK, INK_SOFT, Scroller, glassPanel, orb, roundedRect, text, wrap } from "@fly/ui";
import { DESIGN_WIDTH } from "../../display.ts";
import { drawMenuHints } from "./menu-screen.ts";
import type { Screen, Shell } from "./types.ts";

type Block = { heading?: string; body: string };

export const ABOUT: readonly Block[] = [
  { heading: "A fruit fly on a picnic table", body: "Nothing this fly does is scripted. A simulation of its whole central nervous system, its brain and nerve cord, decides what it does from what its body feels, moment by moment." },
  { heading: "Its brain", body: "166,700 spiking neurons joined by 6.2 million connections, wired as they are in a real male fruit fly. Each neuron is a simple model of a nerve cell: it gathers input from the neurons that connect to it and fires when that input is strong enough, after Shiu and colleagues (Nature, 2024). In a browser it runs in the background; on the Apple TV it runs as native code." },
  { heading: "What it feels", body: "Sugar on its feet and its mouthparts. Touch, from a feather, a soap bubble bursting on it, or bumping into things in the air. Air rushing past its antennae. Its antennae pressing against something on the left or the right. The weight on its legs while it stands. And light: the picture on each of the 1,772 facets of its eyes, rendered from where its head is. (With its eyes off in Settings, the game measures how fast anything nearby grows in each eye instead.) Each sense drives the sensory neurons that carry it in the real fly." },
  { heading: "What it does", body: "Each action is read from the fly's own neurons: walking from DNg100, steering from the two DNa02s, backing up from the moonwalker neurons, the escape jump from the giant fibre, flight from its wing muscles' motor neurons, grooming from DNg12, and feeding from MN9, which moves its proboscis. The game's 'Inside its brain' page shows them all as they fire." },
  { heading: "What the body adds", body: "The model has no physics, so the game supplies it: the fly stays on the surface it walks on, slides along what it walks into, falls off edges, and in the air has weight, drag and the push of its wings. It stays on the table. When it has pushed against a wall it faces for two seconds, the body turns it away. It lands on what it comes down on; when its brain makes it jump, the body picks the direction (away from the ball if the ball is in the air); and it shuffles its mouth onto food its brain has already decided to eat. None of these is shown as the brain's doing." },
  { heading: "What it isn't", body: "It is a model, not a fly. It doesn't learn, get hungry or tired, or smell anything. Which taste neurons count as 'sweet' was chosen by what they do in the model. At rest, a slowly wandering background in its eyes stands in for everything the wiring doesn't contain, and makes it wander; its turns lean to the left. Some senses do little: bumping its antennae reaches no walking or steering neurons, so a wall doesn't turn it by itself." },
  { heading: "Thanks", body: "The wiring is the FlyEM male CNS connectome, from Janelia Research Campus, published under CC-BY 4.0 (male-cns.janelia.org). The neuron model follows Shiu et al., 'A Drosophila computational brain model reveals sensorimotor processing', Nature 634 (2024)." },
];

const PANEL = { x: (DESIGN_WIDTH - 620) / 2, y: 30, w: 620, h: 404 };
const BODY = 15;
const LINE = 21;
const HEADING = 19;

export class AboutScreen implements Screen {
  readonly id = "about" as const;
  readonly pauses = true;
  readonly #shell: Shell;
  #lines: { text: string; heading: boolean }[] | null = null;
  #scroll = new Scroller(LINE * 3);
  #dirty = true;

  constructor(shell: Shell) {
    this.#shell = shell;
  }

  enter() {
    this.#scroll.offset = 0;
    this.#dirty = true;
  }

  press(button: RemoteButton, repeat: boolean) {
    if (button === "up" || button === "down") {
      if (this.#scroll.step(button === "up" ? -1 : 1)) this.#shell.sound("move");
      else if (!repeat) this.#shell.sound("blocked");
    } else if ((button === "back" || button === "select") && !repeat) {
      this.#shell.sound("back");
      this.#shell.back();
    }
    this.#dirty = true;
  }

  update() {
    const d = this.#dirty;
    this.#dirty = false;
    return d || true;
  }

  draw(g: CanvasRenderingContext2D, t: number) {
    const { x, y, w, h } = PANEL;
    if (!this.#lines) {
      this.#lines = [];
      for (const block of ABOUT) {
        if (block.heading) this.#lines.push({ text: block.heading, heading: true });
        for (const line of wrap(g, block.body, w - 80, BODY, 400)) this.#lines.push({ text: line, heading: false });
        this.#lines.push({ text: "", heading: false });
      }
      const content = this.#lines.reduce((sum, l) => sum + (l.heading ? LINE + 6 : LINE), 0);
      this.#scroll.setExtent(content, h - 110);
    }
    glassPanel(g, x, y, w, h, 28);
    text(g, "About the fly", x + w / 2, y + 44, { size: 26, align: "center", color: INK });
    // The page, clipped to its window.
    const top = y + 70;
    const bottom = y + h - 26;
    let ly = top + 22 - this.#scroll.offset;
    for (const line of this.#lines) {
      // Whole lines only: the Apple TV's canvas has no clipping.
      if (ly - 16 > top && ly < bottom) {
        if (line.heading) {
          orb(g, x + 44, ly - 6, 6, "green");
          text(g, line.text, x + 58, ly, { size: HEADING, color: "#0a6fc0" });
        } else text(g, line.text, x + 40, ly, { size: BODY, weight: 400, color: INK });
      }
      ly += line.heading ? LINE + 6 : LINE;
    }
    // How far down the page is.
    if (this.#scroll.max > 0) {
      const track = bottom - top - 20;
      const thumb = Math.max(30, track * ((h - 110) / (h - 110 + this.#scroll.max)));
      const at = top + 10 + (track - thumb) * (this.#scroll.offset / this.#scroll.max);
      roundedRect(g, x + w - 18, at, 6, thumb, 3);
      g.fillStyle = "rgba(20, 110, 190, 0.5)";
      g.fill();
    }
    text(g, this.#scroll.offset < this.#scroll.max ? "▼ more" : "", x + w - 40, bottom + 16, { size: 12, color: INK_SOFT, align: "right" });
    drawMenuHints(g, t);
  }
}
