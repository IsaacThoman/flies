# flies

A fruit fly to feed, startle and watch on an Apple TV, iPhone, iPad or in a
browser. Its commands come from a spiking-neuron simulation wired from the
male fruit fly's central nervous system: 166,700 neurons. The body turns
what the fly sees, tastes and feels into input for that simulation. Leave
it alone and the controls fade into a screensaver. There is no sound.

## Run it

CI uses Node 24; the declared minimum is 22.18. With npm, from the
repository root:

```sh
npm install
npm run brain:fetch   # fetches the connectome and packs anatomy; run once
npm run dev
```

Open the URL Vite prints. The first load starts the brain before showing the
menu. Choose **Play** to use the tools or **Watch** for the screensaver.
Arrows choose tools and kinds, Enter uses one, Escape or space opens the
menu. A mouse or finger points at the world; tap or click the shelf to choose
a tool. See [controls and settings](docs/playing.md).

For a phone on the same network, run `npm run dev -- --host 0.0.0.0` and open
`http://<computer-LAN-address>:5173/` on it (use the port Vite prints). The
computer's firewall must allow it. Plain LAN HTTP plays. The app's persistent
brain cache and wake lock need a secure context; offline support also needs
the production build and service worker. Use HTTPS for those on a phone; see [the web build](docs/web.md).
The [native iPhone and iPad app](docs/ios.md#building-and-running) is another
way to play on a phone. [Apple TV setup](docs/apple-tv.md#building-and-running)
requires Xcode on a Mac.

For a static site, `npm run build` writes `dist/`; [web hosting](docs/web.md#what-to-upload)
explains what to upload. For the site and room server behind Coolify or your
own HTTPS proxy, use [self-hosting](docs/deploy.md).

## What is simulated

The connectome supplies the wiring; a leaky integrate-and-fire model supplies
the spikes. The game reads commands from identified descending and motor
neurons. It is not a reproduction of a whole living fly: the model has no
smell or synaptic learning, and lacks several reflexes. The body supplies
physics and named stand-ins, including sustained flight and turning away
from a wall. Hunger is accelerated. Song has a command and a wing pose, but
the current sensory inputs do not produce courtship song.

The [brain's limits](packages/brain/README.md#what-it-does-and-doesnt-reproduce)
and [body's additions](docs/simulation.md#what-the-body-adds) describe the model
and its stand-ins. [The eyes and nervous-system views](docs/simulation.md#the-eyes)
show the simulation's inputs and regional activity. The eye picture labels
stand-ins; the guide explains the nervous-system drawing's limits.

## Find your way

| I want to… | Read |
| --- | --- |
| Use the tools, camera, screensaver or X-ray | [Playing](docs/playing.md) |
| Explore the places, weather and small events | [The world](docs/world.md) |
| Understand which part talks to which | [Architecture](docs/architecture.md) |
| Add a place | [Places](docs/places.md) |
| Play online or run a room server | [Online](docs/online.md) |
| Build and host the browser game | [Web](docs/web.md) |
| Deploy behind Coolify, update or roll back | [Self-hosting](docs/deploy.md) |
| Build or check an Apple app | [Apple TV](docs/apple-tv.md), [iPhone and iPad](docs/ios.md) |
| Follow a release to TestFlight | [Releasing](docs/release.md) |
| Run tests or reproduce a failure | [Development](docs/development.md), [fuzzing](docs/fuzzing.md), [browser soak](docs/web-soak.md) |

## Where things are

| Path | Responsibility |
| --- | --- |
| `apps/web` | Game loop, scenes, controls, menus and brain drivers; shared by all three hosts |
| `apps/server` | Room server; relays flies and owns the shared world, runs no brains |
| `apps/tvos`, `apps/ios` | Native Apple hosts |
| `packages/brain` | TypeScript neuron model, connectome tools and [biological reference](packages/brain/README.md) |
| `packages/brain-native` | Matching C++ model for the TV and browser WebAssembly; [parity and build workflow](packages/brain-native/README.md) |
| `packages/body` | Senses, hunger, motion and the body's interpretation of commands; [simulation reference](docs/simulation.md) |
| `packages/world` | Places, solids and food; [place authoring](docs/places.md) |
| `packages/fly` | Fly model, rig and nervous-system geometry; [model reference](packages/fly/README.md) |
| `packages/ui`, `packages/contracts`, `packages/net` | Menu kit, host interfaces and room protocol |
| `assets` | [Artwork and licensing](assets/README.md) |

Rendering and its cost are in [the rendering reference](docs/rendering.md).
Run `npm test`, `npm run lint` and `npm run typecheck` before submitting a
change; [development](docs/development.md) covers targeted tests and platform
checks. After changing the native brain, rebuild and commit its WebAssembly
with `npm run brain:wasm` as well.

## Sleep and the daily rhythm

The clock, sleep pressure and arousal threshold include labelled stand-ins.
See [the body's sleep state](docs/simulation.md#sleep-and-the-daily-rhythm)
and [the brain's model and retained measurements](packages/brain/README.md#sleep-and-the-daily-rhythm).
The sleep tables are being remeasured separately.

## Credits

The wiring, and the shapes its nervous system is drawn with, are the
[FlyEM male CNS connectome](https://male-cns.janelia.org/)'s (Janelia
Research Campus, CC-BY 4.0). The neuron model follows Shiu et al.,
"A Drosophila computational brain model reveals sensorimotor processing",
Nature 634 (2024).
