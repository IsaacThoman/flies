# Architecture

Flies is a toy and a screensaver: a fruit fly in a small bright world on
your TV, which you can feed, startle and watch. High-level actions come
from a spiking model wired from the male fruit fly's central nervous system.
It takes what the body sees, tastes and feels in the world; procedural
animation and the body's named reflex stand-ins supply the visible motion.

The game currently has no sound, by design.

## The parts

| Path | What it is |
| --- | --- |
| `packages/brain` | The nervous system: 166,700 spiking neurons wired from the FlyEM male CNS connectome (CC-BY 4.0). TypeScript. Its README is the reference for the model and its limits. |
| `packages/brain-native` | The same simulation in C++, behind the C interface in `packages/brain-native/include/fly_brain.h`, for the Apple TV, and built as WebAssembly for browsers. |
| `packages/fly` | The fly's body: a 3D model that knows how a fly moves its legs, wings and mouthparts, with its nervous system drawn inside it. |
| `packages/contracts` | The interfaces the parts agree on: the remote, the fly's pose, the brain driver, the weather outside, a table's line to its room, typing into a field the game draws. |
| `packages/net` | How flies share a table: the wire format, the room's clock, other flies as they are heard of, the shared food, balls and bubbles, and what a player may do. Runs in a browser and in Node. |
| `apps/web` | The game: the world, the fly's life in it, its senses, the remote's tools and menus. Runs in a browser as it is. |
| `apps/server` | The room server for rooms of up to eight people's flies (`docs/online.md`), and the list of occupied public rooms, including locked ones: one Node process over WebSockets. It runs no brains and draws nothing. |
| `apps/tvos` | The Apple TV app: a native host that runs the web build's JavaScript in JavaScriptCore and draws it through OpenGL ES. |
| `apps/ios` | The iPhone and iPad app: the web build in a `WKWebView`, served from the app's bundle, in a small Swift shell ([ios.md](ios.md)). |

## How it fits together

Each life step the game hands a `BrainDriver` the current body senses
(taste, touch, wind and load on its legs) and the latest completed eye picture.
Eye sampling runs separately at a rate set by detail, load and readback availability. The brain answers with
commands read from the fly's own descending and motor neurons: walk, turn,
back up, take off, beat the wings, groom, feed, sing. The game moves the body
accordingly and poses the model (`FlyPose`).

In a browser, and so in the iPhone and iPad app, the brain runs in a Web Worker, fed a compressed
form of the connectome. Browsers cache verified parts when storage is
available and fetch missing, changed or evicted parts again; the iOS app
loads them from its bundle:
`packages/brain-native` built as WebAssembly where the browser can run it, `packages/brain` itself
where it can't; the browser build is plain files for any static host (`docs/web.md`). On the Apple TV
JavaScript has no JIT and is far too slow for it, so the host runs
`packages/brain-native` on its own thread and exposes it as
`globalThis.__native.brain` (`NativeBrainBridge`). The game only ever sees a
`BrainDriver`.

Built with WeatherKit, the Apple TV app also tells the game the weather
outside and today's sunrise and sunset, as `globalThis.__native.weather`
(`NativeWeatherBridge`); the game takes them for its weather and its clock's
day where it can, and its own made-up forecast and summer day where it can't
(`docs/apple-tv.md`, "The weather outside").

The remote reaches the game as DOM events (`packages/contracts/src/remote.ts`):
key events for the buttons, a `remotetouch` event for the touch surface. A
browser's keyboard and game pad are the same buttons; a mouse, a trackpad or
a finger points at the screen itself (`apps/web/src/input.ts`), and what it
presses is whatever was drawn there, or the fly's world under it; in play,
`apps/web/src/controls.ts` says what each gesture means for the tools and the
camera. A host that
wraps the web build says what its screen's notch covers through
`packages/contracts/src/screen.ts`.

At a table with others (`docs/online.md`) each fly still lives entirely on
its own device. The room server passes each fly's state to the others and
keeps the rest of the world there (the place, the food, the balls, the light
and the weather, when visitors come). Another player's fly is a body this
fly's eyes see and its body bumps into; their tools reach it through the
world, as yours do. Nothing else passes from fly to fly.

## Rules

1. **The brain decides.** Action selection comes from neural readouts.
   Procedural breathing, glances, antenna twitches and foot fidgets are animation,
   not evidence of those neurons firing.
   The body may add reflexes the model has no way to produce, and each one is
   written down as such where it lives and in [the body reference](simulation.md#what-the-body-adds). The largest is
   flight itself: in a fly, losing the ground under its feet keeps the wings
   beating (the tarsal reflex), and nothing in the model does that (the wings'
   own sensors feed their strokes back, too weakly to keep them going), so
   once the giant fiber has taken the fly off, the body holds its wings at
   flight power for a while and lets it glide down (`packages/body/src/behavior.ts`,
   [Flight](simulation.md#flight)). The brain still decides whether to go, steers, and can
   drive its wings harder; how long it stays up is the stand-in's. No neuron is both
   driven and read by a command; what is read only for display (the regions,
   the vision stages) feeds no command. Every departure from the connectome is
   documented in `packages/brain/README.md`.
2. **Say what is real.** Anything shown to the player as "the brain doing X"
   has to be the brain doing X.
3. **640×480.** On the TV the output frame is 640×480 and is stretched to the
   screen, laid out for 16:9. Elsewhere it renders about the same number of
   pixels, square over the supported aspect range, in the screen's shape (`apps/web/src/display.ts`). It is
   a look and a rendering budget. Pixel settings can reduce the world
   resolution inside that frame; see [Rendering](rendering.md).
4. **The TV is slow at JavaScript.** See `AGENTS.md`.
5. **Menus are drawn in engine.** The browser has no visible DOM controls.
   A reusable hidden `<input>` accepts typing into the fields the game draws,
   and a hidden element measures the safe area. tvOS uses its system keyboard
   instead (`apps/web/src/ui/text-entry.ts`).

## The brain belongs to this project

`packages/brain` is the TypeScript reference and `packages/brain-native` is
this game's matching C++ implementation. Model changes are made here directly.
