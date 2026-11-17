// Where things go on a screen of any shape. Each layout is worked out from
// the frame alone (its size in design units and its safe area), so it can be
// checked in Node at every shape; at the Apple TV's 854×480 each comes out
// where it always was. Rects are in design units.

import { TV_FRAME } from "../display.ts";
import type { Frame } from "../display.ts";
import { TOOLS } from "../tools/hands.ts";
import type { Tool } from "../tools/hands.ts";

export type Rect = { x: number; y: number; w: number; h: number };

/** The part of the screen clear of notches, home indicators and rounded corners. */
export function safeRect(frame: Frame): Rect {
  const { width, height } = frame.design;
  const s = frame.safe;
  return { x: s.left, y: s.top, w: Math.max(1, width - s.left - s.right), h: Math.max(1, height - s.top - s.bottom) };
}

/** How far past a target's edge a finger still counts as on it. */
export const touchSlop = (frame: Frame) => (frame.coarse ? 8 : 0);

export type HudLayout = {
  /** The middle of the safe area, across, and its width. */
  cx: number;
  width: number;
  /** Touch layouts keep portrait Menu in thumb range and a short screen's label beside its shelf. */
  touch: { labelCx: number; labelY: number; labelWidth: number; menuY: number; menuAtFoot: boolean; targetHeight: number } | null;
  /** The caption's middle, down. */
  captionY: number;
  /** The shelf: its lowest row's middle, down; the space each tool has; how big the orbs are (1 on the TV); where the first slot starts; the first tool of its second half, and how far that half is apart along the row (0 when the halves are one over the other, or together). */
  shelfY: number;
  gap: number;
  orb: number;
  shelfLeft: number;
  split: number;
  apart: number;
  /** Each tool's middle, in the shelf's order. */
  toolX: number[];
  toolY: number[];
  /** The glass under each half (one, when the halves are together), and all of it. */
  groups: Rect[];
  shelf: Rect;
  /** The tool's label: its middle, down. */
  labelY: number;
  /** Whether input hints need space beside the corner panels. */
  reserveHints: boolean;
  /** The hints: the left column's left edge and its lowest chip's middle; the right one's right edge and middle. */
  hintsX: number;
  hintsY: number;
  rightX: number;
  rightY: number;
  /** The menu's button (or, for the remote, its hint): its left edge and middle. */
  menuX: number;
  menuY: number;
  /** The picture through the fly's eyes: the panel, the scale of its dots (design units per radian of azimuth), the room over them for saying what it is, and how it says it: as on the TV, in two lines on a narrow screen, small on a short one. */
  picture: Rect;
  pictureScale: number;
  pictureHeading: number;
  pictureText: "full" | "wrapped" | "small";
  /** Frame stats: their right edge and baseline. */
  statsX: number;
  statsY: number;
};

/** The TV's shelf: the space each tool has, and how far apart its halves are (the tools that act on the fly, and those about its world and the camera); narrower, they come closer, then the tools do. */
const SHELF_GAP = 52;
const SHELF_APART = 32;
const SHELF_APART_LEAST = 12;
/** The widest the TV's shelf gets: its eight tools as they always were, clear of the pictures in the bottom corners. More come closer. */
const SHELF_MOST = 8 * SHELF_GAP + SHELF_APART;
/** Narrower than this a slot (design units, about 42 CSS pixels on a phone), a finger can't tell the tools apart: the halves go one over the other, the fly's over its world's. */
const STACK_UNDER = 34;
/** Rows of the shelf, middle to middle, when its halves are one over the other: its glass and a little between. */
const SHELF_ROW = 58;
/**
 * The picture through the fly's eyes, as the TV has it: the share of the
 * width its panel takes, its top and bottom as shares of the height, the
 * room round the dots (sides as a share of the width, heading and foot in
 * design units), and how much wider a radian of azimuth is drawn than one of
 * elevation.
 */
const PICTURE = { width: 0.84, top: 0.11, foot: 0.73, sides: 0.04, heading: 57.6, under: 24, stretch: (0.76 * 427) / (0.45 * 480), wrapsUnder: 480 };

