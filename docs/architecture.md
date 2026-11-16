# Architecture

Flies is a toy and a wallpaper: a fruit fly in a small bright world on
your TV, which you can feed, startle and watch. The fly is not scripted. A
simulation of the fruit fly's whole central nervous system decides what it
does, from what it sees, tastes and feels in the world.

## The parts

| Path | What it is |
| --- | --- |
| `packages/brain` | The nervous system: 166,700 spiking neurons wired from the FlyEM male CNS connectome (CC-BY 4.0). TypeScript. Its README is the reference for the model and its limits. |
| `packages/brain-native` | The same simulation in C++, behind the C interface in `include/fly_brain.h`, for the Apple TV, and built as WebAssembly for browsers. |
| `packages/fly` | The fly's body: a 3D model that knows how a fly moves its legs, wings and mouthparts, with its nervous system drawn inside it. |
| `packages/contracts` | The interfaces the parts agree on: the remote, the fly's pose, the brain driver, the weather outside, a table's line to its room, typing into a field the game draws. |
| `packages/net` | How flies share a table: the wire format, the room's clock, other flies as they are heard of, the shared food, balls and bubbles, and what a player may do. Runs in a browser and in Node. |
| `apps/web` | The game: the world, the fly's life in it, its senses, the remote's tools, menus, sound. Runs in a browser as it is. |
| `apps/server` | The room server for rooms of up to eight people's flies (`docs/online.md`), and the list of those open to anyone: one Node process over WebSockets. It runs no brains and draws nothing. |
| `apps/tvos` | The Apple TV app: a native host that runs the web build's JavaScript in JavaScriptCore and draws it through OpenGL ES. |
| `apps/ios` | The iPhone and iPad app: the web build in a `WKWebView`, served from the app's bundle, in a small Swift shell ([ios.md](ios.md)). |

## How it fits together

Each frame the game works out what the fly's body feels (what each facet of
its eyes sees, what its feet and mouthparts taste, touch, wind, whether it is
on its feet) and hands that to a `BrainDriver`. The brain answers with
commands read from the fly's own descending and motor neurons: walk, turn,
back up, take off, beat the wings, groom, feed. The game moves the body
accordingly and poses the model (`FlyPose`).

In a browser, and so in the iPhone and iPad app, the brain runs in a Web Worker, fed a compressed
form of the connectome that the page downloads once and keeps (the app has it in its bundle):
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

1. **The brain decides.** Nothing the fly does is scripted around the brain.
   The body may add reflexes the model has no way to produce, and each one is
   written down as such where it lives and in the README. No neuron is both
   driven and read by a command; what is read only for display (the regions,
   the vision stages) feeds no command. Every departure from the connectome is
   documented in `packages/brain/README.md`.
2. **Say what is real.** Anything shown to the player as "the brain doing X"
   has to be the brain doing X.
3. **640×480.** On the TV the game renders 640×480 and is stretched to the
   screen, laid out for 16:9. Elsewhere it renders the same number of
   pixels, square, in the screen's shape (`apps/web/src/display.ts`). It is
   a look, and it is what makes the TV fast.
4. **The TV is slow at JavaScript.** See `AGENTS.md`.
5. **Everything is drawn in engine.** Menus too. No DOM, but for one
   `<input>` that is never seen: a field the game draws is typed into
   through it, so every keyboard, input method and password manager works
   (`apps/web/src/ui/text-entry.ts`).

## The brain belongs to this project

The brain began as a copy of the [Computerbug desktop pet's](https://github.com/IsaacThoman/ladybug).
It is now independent: model changes are made here directly, with no need to
keep either project in step with the other. `packages/brain` is the TypeScript
reference and `packages/brain-native` is this game's matching C++ implementation.
