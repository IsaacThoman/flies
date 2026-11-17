// Unattended physical-device run with the real brain, eyes and remote input.
// Logs stay on the TV: copy Library/Caches/performance.log from the app container.
//
// With --table, the TV sits at a table of eight instead: seven fake flies from this Mac
// (scripts/tables.ts) start one in a room server the TV can reach (--rooms, the site's by
// default) and walk round the TV's fly for as long as the soak lasts, while the TV plays, throws
// the ball among them and watches them as the wallpaper (docs/apple-tv.md, "Eight flies on a TV").
import { spawnSync } from "node:child_process";
import { MAX_FLIES, tableCode } from "@fly/net";
import { WEATHERS } from "@fly/world";
import { PLACES } from "../apps/web/src/places/catalog.ts";
import { TIMES } from "../apps/web/src/scene/light.ts";
import { APP_ROOMS } from "../apps/web/src/online/invite.ts";
import type { FakeFly } from "./tables.ts";

type Step = ["wait", Record<string, string>, number?] | ["press", string] | ["sleep", number] | ["log", string];

export function soakConfig(minutes = 30) {
  if (!Number.isFinite(minutes) || minutes < 2) throw Error("--minutes must be at least 2");
  const drive: Step[] = [];
  const wait = (state: Record<string, string>, timeout?: number) => drive.push(timeout ? ["wait", state, timeout] : ["wait", state]);
  const press = (key: string, times = 1) => { for (let i = 0; i < times; i++) drive.push(["press", key]); };
  const phase = (name: string, ms: number) => { drive.push(["log", name], ["sleep", ms]); };
  const throws = () => { for (let i = 0; i < 8; i++) { press("Enter"); drive.push(["sleep", 2500]); } };

  // The splash lifts at ready: the log line's [js ms] is the time from launch.
  wait({ ready: "true" });
  wait({ screen: "title", brain: "running" });
  phase("title", 15000);
  press("Enter");
  wait({ screen: "play", tool: "feed" });
  press("ArrowDown");
  press("Enter");
  phase("feeding", 15000);
  press("ArrowRight");
  wait({ tool: "swoop" });
  throws();
  // From Now, whatever time of day a launch came back to.
  press("ArrowRight", 3);
  press("ArrowUp", 5);
  press("ArrowDown", 2);
  wait({ time: "noon" });
  phase("daylight transition", 10000);
  press("ArrowLeft", 3);
  throws();
  // Past Light and Weather to View.
  press("ArrowRight", 5);
  press("ArrowUp", 6);
  press("ArrowDown", 5);
  wait({ view: "eyes" });
  phase("eye picture low", 15000);
  // The menu (Play/Pause), Settings, the Picture tab, the fly's eyes up a step, and back to play.
  press("MediaPlayPause");
  wait({ screen: "title", focus: "play" });
  press("ArrowDown", 4);
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
  wait({ screen: "title" });
  press("ArrowDown", 4);
  press("Enter");
  wait({ screen: "settings", tab: "picture", focus: "eyes" });
  press("ArrowLeft");
  press("MediaPlayPause");
  press("ArrowUp", 4);
  wait({ view: "follow" });
  // The shelf is on View. Clamp each choice from its first variant, regardless of saved settings.
  const tools = ["feed", "swoop", "feather", "blow", "light", "weather", "view", "place"];
  let tool = tools.indexOf("view");
  const choose = (id: string, variant: number) => {
    const next = tools.indexOf(id);
    press(next > tool ? "ArrowRight" : "ArrowLeft", Math.abs(next - tool));
    tool = next;
    wait({ tool: id });
    press("ArrowUp", id === "light" ? 5 : 4);
    press("ArrowDown", variant);
  };
  for (const [index, place] of PLACES.entries()) {
    choose("place", index);
    press("Enter");
    wait({ place: place.id, moving: "" });
    // Pin the place once, at the first: a long wallpaper phase must not trigger the normal 20-minute rotation.
    // Each step of Settings' choice carries the fly there at once, so only step from Each in turn to here;
    // once pinned, the Place tool moves the pin with the fly.
    if (index === 0) {
      press("MediaPlayPause");
      wait({ screen: "title", focus: "play" });
      press("ArrowUp", 4);
      press("ArrowDown", 4);
      press("Enter");
      wait({ screen: "settings" });
      press("ArrowUp", 8);
      wait({ focus: "page" });
      press("ArrowLeft", 3);
      wait({ tab: "wallpaper" });
      press("ArrowDown", 3);
      wait({ focus: "place" });
      press("ArrowLeft", PLACES.length);
      press("ArrowRight");
      press("MediaPlayPause");
      wait({ screen: "play", place: place.id });
    }
    for (const [weatherIndex, weather] of WEATHERS.entries()) {
      choose("weather", weatherIndex + 1);
      wait({ variant: weather });
      for (const [timeIndex, time] of TIMES.entries()) {
        choose("light", timeIndex + 1);
        wait({ time });
        phase(`${place.id} ${weather} ${time}`, 5000);
      }
    }
    choose("weather", 1);
    wait({ variant: "clear" });
    for (const [variant, time] of [[2, "noon"], [5, "night"]] as const) {
      choose("light", variant);
      wait({ time });
      // The wallpaper comes after a minute without a press (the default), as long as a wait's default timeout: leave room.
      wait({ wallpaper: "true" }, 150000);
      phase(`${place.id} ${time} wallpaper`, minutes * 60000 / (PLACES.length * 2));
      press("Enter");
      wait({ wallpaper: "false" });
    }
  }
  drive.push(["log", "soak complete"]);
  return { script: "game.js", stats: 10, logFile: true, drive };
}