/** `shelf`: the tools, for a layout of a shelf other than today's. */
export function hudLayout(frame: Frame, reserveHints = true, shelf: readonly Pick<Tool, "world">[] = TOOLS): HudLayout {
  const tools = shelf.length;
  const split = Math.max(0, shelf.findIndex((t) => t.world));
  const halves = split > 0 && split < tools;
  const a = safeRect(frame);
  const cx = a.x + a.w / 2;
  const bottom = a.y + a.h;
  const compact = frame.coarse && a.h < 360 && a.w > a.h * 1.4 && a.w * frame.unit >= 700;
  const touchApart = Math.min(SHELF_APART, a.w - 16 - tools * (44 / frame.unit));
  let apart = frame.coarse ? (a.w > a.h * 1.2 && frame.unit > 1.25 ? Math.max(SHELF_APART, a.w - 16 - tools * SHELF_GAP) : touchApart >= 16 ? (compact ? 16 : touchApart) : 0) : halves ? Math.max(SHELF_APART_LEAST, Math.min(SHELF_APART, a.w - 16 - tools * SHELF_GAP)) : 0;
  if (!halves) apart = 0;
  const gapWanted = compact ? Math.max(44 / frame.unit, Math.min(SHELF_GAP, (a.w - 32 - apart - 216) / tools)) : frame.coarse ? SHELF_GAP : Math.min(SHELF_GAP, Math.floor((SHELF_MOST - apart) / tools));
  let gap = Math.min(gapWanted, (a.w - 16 - apart) / tools);
  // Too many for one row a finger can use: the fly's tools over its world's, each row as wide as it needs.
  const stacked = halves && !compact && gap < STACK_UNDER;
  if (stacked) {
    apart = 0;
    gap = Math.min(SHELF_GAP, (a.w - 16) / Math.max(split, tools - split));
  }
  const shelfY = bottom - 34;
  const topRow = stacked ? shelfY - SHELF_ROW : shelfY;
  const labelY = topRow - 61;
  const shelfWidth = stacked ? gap * Math.max(split, tools - split) : gap * tools + apart;
  const shelfLeft = compact ? a.x + 8 : cx - shelfWidth / 2;
  const toolX: number[] = [];
  const toolY: number[] = [];
  const groups: Rect[] = [];
  const group = (from: number, to: number, left: number, y: number) => {
    for (let i = from; i < to; i++) {
      toolX.push(left + (i - from + 0.5) * gap);
      toolY.push(y);
    }
    groups.push({ x: left - 8, y: y - 26, w: (to - from) * gap + 16, h: 52 });
  };
  if (stacked) {
    // The menu's button is beside the fly's row, in reach of a thumb: the row keeps clear of it.
    group(0, split, Math.min(a.x + a.w - 8 - split * gap, Math.max(cx - (split * gap) / 2, a.x + 60)), topRow);
    group(split, tools, cx - ((tools - split) * gap) / 2, shelfY);
  } else if (apart > 0) {
    group(0, split, shelfLeft, shelfY);
    group(split, tools, shelfLeft + split * gap + apart, shelfY);
  } else group(0, tools, shelfLeft, shelfY);
  const shelfRect = { x: Math.min(...groups.map((r) => r.x)), y: topRow - 26, w: 0, h: shelfY - topRow + 52 };
  shelfRect.w = Math.max(...groups.map((r) => r.x + r.w)) - shelfRect.x;
  const menuAtFoot = frame.coarse;
  const menuBeside = menuAtFoot && !stacked && a.w * frame.unit >= 375;
  const touch = frame.coarse ? {
    labelCx: compact ? (shelfLeft + shelfWidth + 16 + a.x + a.w - 8) / 2 : cx + (menuBeside ? 28 : 0),
    labelWidth: compact ? a.x + a.w - 8 - (shelfLeft + shelfWidth + 16) : a.w - 16 - (menuBeside ? 56 : 0),
    labelY: compact ? shelfY : labelY,
    menuY: compact ? shelfY - 52 : stacked ? topRow : labelY - (menuBeside ? 0 : 45),
    menuAtFoot,
    targetHeight: Math.max(32, 44 / frame.unit),
  } : null;
  // The hints keep to the corners beside the shelf (the lowest, "Tools", is beside it), unless the shelf reaches them: then above the label.
  const beside = shelfRect.x > a.x + 16 + 100;
  const hintsY = beside ? shelfY : labelY - 36;
  // The picture between the caption and the label: as big as fits, keeping the dots' proportions.
  const top = Math.max(a.y + a.h * PICTURE.top, a.y + 25 + 23);
  const room = { w: a.w * PICTURE.width, h: Math.min(a.y + a.h * PICTURE.foot, labelY - 17 - 12) - top };
  const sides = a.w * PICTURE.sides;
  // Narrow, what it is says it in two lines; short, in small type.
  const pictureText = room.h < 220 ? "small" : room.w < PICTURE.wrapsUnder ? "wrapped" : "full";
  const heading = pictureText === "small" ? 38 : pictureText === "wrapped" ? PICTURE.heading + 13 : PICTURE.heading;
  const scale = Math.max(1, Math.min((room.w - 2 * sides) / (2 * Math.PI), ((room.h - heading - PICTURE.under) * PICTURE.stretch) / Math.PI));
  // Short, the panel is wider than its dots, for the line saying what they are.
  const pw = Math.max(2 * Math.PI * scale + 2 * sides, pictureText === "small" ? Math.min(room.w, 400) : 0);
  const ph = (Math.PI * scale) / PICTURE.stretch + heading + PICTURE.under;
  return {
    cx,
    width: a.w,
    touch,
    captionY: a.y + 25,
    shelfY,
    gap,
    orb: Math.min(1, (gap / 2 - 1) / 22),
    shelfLeft,
    split: apart > 0 || stacked ? split : tools,
    apart,
    toolX,
    toolY,
    groups,
    shelf: shelfRect,
    labelY,
    reserveHints,
    hintsX: a.x + 16,
    hintsY,
    rightX: a.x + a.w - 16,
    rightY: hintsY,
    menuX: a.x + 16,
    menuY: a.y + 24,
    picture: { x: cx - pw / 2, y: top + (room.h - ph) / 2, w: pw, h: ph },
    pictureScale: scale,
    pictureHeading: heading,
    pictureText,
    statsX: a.x + a.w - 10,
    statsY: bottom - 10,
  };
}

