# flies

A fruit fly in a small world, on Apple TV, iPhone, iPad or in a browser.
Feed it, startle it and watch it; left alone, the game becomes a screensaver.
A spiking model of the fly's central nervous system supplies movement and
activity commands. Body physics, reflexes and procedural animation supply
parts the neural model does not reproduce. The game has no sound.

## Run it

Use Node 22.18 or newer, from the repository root:

```sh
npm install
npm run brain:fetch
npm run dev
```

The connectome is downloaded separately; it is not tracked in git. The dev
server prints the browser address. On a phone on the same network, run
`npm run dev -- --host 0.0.0.0` and open its Network address.

For the native iPhone/iPad app, use `npm run ios` on a Mac with the Apple
build tools; [iOS setup and device instructions](docs/ios.md#building-and-running)
cover the prerequisites. [Apple TV setup](docs/apple-tv.md) covers its native
host. [Web hosting](docs/web.md) and [Coolify deployment](docs/deploy.md) cover
serving a build and the room server.

## Playing

Arrows choose tools and their kinds, Enter uses one, and Escape or space
opens the menu. A mouse or finger points into the world; hold Tickle or Blow
to use it continuously. [Controls, tools, camera and displays](docs/playing.md)
cover the remote, keyboard, game pad and touch gestures.

The game tries to join a public room by default. Each fly's brain stays on
its owner's device. [Online](docs/online.md#playing) explains joining, making
a room and staying alone. [The world](docs/world.md) describes the places,
weather, food and visitors; [adding a place](docs/places.md) is the authoring
reference.

## What is real

The wiring comes from the FlyEM male CNS connectome; the reference data is
expected to contain 166,700 neurons. This is a simplified spiking model,
not a complete biological fly. It reads sensory input and synthetic internal
state and produces movement/activity commands.

The body supplies collision handling, a wing-drive floor for sustained
flight, food alignment, hunger, the daily clock and sleep pressure. The rig
supplies gait and idle motion. Those are stand-ins. Song is shown as wing
movement; there is no audio. See [model limits](packages/brain/README.md#what-it-does-and-doesnt-reproduce),
[body and sensory mechanisms](docs/simulation.md), and the retained sleep
reference below. Historical observations in the references remain historical;
unknown capture dates and machines are identified rather than inferred.

## Documentation

| To do or understand | Reference |
| --- | --- |
| Find the package boundaries and platform runtimes | [Architecture](docs/architecture.md) |
| Use the controls, settings and neural displays | [Playing](docs/playing.md) |
| Understand places, weather and visitors | [The world](docs/world.md) |
| Add a place, including shared world registration | [Place authoring](docs/places.md) |
| <a id="the-flys-senses"></a><a id="what-the-body-adds"></a>Trace senses and body stand-ins | [Simulation](docs/simulation.md) |
| <a id="flight"></a>Understand flight and its recorded measurements | [Flight](docs/simulation.md#flight) |
| <a id="the-eyes"></a>Understand sampled vision | [Eyes](docs/simulation.md#the-eyes) |
| <a id="its-nervous-system"></a><a id="the-frame"></a>Understand neural anatomy and rendering | [Rendering](docs/rendering.md) |
| <a id="remote-and-host"></a><a id="tests"></a>Run checks or drive the game | [Development](docs/development.md) |
| Run long browser checks or investigate a soak failure | [Web soak](docs/web-soak.md) |
| Run seeded body/neural fuzzing | [Fuzzing](docs/fuzzing.md) |
| Measure headless behaviour against published assays | [Behaviour scorecard](docs/ethogram/README.md) |
| Build, cache or host the browser game | [Web](docs/web.md) |
| Run the room server behind Coolify | [Deployment](docs/deploy.md) |
| Understand room authority, protocol and limits | [Online](docs/online.md) |
| Build and check the Apple hosts | [iOS](docs/ios.md), [Apple TV](docs/apple-tv.md) |
| Get a release to TestFlight | [Release](docs/release.md) |
| Understand wiring, model behavior and limitations | [Brain](packages/brain/README.md) |
| Change C++/Wasm and check comparison limits | [Native brain](packages/brain-native/README.md) |
| Change the fly's model or posing | [Fly](packages/fly/README.md) |
| Find dated artifact sizes and measurement limits | [Measurement provenance](docs/measurements.md) |
| Regenerate icons and launch images | [Assets](assets/README.md) |

The following sleep reference is retained unchanged for its separate follow-up.
Its response observations have no retained captures and are not guarantees.

## Sleep and the daily rhythm

The fly keeps the real time of day, whatever light is chosen: its clock follows the
device's clock and, while Real weather is enabled on an Apple TV, its retained
sunrise and sunset when usable (the rhythm getter does not age-check them; otherwise the game's summer day, 05:40 to 20:10). Like a male fly's, its day has a
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
or more classified as resting or tasting counts as sleep, and that inactivity deepens it;
this is an activity-based stand-in, not a test for every displacement or joint movement.
When resting is classified as sleeping, the fly settles a little lower on its legs, its head bowed, without the idle
glances and shifts of its feet (the pose's `sleep`, `packages/fly`), and the caption says
"Asleep". Asleep, the feather resting on it or a raindrop doesn't wake it; stroking it
nearly always does within a few seconds, and a swoop does. An activity other than resting or tasting resets this sleep score. The canvas's `data-rhythm` gives the hour, the
clock, the pressure, the depth and how long it has been still.

## Credits

The wiring, and the shapes its nervous system is drawn with, are the
[FlyEM male CNS connectome](https://male-cns.janelia.org/)'s (Janelia
Research Campus, CC-BY 4.0). The neuron model follows Shiu et al.,
"A Drosophila computational brain model reveals sensorimotor processing",
Nature 634 (2024).
