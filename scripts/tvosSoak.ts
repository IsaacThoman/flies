// Unattended physical-device run with the real brain, eyes and remote input.
// Logs stay on the TV: copy Library/Caches/performance.log from the app container.
//
// With --table, the TV sits at a table of eight instead: seven fake flies from this Mac
// (scripts/tables.ts) start one in a room server the TV can reach (--rooms, the site's by
// default) and walk round the TV's fly for as long as the soak lasts, while the TV plays, throws
// the ball among them and watches them as the wallpaper (docs/apple-tv.md, "Eight flies on a TV").
//
// --flies N (1 to NATIVE_MOST, the most an Apple TV lives) first sets Settings' Flies, how many
// flies the TV lives, each with a brain thread of its own; at a table it then brings N and the
// fakes take the other seats. The count stays set after the soak.
import { spawnSync } from "node:child_process";
import { tableCode } from "@fly/net";
import { PLACES } from "../apps/web/src/places/catalog.ts";
import { TIMES } from "../apps/web/src/scene/light.ts";
import { TOOLS } from "../apps/web/src/tools/hands.ts";
import { APP_ROOMS } from "../apps/web/src/online/invite.ts";
import { NATIVE_MOST } from "../apps/web/src/brain/create.ts";
import type { FakeFly } from "./tables.ts";

type Step = ["wait", Record<string, string>, number?] | ["press", string] | ["sleep", number] | ["log", string];

/** The Sky's weathers, Now among them. */
const SKY_WEATHERS = TOOLS.find((t) => t.id === "sky")!.second!.length;

/**
 * From the title, focused on Play: Settings' Flies set to `flies`, waiting until that many live,
 * and back to Play with Settings left on its tabs, where the soaks expect to find it.
 */
function chooseFlies(flies: number): Step[] {
  if (!Number.isInteger(flies) || flies < 1 || flies > NATIVE_MOST) throw Error(`--flies must be 1 to ${NATIVE_MOST}`);
  const press = (key: string, times = 1): Step[] => Array.from({ length: times }, () => ["press", key]);
  return [
    // The title may already be the wallpaper: the first press only wakes it, and Left does
    // nothing on the title (its Up and Down wrap round).
    ...press("ArrowLeft"),
    ["wait", { wallpaper: "false", focus: "play" }],
    ...press("ArrowDown", 2),
    ["wait", { focus: "settings" }],
    ...press("Enter"),
    ["wait", { screen: "settings", tab: "wallpaper", focus: "page" }],
    ...press("ArrowDown", 4),
    ["wait", { focus: "flies" }],
    ...press("ArrowLeft", NATIVE_MOST - 1),
    ...press("ArrowRight", flies - 1),
    // Each new fly's brain loads before it is there.
    ["wait", { flies: String(flies) }, 180000],
    ["log", `${flies} flies`],
    ...press("ArrowUp", 4),
    ["wait", { focus: "page" }],
    ...press("Escape"),
    ["wait", { screen: "title", focus: "settings" }],
    ...press("ArrowUp", 2),
    ["wait", { focus: "play" }],
  ];
}

/** How far along the shelf one tool is from another: Right for more, Left for fewer. */
const along = (from: string, to: string) => TOOLS.findIndex((t) => t.id === to) - TOOLS.findIndex((t) => t.id === from);

