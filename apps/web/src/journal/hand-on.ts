// Handing a picture from the journal on, where the host can: a phone's share
// sheet (on the iPhone and iPad app, Save Image is there), or a browser's
// download. The Apple TV can do neither, and its journal is the only place a
// picture is kept. Nothing is uploaded: the picture goes only where the player
// sends it.

export type HandedOn = "shared" | "saved" | "failed";

/** Whether this host can hand a picture on at all: not the Apple TV's (it has no share sheet and no files). */
export function canHandOn(): boolean {
  if ((globalThis as { __native?: unknown }).__native) return false;
  return typeof document !== "undefined" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function";
}

/** The picture's bytes, from its data URL. */
export function pictureBlob(url: string): Blob {
  const comma = url.indexOf(",");
  const binary = atob(url.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "image/jpeg" });
}

/** A file name for a picture taken at `at`: "flies-2026-11-17-1504.jpg". */
export function pictureName(at: number) {
  const d = new Date(at);
  const two = (n: number) => String(n).padStart(2, "0");
  return `flies-${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}.jpg`;
}

/** Hands a picture on: the share sheet with `share` (a phone), else a download. Called from a press. */
export async function handOn(url: string, at: number, share: boolean): Promise<HandedOn> {
  if (!canHandOn()) return "failed";
  const blob = pictureBlob(url);
  const name = pictureName(at);
  const nav = typeof navigator === "undefined" ? null : navigator;
  if (share && nav?.share && typeof File !== "undefined") {
    const file = new File([blob], name, { type: "image/jpeg" });
    if (!nav.canShare || nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file] });
        return "shared";
      } catch (error) {
        // Dismissed: they chose not to. Anything else falls through to a download.
        if ((error as Error).name === "AbortError") return "failed";
      }
    }
  }
  try {
    const link = document.createElement("a");
    const href = URL.createObjectURL(blob);
    link.href = href;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 30_000);
    return "saved";
  } catch {
    return "failed";
  }
}
