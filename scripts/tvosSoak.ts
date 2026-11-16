// Unattended physical-device run with the real brain, sound, eyes and remote input.
// Logs stay on the TV: copy Library/Caches/performance.log from the app container.
import { spawnSync } from "node:child_process";
import { PLACES } from "../apps/web/src/places/catalog.ts";
import { TIMES } from "../apps/web/src/scene/light.ts";
import { WEATHERS } from "@fly/world";

type Step = ["wait", Record<string, string>] | ["press", string] | ["sleep", number] | ["log", string];

export function soakConfig(minutes = 30) {
  if (!Number.isFinite(minutes) || minutes < 2) throw Error("--minutes must be at least 2");
  const drive: Step[] = [];
  const wait = (state: Record<string, string>) => drive.push(["wait", state]);
  const press = (key: string, times = 1) => { for (let i = 0; i < times; i++) drive.push(["press", key]); };
  const phase = (name: string, ms: number) => { drive.push(["log", name], ["sleep", ms]); };
  const throws = () => { for (let i = 0; i < 8; i++) { press("Enter"); drive.push(["sleep", 2500]); } };

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
    // Pin the place: a long wallpaper phase must not trigger the normal 20-minute rotation.
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
    press("ArrowRight", index + 1);
    press("MediaPlayPause");
    wait({ screen: "play" });
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
      wait({ wallpaper: "true" });
      phase(`${place.id} ${time} wallpaper`, minutes * 60000 / (PLACES.length * 2));
      press("Enter");
      wait({ wallpaper: "false" });
    }
  }
  drive.push(["log", "soak complete"]);
  return { script: "game.js", stats: 10, logFile: true, drive };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const device = args[args.indexOf("--device") + 1];
  if (!args.includes("--device") || !device) throw Error("Use --device <paired Apple TV UDID> [--minutes 30]");
  const minutes = args.includes("--minutes") ? Number(args[args.indexOf("--minutes") + 1]) : 30;
  const result = spawnSync(process.execPath, ["scripts/tvos.ts", "run", "--device", device, "--detached", "--config", JSON.stringify(soakConfig(minutes))], { stdio: "inherit", cwd: new URL("..", import.meta.url) });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