/** Where the picture's dots go: the middle of their space, and design units per radian of azimuth and of elevation. */
export function pictureDots(hud: HudLayout) {
  const p = hud.picture;
  return {
    x: p.x + p.w / 2,
    y: p.y + hud.pictureHeading + (p.h - hud.pictureHeading - PICTURE.under) / 2,
    azimuth: hud.pictureScale,
    elevation: hud.pictureScale / PICTURE.stretch,
  };
}

/** A pane holding a menu: where it is, where its rows start, how they are sized, and how many show. */
export type MenuPanel = {
  panel: Rect;
  /** The heading's baseline and size, or none where there isn't room. */
  heading: { y: number; size: number } | null;
  list: { x: number; y: number; width: number; row: number; gap: number; compact: boolean; columns: number; scrollControls?: boolean };
  rows: number;
};

export type MenuPanelSpec = {
  /** How many items, and the most rows to show at once. */
  items: number;
  maxRows?: number;
  /** The pane's width and its rows' height on the TV. */
  width: number;
  row: number;
  heading: boolean;
  /** Space under the last row on the TV. */
  foot: number;
  /** Rows with a value beside their label (a choice, a slider): stacked when the pane is narrow. */
  values: boolean;
  /** Where it goes in the space it is given: centred, raised this much (the TV's panes sit a little above the middle). */
  raise: number;
  /** Two columns rather than scrolling, where one doesn't fit: for a list of actions short enough to show whole. */
  columns?: 2;
};

