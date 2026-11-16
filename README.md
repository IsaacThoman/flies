# flies

A fruit fly to feed, startle and watch on an Apple TV, iPhone, iPad or in a
browser. Its commands come from a spiking-neuron simulation wired from the
male fruit fly's central nervous system: 166,700 neurons. The body turns
what the fly sees, tastes and feels into input for that simulation. Leave
it alone and the controls fade into a screensaver. There is no sound.

## Run it

Use Node 22.18 or later and npm. From the repository root:

```sh
npm install
npm run brain:fetch   # downloads and packs the connectome; run once
npm run dev
```

Open the URL Vite prints. The first load starts the brain before showing the
menu. Choose **Play** to use the tools or **Watch** for the screensaver.
Arrows choose tools and kinds, Enter uses one, Escape or space opens the
menu. A mouse or finger points at the world; tap or click the shelf to choose
a tool. See [controls and settings](docs/playing.md).

For a phone on the same network, run `npm run dev -- --host 0.0.0.0` and open
`http://<computer-LAN-address>:5173/` on it (use the port Vite prints). The
computer's firewall must allow it. Plain LAN HTTP plays, but browser caching,
offline support and wake lock need HTTPS; see [the web build](docs/web.md).
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
smell, learning or memory, and lacks several reflexes. The body supplies
physics and named stand-ins, including sustained flight and turning away
from a wall. Hunger is accelerated. Song has a command and a wing pose, but
the current sensory inputs do not produce courtship song.

The [brain's limits](packages/brain/README.md#what-it-does-and-doesnt-reproduce)
and [body's additions](docs/simulation.md#what-the-body-adds) say exactly what
is real and what is a stand-in. [The eyes and nervous-system views](docs/simulation.md#the-eyes)
show the simulation's inputs and activity, with their limits labelled.

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

The fly keeps the real time of day, whatever light is chosen: its clock follows the
device's clock and, on an Apple TV that knows them, today's real sunrise and sunset
(otherwise the game's summer day, 05:40 to 20:10). Like a male fly's, its day has a
morning peak of activity round dawn and an evening one round dusk, each beginning
about three hours ahead, a siesta between them, and sleep through the night. Sleep
pressure builds while it is awake (over about 12 hours) and discharges while it sleeps
(over about 3): a fly kept awake by play, or woken again and again at night, is
sleepier, and it starts each visit as sleepy as the hour would leave a fly left to itself.

None of this moves the fly. The body works the clock and the pressure out
(`packages/body/src/rhythm.ts`) and tells the brain, which drives the clock neurons
and the sleep-promoting neurons the connectome has and shifts its made-up arousal; it
is the brain that stops walking (`packages/brain/README.md`, Sleep and the daily rhythm,
says how, with what is real and what stands in). The body only watches: five minutes
or more without moving is sleep, as the field scores it, and stillness deepens it.
Asleep, the fly settles a little lower on its legs, its head bowed, without the idle
glances and shifts of its feet (the pose's `sleep`, `packages/fly`), and the caption says
"Asleep". Asleep, the feather resting on it or a raindrop doesn't wake it; stroking it
nearly always does within a few seconds, and a swoop does. Moving at all wakes it. The canvas's `data-rhythm` gives the hour, the
clock, the pressure, the depth and how long it has been still.


## Credits

The wiring, and the shapes its nervous system is drawn with, are the
[FlyEM male CNS connectome](https://male-cns.janelia.org/)'s (Janelia
Research Campus, CC-BY 4.0). The neuron model follows Shiu et al.,
"A Drosophila computational brain model reveals sensorimotor processing",
Nature 634 (2024).
