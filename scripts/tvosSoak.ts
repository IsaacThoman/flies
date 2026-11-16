// Unattended physical-device run with the real brain, sound, eyes and remote input.
// Logs stay on the TV: copy Library/Caches/performance.log from the app container.
import { spawnSync } from "node:child_process";

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
  press("ArrowRight", 4);
  press("ArrowDown", 5);
  wait({ view: "eyes" });
  phase("eye picture low", 15000);
  press("MediaPlayPause");
  wait({ screen: "pause" });
  press("ArrowDown", 3);
  press("Enter");
  wait({ screen: "settings" });
  press("ArrowDown", 2);
  wait({ focus: "picture" });
  press("Enter");
  wait({ screen: "picture" });
  press("ArrowDown");
  wait({ focus: "eyes" });
  press("ArrowRight");
  press("MediaPlayPause");
  wait({ screen: "play" });
  phase("eye picture high", 15000);
  // Restore Low so an unattended run leaves the user's usual eye detail in place.
  press("MediaPlayPause");
  press("Enter");
  press("Enter");
  wait({ screen: "picture", focus: "eyes" });
  press("ArrowLeft");
  press("MediaPlayPause");
  press("ArrowUp", 4);
  wait({ view: "follow" });
  wait({ wallpaper: "true" });
  phase("daylight wallpaper", minutes * 30000);
  press("Enter");
  wait({ wallpaper: "false" });
  press("ArrowLeft");
  press("ArrowDown", 3);
  wait({ time: "night" });
  wait({ wallpaper: "true" });
  phase("night wallpaper", minutes * 30000);
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
