// The kit's drawing: glossy glass panels and pills, the soap-bubble focus
// ring, sliders and choices, friendly type, and the remote's buttons as
// little glyphs. Only paths, fills, strokes, gradients and text, which the
// Apple TV host's 2D canvas draws too: no shadows, filters or images.

type Ctx = CanvasRenderingContext2D;

/** Friendly rounded type, with fallbacks. */
export const FONT = '"Arial Rounded MT Bold", "Nunito", "Varela Round", "Avenir Next", "Helvetica Neue", Arial, sans-serif';
export const INK = "#0d3b66";
export const INK_SOFT = "rgba(13, 59, 102, 0.72)";
export const TAU = Math.PI * 2;

export const font = (size: number, weight = 700) => `${weight} ${Math.round(size)}px ${FONT}`;

export function roundedRect(g: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + k, y);
  g.lineTo(x + w - k, y);
  g.arcTo(x + w, y, x + w, y + k, k);
  g.lineTo(x + w, y + h - k);
  g.arcTo(x + w, y + h, x + w - k, y + h, k);
  g.lineTo(x + k, y + h);
  g.arcTo(x, y + h, x, y + h - k, k);
  g.lineTo(x, y + k);
  g.arcTo(x, y, x + k, y, k);
  g.closePath();
}

/** A soft drop shadow drawn as stacked translucent shapes (the host has no canvas shadows). */
function softShadow(g: Ctx, x: number, y: number, w: number, h: number, r: number, depth: number, alpha: number) {
  for (let i = 3; i >= 1; i--) {
    const s = (depth * i) / 3;
    roundedRect(g, x - s * 0.5, y + s * 0.6, w + s, h + s * 0.6, r + s * 0.5);
    g.fillStyle = `rgba(4, 40, 90, ${(alpha / 3).toFixed(3)})`;
    g.fill();
  }
}

export type PanelStyle = { tint?: "sky" | "mint" | "night"; alpha?: number; shadow?: boolean };

/** A pane of glossy Aero glass. */
export function glassPanel(g: Ctx, x: number, y: number, w: number, h: number, r: number, style: PanelStyle = {}) {
  const alpha = style.alpha ?? 1;
  const tint = style.tint ?? "sky";
  g.save();
  g.globalAlpha *= alpha;
  if (style.shadow !== false) softShadow(g, x, y, w, h, r, 10, 0.28);
  const body = g.createLinearGradient(0, y, 0, y + h);
  if (tint === "night") {
    body.addColorStop(0, "rgba(40, 70, 130, 0.86)");
    body.addColorStop(1, "rgba(10, 24, 60, 0.9)");
  } else if (tint === "mint") {
    body.addColorStop(0, "rgba(236, 255, 248, 0.9)");
    body.addColorStop(0.5, "rgba(190, 245, 226, 0.84)");
    body.addColorStop(1, "rgba(130, 222, 200, 0.88)");
  } else {
    body.addColorStop(0, "rgba(246, 252, 255, 0.92)");
    body.addColorStop(0.5, "rgba(212, 238, 255, 0.86)");
    body.addColorStop(1, "rgba(160, 214, 250, 0.9)");
  }
  roundedRect(g, x, y, w, h, r);
  g.fillStyle = body;
  g.fill();
  // The gloss: a bright band over the top half.
  const gloss = g.createLinearGradient(0, y, 0, y + h * 0.5);
  gloss.addColorStop(0, tint === "night" ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.85)");
  gloss.addColorStop(1, "rgba(255,255,255,0.05)");
  roundedRect(g, x + 3, y + 3, w - 6, h * 0.46, Math.max(0, r - 3));
  g.fillStyle = gloss;
  g.fill();
  // Rims: a white inner edge and a blue outer one.
  roundedRect(g, x, y, w, h, r);
  g.lineWidth = 2;
  g.strokeStyle = tint === "night" ? "rgba(140, 200, 255, 0.7)" : "rgba(40, 130, 210, 0.55)";
  g.stroke();
  roundedRect(g, x + 2, y + 2, w - 4, h - 4, Math.max(0, r - 2));
  g.lineWidth = 1.5;
  g.strokeStyle = "rgba(255, 255, 255, 0.9)";
  g.stroke();
  g.restore();
}

/** `focused`: the remote's focus is on it; `hover`: a pointer is over it, which only brightens it a little. */
export type PillStyle = { focused?: boolean; hover?: boolean; color?: "aqua" | "green" | "orange" | "pink" | "glass"; disabled?: boolean; press?: number; /** The label's size, if not the pill's own. */ size?: number };

const PILL_COLORS = {
  aqua: ["#9ff0ff", "#29b6ec", "#0a7cc7"],
  green: ["#d6ff9a", "#6fd13a", "#2d9a1e"],
  orange: ["#ffe29a", "#ffab2e", "#ea6a0c"],
  pink: ["#ffd3ec", "#ff7fbf", "#d93c8e"],
  glass: ["rgba(255,255,255,0.95)", "rgba(220,240,255,0.85)", "rgba(170,215,245,0.9)"],
} as const;