/** Fits a menu's pane into a space: the TV's size if it fits, else narrower and with tighter rows, scrolling what doesn't fit. */
export function fitMenu(space: Rect, spec: MenuPanelSpec): MenuPanel {
  const margin = 12;
  const width = Math.min(spec.width, space.w - 2 * margin);
  const narrow = width < spec.width;
  const pad = narrow ? 16 : 28;
  const listWidth = width - 2 * pad;
  const compact = spec.values && listWidth < 380;
  const want = Math.min(spec.items, spec.maxRows ?? spec.items);
  const room = space.h - 2 * margin;
  // From the TV's spacing to the tightest that still takes a finger.
  const tiers = [
    { row: compact ? 54 : spec.row, gap: compact ? 8 : 12, top: spec.heading ? 70 : 26, foot: spec.foot, heading: spec.heading ? { dy: 46, size: 28 } : null },
    { row: compact ? 52 : spec.row, gap: 8, top: spec.heading ? 56 : 18, foot: 18, heading: spec.heading ? { dy: 38, size: 24 } : null },
    { row: compact ? 50 : Math.max(36, spec.row - 4), gap: 4, top: spec.heading ? 40 : 14, foot: spec.heading ? 8 : 14, heading: spec.heading ? { dy: 27, size: 22 } : null },
    { row: compact ? 50 : 36, gap: 4, top: spec.heading ? 36 : 10, foot: 2, heading: spec.heading ? { dy: 23, size: 18 } : null },
  ];
  const fits = (t: (typeof tiers)[number]) => Math.floor((room - t.top - t.foot + t.gap) / (t.row + t.gap));
  // A list short enough to show whole: the roomiest spacing that shows it all, in two columns if it may and one won't do. One that scrolls anyway: the roomiest that shows a few rows, keeping its heading.
  const few = Math.min(want, spec.heading ? 5 : 4);
  const whole = want === spec.items;
  let columns = 1;
  let tier = whole ? tiers.find((t) => fits(t) >= want) : undefined;
  if (!tier && whole && spec.columns) {
    tier = tiers.find((t) => fits(t) >= Math.ceil(want / spec.columns!));
    if (tier) columns = spec.columns;
  }
  tier ??= tiers.find((t) => fits(t) >= few) ?? tiers[tiers.length - 1];
  const rows = columns > 1 ? want : Math.max(1, Math.min(want, fits(tier)));
  const h = tier.top + Math.ceil(rows / columns) * (tier.row + tier.gap) - tier.gap + tier.foot;
  const x = space.x + (space.w - width) / 2;
  const y = space.y + Math.max(margin, Math.min(space.h - h - margin, (space.h - h) / 2 - spec.raise));
  return {
    panel: { x, y, w: width, h },
    heading: tier.heading ? { y: y + tier.heading.dy, size: tier.heading.size } : null,
    list: { x: x + pad, y: y + tier.top, width: listWidth - (rows < spec.items ? 44 : 0), row: tier.row, gap: tier.gap, compact: compact || (spec.values && listWidth - (rows < spec.items ? 44 : 0) < 380), columns, ...(rows < spec.items ? { scrollControls: true } : {}) },
    rows,
  };
}

/** A pane of text or readings: the TV's size if it fits, else as much of the safe area as it can have; on a screen taller than it is wide, as tall as it likes. */
export function fitPane(frame: Frame, width: number, height: number, raise: number): Rect {
  const a = menuSpace(frame);
  if (a.h > a.w) height = Math.max(height, a.h);
  const margin = Math.min(12, a.w * 0.03);
  const w = Math.min(width, a.w - 2 * margin);
  const h = Math.min(height, a.h - 2 * margin);
  return { x: a.x + (a.w - w) / 2, y: a.y + Math.max(margin, (a.h - h) / 2 - raise), w, h };
}

/** The back button some panes have for a pointer: its middle and radius, inside the pane's top left. */
export function backButton(panel: Rect, headingY: number) {
  return { x: panel.x + 34, y: headingY - 9, r: 17 };
}

/** Moves a menu's pane and everything in it down by `dy`. */
function shiftMenu(m: MenuPanel, dy: number): MenuPanel {
  return { ...m, panel: { ...m.panel, y: m.panel.y + dy }, heading: m.heading && { ...m.heading, y: m.heading.y + dy }, list: { ...m.list, y: m.list.y + dy } };
}

/** The design-unit point a shot should put the fly at, as a Shot's `across` and `low`. */
function spot(frame: Frame, x: number, y: number) {
  const { width, height } = frame.design;
  return { across: x / (width / 2) - 1, low: y / (height / 2) - 1 };
}

/** What the menus' hints take along the foot of the safe area (drawMenuHints). */
const HINTS_ROOM = 38;

/** Keep the menus clear of button hints; a keyboard already takes that edge. */
export function menuSpace(frame: Frame): Rect {
  const a = safeRect(frame);
  if (frame.safe.bottom < 80) a.h = Math.max(1, a.h - HINTS_ROOM);
  return a;
}

