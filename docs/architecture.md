# Architecture

Flies is a toy and a screensaver: a fruit fly in a small bright world on
your TV, which you can feed, startle and watch. A spiking model of the fruit
fly's central nervous system supplies its movement and activity commands
from sensory input and internal state. The body and animation supply
stand-ins for biology the model does not reproduce.

The game has no sound, by design.

## The parts

| Path | What it is |
| --- | --- |
| `packages/brain` | The TypeScript nervous-system model. Its reference FlyEM male CNS connectome has an expected 166,700 neurons (CC-BY 4.0). [Model and limits](../packages/brain/README.md). |
| `packages/brain-native` | The C++ implementation of that model ([comparison limits](../packages/brain-native/README.md#where-it-cant-be-the-same)), behind the C interface in `packages/brain-native/include/fly_brain.h`, for the Apple TV, and built as WebAssembly for browsers. |
| `packages/body` | Movement, senses, hunger, daily rhythm and the body reflexes that interpret brain commands. |
| `packages/world` | Collision shapes, walkable surfaces, food and place geometry, apart from how they are drawn. |
| `packages/fly` | The fly's appearance: a 3D model that knows how a fly moves its legs, wings and mouthparts, with its nervous system drawn inside it. |
| `packages/ui` | Reusable menu state, navigation, hit targets, drawing and QR codes. |
| `packages/contracts` | The interfaces the parts agree on: the remote, the fly's pose, the brain driver, the weather outside, a table's line to its room, typing into a field the game draws. |
| `packages/net` | How flies share a table: the wire format, the room's clock, other flies as they are heard of, the shared food, balls and bubbles, and what a player may do. Runs in a browser and in Node. |
| `apps/web` | The game: the world, each fly's life and senses, the remote's tools and menus. `apps/web/src/company.ts` keeps this device's companion flies. Runs in a browser as it is. |
| `apps/server` | The room server for rooms of up to eight flies, with one to four per device (`docs/online.md`): the rooms open to everyone, which clients try to join by default, the rooms people make, and the public directory: one Node process over WebSockets. It runs no brains and draws nothing. |
| `apps/tvos` | The Apple TV app: a native host that runs the web build's JavaScript in JavaScriptCore and draws it through OpenGL ES. |
| `apps/ios` | The iPhone and iPad app: the web build in a `WKWebView`, served from the app's bundle, in a small Swift shell ([ios.md](ios.md)). |

## How it fits together

Settings → Screensaver → Flies chooses one to four flies on hosts that support
multiple brains. Each has its own brain, body and senses, sharing a pantry.
The first fly is the one followed by the camera and shown in the eye picture,
nervous-system display and stats. `Company` keeps the companions;
`OtherFlies` draws them alongside remote flies. A companion whose brain fails
is retried after delays of 5 and 30 game seconds, then removed if it still fails,
until the player changes the count (`apps/web/src/company.ts`).

Each life step ([Life](../apps/web/src/life.ts)) works out what each body feels: taste, touch,
wind, whether it is on its feet, and the other scalar senses. It sends these,
hunger and clock/sleep state, and the latest completed eye picture to a
[`BrainDriver`](../packages/contracts/src/brain.ts). The eyes sample the
scene separately: at most one fly's eyes refresh per rendered frame, subject
to sampling cadence, readback and reflection work. The followed fly has
priority during an approaching ball; it does not necessarily get a picture
every frame (`apps/web/src/eyes/eyes.ts`). The brain answers asynchronously with
commands read from descending and motor neurons: walk, turn, back up, take
off, beat the wings, groom, feed and sing. The game moves the body accordingly
and poses the model (`FlyPose`).

In a browser, including the iPhone and iPad app, each brain runs in its own Web
Worker. It uses `packages/brain-native` built as WebAssembly by default where
supported, and the TypeScript implementation otherwise; `?brain=wasm` and
`?brain=typescript` select one explicitly. The browser downloads compressed
connectome parts and tries to keep them in persistent storage where available.
Missing, changed or evicted parts need downloading again. `InTurn` serializes
brain-file loads so they do not download the same inputs concurrently
(`apps/web/src/brain/create.ts`). The iPhone and iPad
app bundles the inputs. The browser build is plain files for a static host
([web.md](web.md)). The Apple TV build treats JavaScript JIT as unavailable
and runs `packages/brain-native` on a thread per brain. The first is exposed
as `globalThis.__native.brain` (`NativeBrainBridge`); `spawn()` makes another
and `stop()` requests its cleanup. Older hosts without `spawn()` run one fly and hide
the Flies row. Each brain uses the same `BrainDriver` interface.

Built with WeatherKit, the Apple TV app also supplies outside conditions and
solar hours through `globalThis.__native.weather` (`NativeWeatherBridge`).
Solo play and rooms open to everyone can use these for their weather and day,
or use the generated forecast and summer day. Player-created tables share
light/weather selections and a forecast based on the starter's clock; they
do not share the starter's outside observations. Each fly's internal daily
rhythm uses device time and available solar hours, falling back to a summer day
([the weather outside](apple-tv.md#the-weather-outside), [online.md](online.md)).

The remote reaches the game as DOM events (`packages/contracts/src/remote.ts`):
key events for the buttons, a `remotetouch` event for the touch surface. A
browser's keyboard and game pad are the same buttons; a mouse, a trackpad or
a finger points at the screen itself (`apps/web/src/input.ts`), and what it
presses is whatever was drawn there, or the fly's world under it; in play,
`apps/web/src/controls.ts` says what each gesture means for the tools and the
camera. A host that wraps the web build says what its screen's notch covers through
`packages/contracts/src/screen.ts`.

At a table with others (`docs/online.md`) each fly still lives entirely on
its owner's device. Each device carries its flies in one connection;
only the first carries its hand. The table seats at most eight flies, giving
a device as many of its chosen flies as there is room for. The server relays
each fly's state and keeps shared state for the place, food, balls and visitors. Player-created
tables also share light and weather; rooms open to everyone keep those local
to each device. Another player's fly is a body this fly's eyes see and its
body bumps into; their tools reach it through the world, as yours do. Each brain responds to those sensory inputs.

## Rules

These are contributor rules; the input/readout separation is also checked
when constructing a brain.

1. **The brain decides.** Read movement and activity commands from the brain.
   Label body reflexes and procedural animation as stand-ins, including the
   idle head and antenna movements and breathing in `packages/fly/src/rig.ts`.
   Flight has a procedural wing-drive floor that holds and then decreases
   while airborne (`packages/body/src/behavior.ts`, [Flight](../README.md#flight)).
   Escape takeoff and air steering use brain commands; falling off a surface
   also activates the floor. Neural wing drive can exceed it. No neuron is
   both driven and read by a command; what is read only for display (the regions,
   the vision stages) feeds no command. Document departures from the connectome
   in `packages/brain/README.md`.
2. **Say what is real.** Anything shown to the player as "the brain doing X"
   has to be the brain doing X.
3. **640×480.** On the TV the game renders 640×480 and is stretched to the
   screen, laid out for 16:9. Elsewhere the frame uses approximately the same
   pixel budget, with rounded dimensions following the screen's shape between
   aspect ratios 1:4 and 4:1; more extreme shapes stretch it. The world can
   render at lower resolution than the overlays (`apps/web/src/display.ts`).
4. **Keep TV JavaScript small.** See [AGENTS.md](../AGENTS.md).
5. **Draw the visible game in engine.** Menus and text fields too. Browser
   text entry uses a hidden `<input>` for keyboard, input-method and password
   manager integration; the Apple TV uses a native keyboard. A hidden DOM
   probe also reads the browser's safe-area insets (`apps/web/src/ui/text-entry.ts`,
   `apps/web/src/display.ts`).

## The brain belongs to this project

Model changes are made here directly. `packages/brain` is the TypeScript
reference and `packages/brain-native` is its C++ implementation, with the
comparison limits linked above.