/** A glossy jelly button, its label centred. */
export function pill(g: Ctx, x: number, y: number, w: number, h: number, label: string, style: PillStyle = {}) {
  const [top, mid, bottom] = PILL_COLORS[style.color ?? (style.focused ? "aqua" : "glass")];
  const lift = style.focused ? 2 : 0;
  const press = style.press ?? 0;
  const yy = y - lift + press * 2;
  const r = h / 2;
  g.save();
  if (style.disabled) g.globalAlpha *= 0.45;
  softShadow(g, x, yy, w, h, r, style.focused ? 8 : 5, style.focused ? 0.3 : 0.18);
  const body = g.createLinearGradient(0, yy, 0, yy + h);
  body.addColorStop(0, top);
  body.addColorStop(0.5, mid);
  body.addColorStop(1, bottom);
  roundedRect(g, x, yy, w, h, r);
  g.fillStyle = body;
  g.fill();
  if (style.hover && !style.focused) {
    g.fillStyle = "rgba(80, 185, 255, 0.2)";
    g.fill();
  }
  const gloss = g.createLinearGradient(0, yy, 0, yy + h * 0.55);
  gloss.addColorStop(0, "rgba(255,255,255,0.9)");
  gloss.addColorStop(1, "rgba(255,255,255,0.12)");
  roundedRect(g, x + h * 0.18, yy + 2, w - h * 0.36, h * 0.46, h * 0.23);
  g.fillStyle = gloss;
  g.fill();
  roundedRect(g, x, yy, w, h, r);
  g.lineWidth = 1.5;
  g.strokeStyle = style.focused ? "rgba(0, 80, 150, 0.6)" : "rgba(40, 110, 180, 0.4)";
  g.stroke();
  if (label) {
    const size = style.size ?? Math.round(h * 0.46);
    g.font = font(size);
    g.textAlign = "center";
    g.textBaseline = "middle";
    const light = style.focused || (style.color && style.color !== "glass");
    if (light) {
      g.lineJoin = "round";
      g.lineWidth = 3;
      g.strokeStyle = "rgba(0, 60, 120, 0.55)";
      g.strokeText(label, x + w / 2, yy + h / 2 + 1);
    }
    g.fillStyle = light ? "#ffffff" : INK;
    g.fillText(label, x + w / 2, yy + h / 2 + 1);
  }
  g.restore();
}

const FILM = ["#a6fff0", "#9fd8ff", "#d9c6ff", "#ffffff", "#ffd2f0", "#a6fff0"];

/**
 * The soap-bubble focus ring: an iridescent rim round a rounded rectangle,
 * with a glint running round it. `t` is seconds, for the shimmer.
 */
export function bubbleRing(g: Ctx, x: number, y: number, w: number, h: number, r: number, t: number, alpha = 1) {
  if (alpha <= 0.01) return;
  const gap = 5;
  const ox = x - gap;
  const oy = y - gap;
  const ow = w + gap * 2;
  const oh = h + gap * 2;
  const or = r + gap;
  g.save();
  g.globalAlpha *= alpha;
  roundedRect(g, ox, oy + 1.5, ow, oh, or);
  g.lineWidth = 6;
  g.strokeStyle = "rgba(0, 50, 110, 0.28)";
  g.stroke();
  roundedRect(g, ox, oy, ow, oh, or);
  g.lineWidth = 6;
  g.strokeStyle = "rgba(70, 215, 235, 0.75)";
  g.stroke();
  // The film: a gradient whose direction turns slowly.
  const a = t * 0.9;
  const cx = ox + ow / 2;
  const cy = oy + oh / 2;
  const dx = Math.cos(a) * ow * 0.5;
  const dy = Math.sin(a) * oh * 0.5;
  const film = g.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  FILM.forEach((c, i) => film.addColorStop(i / (FILM.length - 1), c));
  roundedRect(g, ox, oy, ow, oh, or);
  g.lineWidth = 3.5;
  g.strokeStyle = film;
  g.stroke();
  // A glint travelling round the rim.
  const p = pointOnRoundedRect(ox, oy, ow, oh, or, (t * 0.18) % 1);
  const glint = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, 9);
  glint.addColorStop(0, "rgba(255,255,255,1)");
  glint.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = glint;
  g.beginPath();
  g.arc(p.x, p.y, 9, 0, TAU);
  g.fill();
  g.restore();
}

/** A point a fraction of the way round a rounded rectangle's perimeter (clockwise from the top left). */
export function pointOnRoundedRect(x: number, y: number, w: number, h: number, r: number, f: number) {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  const sw = w - 2 * k;
  const sh = h - 2 * k;
  const arc = (Math.PI / 2) * k;
  const total = 2 * sw + 2 * sh + 4 * arc;
  let d = (((f % 1) + 1) % 1) * total;
  const corner = (cx: number, cy: number, a0: number) => {
    const a = a0 + (d / arc) * (Math.PI / 2);
    return { x: cx + Math.cos(a) * k, y: cy + Math.sin(a) * k };
  };
  if (d < sw) return { x: x + k + d, y };
  d -= sw;
  if (d < arc) return corner(x + w - k, y + k, -Math.PI / 2);
  d -= arc;
  if (d < sh) return { x: x + w, y: y + k + d };
  d -= sh;
  if (d < arc) return corner(x + w - k, y + h - k, 0);
  d -= arc;
  if (d < sw) return { x: x + w - k - d, y: y + h };
  d -= sw;
  if (d < arc) return corner(x + k, y + h - k, Math.PI / 2);
  d -= arc;
  if (d < sh) return { x, y: y + h - k - d };
  d -= sh;
  return corner(x + k, y + k, Math.PI);
}