/** The wordmark's size for a width: a 6.5th of it, in proportion to the brain's state under it. */
const wordmarkFor = (width: number, most: number) => Math.max(24, Math.min(most, (width - 32) / 6.5));

export type TitleLayout = {
  menu: MenuPanel;
  wordmark: { x: number; y: number; size: number };
  /** Where the camera puts the fly, clear of all of it. */
  fly: { across: number; low: number };
};

/**
 * The title: on a wide screen the name on the left, the
 * menu on the right and the fly small under the name; on a tall one the name
 * at the top, the menu at the bottom, the fly between.
 */
export function titleLayout(frame: Frame, items: number): TitleLayout {
  const a = safeRect(frame);
  const spec: MenuPanelSpec = { items, width: 320, row: 40, heading: false, foot: 26, values: false, raise: -22, columns: 2 };
  if (a.w >= a.h * 1.2) {
    const right = Math.min(40, a.w * 0.047);
    const fit = (width: number) => fitMenu({ x: a.x + a.w - right - width - 12, y: a.y, w: width + 24, h: a.h }, { ...spec, width });
    let width = Math.min(320, a.w * 0.44);
    let menu = fit(width);
    // In two columns, wider, so that each button's word is as big as it can be.
    if (menu.list.columns > 1) menu = fit((width = Math.min(360, a.w * 0.52)));
    // Clear of the hints along the foot of the screen, where it can go up.
    const over = menu.panel.y + menu.panel.h - (a.y + a.h - HINTS_ROOM);
    if (over > 0) menu = shiftMenu(menu, -Math.max(0, Math.min(over, menu.panel.y - a.y - 12)));
    const menuX = a.x + a.w - right - width;
    const left = menuX - a.x;
    const size = wordmarkFor(left, 60);
    const x = a.x + left * (250 / 494);
    const y = Math.max(a.y + size * 0.9, menu.panel.y - 12);
    return { menu, wordmark: { x, y, size }, fly: { across: spot(frame, a.x + left * (187.88 / 494), 0).across, low: 0.1 } };
  }
  const size = wordmarkFor(a.w, 60);
  const cx = a.x + a.w / 2;
  const y = a.y + 22 + size * 0.85;
  // Under the name's descenders.
  const top = y + 22;
  const fitted = fitMenu({ x: a.x, y: top, w: a.w, h: a.y + a.h - HINTS_ROOM - top }, { ...spec, raise: 0 });
  const menu = shiftMenu(fitted, a.y + a.h - HINTS_ROOM - 12 - fitted.panel.h - fitted.panel.y);
  const middle = (top + menu.panel.y) / 2;
  return { menu, wordmark: { x: cx, y, size }, fly: spot(frame, cx, middle) };
}

export type RoomLayout = {
  menu: MenuPanel;
  /** The card with the room's QR code and, under it, its code. */
  card: Rect;
  qr: Rect;
  code: { x: number; y: number; size: number };
};

/** Round the QR code inside its card, and the room under it for the code. */
const CARD_PAD = 14;
const CODE_ROOM = 40;
/** The QR code's side: as big as the TV has room for, for a phone across the room; never so small a phone has to come close. */
const QR_MOST = 210;
const QR_LEAST = 120;

/**
 * At a room: the menu (`spec`), and the card a phone scans to join it, its
 * code readable under it. Side by side where the screen is wide, the card on
 * the left; on a tall one the card over the menu. Either way clear of the
 * hints along the foot.
 */
