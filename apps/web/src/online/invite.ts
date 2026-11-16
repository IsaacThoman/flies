// Invitations to a table: a link with the table's code (?table=), which is
// all the permission there is; this device's own key, kept on it; where the
// room server is; and handing the link on (the system's share sheet where
// there is one, else the clipboard).

import { ROOMS_PATH, isTableCode, tableCode } from "@fly/net";
import type { TableStart } from "@fly/net";

const random = (bytes: Uint8Array<ArrayBuffer>) => crypto.getRandomValues(bytes);

/** A new table's code, made here so that its link can be shared at once, before the room has heard of it. */
export const newTableCode = () => tableCode(random);

/** A key for this device: 128 random bits. */
export function newDeviceKey(): string {
  let key = "";
  for (const b of random(new Uint8Array(16))) key += b.toString(16).padStart(2, "0");
  return key;
}

/** The table a page's address invites it to, if any. */
export function invitedTo(href: string): string | null {
  const code = new URL(href).searchParams.get("table");
  return isTableCode(code) ? code : null;
}

/** The address to share for a table: this page's, with the table's code. */
export function inviteLink(href: string, code: string): string {
  const url = new URL(href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("table", code);
  return url.href;
}

/** Puts the table in the page's address (or takes it out), so that a reload comes back to it. */
export function showInAddress(code: string | null) {
  if (typeof history === "undefined") return;
  const url = new URL(location.href);
  if (code) url.searchParams.set("table", code);
  else url.searchParams.delete("table");
  history.replaceState(history.state, "", url.href);
}

/** The room server: this site's own /rooms, or another named by ?rooms= (for development and scripts). */
export function roomsUrl(href: string): string {
  const page = new URL(href);
  const named = page.searchParams.get("rooms");
  if (named) return named;
  const url = new URL(ROOMS_PATH, page);
  url.protocol = page.protocol === "https:" ? "wss:" : "ws:";
  url.search = "";
  url.hash = "";
  return url.href;
}

/** What this device says of a table it starts: where the fly is, the light and weather chosen, and its own clock. */
export function tableStart(place: string, light: string, weather: string, now = new Date()): TableStart {
  let zone = "";
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    // An old browser: the offset alone keeps the clock.
  }
  return { place, light, weather, zone, offset: -now.getTimezoneOffset() };
}

/** How the link went: through the share sheet, onto the clipboard, or nowhere (refused, or no way to). */
export type Shared = "shared" | "copied" | "failed";

/** Hands the link on. Called from a press (the browser allows these only then). */
export async function share(url: string): Promise<Shared> {
  const nav = typeof navigator === "undefined" ? null : navigator;
  if (nav?.share && (!nav.canShare || nav.canShare({ url }))) {
    try {
      await nav.share({ url });
      return "shared";
    } catch (error) {
      // Dismissed: they chose not to. Anything else falls through to the clipboard.
      if ((error as Error).name === "AbortError") return "failed";
    }
  }
  try {
    await nav?.clipboard.writeText(url);
    return nav?.clipboard ? "copied" : "failed";
  } catch {
    return "failed";
  }
}
