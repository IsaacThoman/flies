// A 2D canvas that draws nothing, for drawing the menus and the HUD in Node
// to see where their targets land, and what it was asked to write where.
// Text is measured as about half its size a letter, as the rounded font
// measures.

export type Written = { text: string; x: number; y: number; size: number; width: number; align: string };
const WRITTEN = Symbol("written");

export function blankCanvas(): CanvasRenderingContext2D {
  let size = 16;
  const gradient = { addColorStop() {} };
  const written: Written[] = [];
  const state: Record<string | symbol, unknown> = { [WRITTEN]: written, textAlign: "left" };
  return new Proxy(state, {
    get(target, key) {
      if (key === "measureText") return (text: string) => ({ width: text.length * size * 0.55 });
      if (key === "fillText") return (text: string, x: number, y: number) => written.push({ text, x, y, size, width: text.length * size * 0.55, align: String(target.textAlign) });
      if (key === "createLinearGradient" || key === "createRadialGradient") return () => gradient;
      if (key in target) return target[key];
      return () => {};
    },
    set(target, key, value) {
      if (key === "font") size = Number(/(\d+(?:\.\d+)?)px/.exec(String(value))?.[1] ?? size);
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

/** What was written on a blank canvas, in order. */
export const writtenOn = (g: CanvasRenderingContext2D) => (g as unknown as Record<symbol, Written[]>)[WRITTEN];