export function soakConfig(minutes = 30, flies?: number) {
  if (!Number.isFinite(minutes) || minutes < 2) throw Error("--minutes must be at least 2");
  const drive: Step[] = [];
  const wait = (state: Record<string, string>, timeout?: number) => drive.push(timeout ? ["wait", state, timeout] : ["wait", state]);
  const press = (key: string, times = 1) => { for (let i = 0; i < times; i++) drive.push(["press", key]); };
  const phase = (name: string, ms: number) => { drive.push(["log", name], ["sleep", ms]); };
  const throws = () => { for (let i = 0; i < 8; i++) { press("Enter"); drive.push(["sleep", 2500]); } };

  // The splash lifts at ready: the log line's [js ms] is the time from launch.
  wait({ ready: "true" });
  wait({ screen: "title", brain: "running" });
  if (flies !== undefined) drive.push(...chooseFlies(flies));
  phase("title", 15000);
  press("Enter");
  wait({ screen: "play", tool: "feed" });
  press("ArrowDown");
  press("Enter");
  phase("feeding", 15000);
  press("ArrowRight", along("feed", "swoop"));
  wait({ tool: "swoop" });
  throws();
  // The Sky, from Now, whatever time of day a launch came back to.
  press("ArrowRight", along("swoop", "sky"));
  press("ArrowUp", 5);
  press("ArrowDown", 2);
  wait({ time: "noon" });
  phase("daylight transition", 10000);
  press("ArrowLeft", along("swoop", "sky"));
  throws();
  // Past the Sky and Place to View.
  press("ArrowRight", along("swoop", "view"));
  press("ArrowUp", 6);
  press("ArrowDown", 5);
  wait({ view: "eyes" });
  phase("eye picture low", 15000);
  // The menu (Play/Pause), Settings, the Picture tab, the fly's eyes up a step, and back to play.
  press("MediaPlayPause");
  wait({ screen: "title", focus: "play" });
  press("ArrowDown", 2);
  wait({ focus: "settings" });
  press("Enter");
  wait({ screen: "settings", focus: "page" });
  press("ArrowRight", 3);
  wait({ tab: "picture" });
  press("ArrowDown", 2);
  wait({ focus: "eyes" });
  press("ArrowRight");
  press("MediaPlayPause");
  wait({ screen: "play" });
  phase("eye picture high", 15000);
  // Restore Low so an unattended run leaves the user's usual eye detail in place: the menu and Settings remember where they were.
  press("MediaPlayPause");
  wait({ screen: "title", focus: "play" });
  press("ArrowDown", 2);
  press("Enter");
  wait({ screen: "settings", tab: "picture", focus: "eyes" });
  press("ArrowLeft");
  press("MediaPlayPause");
  press("ArrowUp", 4);
  wait({ view: "follow" });
  // The shelf is on View. Clamp each choice from its first variant, regardless of saved settings.
  const tools = TOOLS.map((t) => t.id as string);
  let tool = tools.indexOf("view");
  const choose = (id: string, variant: number) => {
    const next = tools.indexOf(id);
    press(next > tool ? "ArrowRight" : "ArrowLeft", Math.abs(next - tool));
    tool = next;
    wait({ tool: id });
    press("ArrowUp", id === "sky" ? TIMES.length : PLACES.length - 1);
    press("ArrowDown", variant);
  };
  for (const [index, place] of PLACES.entries()) {
    choose("place", index);
    press("Enter");
    wait({ place: place.id, moving: "" });
    // Once, at the first: the screensaver stays home, so a long wallpaper phase never goes round the places
    // (Settings → Screensaver → Places, Home only); the Place tool carries home with the fly.
    if (index === 0) {
      press("MediaPlayPause");
      wait({ screen: "title", focus: "play" });
      press("ArrowDown", 2);
      press("Enter");
      // Settings is where it was left, on the fly's eyes, two below the tabs; its rows wrap round.
      wait({ screen: "settings", tab: "picture", focus: "eyes" });
      press("ArrowUp", 2);
      wait({ focus: "page" });
      press("ArrowLeft", 3);
      wait({ tab: "wallpaper" });
      press("ArrowDown", 4);
      wait({ focus: "wallpaperPlaces" });
      press("ArrowLeft");
      press("MediaPlayPause");
      wait({ screen: "play", place: place.id });
    }
    // Select steps the Sky's weather round, from wherever a launch left it: once round is every weather and Now.
    for (let weather = 1; weather <= SKY_WEATHERS; weather++) {
      choose("sky", 1);
      press("Enter");
      for (const [timeIndex, time] of TIMES.entries()) {
        choose("sky", timeIndex + 1);
        wait({ time });
        phase(`${place.id} weather ${weather} ${time}`, 5000);
      }
    }
    for (const [variant, time] of [[2, "noon"], [5, "night"]] as const) {
      choose("sky", variant);
      wait({ time });
      // The wallpaper comes after a minute without a press (the default), as long as a wait's default timeout: leave room.
      wait({ wallpaper: "true" }, 150000);
      phase(`${place.id} ${time} wallpaper`, minutes * 60000 / (PLACES.length * 2));
      press("Enter");
      wait({ wallpaper: "false" });
    }
  }
  drive.push(["log", "soak complete"]);
  // Alone: a visit kept from an earlier run would otherwise sit it with everyone once its brain is awake.
  return { script: "game.js", stats: 10, logFile: true, url: "http://fly.local/?alone", drive };
}

/**
 * The TV at table `code` in the room server at `rooms`, with seven others already there: playing
 * among them (feeding, the ball now and then, the fly's eyes), then watching them as the
 * wallpaper. Half the minutes each. The table's light, weather and place are its starter's, one
 * of the fakes, so this soak leaves them be.
 */