/**
 * The TV at table `code` in the room server at `rooms`, with seven others already there: playing
 * among them (feeding, the ball now and then, the fly's eyes), then watching them as the
 * wallpaper. Half the minutes each. The table's light, weather and place are its starter's, one
 * of the fakes, so this soak leaves them be.
 */
export function tableSoakConfig(minutes: number, code: string, rooms: string) {
  if (!Number.isFinite(minutes) || minutes < 2) throw Error("--minutes must be at least 2");
  const drive: Step[] = [];
  const wait = (state: Record<string, string>) => drive.push(["wait", state]);
  const press = (key: string, times = 1) => { for (let i = 0; i < times; i++) drive.push(["press", key]); };
  const phase = (name: string, ms: number) => { drive.push(["log", name], ["sleep", ms]); };
  wait({ screen: "title", brain: "running", online: "joined" });
  phase("table title", 15000);
  press("Enter");
  wait({ screen: "play", tool: "feed" });
  press("ArrowDown");
  press("Enter");
  phase("table feeding", 15000);
  press("ArrowRight");
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

/** Starts a table of seven fake flies in `rooms`, launches the TV at it, and keeps them walking until the soak is done. */
async function tableSoak(device: string, minutes: number, rooms: string) {
  // Only now: tables.ts brings Playwright with it.
  const { fakeFly } = await import("./tables.ts");
  const code = tableCode((bytes) => crypto.getRandomValues(bytes));
  const start = { place: "picnic", light: "noon", weather: "clear", zone: "UTC", offset: 0, name: "Soak", listed: false };
  const fakes = new Set<number>();
  const flies: FakeFly[] = [];
  for (let k = 0; k < MAX_FLIES - 1; k++) flies.push(await fakeFly(rooms, code, k, fakes, k === 0 ? start : undefined));
  console.log(`${flies.length} fake flies at table ${code} in ${rooms}`);
  const config = tableSoakConfig(minutes, code, rooms);
  const result = spawnSync(process.execPath, ["scripts/tvos.ts", "run", "--device", device, "--detached", "--config", JSON.stringify(config)], { stdio: "inherit", cwd: new URL("..", import.meta.url) });
  if (result.error || result.status !== 0) {
    for (const fly of flies) fly.close();
    throw result.error ?? Error(`launching failed (exit ${result.status})`);
  }
  // The drive's sleeps, and five minutes for its waits and the TV's start.
  const until = Date.now() + driveMs(config.drive) + 5 * 60_000;
  console.log(`The fakes stay until ${new Date(until).toLocaleTimeString()}; the TV logs "drive: soak complete" when it is done.`);
  await new Promise((resolve) => setTimeout(resolve, until - Date.now()));
  for (const fly of flies) fly.close();
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const device = args[args.indexOf("--device") + 1];
  if (!args.includes("--device") || !device) throw Error("Use --device <paired Apple TV UDID> [--minutes 30] [--table [--rooms wss://…/rooms]]");
  const minutes = args.includes("--minutes") ? Number(args[args.indexOf("--minutes") + 1]) : 30;
  if (args.includes("--table")) {
    await tableSoak(device, minutes, args.includes("--rooms") ? args[args.indexOf("--rooms") + 1] : APP_ROOMS);
    process.exit(0);
  }
  const result = spawnSync(process.execPath, ["scripts/tvos.ts", "run", "--device", device, "--detached", "--config", JSON.stringify(soakConfig(minutes))], { stdio: "inherit", cwd: new URL("..", import.meta.url) });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
