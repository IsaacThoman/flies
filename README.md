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

The fly lives at home, alone, until you take it to visit a room open to
everyone, or to a room of your own, from Online. Each fly's brain stays on
its owner's device. [Online](docs/online.md#playing) explains visiting, making
a room and going home. [The world](docs/world.md) describes the places,
weather, food and visitors; [adding a place](docs/places.md) is the authoring
reference.

## What is real

The wiring comes from the FlyEM male CNS connectome; the reference data is
expected to contain 166,700 neurons. This is a simplified spiking model,
not a complete biological fly. It reads sensory input and synthetic internal
state and produces movement/activity commands.

The body supplies collision handling, a wing-drive floor for sustained
flight, food alignment, hunger, thirst, the daily clock and sleep pressure. The rig
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
| See whether the central complex can hold a heading and steer by it | [Central complex probe](docs/central-complex.md) |
| See how smell was put in the world and what it does | [Smell in the world](docs/smell-protocol.md), [hunger on smell](docs/smell-hunger-protocol.md), [the antennal lobe's gain](docs/antennal-lobe-gain-protocol.md), [learning from smells](docs/smell-learning-protocol.md) |
| See whether DNa02's recordings can set the fly's steering | [Steering](docs/ethogram/steering.md) |
| Change C++/Wasm and check comparison limits | [Native brain](packages/brain-native/README.md) |
| Change the fly's model or posing | [Fly](packages/fly/README.md) |
| Find dated artifact sizes and measurement limits | [Measurement provenance](docs/measurements.md) |
| Regenerate icons and launch images | [Assets](assets/README.md) |

The following sleep reference is retained for its separate follow-up.
Its response observations have no retained captures and are not guarantees.

## Sleep and the daily rhythm

The fly keeps the real time of day, whatever light is chosen: its clock follows the
device's clock and, while Real weather is enabled on an Apple TV, its retained
sunrise and sunset when usable (the rhythm getter does not age-check them; otherwise the game's summer day, 05:40 to 20:10). Like a male fly's, its day has a
morning peak of activity round dawn and an evening one round dusk, each beginning
about three hours ahead, a siesta between them, and sleep through the night. Sleep
pressure builds while it is awake (over about 12 hours) and discharges while it sleeps
(over about 3): a fly kept awake by play, or woken again and again at night, is
sleepier. It starts each visit as sleepy as it left, the time away lived as a fly left
to itself would live it, asleep whenever the clock pushes it more than halfway toward
sleep: a stand-in, as nothing watches it then. A fly new to the device, or away two days
or more, starts as sleepy as the hour leaves a fly left to itself
([From launch to launch](docs/simulation.md#from-launch-to-launch)).

That is the Natural pace (Settings → Screensaver → Activity). The game starts on
Lively, a day shaped for watching rather than measured in a fly: its peaks spread
four hours either side of dawn and dusk, its day is never shorter than a summer's
(05:40 to 20:10, so a winter evening is still its evening peak), the clock pushes
it a little toward sleep by day and somewhat at night, and it feels a fifth of its
sleep pressure. It walks about 20% of a midday hour where a natural fly walks 2%,
keeps its evening peak till about 22:00, and mostly rests from late evening to dawn,
napping briefly (`packages/brain/README.md`, Sleep and the daily rhythm, has the numbers).

None of this moves the fly. The body works the clock and the pressure out
(`packages/body/src/rhythm.ts`) and tells the brain, which drives the clock neurons
and the sleep-promoting neurons the connectome has and shifts its made-up arousal; it
is the brain that stops walking (`packages/brain/README.md`, Sleep and the daily rhythm,
says how, with what is real and what stands in). The body only watches: five minutes
or more classified as resting or tasting counts as sleep, and that inactivity deepens it;
this is an activity-based stand-in, not a test for every displacement or joint movement.
When resting is classified as sleeping, the fly settles a little lower on its legs, its head bowed, without the idle
glances and shifts of its feet (the pose's `sleep`, `packages/fly`), and the caption says
"Asleep". Touch lands where it does. Asleep, a raindrop doesn't wake it, nor the feather resting
on its back, which touches its notum and wings, not its head; resting at its face, where it
follows the fly, the feather makes it groom where it stands, which wakes it (a departure:
`packages/brain/README.md`, the arousal threshold); stroking its face wakes it within a few
seconds, and a swoop does. At night touch on its body, even stroking its back, moves it neither
awake nor asleep. An activity other than resting or tasting resets this sleep score. The canvas's `data-rhythm` gives the hour, the
clock, the pressure, the depth and how long it has been still.

## Credits

The wiring, and the shapes its nervous system is drawn with, are the
[FlyEM male CNS connectome](https://male-cns.janelia.org/)'s (Janelia
Research Campus, CC-BY 4.0). The neuron model follows Shiu et al.,
"A Drosophila computational brain model reveals sensorimotor processing",
Nature 634 (2024).

## Licence

Flies is free software under the [GNU General Public License, version 3](LICENSE)
or any later version. The third-party code and data it ships keep their own
licences: [`THIRD_PARTY_NOTICES`](THIRD_PARTY_NOTICES) and
[licences and acknowledgements](docs/licenses.md).
