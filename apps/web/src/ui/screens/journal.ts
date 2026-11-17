// The fly's journal: its pictures, newest first, each with its date and an
// icon for the first it was (or the player's own photo), and a word or two
// where an icon can't say it (the food, the place, what it walked onto).
// Select opens one big; there, Left and Right go through them and, where the
// host can hand a picture on, it can be saved (a browser's download) or
// shared (a phone's share sheet). On the Apple TV the journal is the only
// place a picture is kept.

import type { RemoteButton } from "@fly/contracts";
import { INK, INK_SOFT, bubbleRing, drawGlyph, font, glassPanel, iconButton, orb, pill, roundedRect, text } from "@fly/ui";
import type { Glyph, HitMap } from "@fly/ui";
import type { Frame } from "../../display.ts";
import type { Entry, Journal } from "../../journal/store.ts";
import { PLACES } from "../../places/catalog.ts";
import { drawToolIcon } from "../../tools/view.ts";
import { backButton, fitPane } from "../layout.ts";
import type { Rect } from "../layout.ts";
import { SCREEN_HITS } from "./types.ts";
import type { Point, Screen, Shell } from "./types.ts";

export const JOURNAL_HITS = { cell: "cell", prev: "prev", next: "next", save: "save", remove: "remove" } as const;

/** Where the grid's pictures go in the pane: how many across, each picture's size, and a row's height with its caption. */
export type JournalGrid = { x: number; y: number; w: number; h: number; columns: number; rows: number; cellW: number; cellH: number; rowH: number; gap: number };

const CAPTION = 24;
const GAP = 12;
/** A picture in the grid is about this wide, design units. */
const CELL = 150;

