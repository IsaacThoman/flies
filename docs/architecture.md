# Architecture

apple-tv-fly is a toy and a wallpaper: a fruit fly in a small bright world on
your TV, which you can feed, startle and watch. The fly is not scripted. A
simulation of the fruit fly's whole central nervous system decides what it
does, from what it sees, tastes and feels in the world.

## The parts

| Path | What it is |
| --- | --- |
| `packages/brain` | The nervous system: 166,700 spiking neurons wired from the FlyEM male CNS connectome (CC-BY 4.0). TypeScript. Its README is the reference for the model and its limits. |
| `packages/brain-native` | The same simulation in C++, behind the C interface in `include/fly_brain.h`, for the Apple TV. |
| `packages/fly` | The fly's body: a 3D model that knows how a fly moves its legs, wings and mouthparts. |
| `packages/contracts` | The interfaces the parts agree on: the remote, the fly's pose, the brain driver, the weather outside. |
| `apps/web` | The game: the world, the fly's life in it, its senses, the remote's tools, menus, sound. Runs in a browser as it is. |
| `apps/tvos` | The Apple TV app: a native host that runs the web build's JavaScript in JavaScriptCore and draws it through OpenGL ES. |

## How it fits together

Each frame the game works out what the fly's body feels (what each facet of
its eyes sees, what its feet and mouthparts taste, touch, wind, whether it is
on its feet) and hands that to a `BrainDriver`. The brain answers with
commands read from the fly's own descending and motor neurons: walk, turn,
back up, take off, beat the wings, groom, feed. The game moves the body
accordingly and poses the model (`FlyPose`).

In a browser the brain is `packages/brain` in a Web Worker, fed a compressed
form of the connectome that the page downloads once and keeps; the browser
build is plain files for any static host (`docs/web.md`). On the Apple TV
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
browser produces the same events from the keyboard and mouse.

## Rules

1. **The brain decides.** Nothing the fly does is scripted around the brain.
   The body may add reflexes the model has no way to produce, and each one is
   written down as such where it lives and in the README. No neuron is both
   driven and read by a command; what is read only for display (the regions,
   the vision stages) feeds no command. Every departure from the connectome is
   documented in `packages/brain/README.md`.
2. **Say what is real.** Anything shown to the player as "the brain doing X"
   has to be the brain doing X.
3. **640×480.** The game renders at 640×480 and is stretched to the screen,
   laid out for 16:9. It is a look, and it is what makes the TV fast.
4. **The TV is slow at JavaScript.** See `AGENTS.md`.
5. **Everything is drawn in engine.** Menus too. No DOM.

## The brain belongs to this project

The brain began as a copy of the [Computerbug desktop pet's](https://github.com/IsaacThoman/ladybug).
It is now independent: model changes are made here directly, with no need to
keep either project in step with the other. `packages/brain` is the TypeScript
reference and `packages/brain-native` is this game's matching C++ implementation.