export type TextStyle = {
  size: number;
  weight?: number;
  color?: string | CanvasGradient;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  /** A stroke round the letters, for text over the busy world. */
  outline?: string;
  outlineWidth?: number;
};

export function text(g: Ctx, value: string, x: number, y: number, style: TextStyle) {
  g.font = font(style.size, style.weight);
  g.textAlign = style.align ?? "left";
  g.textBaseline = style.baseline ?? "alphabetic";
  if (style.outline) {
    g.lineJoin = "round";
    g.lineWidth = style.outlineWidth ?? Math.max(2, style.size * 0.18);
    g.strokeStyle = style.outline;
    g.strokeText(value, x, y);
  }
  g.fillStyle = style.color ?? INK;
  g.fillText(value, x, y);
}

/** Lines of text wrapped to `width` at `size`. */
export function wrap(g: Ctx, value: string, width: number, size: number, weight = 700): string[] {
  g.font = font(size, weight);
  const lines: string[] = [];
  for (const paragraph of value.split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (line && g.measureText(next).width > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

/** A glossy track with a jelly thumb, `value` from 0 to 1. */
export function slider(g: Ctx, x: number, y: number, w: number, value: number, focused: boolean) {
  const h = 12;
  roundedRect(g, x, y - h / 2, w, h, h / 2);
  const track = g.createLinearGradient(0, y - h / 2, 0, y + h / 2);
  track.addColorStop(0, "rgba(10, 60, 120, 0.35)");
  track.addColorStop(1, "rgba(255, 255, 255, 0.6)");
  g.fillStyle = track;
  g.fill();
  const v = Math.max(0, Math.min(1, value));
  if (v > 0) {
    roundedRect(g, x, y - h / 2, Math.max(h, w * v), h, h / 2);
    const fill = g.createLinearGradient(0, y - h / 2, 0, y + h / 2);
    fill.addColorStop(0, "#b4ff8a");
    fill.addColorStop(1, "#3cb52a");
    g.fillStyle = fill;
    g.fill();
  }
  const tx = x + w * v;
  orb(g, tx, y, focused ? 12 : 10, focused ? "aqua" : "glass");
}

/** A glossy ball, the kit's dot: slider thumbs, list bullets. */
export function orb(g: Ctx, x: number, y: number, r: number, color: keyof typeof PILL_COLORS = "aqua") {
  const [top, mid, bottom] = PILL_COLORS[color];
  const body = g.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
  body.addColorStop(0, top);
  body.addColorStop(0.6, mid);
  body.addColorStop(1, bottom);
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fillStyle = body;
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = "rgba(0, 60, 120, 0.45)";
  g.stroke();
  g.beginPath();
  g.ellipse(x, y - r * 0.45, r * 0.6, r * 0.32, 0, 0, TAU);
  g.fillStyle = "rgba(255,255,255,0.75)";
  g.fill();
}

/** A small left or right chevron in a glass circle, dimmed when that way is closed. */
export function chevron(g: Ctx, x: number, y: number, dir: -1 | 1, enabled: boolean) {
  g.save();
  g.globalAlpha *= enabled ? 1 : 0.3;
  orb(g, x, y, 10, "glass");
  g.beginPath();
  g.moveTo(x - dir * 3, y - 5);
  g.lineTo(x + dir * 3, y);
  g.lineTo(x - dir * 3, y + 5);
  g.lineWidth = 2.5;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.strokeStyle = INK;
  g.stroke();
  g.restore();
}

/** A round glass button with a symbol on it, for a pointer to press: back (a chevron) or the menu (two bars, as for pause). */
export function iconButton(g: Ctx, x: number, y: number, r: number, icon: "back" | "menu", hot = false) {
  g.save();
  softShadow(g, x - r, y - r, r * 2, r * 2, r, 5, 0.18);
  orb(g, x, y, r, hot ? "aqua" : "glass");
  g.fillStyle = hot ? "#ffffff" : INK;
  g.strokeStyle = hot ? "#ffffff" : INK;
  if (icon === "menu") {
    // Three bars: the menu, which doesn't stop the fly.
    const w = r * 0.9;
    const h = r * 0.16;
    for (let i = -1; i <= 1; i++) g.fillRect(x - w / 2, y + i * r * 0.3 - h / 2, w, h);
  } else {
    g.beginPath();
    g.moveTo(x + r * 0.16, y - r * 0.36);
    g.lineTo(x - r * 0.22, y);
    g.lineTo(x + r * 0.16, y + r * 0.36);
    g.lineWidth = r * 0.2;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.stroke();
  }
  g.restore();
}