export function journalGrid(pane: Rect): JournalGrid {
  const pad = pane.w < 520 ? 16 : 28;
  const x = pane.x + pad;
  const y = pane.y + 72;
  const w = pane.w - 2 * pad;
  const h = Math.max(1, pane.y + pane.h - 20 - y);
  const columns = Math.max(2, Math.min(5, Math.floor((w + GAP) / (CELL + GAP))));
  const cellW = (w - GAP * (columns - 1)) / columns;
  const cellH = Math.round((cellW * 9) / 16);
  const rowH = cellH + CAPTION + GAP;
  const rows = Math.max(1, Math.floor((h + GAP) / rowH));
  return { x, y, w, h, columns, rows, cellW, cellH, rowH, gap: GAP };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** A date in a few characters: "17 Nov", or with the year when it isn't this one. */
export function shortDate(at: number, now: number) {
  const d = new Date(at);
  const year = d.getFullYear() === new Date(now).getFullYear() ? "" : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year}`;
}

/** At most two words of a label, for a caption. */
export const twoWords = (label: string) => label.split(/\s+/).filter(Boolean).slice(0, 2).join(" ");

const placeColour = (id: string) => PLACES.find((p) => p.id === id)?.colour ?? "#ff5a6e";

/** A first's icon, centred on (x, y), `r` across in each direction; the player's photo has none. */
export function drawMomentIcon(g: CanvasRenderingContext2D, entry: Pick<Entry, "kind" | "key">, x: number, y: number, r: number) {
  g.save();
  g.translate(x, y);
  g.lineCap = "round";
  g.lineJoin = "round";
  switch (entry.kind) {
    case "flight": {
      // Two wings up, over speed lines.
      g.fillStyle = "rgba(200, 235, 255, 0.95)";
      g.strokeStyle = "#2a6fb0";
      g.lineWidth = r * 0.1;
      for (const side of [-1, 1]) {
        g.beginPath();
        g.ellipse(side * r * 0.36, -r * 0.2, r * 0.26, r * 0.62, side * 0.5, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
      g.fillStyle = "#3a4a6a";
      g.beginPath();
      g.ellipse(0, r * 0.25, r * 0.17, r * 0.4, 0, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case "escape": {
      // An arrow springing up.
      g.strokeStyle = "#ea6a0c";
      g.lineWidth = r * 0.2;
      g.beginPath();
      g.moveTo(-r * 0.5, r * 0.75);
      g.lineTo(r * 0.05, r * 0.2);
      g.lineTo(-r * 0.2, r * 0.05);
      g.lineTo(r * 0.45, -r * 0.55);
      g.stroke();
      g.fillStyle = "#ea6a0c";
      g.beginPath();
      g.moveTo(r * 0.75, -r * 0.85);
      g.lineTo(r * 0.15, -r * 0.7);
      g.lineTo(r * 0.6, -r * 0.25);
      g.closePath();
      g.fill();
      break;
    }
    case "meal": {
      // A sweet drop.
      g.fillStyle = "#ffb11c";
      g.strokeStyle = "#c46a00";
      g.lineWidth = r * 0.1;
      g.beginPath();
      g.moveTo(0, -r * 0.8);
      g.quadraticCurveTo(r * 0.7, r * 0.05, 0, r * 0.7);
      g.quadraticCurveTo(-r * 0.7, r * 0.05, 0, -r * 0.8);
      g.fill();
      g.stroke();
      g.fillStyle = "rgba(255, 255, 255, 0.8)";
      g.beginPath();
      g.ellipse(-r * 0.15, r * 0.05, r * 0.1, r * 0.2, 0.3, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case "groom": {
      // A sparkle: clean.
      g.fillStyle = "#6fd13a";
      g.strokeStyle = "#2d9a1e";
      g.lineWidth = r * 0.08;
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const k = i % 2 ? 0.28 : 0.85;
        g.lineTo(Math.cos(a) * r * k, Math.sin(a) * r * k);
      }
      g.closePath();
      g.fill();
      g.stroke();
      break;
    }
    case "climb": {
      // Steps, going up.
      g.fillStyle = "#29b6ec";
      g.strokeStyle = "#0a7cc7";
      g.lineWidth = r * 0.08;
      g.beginPath();
      g.moveTo(-r * 0.8, r * 0.7);
      g.lineTo(-r * 0.8, r * 0.25);
      g.lineTo(-r * 0.27, r * 0.25);
      g.lineTo(-r * 0.27, -r * 0.2);
      g.lineTo(r * 0.27, -r * 0.2);
      g.lineTo(r * 0.27, -r * 0.65);
      g.lineTo(r * 0.8, -r * 0.65);
      g.lineTo(r * 0.8, r * 0.7);
      g.closePath();
      g.fill();
      g.stroke();
      break;
    }
    case "sleep": {
      // A crescent moon.
      g.fillStyle = "#ffcf2e";
      g.strokeStyle = "#e88a00";
      g.lineWidth = r * 0.08;
      g.beginPath();
      g.arc(0, 0, r * 0.75, Math.PI * 0.35, Math.PI * 1.65);
      g.arc(r * 0.32, -r * 0.08, r * 0.58, Math.PI * 1.45, Math.PI * 0.55, true);
      g.closePath();
      g.fill();
      g.stroke();
      break;
    }
    case "place": {
      // A pin in the place's own colour.
      g.fillStyle = placeColour(entry.key.slice("place:".length));
      g.strokeStyle = "rgba(0, 40, 80, 0.55)";
      g.lineWidth = r * 0.08;
      g.beginPath();
      g.moveTo(0, r * 0.9);
      g.bezierCurveTo(-r * 0.25, r * 0.35, -r * 0.62, r * 0.05, -r * 0.62, -r * 0.3);
      g.arc(0, -r * 0.3, r * 0.62, Math.PI, 0);
      g.bezierCurveTo(r * 0.62, r * 0.05, r * 0.25, r * 0.35, 0, r * 0.9);
      g.fill();
      g.stroke();
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(0, -r * 0.3, r * 0.24, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case "photo":
      break;
  }
  g.restore();
}

const GRID_HINTS: readonly Glyph[] = ["arrows", "select", "back"];
const BACK_HINT: readonly Glyph[] = ["back"];
const OPEN_HINTS: readonly Glyph[] = ["leftRight", "upDown", "back"];
const OPEN_BARE_HINTS: readonly Glyph[] = ["leftRight", "back"];

/** Pictures decoded and kept for drawing, at most: the rest are decoded again when they come into view. */
const DECODED = 48;

type Loaded = { image: HTMLImageElement | null; ready: boolean; used: number };

export class JournalScreen implements Screen {
  readonly id = "journal" as const;
  readonly #shell: Shell;
  #pane: Rect;
  #grid: JournalGrid;
  /** Newest first, as last seen in the journal. */
  #entries: Entry[] = [];
  #seen = -1;
  #focus = 0;
  /** The first row shown. */
  #top = 0;
  /** The picture open big, by its place in the list, or -1 for the grid. */
  #open = -1;
  /** In the picture open big, the button the remote is on: -1 none (Left and Right go through the pictures). */
  #action = -1;
  #images = new Map<string, Loaded>();
  #dirty = true;
  #drawn = 0;
  /** Pictures drawn in the last frame, for scripts and tests. */
  shown = 0;
  /** What handing a picture on came to, for a moment: "saved", "shared", "failed" or "". */
  #handed = "";
  #handedAt = 0;
  #time = 0;
  /** Where a drag started, rows. */
  #from = -1;

  constructor(shell: Shell) {
    this.#shell = shell;
    this.#pane = fitPane(shell.shape, 720, 420, 8);
    this.#grid = journalGrid(this.#pane);
  }

  enter() {
    this.#open = -1;
    this.#action = -1;
    this.#refresh(true);
    this.#dirty = true;
  }

  layout(frame: Frame) {
    this.#pane = fitPane(frame, 720, 420, 8);
    this.#grid = journalGrid(this.#pane);
    this.#reveal();
    this.#dirty = true;
  }

  get #journal(): Journal | null {
    return this.#shell.journal;
  }

  /** The entries as the journal has them now, newest first, keeping the focus on the same one where it can. */
  #refresh(force = false) {
    const journal = this.#journal;
    const changes = journal?.changes ?? -1;
    if (!force && changes === this.#seen) return;
    this.#seen = changes;
    const focused = this.#entries[this.#focus];
    const open = this.#entries[this.#open];
    this.#entries = journal ? journal.entries.slice().reverse() : [];
    const count = this.#entries.length;
    const at = focused ? this.#entries.indexOf(focused) : -1;
    this.#focus = force ? 0 : at >= 0 ? at : Math.min(this.#focus, Math.max(0, count - 1));
    if (this.#open >= 0) {
      const i = open ? this.#entries.indexOf(open) : -1;
      this.#open = i >= 0 ? i : count ? Math.min(this.#open, count - 1) : -1;
      if (this.#open >= 0) this.#focus = this.#open;
    }
    if (force) this.#top = 0;
    this.#reveal();
    this.#dirty = true;
  }

  /** The rows scrolled so the focused picture shows. */
  #reveal() {
    const { columns, rows } = this.#grid;
    const row = Math.floor(this.#focus / columns);
    const last = Math.max(0, Math.ceil(this.#entries.length / columns) - rows);
    if (row < this.#top) this.#top = row;
    if (row >= this.#top + rows) this.#top = row - rows + 1;
    this.#top = Math.max(0, Math.min(last, this.#top));
  }

  #actions(): ("save" | "remove")[] {
    const entry = this.#entries[this.#open];
    if (!entry) return [];
    const actions: ("save" | "remove")[] = [];
    if (this.#shell.canSavePictures && entry.size) actions.push("save");
    if (entry.kind === "photo") actions.push("remove");
    return actions;
  }

  press(button: RemoteButton, repeat: boolean) {
    this.#dirty = true;
    const count = this.#entries.length;
    if (this.#open >= 0) {
      const actions = this.#actions();
      if (button === "back" || button === "playPause") {
        if (!repeat) this.#close();
      } else if (button === "down" && actions.length) this.#action = Math.max(0, this.#action);
      else if (button === "up") this.#action = -1;
      else if ((button === "left" || button === "right") && this.#action >= 0) {
        this.#action = Math.max(0, Math.min(actions.length - 1, this.#action + (button === "left" ? -1 : 1)));
      } else if (button === "left" || button === "right") this.#show(this.#open + (button === "left" ? -1 : 1));
      else if (button === "select" && !repeat && this.#action >= 0) this.#act(actions[this.#action]);
      return;
    }
    if (button === "back" || button === "playPause") {
      if (!repeat) this.#shell.back();
      return;
    }
    if (!count) return;
    const { columns } = this.#grid;
    const step = button === "left" ? -1 : button === "right" ? 1 : button === "up" ? -columns : button === "down" ? columns : 0;
    if (step) {
      const next = this.#focus + step;
      // Down from the last full row lands on the last picture.
      if (next >= 0 && next < count) this.#focus = next;
      else if (button === "down" && Math.floor(this.#focus / columns) < Math.floor((count - 1) / columns)) this.#focus = count - 1;
      this.#reveal();
    } else if (button === "select" && !repeat) this.#show(this.#focus);
  }

  point(p: Point) {
    this.#dirty = true;
    const hit = p.hit;
    if (p.type === "down") this.#from = this.#open < 0 ? this.#top : -1;
    else if (p.type === "drag" && this.#from >= 0) {
      const last = Math.max(0, Math.ceil(this.#entries.length / this.#grid.columns) - this.#grid.rows);
      this.#top = Math.max(0, Math.min(last, this.#from - Math.round(p.dy / this.#grid.rowH)));
    } else if (p.type === "wheel" && this.#open < 0) {
      const last = Math.max(0, Math.ceil(this.#entries.length / this.#grid.columns) - this.#grid.rows);
      this.#top = Math.max(0, Math.min(last, this.#top + Math.sign(p.dy)));
    } else if (p.type === "up") {
      this.#from = -1;
      if (!p.tap) return;
      if (hit?.kind === JOURNAL_HITS.cell) {
        this.#focus = hit.index;
        this.#show(hit.index);
      } else if (hit?.kind === JOURNAL_HITS.prev || hit?.kind === JOURNAL_HITS.next) this.#show(this.#open + (hit.kind === JOURNAL_HITS.prev ? -1 : 1));
      else if (hit?.kind === JOURNAL_HITS.save || hit?.kind === JOURNAL_HITS.remove) this.#act(hit.kind);
      else if (!hit || hit.kind === SCREEN_HITS.back) {
        if (this.#open >= 0) this.#close();
        else this.#shell.back();
      }
    } else if (p.type === "cancel") this.#from = -1;
  }

  #show(index: number) {
    if (index < 0 || index >= this.#entries.length) return;
    this.#open = this.#focus = index;
    this.#action = Math.min(this.#action, this.#actions().length - 1);
    this.#handed = "";
    this.#reveal();
  }

  #close() {
    this.#open = -1;
    this.#action = -1;
    this.#handed = "";
  }

  #act(action: "save" | "remove") {
    const entry = this.#entries[this.#open];
    const journal = this.#journal;
    if (!entry || !journal) return;
    if (action === "remove") {
      void journal.remove(entry).then(() => {
        this.#images.delete(entry.id);
        this.#action = -1;
        if (!this.#entries.length) this.#close();
      });
      return;
    }
    void this.#shell.savePicture(entry).then((how) => {
      this.#handed = how;
      this.#handedAt = this.#time;
      this.#dirty = true;
    });
  }

  publish(data: DOMStringMap) {
    data.journalShown = String(this.shown);
    data.journalOpen = this.#open >= 0 ? (this.#entries[this.#open]?.key || "photo") : "";
    data.journalFocus = String(this.#focus);
  }

  update(dt: number) {
    this.#time += dt;
    this.#refresh();
    const d = this.#dirty || this.#drawn !== this.shown;
    this.#dirty = false;
    return d || (this.#handed !== "" && this.#time - this.#handedAt < 2.5);
  }

  /** The picture for an entry, decoding it if it isn't already; null until it is ready (or with none). */
  #image(entry: Entry): HTMLImageElement | null {
    if (!entry.size || typeof Image === "undefined") return null;
    const known = this.#images.get(entry.id);
    if (known) {
      known.used = this.#time;
      return known.ready ? known.image : null;
    }
    const loaded: Loaded = { image: null, ready: false, used: this.#time };
    this.#images.set(entry.id, loaded);
    if (this.#images.size > DECODED) this.#forget();
    void this.#journal?.picture(entry).then((url) => {
      if (!url || this.#images.get(entry.id) !== loaded) return;
      const image = new Image();
      image.onload = () => {
        loaded.ready = true;
        this.#dirty = true;
      };
      image.src = url;
      loaded.image = image;
    });
    return null;
  }

  /** Lets go of the pictures used longest ago. */
  #forget() {
    const byUse = [...this.#images].sort((a, b) => a[1].used - b[1].used);
    for (let i = 0; i < byUse.length - DECODED; i++) this.#images.delete(byUse[i][0]);
  }

  draw(g: CanvasRenderingContext2D, t: number, hits: HitMap) {
    const { x, y, w, h } = this.#pane;
    const shell = this.#shell;
    hits.add(SCREEN_HITS.panel, x, y, w, h);
    glassPanel(g, x, y, w, h, 28);
    const pointing = shell.glyphs === null;
    text(g, "Journal", x + w / 2 + (pointing ? 16 : 0), y + 44, { size: 26, align: "center", color: INK });
    if (pointing) {
      const b = backButton(this.#pane, y + 44);
      iconButton(g, b.x, b.y, b.r, "back");
      hits.add(SCREEN_HITS.back, b.x - 24, b.y - 24, 48, 48);
    }
    this.#drawn = 0;
    if (this.#open >= 0 && this.#entries[this.#open]) this.#drawOpen(g, t, hits);
    else this.#drawGrid(g, t, hits);
    this.shown = this.#drawn;
    if (this.#open < 0) this.#drawHints(g, this.#entries.length ? GRID_HINTS : BACK_HINT);
  }

  #drawGrid(g: CanvasRenderingContext2D, t: number, hits: HitMap) {
    const entries = this.#entries;
    const grid = this.#grid;
    if (!entries.length) {
      const cx = this.#pane.x + this.#pane.w / 2;
      const cy = grid.y + grid.h / 2 - 16;
      orb(g, cx, cy, 30, "glass");
      drawToolIcon(g, "photo", cx, cy, 18);
      text(g, this.#journal ? "No pictures yet" : "", cx, cy + 58, { size: 17, align: "center", color: INK_SOFT });
      return;
    }
    const now = Date.now();
    const focusShown = this.#shell.glyphs !== null;
    const first = this.#top * grid.columns;
    const last = Math.min(entries.length, first + grid.rows * grid.columns);
    for (let i = first; i < last; i++) {
      const col = (i - first) % grid.columns;
      const row = Math.floor((i - first) / grid.columns);
      const cx = grid.x + col * (grid.cellW + grid.gap);
      const cy = grid.y + row * grid.rowH;
      const entry = entries[i];
      this.#drawPicture(g, entry, cx, cy, grid.cellW, grid.cellH, true);
      this.#drawCaption(g, entry, cx, cy + grid.cellH + 17, grid.cellW, 13, now);
      hits.add(JOURNAL_HITS.cell, cx, cy, grid.cellW, grid.cellH + CAPTION, i);
      if (focusShown && i === this.#focus) bubbleRing(g, cx, cy, grid.cellW, grid.cellH, 10, t);
    }
    // More above or below.
    const rows = Math.ceil(entries.length / grid.columns);
    if (this.#top > 0) text(g, "▲", this.#pane.x + this.#pane.w - 22, grid.y + 8, { size: 12, color: INK_SOFT, align: "center" });
    if (this.#top + grid.rows < rows) text(g, "▼", this.#pane.x + this.#pane.w - 22, grid.y + grid.h - 4, { size: 12, color: INK_SOFT, align: "center" });
  }

  #drawOpen(g: CanvasRenderingContext2D, t: number, hits: HitMap) {
    const { x, y, w, h } = this.#pane;
    const entry = this.#entries[this.#open];
    const pad = w < 520 ? 16 : 28;
    const arrows = 48 + 12;
    const area = { x: x + pad + arrows, y: y + 66, w: w - 2 * (pad + arrows), h: h - 66 - 100 };
    const aspect = entry.size ? entry.w / entry.h : 16 / 9;
    const pw = Math.min(area.w, area.h * aspect);
    const ph = pw / aspect;
    const px = area.x + (area.w - pw) / 2;
    const py = area.y + (area.h - ph) / 2;
    this.#drawPicture(g, entry, px, py, pw, ph, false);
    this.#drawCaption(g, entry, px, py + ph + 26, pw, 16, Date.now());
    const mid = py + ph / 2 - 17;
    pill(g, x + pad, mid, 48, 34, "←", { size: 20, disabled: this.#open <= 0 });
    pill(g, x + w - pad - 48, mid, 48, 34, "→", { size: 20, disabled: this.#open >= this.#entries.length - 1 });
    hits.add(JOURNAL_HITS.prev, x + pad, mid - 7, 48, 48);
    hits.add(JOURNAL_HITS.next, x + w - pad - 48, mid - 7, 48, 48);
    const actions = this.#actions();
    const coarse = this.#shell.shape.coarse;
    const labels = { save: coarse ? "Share" : "Save", remove: "Remove" };
    const bw = 120;
    const foot = y + h - 52;
    let bx = x + (w - (actions.length * bw + (actions.length - 1) * 16)) / 2;
    actions.forEach((action, i) => {
      const done = action === "save" && this.#handed && this.#time - this.#handedAt < 2.5;
      const label = done ? (this.#handed === "failed" ? "Couldn't" : this.#handed === "shared" ? "Shared" : "Saved") : labels[action];
      pill(g, bx, foot, bw, 34, label, { focused: this.#shell.glyphs !== null && this.#action === i, color: action === "remove" && this.#action === i ? "pink" : undefined, size: 15 });
      hits.add(action === "save" ? JOURNAL_HITS.save : JOURNAL_HITS.remove, bx, foot - 7, bw, 48);
      bx += bw + 16;
    });
    if (this.#shell.glyphs && this.#action < 0) bubbleRing(g, px, py, pw, ph, 10, t, 0.6);
    this.#drawHints(g, actions.length ? OPEN_HINTS : OPEN_BARE_HINTS);
  }

  /** A picture, filling its place (cropped to it, in the grid) or fitted (open big); a first without one shows its icon instead. */
  #drawPicture(g: CanvasRenderingContext2D, entry: Entry, x: number, y: number, w: number, h: number, crop: boolean) {
    roundedRect(g, x, y, w, h, 10);
    g.fillStyle = "rgba(20, 70, 120, 0.18)";
    g.fill();
    const image = this.#image(entry);
    if (image) {
      g.save();
      roundedRect(g, x, y, w, h, 10);
      g.clip();
      const iw = entry.w;
      const ih = entry.h;
      // Cropped to fill the cell from the middle of the picture.
      const scale = crop ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
      const sw = w / scale;
      const sh = h / scale;
      g.drawImage(image, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
      g.restore();
      this.#drawn++;
    } else if (!entry.size) drawMomentIcon(g, entry, x + w / 2, y + h / 2, Math.min(w, h) * 0.28);
    roundedRect(g, x, y, w, h, 10);
    g.lineWidth = 1.5;
    g.strokeStyle = "rgba(255, 255, 255, 0.9)";
    g.stroke();
  }

  /** Under a picture: its first's icon and a word or two, and its date. */
  #drawCaption(g: CanvasRenderingContext2D, entry: Entry, x: number, y: number, w: number, size: number, now: number) {
    let left = x + 2;
    if (entry.kind !== "photo") {
      drawMomentIcon(g, entry, left + size * 0.6, y - size * 0.35, size * 0.65);
      left += size * 1.5;
    }
    const date = shortDate(entry.at, now);
    g.font = font(size, 400);
    const label = twoWords(entry.label);
    text(g, date, x + w - 2, y, { size, weight: 400, align: "right", color: INK_SOFT });
    const room = x + w - 2 - g.measureText(date).width - 8 - left;
    if (label && room > size * 2) text(g, fit(g, label, room, size), left, y, { size, color: INK });
  }

  /** The remote's hints along the bottom: in the grid, the arrows, Select and Back; open big, Left and Right through the pictures, Down to its buttons, and Back. */
  #drawHints(g: CanvasRenderingContext2D, glyphs: readonly Glyph[]) {
    const set = this.#shell.glyphs;
    if (!set || this.#shell.settings.hints === false) return;
    const { design, safe } = this.#shell.shape;
    const y = design.height - safe.bottom - 26;
    const gap = Math.min(72, (design.width - safe.left - safe.right) / 4);
    const cx = safe.left + (design.width - safe.left - safe.right) / 2;
    glyphs.forEach((glyph, i) => drawGlyph(g, glyph, cx + (i - (glyphs.length - 1) / 2) * gap, y, 25, 0, set));
  }
}

/** Text cut to a width, with an ellipsis if it had to be. */
function fit(g: CanvasRenderingContext2D, value: string, width: number, size: number) {
  g.font = font(size);
  if (g.measureText(value).width <= width) return value;
  let cut = value;
  while (cut.length > 1 && g.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut}…`;
}