export function roomLayout(frame: Frame, spec: MenuPanelSpec): RoomLayout {
  const a = safeRect(frame);
  const margin = 12;
  const gap = 16;
  const sized = (qr: number) => ({ w: qr + 2 * CARD_PAD, h: qr + 2 * CARD_PAD + CODE_ROOM });
  const place = (x: number, y: number, qr: number) => {
    const { w, h } = sized(qr);
    return { card: { x, y, w, h }, qr: { x: x + CARD_PAD, y: y + CARD_PAD, w: qr, h: qr }, code: { x: x + w / 2, y: y + CARD_PAD + qr + CODE_ROOM * 0.66, size: Math.min(26, qr / 7) } };
  };
  if (a.w >= a.h) {
    const qr = Math.max(QR_LEAST, Math.min(QR_MOST, a.h - 2 * HINTS_ROOM - 2 * CARD_PAD - CODE_ROOM, a.w * 0.36));
    const { w, h } = sized(qr);
    const menuWidth = Math.min(spec.width, a.w - 2 * margin - gap - w);
    const left = a.x + (a.w - w - gap - menuWidth) / 2;
    const menu = fitMenu({ x: left + w + gap - margin, y: a.y, w: menuWidth + 2 * margin, h: a.h }, { ...spec, width: menuWidth });
    return { menu, ...place(left, a.y + Math.max(margin, (a.h - h) / 2 - spec.raise), qr) };
  }
  const qr = Math.max(QR_LEAST, Math.min(QR_MOST, a.w - 2 * margin - 2 * CARD_PAD, a.h * 0.4));
  const { w, h } = sized(qr);
  const fitted = fitMenu({ x: a.x, y: a.y + h + gap, w: a.w, h: a.h - h - gap - HINTS_ROOM }, { ...spec, raise: 0 });
  // The two together in the middle of the height.
  const top = a.y + Math.max(margin, (a.h - HINTS_ROOM - (h + gap + fitted.panel.h)) / 2);
  const menu = shiftMenu(fitted, top + h + gap - fitted.panel.y);
  return { menu, ...place(a.x + (a.w - w) / 2, top, qr) };
}

export type LoadingLayout = {
  wordmark: { x: number; y: number; size: number };
  /** The brain waking; or, if it can't, why, with "Try again" in it. */
  panel: Rect;
  failure: Rect;
  retry: Rect;
  fly: { across: number; low: number };
};

/** The loading screen: the name at the top, the brain waking in a pane at the bottom (or why it couldn't, and a button to try again), the fly (behind it, already there) out of their way. */
export function loadingLayout(frame: Frame): LoadingLayout {
  const a = safeRect(frame);
  const under = Math.min(56, a.h * 0.117);
  const pane = (width: number, h: number) => {
    const w = Math.min(width, a.w - 24);
    return { x: a.x + (a.w - w) / 2, y: a.y + a.h - h - under, w, h };
  };
  const panel = pane(440, 132);
  const failure = pane(520, 150);
  const rw = Math.min(180, failure.w - 40);
  const retry = { x: failure.x + (failure.w - rw) / 2, y: failure.y + failure.h - 46, w: rw, h: 34 };
  // The name over the taller of the two panes, its letters (from 0.8 of its size above the baseline to a quarter below) clear of it.
  const room = failure.y - a.y - 16;
  const size = Math.min(wordmarkFor(a.w, 64), room / 1.05);
  const wordmark = { x: a.x + a.w / 2, y: Math.min(a.y + Math.max(size * 0.9 + 12, a.h * (150 / 480)), failure.y - 8 - size * 0.25), size };
  // As on the title: on a wide screen to the left; on a tall one between the name and the pane.
  const fly = a.w >= a.h * 1.2 ? { across: -0.56, low: 0.1 } : spot(frame, wordmark.x, (wordmark.y + panel.y) / 2);
  return { wordmark, panel, failure, retry, fly };
}

/** The room the HUD leaves the fly while playing, between the caption and the tool's label: its share of the height, and where the fly's middle falls in it (a share of the half-height below the middle), about two thirds of the way down. */
function playSpot(frame: Frame, hud: HudLayout) {
  const top = hud.captionY + 15;
  const bottom = hud.touch && hud.touch.labelY === hud.shelfY ? hud.shelfY - 26 : hud.labelY - 17;
  const half = frame.design.height / 2;
  return { share: (bottom - top) / frame.design.height, low: (top + 0.7 * (bottom - top) - half) / half };
}

/**
 * Where the fly goes while playing, against where the shots put it for the
 * TV's HUD: how much lower (a share of the half-height; negative is higher),
 * and how much wider the field of view (1 on the TV). On a short screen the
 * shelf and the label take more of the height, so the fly rises to stay clear
 * of them and is drawn a little smaller to fit the room left.
 */
export function playRoom(frame: Frame): { lower: number; wider: number } {
  const here = playSpot(frame, hudLayout(frame));
  const tv = playSpot(TV_FRAME, hudLayout(TV_FRAME));
  return { lower: here.low - tv.low, wider: Math.max(1, Math.sqrt(tv.share / here.share)) };
}