export function tableSoakConfig(minutes: number, code: string, rooms: string, flies?: number) {
  if (!Number.isFinite(minutes) || minutes < 2) throw Error("--minutes must be at least 2");
  const drive: Step[] = [];
  const wait = (state: Record<string, string>) => drive.push(["wait", state]);
  const press = (key: string, times = 1) => { for (let i = 0; i < times; i++) drive.push(["press", key]); };
  const phase = (name: string, ms: number) => { drive.push(["log", name], ["sleep", ms]); };
  wait({ screen: "title", brain: "running", online: "joined" });
  if (flies !== undefined) drive.push(...chooseFlies(flies));
  phase("table title", 15000);
  press("Enter");
  wait({ screen: "play", tool: "feed" });
  press("ArrowDown");
  press("Enter");
  phase("table feeding", 15000);
  press("ArrowRight", along("feed", "swoop"));
  wait({ tool: "swoop" });
  // The ball thrown once every 20 s while playing among them.
  const throws = Math.max(1, Math.round((minutes * 60) / 2 / 20));
  drive.push(["log", "table play"]);
  for (let i = 0; i < throws; i++) drive.push(["press", "Enter"], ["sleep", 20000]);
  // Watch, from the menu: the wallpaper, still at the table.
  press("MediaPlayPause");
  wait({ screen: "title", focus: "play" });
  press("ArrowDown");
  wait({ focus: "watch" });
  press("Enter");
  wait({ wallpaper: "true" });
  phase("table wallpaper", (minutes * 60000) / 2);
  drive.push(["log", "soak complete"]);
  return { script: "game.js", stats: 10, logFile: true, url: `http://fly.local/?rooms=${encodeURIComponent(rooms)}&table=${code}`, drive };
}

/** How long a soak's drive sleeps in all, ms: the least it takes. */
export const driveMs = (drive: Step[]) => drive.reduce((ms, step) => ms + (step[0] === "sleep" ? step[1] : 0), 0);

/**
 * The flies at a soak's table, the TV's among them: eight, as measured on a TV (docs/apple-tv.md).
 * Not a full table (MAX_FLIES): the fakes all come from this Mac, and a room server lets one
 * address open only so many connections (ROOM_LIMITS).
 */
const TABLE = 8;

/** Starts a table of seven fake flies in `rooms`, launches the TV at it, and keeps them walking until the soak is done. */
async function tableSoak(device: string, minutes: number, rooms: string, flies = 1) {
  // Only now: tables.ts brings Playwright with it.
  const { fakeFly } = await import("./tables.ts");
  const code = tableCode((bytes) => crypto.getRandomValues(bytes));
  const start = { place: "picnic", light: "noon", weather: "clear", zone: "UTC", offset: 0, name: "Soak", listed: false };
  const fakes = new Set<number>();
  const fakeFlies: FakeFly[] = [];
  for (let k = 0; k < TABLE - flies; k++) fakeFlies.push(await fakeFly(rooms, code, k, fakes, k === 0 ? start : undefined));
  console.log(`${fakeFlies.length} fake flies at table ${code} in ${rooms}`);
  const config = tableSoakConfig(minutes, code, rooms, flies);
  const result = spawnSync(process.execPath, ["scripts/tvos.ts", "run", "--device", device, "--detached", "--config", JSON.stringify(config)], { stdio: "inherit", cwd: new URL("..", import.meta.url) });
  if (result.error || result.status !== 0) {
    for (const fly of fakeFlies) fly.close();
    throw result.error ?? Error(`launching failed (exit ${result.status})`);
  }
  // The drive's sleeps, and five minutes for its waits and the TV's start.
  const until = Date.now() + driveMs(config.drive) + 5 * 60_000;
  console.log(`The fakes stay until ${new Date(until).toLocaleTimeString()}; the TV logs "drive: soak complete" when it is done.`);
  await new Promise((resolve) => setTimeout(resolve, until - Date.now()));
  for (const fly of fakeFlies) fly.close();
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const device = args[args.indexOf("--device") + 1];
  if (!args.includes("--device") || !device) throw Error("Use --device <paired Apple TV UDID> [--minutes 30] [--flies 1-3] [--table [--rooms wss://…/rooms]]");
  const minutes = args.includes("--minutes") ? Number(args[args.indexOf("--minutes") + 1]) : 30;
  const flies = args.includes("--flies") ? Number(args[args.indexOf("--flies") + 1]) : undefined;
  if (args.includes("--table")) {
    await tableSoak(device, minutes, args.includes("--rooms") ? args[args.indexOf("--rooms") + 1] : APP_ROOMS, flies);
    process.exit(0);
  }
  const result = spawnSync(process.execPath, ["scripts/tvos.ts", "run", "--device", device, "--detached", "--config", JSON.stringify(soakConfig(minutes, flies))], { stdio: "inherit", cwd: new URL("..", import.meta.url) });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
