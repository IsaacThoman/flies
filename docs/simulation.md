# Senses, body and eyes

[Documentation index](../README.md#documentation).

## The fly's senses

Each frame `packages/body/src/senses.ts` works out what the body feels and
`apps/web/src/life.ts` hands it to the brain:

| Sense | From |
| --- | --- |
| `light` | When the brain has eyes (`BrainDriver.eyes`) and they're on: the brightness along each facet (below). It stops generating hand-wired looming; an existing held pulse can decay after the switch. |
| `loomLeft`, `loomRight` | When no eye picture is supplied (including eyes Off): how fast anything (the ball, the bubbles) grows in each eye, from its angular size frame to frame. Nothing below 0.8 rad/s or smaller than 0.08 rad; full at 4 rad/s. Held 80 ms, fading over 200 ms. |
| `touchEyeLeft` … `touchLegs` | Touch where it lands (`packages/body/src/touch.ts`): each eye's, each side's front of the head (the antennae, the frons and the top of the head between the eyes), back of the head and mouthparts, the notum, the wings and halteres, the abdomen and the legs. Each thing touching it is a contact, a point with a reach and a strength: it meets the fly at the point of its surface nearest it, a set of points placed on the drawn model as it stands (its legs drawn in, in the air), and bends the bristles there and at any point within its reach of that. Each part feels the contact's strength times the share of its points bent. The feather: its tip where the pointer is, from above, reaching 0.5 mm (chosen) and 0.5 mm more stroking, as far as it is drawn brushing; 0.4 resting, 1 stroking. Pointed at the fly it rests on its back (notum 0.29, wings 0.16); following the fly, just ahead of its mouth, on its face. The fingertip (the Finger tool): its underside resting on the fly, or moving over it, presses flat from above wherever it covers the fly (a contact limited to its footprint, `Contacts.addFlat`): what stands highest under it and whatever is within 0.12 mm below that, about a bristle's length (chosen); 0.4 resting, 1 moving. Over its back, notum 0.40 and wings 0.08 (over its abdomen alone, the folded wings, 0.16); over all of it, its face too (eyes 0.10, front 0.13); its tip come down on one side of the head, that side's eye. Slid along the table into its side, its edge presses where it meets it, 0.5 mm round, 1. A soap bubble bursting on it: 0.3, where its film meets it. Another fly pushing against it (on this device or at a table with others): 0.3, where they meet. A raindrop landing on it: 0.25, anywhere within half the fly's length round its middle, from above, 0.5 mm round (light rain's drops are about 1 mm across), in light rain about one every 40 s, for the followed fly at full heavy rain about one every 13 s (companions use the base rain rate): chosen rates, not measured biology. A falling leaf brushing it: 0.4, on the side facing it. Hitting something in the air, or the ground landing: full at 400 mm/s, on what stands out furthest toward it (flying into a wall, its face; landing, its feet). Eases out over 0.3 s. `touch`, every part at once, stays 0: the body knows where. |
| `bumpLeft`, `bumpRight` | Something pushing an antenna back: its tip, just ahead of the head and to its side, inside another fly's body (on this device or at a table) or, in the air, inside anything; on its feet, at anything taller than a step that it walks into, or that it stands against where its foreleg on that side doesn't (standing, its forelegs' tarsi reach further forward than its antennae, so a wall they meet holds its head off it, while a stem between them still touches). Nothing past the table's edge, where there is nothing to touch. 1 while it lasts, however long (any contact deflects an antenna further than its push neurons need, and they answer for as long as it is held), easing out over 0.3 s. It drives that antenna's Johnston's organ neurons that sense a push (zones C and E). |
| `wind` | Its own speed through the air (its velocity less the air's: a puff, a gust, or flying, or falling), full at 1 m/s. A gust at the picnic lasts 4 to 10 s; its speed depends on forecast wind, event strength, fade and flutter. |
| `sweet` | Food under its feet or at its mouthparts (flies taste with both), while it stands: the food's sweetness, less as it runs out. Its mouth tastes the ground under its head, which up a fruit's curve is higher than its feet. How sweet each food is comes from the sugar it holds, through recordings of the sugar taste neurons ([the world's food](world.md#food)); plain water isn't sweet. |
| `bitter` | The same way, from food that is bitter, by its caffeine: dropped Coffee, an espresso (1), and the restaurant's espresso cup and dropped Bitter sugar, sugar soaked in espresso (0.85: the sugar dissolved in it thins the caffeine). |
| `water` | The same way, from what the water-sensing neurons answer in a food: plain water (dropped Water, the windowsill's basil saucer and the greenhouse's saucer) 1, and a dilute juice or fruit as much as its sugar leaves them, from 1 (tomato, lemon) to a third (grape, banana); syrups, honey, jam and anything holding more than 1 M of sugar, none ([the world's food](world.md#food)). |
| `odor` | Each of five odorants (ethyl acetate, acetic acid, ethanol, isoamyl acetate, CO₂) at each antenna's tip, where the body puts it for touch and temperature, 0 to 1: the odour the food around gives off, carried by the air as it blows there, summed over every food ([the world's food](world.md#smell)), on the ground and in the air. Under 0.01, none. It drives that antenna's smell neurons as they were recorded answering each odorant (`packages/brain/README.md`, Smell). `Life.smells` (on in the game) lets a script leave it out, the brain as it was before food smelled. |
| `grounded` | On its feet: its legs' load sensors bear its weight. |
| `legsLeft`, `legsRight` | How fast the legs on each side move through their steps, while it stands: its speed over the ground less (the inner side) or plus (the outer) its turning rate times how far its feet stand out (0.88 mm), as a share of 20 mm/s, about the fastest a fly walks. 0 standing still and in the air. It drives that side's legs' chordotonal claw and club neurons and hair plates (`packages/brain/README.md`, The legs' proprioceptors). |
| `maleTaste` | A front leg's tarsus on another fly's body, while it stands (on this device or at a table with others; every fly is a male): the taste of a male's cuticle, 1 while touching, easing out over 0.3 s. |
| `hunger` | Not a sense: how hungry it is (below). |
| `thirst` | Not a sense: how thirsty it is (below). |
| `temperatureLeft`, `temperatureRight` | The air's temperature, °C, at each antenna's tip, where its arista's heating and cooling cells are: the world's (`packages/world/src/climate.ts`), the place's ambient (25 °C where it names none, the temperature flies are kept at and choose) plus its warm and cool spots, each a Gaussian of distance around a point. The brain's thermoreceptors turn it into firing as recorded from the arista, mostly answering change (`packages/brain/README.md`, Temperature). The game says only how warm the air is; nothing in the body judges it. The body works it out every frame, but `Life` doesn't send it (`feelsTemperature`, off): the brain so far doesn't avoid warmth that flies avoid. |
| `wingbeat` | How hard its own wings beat, felt by their and the halteres' strain sensors: in the air, the drive it flies with (the brain's `wings`, or the tarsal reflex's floor where that is higher, see Flight); on its feet, only as far as the pose opens them, so 0 with the wings folded, and 0 from the step it lands in (tarsal contact stops a fly's wings). |

**Hunger** (`packages/body/src/hunger.ts`). The body keeps account of how
hungry the fly is, from 0 just fed to 1 starved, and of how full its crop is.
Hunger rises toward 1 with a time constant of 12 minutes; what it eats brings
it down by the food's sweetness times how much it ate, so a whole lump of
sugar takes a starved fly to fed. The brain is sent it every frame: it sets how
strongly the sweet taste neurons, and three glomeruli's smell neurons, pass on
what they sense, and how restless the fly is (`packages/brain/README.md`, Hunger). A real fly gets hungry over hours
and is starved after a day, so hunger runs 60 times faster than life here:
what takes a real fly an hour takes this one a minute. Nothing else does. A
new fly starts at 0.7, hungry enough to go and look for food; one that has
lived here before comes back as it left ([From launch to launch](#from-launch-to-launch)).

What changes, all through the brain: a just-fed fly leaves weak sugar alone
that a hungry one stops to eat (sweetness 0.4: 2 flies in 20 start
to feed, against 20 in 20 starved), takes strong sugar less eagerly and leaves a little more of it, and walks about a third less.

The crop fills with what it eats and empties by half every minute (an hour,
over 60), and the abdomen swells with it: up to 12% wider and deeper and 5%
longer, round numbers chosen to be seen. Another player's fly at a table
doesn't show it: the crop isn't sent to the room.

**Thirst** (`packages/body/src/thirst.ts`). The body keeps account of how
thirsty the fly is too, from 0 just drunk to 1 thirsty, the same way. It
rises toward 1 with a time constant of 6 minutes: flies kept in dry air drink
more after two hours and are well dehydrated after six (Jourjine et al. 2016),
and thirst runs 60 times fast too. A new fly starts two dry hours in, at 0.28.
What it drinks brings it down by the food's water times how much it drank, so
a whole dropped drop of Water takes a thirsty fly to quenched. A food's water
is what its water-sensing neurons answer, which stands in for how much water
it holds: a dilute juice quenches nearly as water does, a sweeter one a third
as much, a syrup nothing. The air's humidity isn't modelled. The fly drinks the way it eats,
when the brain's `feed` says so with its mouthparts on water, and the brain is
sent its thirst every frame, which sets how strongly the water taste neurons
pass on what they taste (`packages/brain/README.md`, Thirst).

What changes: nothing it does. Water reaches nothing in the model that
extends the proboscis, thirsty or not, so the fly never drinks: of 20 flies
on water, none starts to feed, at any thirst. What quenches it is the sweet
food it does eat, as far as that is a dilute juice or fruit: on syrups and
honey alone it grows thirsty and stays so.

With them go the fly's daily clock and its need for sleep (`packages/body/src/rhythm.ts`),
not senses but internal state the connectome can't supply: the morning and evening
oscillators, the clock's push toward sleep, sleep pressure and how deeply it sleeps ([Sleep and the daily rhythm](../README.md#sleep-and-the-daily-rhythm)).

## From launch to launch

Each fly this device lives is one fly from launch to launch
(`apps/web/src/fly-record.ts`). Its record, kept on the device under
`flies.fly.0` to `flies.fly.3` by its place in line (0 the followed fly), says
who it is (a random id, and when it first arrived) and what its body was when
it was last seen: its hunger, how full its crop, its thirst, its sleep pressure and the
pace that pressure was built at, and where it stood (the place, and the spot
there). It is saved every 30 s while the game runs, as the page is hidden or
left, and as a fly goes. Fewer flies in Settings, or a companion whose brain
wouldn't run, leaves its record as it was: with more flies again, it comes
back, not a new fly. A companion keeps the place in line it came in at however
the others come and go.

Coming back, the body lives out the time away by its own sums, with no brain
run: what it did while nobody watched is a stand-in. Its crop empties and its
hunger grows as they would here (`Hunger.away`), but no further than the 0.7
a new fly arrives with, a game rule: at hunger's pace any absence of more than
half an hour would otherwise always end in a starved fly. A fly that left
hungrier than that is no less hungry. Its thirst grows the same way, to no more
than the 0.28 a new fly arrives with (`Thirst.away`); a record from before the
body kept thirst gives the fly a new fly's. Its sleep pressure goes as a fly left to
itself would have it (`pressureLeftAlone`): asleep whenever the clock pushes it
more than halfway toward sleep, awake otherwise, in five-minute steps of a
model day under today's sun. Two days are enough to forget where it started,
so a longer absence ends as sleepy as the hour leaves any fly, which is how a
new fly starts. Pressure built at another pace than the one now chosen isn't
kept: the fly starts as sleepy as the new pace leaves it, as when the pace
changes while it lives. A page hidden while the game runs (a tab in the
background, the Apple TV app out of sight) lives out its time the same way
when it is shown again. A clock gone backwards is no time away.

Alone, in the place it was in, it stands where it stood, if that spot is still
on the table; at a table, or elsewhere, it stands where the place or the table
sets it. Its brain's activity is not kept: it wakes afresh at every launch,
as it always has. What its mushroom body has learned is (the record's
`learned`, packages/brain/README.md, Learning): the brain is asked for it at
each save and the answer saved as it comes, so the record is at most one save
behind; coming back, the brain takes it back as it starts, or refuses it if it
is of another connectome. What it smells teaches it (the
smells of food that fed it, or of where a swoop startled it), though what it
learns doesn't change what it does; after six hours beside the lab's fly food
the memory was about 6 KB (packages/brain/README.md, Learning, In play). How deeply it sleeps and how
long it has been still start again from nothing, as the brain does. Of the
body, only its own state is kept, never what the brain makes of it.

Nothing of the record leaves the device. At a table, another player sees the
fly as ever, its body's pose; the crop isn't sent.

The record is JSON with a version, `v` (1). A feature that keeps more about a
fly (its first moments) adds one field of its own, versioned inside, as
`learned` is: `{ v: 1, data }`, the memory's bytes as base64, at most 44,694
characters (the bytes carry their own version and connectome). A record from a newer build keeps its id and every field it
has, carried through each save, but none of its state is read. A record that
can't be read is a new fly in that place in line; a field that can't be read
starts fresh. A record is at most 96 KB of JSON: a larger one isn't saved, and
the one before it stays. That bound is for the Apple TV, which keeps
`localStorage` in its app's `NSUserDefaults`, limited to 500 KB in all: three
flies' records fit there beside the settings. A browser allows about 5 MB to a
site, and the iPhone and iPad app's `WKWebView` the same.

## Handedness

The connectome is one male's, and its spontaneous turns lean left
(packages/brain/README.md, Symmetry): no fault in the tracing explains it,
and nothing is tuned to remove it. Real flies each have a turning bias of
their own that lasts their life, but a population's averages none: in
Y-mazes every line tested turns right about half the time on average, while
nearly a quarter of Canton-S flies turn right more than 70% or less than 30%
of the time; a fly's bias on one day predicts its bias a day later (r = 0.81)
and four weeks later (r = 0.57), and isn't passed on to its offspring
(Buchanan, Kain & de Bivort 2015, PNAS 112:6700, read in its preprint,
arXiv:1408.6896). A fly that is the traced fly's mirror image is as true a
rendering of that animal as the fly itself, so half the flies here are
mirrored. Each still leans, one way or the other.

The wiring isn't changed. The mirror is at the boundary between the body
and the brain (`apps/web/src/brain/mirror.ts`, one wrapper round whichever
brain runs: TypeScript, WebAssembly or the Apple TV's): every sense with a
side goes to the brain's other side (each eye's looming, each antenna's push
and temperature, each side's touch on the eye, the front, the back and
underside of the head, each side's legs, each antenna's smell, and the two
eyes' pictures), and what comes out with a side goes back to the other side
(`turn`, the two DNa02's rates, each region's and each vision stage's
rate). The eyes are exchanged whole: the body's left eye is the brain's right
eye, its facets looking where the right eye's look, reflected. The same
column looks in exactly mirrored directions in each eye (packages/brain/README.md,
Orientation, Viewing directions), so for the 880 columns both eyes have,
that is the column-for-column exchange; the right eye has 12 columns the
left lacks, and a mirrored fly's left eye has them, so nothing is dropped or
matched. The game renders each fly's pictures at the facets its brain's eyes
have, so a mirrored fly's eyes see the world from where they are on its head,
and the picture shown in the corner is what they see.

Which flies: decided from each fly's id (`mirroredFly` in
`apps/web/src/fly-record.ts`), a random one, by whether its last hex digit is
odd: half of all flies, each the same from launch to launch. Nothing is kept
for it, so a fly from before there were mirrored flies has its answer as
every fly does, and its record loses nothing and gains nothing; about half of
those flies now lean right. What its mushroom body has learned is tied to the
wiring, which is the same, so it loads as before. At a table nothing of the
brain crosses the wire: another player's fly is its body's pose, worked out on
its owner's device after the mirror.

### Measuring it

Fixed before measuring (`node scripts/handedness.ts`, seeds 1 to 3, each
seed's two flies built alike, the brain in process):

- **At rest** (`--part rest`): 10 minutes of the brain's resting senses at
  16 ms ticks, unmirrored and mirrored, through the diagnostic observer that
  `packages/brain/scripts/report.ts` (c) counts turn events with. At rest
  every sense is the same on both sides, so the mirrored brain gets exactly
  the unmirrored one's input. Passes if, for every seed, the mirrored fly's
  left turn events are the unmirrored fly's right ones and the other way
  round, and every tick's commands are the unmirrored ones reflected (`turn`
  negated, the rest equal); fails on any difference.
- **A loom at each eye** (`--part loom`): from 2 s at rest, the game's
  fallback looming pulse (full for 80 ms, fading over 200 ms) at the left eye,
  and from a new brain at the right: escape's peak, when it passes 0.5, and
  the mean `turn` over the 500 ms from onset. Passes if the mirrored fly's
  answer to a loom at one eye is exactly the unmirrored fly's to a loom at
  the other, `turn` negated; fails on any difference.
- **The whole fly** (`--part life`): its life frame by frame at 60 fps
  (`apps/web/src/life.ts`) in an open disc 43 mm across, from the centre,
  facing along the disc's line of symmetry, for 10 minutes, eyes shut (Node
  draws nothing). The world and the start are their own mirror image and the
  body has no randomness, so the mirrored fly's path should be the unmirrored
  one's reflected. Reported: turn events (the observer, on the commands the
  body was given), how far the mirrored fly ever was from the reflection,
  and when it first parted from it by more than 1 µm. Passes if it never
  does; if it does, where and why is reported, not tuned away.
- **Cost** (`--part cost`, interpreted): what the mirror adds to a frame,
  for the followed fly and for another.

Measured on 18 November 2026, every part passing:

| seed | at rest: turn events left / right, unmirrored · mirrored | ticks not the reflection | whole fly: turn events left / right, unmirrored · mirrored | walked | furthest from the reflection |
|---|---|---|---|---|---|
| 1 | 64 / 33 · 33 / 64 | 0 of 37,500 | 67 / 22 · 22 / 67 | 1,771 mm | 0 |
| 2 | 89 / 26 · 26 / 89 | 0 of 37,500 | 94 / 15 · 15 / 94 | 1,649 mm | 0 |
| 3 | 85 / 25 · 25 / 85 | 0 of 37,500 | 91 / 20 · 20 / 91 | 1,866 mm | 0 |

At rest the unmirrored fly turns left 1.9 to 3.4 times as often as right,
and the mirrored one right as often, tick for tick. The whole fly leans
harder (3.0 to 6.3 times); its legs' sensors fire as it walks, which
`node scripts/legs.ts` found to lean it further left too (packages/brain/README.md,
the legs' proprioceptors). Its path in the disc
is the unmirrored one's reflected to the last bit through every frame, the
walls included (it ended 12 to 21 mm from the centre each time, x negated,
yaw negated). The loom: the escape command peaks at 0.98, 0.89 and 0.97
(seeds 1 to 3) at the left eye and 1.00 at the right, passing 0.5 within 32 ms
either way, and the mirrored fly's answer to each eye is the unmirrored
fly's to the other, tick for tick: escape the same, `turn` negated. The
mirror itself costs, interpreted on an M5 Pro, about 9 µs a frame for the
followed fly, whose rates and regions the display reads, and about 3 µs for
another, whose commands alone are read (each rate and region is mirrored only
when it is read): under a thousandth of a 60 fps frame. It wasn't measured
on an Apple TV. With the eyes open it can't be exact: each picture is the
world from where that fly's eyes are, and a world that isn't its own mirror
image shows the two flies different things.


## What the body adds

The brain decides; the body carries it out (`packages/body/src/behavior.ts`).
How each command becomes motion, and where each number comes from:

| Command | Becomes | Numbers, and where they come from |
|---|---|---|
| `walk` (DNg100) | walking forward | starts above 0.3 and stops below 0.15 (chosen); 5 mm/s at no drive to 16 at full, chosen to span a fruit fly's 5 to 20 mm/s: no recording relates DNg100's firing to walking speed ([steering](ethogram/steering.md#forward-speed)) |
| `turn` (DNa02, right minus left) | yaw, continuously | 3 rad/s at full `turn` walking (4.3 °/s per Hz of difference), 35% of that standing, 5 in the air: chosen. Paired recordings of DNa02 in walking flies put the walking gain at 6.4 ± 1.5 °/s per Hz, about 110 ms later, but read through the brain's rate readout they predict a held-out fly's turning too poorly to replace it ([steering](ethogram/steering.md)) |
| `back` (MDN) | backing up | above 0.3 when it also beats `walk` by 0.15, until below 0.15 or `walk` catches up, at 6 mm/s (chosen) |
| `escape` (DNp01, the giant fiber) | a take-off, on its feet | at 0.4, the giant fiber at 80 Hz, above what it does in the model at rest (why there, in `behavior.ts`); again only once it has fallen below 0.3, and 1.5 s apart (chosen) |
| `wings` (the flight power muscles' motor neurons) | the wings' pose; in the air, their lift (below) | the pose above 0.2 (chosen) |
| `groom` (DNg12) | grooming, shown while it stands | above 0.2 (chosen) |
| `feed` (MN9) | eating, with food in reach | above 0.15 until below 0.05 (chosen) |
| `sing` (pIP10, the song command neuron) | song, on its feet | above 0.4 until below 0.2, above pIP10's measured peak in a lone fly (why there, in `behavior.ts`) |

Each command is smoothed at 12/s, as they arrive unevenly, and ignored once
500 ms old (both chosen).

Things the body does that the brain did not decide, each written down where it
lives (`packages/body/src/motion.ts` unless noted):

- **Physics.** It stays on the surface it walks on and tilts with it, slides
  along what it walks into, steps up nothing taller than 0.9 mm, and falls off
  ledges and slopes steeper than 65°. In the air it has weight, drag (7/s, through
  the air, which a puff or a gust moves) and
  the push of its wings: lift in proportion to the `wings` command (0.6 holds
  its weight) and thrust along its heading. Its head, abdomen and legs keep
  out of what they reach, as its feet do: flying at a pane it bounces off with
  its head on the near side, and turning beside a wall its legs swing clear;
  between two things too close for it as it faces, they turn it a quarter
  turn if it fits so.
- **The take-off's speed.** The escape command launches it (380 to 620 mm/s
  up and 160 to 340 along its heading, by how far past 0.4 it went). Whether
  along its heading forward or backward is the brain's `lean` (DNp11 against
  DNp02, `packages/brain/README.md`, Which way it jumps); it never jumps
  sideways, since nothing read carries left against right.
- **Flying on: the tarsal reflex** (`behavior.ts`, see Flight). Off its feet,
  the body keeps a floor under the wings' drive until it lands.
- **Facing its course.** In the air it turns to face the way it is going (at
  up to 8/s of the angle between), and the brain's `turn` steers on top:
  thrust is along its body, so a jump backward would otherwise have its
  wings carry it straight back; turning, it flies off to one side.
- **Staying in the world.** It doesn't walk off the table's edge, and in the
  air soft forces draw it toward the place's floor boundary and below its ceiling;
  these are place-dependent, not hard clamps.
- **Turning from a wall.** Pressed against a wall it faces for 2 s, it turns
  away (about 125°). The brain feels the wall on its antennae and grooms
  them (Johnston's organ's displacement-sensitive neurons drive the
  head-grooming neurons), but nothing in the model turns it or backs it
  away, as a real fly's touched antenna does through MDN (see
  `packages/brain/README.md`).
- **Landing.** Coming down on something it can stand on puts it on its feet.
- **Lining its mouth up with food.** Once the brain wants to feed and its feet
  or mouth are on something sweet, the body shuffles the last millimetre to put
  its mouth on it. Stopping is the brain's (sugar stops DNg100); the shuffle
  isn't.
- **Other flies** (`packages/body/src/crowd.ts`, on this device or at a table with others:
  `docs/online.md`). Crowd resolution tries to separate overlapping flies:
  walking into another body can stop or slide the fly, and airborne contact
  can bounce it away. A blocked correction or subsequent contact can leave overlap. Each device moves only its own
  flies, out of where it sees the others.
- **The song's wing.** Singing, it holds out the wing on the side
  of the nearest other fly (else the one it last sang with; a male extends the
  wing nearer the one he courts), vibrating too fast to see as strokes. The
  song is shown, not heard. Recorded probes did not elicit song from the available sensory inputs,
  including male taste and sight; this is not a hard disable of pIP10
  (`packages/brain/README.md`, Courtship). Another player's fly is not shown
  singing (the table doesn't carry it).
- **The pose.** Grooming is shown only while it stands, and a bout lingers
  about 1.5 s after the command fades. The crouch follows the
  raw escape command. Idle head and antenna movements, breathing and occasional
  foot shifts are procedural animation, not neural readouts (`packages/fly/src/rig.ts`).

The caption ("Walking", "Eating honey", "Grooming", "Flying", "Asleep") names what the
body is doing on the brain's commands; the stats' In and out shows the
commands and the neurons themselves.

## Flight

In recorded swoop samples the fly jumped and flew: up for a second
and a half to three, a few hundred millimetres, then a glide down onto
whatever is under it. Flight is simple physics (lift in
proportion to the wings' drive, 0.6 holding its weight, and thrust along its
body), driven by the brain's flight motor neurons and, while its feet are off
the ground, by a body reflex standing in for circuitry the model lacks.

**What the brain does.** It decides whether to go: the body takes off only when
the giant fiber (DNp01) fires, and nothing else starts a take-off. It decides
whether the jump goes forward or backward (`lean`, DNp11 minus DNp02, read
when the giant fiber fires). It steers in
the air (`turn`, 5 rad/s at full). Its own wing drive counts whenever it is
higher than the reflex's: the hand-wired loom (eyes off) drives the flight motor
neurons to `wings` 0.8 to 0.9, and the fly then climbs and flies longer.

**What the body adds: the tarsal reflex** (`packages/body/src/behavior.ts`,
`TARSAL_ONSET`). In a fly, losing contact with the ground under its feet starts
the wings beating and keeps them going until its feet touch something again
(Fraenkel 1932): a fly held in the air flies for as long as its feet find
nothing. The model has nothing that does it. Leaving the ground silences the
legs' 13 load sensors and, if it was walking, its legs' chordotonal and hair
plate neurons, which changes nothing measurable, and the wings' own
sensors (`wingbeat`) feed each stroke back to the flight motor neurons too
weakly to keep them going: beating at full power they bring `wings` to about
0.3. After an escape seen through the eyes `wings` peaks at 0.3 to 0.5, short of
the 0.6 that holds the fly up, and falls away: on its own a take-off is a hop of
a few millimetres, over in a tenth of a second (`packages/brain/README.md`,
What it does and doesn't reproduce). So while
its feet are off the ground the body keeps a floor under the wings' drive:

- an escape jump schedules the floor immediately. There is an ordering gap:
  `Behavior.update` computes wing drive before setting the jump's airborne
  timer, so the floor is applied on the following update. The source comment
  intends it to accompany the jump. Off its feet another way, such as walking
  off a ledge, it starts 0.05 s later, so a short step down can finish first;
- for 0.7 s it holds 0.62, a little over its weight, so it flies on at about
  0.28 m/s (a fruit fly cruises at about 0.3 m/s);
- then over 0.4 s it eases to 0.54, short of its weight, and the fly glides
  down at about 0.14 m/s until its feet touch, which ends the reflex, as tarsal
  contact does in the fly.

The floor schedules this minimum wing drive; actual flight duration also
depends on neural drive, forces, geometry and contact. The landing policy is
a stand-in: what a real fly
does with an escape flight and where it chooses to land is decided in circuits
the model doesn't reproduce well enough to read, and no landing command is read
from it. Without a brain (its commands stale) there is no reflex either.

**The wings' own sensors** (`wingbeat`, The fly's senses) feel the strokes the
floor makes as they would any others, providing direct proprioceptive feedback. Its changed motion also changes
wind, ground contact and visual input; there is no dedicated neural drive
for the floor itself. They
raised the brain's own wing drive in the recorded samples, without reaching
the floor; without the floor the sampled take-offs were hops with them as without. They don't make the reflex any less needed, and its floor
stays as it was. Measured in Node on the real connectome, the swoop thrown as
`apps/web/tests/swoop-escape.budget.ts` throws it (eyes open, seeds 1 to 4, 8
throws each):

| | With the floor | Without it |
| --- | --- | --- |
| With the wings' sensors | 30 of 32 flew: 1.5 to 1.6 s, 369 to 402 mm, every one jumping backward from the ball coming in ahead; the brain's `wings` 0.18 to 0.22 on average in the air | 32 of 32 hopped: 0.05 to 0.12 s, 5 to 15 mm |
| Without them | 31 of 32 flew: 1.5 to 1.6 s, 376 to 408 mm; the brain's `wings` 0.06 to 0.15, peaks 0.23 to 0.46 | 32 of 32 hopped: 0.05 to 0.08 s, 6 to 13 mm |

The first cell is remeasured since the jump's direction came from the brain's `lean`; the others were measured while the body jumped away from the ball, which moves where a flight goes but not how long it lasts.

With the floor each flight spends 0.78 s at power and the rest gliding, and
lands on its feet. Nothing runs away: the wings fold the step it lands, and a
second later the brain's `wings` is 0 to 0.15 with the floor or without it
(as at rest). The brain alone, flying on its own drive as the body would
without the floor, lets its wings down within half a second
(`packages/brain/README.md`, What it does and doesn't reproduce).

The recorded take-offs with the eyes open were flights of 1.5 to 1.6 s, 369 to 402 mm
along their way, rising 58 to 72 mm, and landed on their feet; with the eyes shut
(the hand-wired loom, 6 throws a seed, seeds 1 to 3), 2.8 to 3.9 s and 719 to 970 mm,
backward in 13 and forward in 4 of the 17 whose direction was recorded (the brain's `lean` at 0 or a spike of DNp02).
Before the reflex they were in the air for 0.07 to 0.12 s. The
fly often crosses the edge of the picnic table and is drawn back over it to land
(Staying in the world). The automatic camera pulls back in flight and can lead the fly by up to
120 mm after a quarter of a second. Play uses the player-controlled orbit
instead; neither description guarantees framing on every trajectory. The caption says "Flying" and the
stats count the time; the X-ray and the stats' In and out show the brain's own
flight motor neurons. Their activity includes feedback from the wings' own
sensors and the other sensory consequences of movement.

## The eyes

`apps/web/src/eyes/eyes.ts` and `packages/body/src/vision.ts`. With one fly,
every 50 ms (Settings → Picture → The fly's eyes: Low is 16×16 views at 20 Hz,
High 32×32 at 30 Hz, Off sends no light) the world is rendered round the
fly's head as six 90° views
of a low-detail layer of the scene (sky, table, fruit and jars, ball, bubbles,
food, feather, every other fly; never the menus or the pointer), read back
once, and resampled to each facet (bilinear, by the facet's direction in the
head frame).

With several flies their eyes take turns, normally one fly's refresh a frame,
whichever is most overdue: four at 60 fps each get about 15 Hz instead of
20. Each has its own picture and light adaptation, and its own stand-in is
left out while it looks round. The pictures shown on screen are still the
followed fly's. While the ball is in the air the followed fly gets priority at a target of 60 Hz;
others can refresh on frames when it is not due. No frame refreshes more than
one fly's eyes. Pending readbacks and reflection refreshes can delay pictures.

Brightness is weighted as a fly's outer photoreceptors (R1–R6, rhodopsin Rh1,
mostly blue-green) catch it in daylight, 0.1 R + 0.45 G + 0.45 B of the
picture's linear colour, so a blue sky is bright to it. These are what R1–R6's
response measured in the eye gives (Sharkey et al. 2020, Sci. Rep. 10:18242:
0.11 to 0.13, 0.43, 0.44 to 0.46, fitted over smooth spectra with each colour,
`packages/body/scripts/photoreceptors.ts`); the pigment's template alone gives
no red (0, 0.39 to 0.46, 0.54 to 0.61), the eye's red coming from light that
leaks through its screening pigment. Ultraviolet is left out. R1–R6 are more
sensitive at 350 nm than in the blue (1.37 times by the whole eye's ERG; Ilić
et al. 2018, Front. Cell. Neurosci. 12:34), and UV is about a fifth of what
they catch from a white that reflects it, but a colour doesn't say how much a
surface reflects, and most of what the game draws reflects little: skin, wood,
leaves, and white paint (titanium dioxide absorbs below 400 nm). In daylight,
UV included, light skin gives R1–R6 0.31 of a perfect white's light and a
white-painted table 0.73, a contrast of 0.58; FLY_RGB on their colours gives
0.35 and 0.88, 0.60. The sky is richer in UV than what it lights, but the
game's sky is already about as bright as its table to the eyes, where a clear sky is
a fraction as bright as a sunlit white surface (a few thousand candela per
square metre against about 25,000 at 100,000 lux), with UV or without, so it
isn't raised.

How dark a thing is against the table is what the eyes' looming pathway
answers (`packages/brain/README.md`, Seeing), and the picture flattens it.
Measured in the game's own eyes at midday on the picnic table
(`scripts/eyesContrast.ts`: a fingertip's size and shape lying 6 mm ahead
of the fly, seen with and without it), a photograph's skin colour (#eab39a,
the Finger tool's first) gives 0.39 where the table behind it gives 0.56, a
contrast of 0.30; glossy or matte makes no difference. The same shape in white
gives 0.75 and in near black 0.15 (0.72). The table renders at about three
quarters of a white thing's light, and a photograph's skin at about half of
white's where its colour says 0.43: its contrast is half the 0.58 a fly
would see from skin on white paint. The Finger tool's skin is now drawn as
skin reflects (#cb9b89, linear 0.60, 0.33, 0.25: about 0.6 of red light, a
third of green and a quarter of blue; Anderson & Parrish 1981, J. Invest.
Dermatol. 77:13), 0.32 of a white's light to R1–R6. It gives 0.34 against the
table's 0.56, a contrast of 0.40 (0.41 matte). The rest is lost in the
picture: dark things render brighter than their colour says (near black at
0.15, a fifth of white's), partly in the facets at their edges, which see
some of the table with them.
The kit's colours stay apart: blue 0.54 to 0.59, yellow 0.35 to 0.47 and red
0.16 to 0.34 (dishes and tiles; contrasts against the table 0.14 to 0.15,
0.29 to 0.41 and 0.48 to 0.73), and the ball's stripes 0.21 to 0.23 (0.61
to 0.65).

The picture is
then adapted to the light, as a fly's photoreceptors adapt their gain to it
(`Adaptation` in `vision.ts`): where the scene renders dim, it is scaled up
toward the level midday has (a mean of 0.5), by up to 2 times, following the
picture's mean over 4 s. The screen's dusk is 0.15 and its night 0.07 to 0.09
against midday's 0.6, but real dusk is far above the light at which a fly's
photoreceptors stop coding contrast, and the brain's input stage measures
contrast against the ambient level plus a floor of 0.05 for black, which at the
screen's dusk cut a dark ball's contrast from 0.89 to 0.70, and at night to
0.63; adapted, they are 0.86 and 0.76. Midday is left as it is (the gain never
goes below 1). What is left of a fly's poorer sight in dim light is the cap: at
4, night came up to midday's level and a quiet night set the fly off more often
with nothing thrown at it. While the ball
is in the air, or the fingertip moves fast near it, the followed fly's eyes target 60 Hz, subject to those delays: the looming detectors answer how
fast dark area grows, and at 20 Hz a throw set off the escape about one time in
six against one in two at 60 Hz.

The ball is dark in green and blue because a dark shape growing is what the
eyes' looming pathway answers best, as a fly's does: a light disc looming on a
dim ground takes the fly off too, but only through LC4, a limitation of the
model (`packages/brain/README.md`, Seeing). It dives in low from the fly's front-right (higher
over anything standing in its way, and round what it can't come in over, such
as a window), where the connectome's looming pathway is strongest and where the
fly is seen against the bright table, stops just short, hangs a moment and
veers away on a side that is clear. It casts a shadow. With
all that, measured in the game in a browser with the eyes on, two runs of 8
throws at each time of day: the fly takes off from 11 of 16 at midday, 12 at
golden hour, 11 at dusk and 9 at night; before the light adaptation, one run,
5 of 8, 5, 4 and 0. It varies from run to run as much as from one time of day
to the next (golden hour gave 8 of 8 in one run and 4 in the other): whether
it goes is the brain's answer to what it sees, not a dice roll in the game.
At night the ball is dark against a dark table and a dark sky, and the looming
detectors reach about two thirds of their midday rate. With nothing thrown at
it (4-minute runs of ordinary life on the picnic table), it never took off at
midday (8 minutes, escape at most 0.35) or at dusk (12 minutes, at most 0.37),
and at night 0.3 times a minute (16 minutes). Before, the night gave 0.5 to 0.7
a minute, mostly from soap bubbles drawn as bright as by day drifting past it.
`apps/web/tests/swoop-escape.budget.ts` checks the chain in Node.

Since the eyes have an ON pathway (brightening reaches it through L1, as in a
fly; `packages/brain/README.md`, Seeing), a sudden brightening can set off the
escape too, through the same looming detector, LC4, that a large darkening
does. Measured in the game with the brain built both ways (the TypeScript
brain, ON pathway off and on), at midday and at midnight (the fly's clock set
to it too, so its sleepy eyes are measured), ordinary life never sets it off,
with or without it: no take-off in four rounds of carrying the fly to every
place (six seconds after each of 20 arrivals, by day and by night), ten
switches of the indoor places' lights between night and midday, twenty
jumps of the picnic's time of day by day and by night, three
minutes of fireflies, five of soap bubbles drifting by and popping, five of the
screensaver and five of free play by day and by night: about 5,700 seconds of
its life each way, the escape peaking at 0.38 at most. (On the version of the
game before the legs' load sensors were narrowed and sleep added, arriving at
a place did set it off, at the restaurant without the ON pathway and at the
picnic too with it.) The ball takes it off as before, and never in the half
second after the ball has gone: through the brain's own eyes in Node
(`apps/web/tests/swoop-escape.budget.ts`, seeds 1 to 5, 8 throws each), 37
throws of 40 with the ON pathway against 35 without. In the game the count
swings from run to run with where the fly comes to stand (40 throws at midday:
29 and, in a run where it stopped seeing the ball after the second, 2 with it;
33 without). Those observations predate the current lightning effects;
fireflies are not drawn into the eyes. They do not establish current storm
response rates.

**View → Fly's eyes** shows the same picture to the player: one dot per facet
(the brain's 1,772, or, for a brain without eyes, a stand-in layout labelled as
such), laid out by where each looks, left eye on the left. It is titled and
nothing more while it is what the brain is sent; a line under the title says
so when it isn't (a stand-in, or the eyes off in Settings).

**Fly POV** (`apps/web/src/eyes/inset.ts`) is that picture small, in a
corner over the camera's: the same layout and colours, the dots snapped to the
frame's pixels and widened toward the top and bottom, where the layout spreads
the facets apart. It says "Fly POV" when it is what the brain is being
sent, and "A picture it doesn't see" for a brain without eyes, whose eyes are
then rendered for the picture alone. With the eyes off in Settings it doesn't
show: rendering them for the picture would bring back the cost that setting
saves, and it would no longer be what the brain is sent. It never shows on the
title, over a menu, or while View → Fly's eyes is up.

## A light on the table

Fruit flies go to light: they walk and fly toward it, the basis of Benzer's
countercurrent assay (1967, PNAS 58:1112) and of open-field phototaxis
assays since. This fly doesn't, so the building kit has no lamp: a lamp that
drew the fly to it would be the game pretending, and one it ignores is not
the toy it was meant to be.

`scripts/phototaxis.ts` measures it with the real brain, `Life`, senses and
body, headless as the [behaviour scorecard](ethogram/README.md) is, and with
its clock held at 06:00 as the scorecard holds it. The fly stands on an open
table 300 mm across, in a steady scene at the luminances the game renders at
dusk or at night (table and sky), adapted as the game adapts its picture
(above), 20 pictures a second as the Low eyes take them. After 10 s a light
comes on, square to the way it started facing, on its right or on its left:
a bulb 3 mm across on a stand 4 mm high, or a glowing panel 20 mm across,
10 mm up, the strongest light a table might hold. Each is as bright as the
screen goes and lights the table under it as a point light would. Its light
reaches the facets and nothing else: nothing turns, walks or draws the fly.
Each run lasts 3 minutes and is paired with the same seed and side with the
light off, which cancels the connectome's lean to the left (Spontaneous
behaviour in `packages/brain/README.md`). With it off, the scene is the same
at dusk and at night once adapted, and so is every spike. Seeds 1 to 8 (1 to
4 for the bulb at 30 mm at night), both sides; each cell is the lit run minus
its unlit pair, mean ± SD, and in brackets how many pairs went the light's way.
Refreshed at `56d9f3b` ([provenance](measurements.md)). The earlier capture
at `f8a9225` matched `e862fa6`, before the brain's neuromodulation and
thermosensation:

| Light | Pairs | Lamina, Hz (unlit: 0) | Turn toward it | Facing it | End distance, mm | Took off (unlit: never) |
| --- | --- | --- | --- | --- | --- | --- |
| bulb, dusk, 30 mm | 16 | 1.02 | +0.011 ± 0.015 (13) | +0.04 ± 0.12 (12) | −4 ± 45 (7 nearer) | 0 of 16 |
| panel, dusk, 30 mm | 16 | 2.29 | +0.001 ± 0.011 (8) | +0.08 ± 0.17 (9) | +37 ± 47 (3 nearer) | 8 of 16 |
| bulb, night, 30 mm | 8 | 1.02 | +0.005 ± 0.011 (6) | +0.05 ± 0.14 (3) | −1 ± 63 (5 nearer) | 1 of 8 |
| bulb, night, 10 mm | 16 | 1.60 | +0.005 ± 0.015 (13) | +0.04 ± 0.22 (7) | +9 ± 56 (8 nearer) | 3 of 16 |

"Turn toward it" is the brain's own turn command (DNa02, right minus left)
signed toward the light's side, over the whole run; with the light off it
averages 0.02 to 0.03, at the left lean's level. "Facing it" is the cosine of
the light's bearing (1 facing it). The fly walks half the time, lit or
not, and goes 800 mm or so in 3 minutes, past the light and away from it as
it does past the place an unlit one would stand. Lit, it goes a little
further (17 to 179 mm more on average, further in 7 of 8 and 11 to 12 of 16
pairs), in no particular direction: it ends no nearer the light.

The eyes do see the light: the lamina, silent in a steady scene, fires each
time the fly's own movement sweeps the light or its pool across the facets,
and the ON pathway answers. But nothing downstream turns the fly toward the
bright side by more than about a hundredth of a full turn. The input stage codes contrast, a change against the facet's
recent mean (`packages/brain/README.md`, Seeing): a steady light, once
adapted to, drives nothing. What it does drive comes as brightening and
motion while the fly moves, and none of it moves DNa02 toward the light's
side by more than that (+0.001 to +0.011 against the light off, the spread
from pair to pair larger). Two things the model leaves out could carry a steady light: colour,
through the inner photoreceptors R7 and R8, and lasting levels of light,
through L1's sustained component. Both were tried (What would carry it,
below), and neither makes the fly go to the light.

Brightening has one answer the fly shouldn't give: it takes the fly off,
through LC4 (`packages/brain/README.md`, Seeing). The panel did it in 8 of
16 runs, the bulb in 0 of 16 at dusk and 4 of 24 at night; with the light
off, never.

```sh
# Dusk, 30 mm: both lights and the unlit control, seeds 1 to 8.
node scripts/phototaxis.ts --out /tmp/phototaxis-dusk.json
# Night: the bulb and the control, at 10 mm (seeds 1 to 8) and 30 mm (1 to 4).
node scripts/phototaxis.ts --scene night --distance 10 --conditions bulb-right,bulb-left,off-right,off-left --out /tmp/phototaxis-night10.json
node scripts/phototaxis.ts --scene night --distance 30 --seeds 1,2,3,4 --conditions bulb-right,bulb-left,off-right,off-left --out /tmp/phototaxis-night30.json
# Runs side by side, read together: the paired differences above.
node scripts/phototaxis.ts --summarise /tmp/phototaxis-dusk.json /tmp/phototaxis-night10.json /tmp/phototaxis-night30.json
```

Each run takes a heavy slot as the scorecard does (`/tmp/flies-heavy`) and
costs about 0.19 s of CPU per simulated second on an M5 Pro, about 37 s a run.

### What would carry it

**Which of the eye's cells can steer.** `packages/brain/scripts/routes.ts`
drives one cell type in one eye at 50 Hz for 5 s on the running brain (eyes
open on a steady grey scene, the background on) against a control of the same
seed. Turn toward the driven eye, seeds 1 to 3, left eye then right:

| Driven | Turn toward that eye | What else |
| --- | --- | --- |
| Mi1 (ON, L1's main partner) | +0.59, +0.49, +0.50; +0.53, +0.56, +0.45 | its own side's DNa02 up 14 to 21 Hz, every seed |
| Tm3 (ON) | +0.11, −0.13, 0.00; −0.07, +0.22, 0.00 | stops walking (−0.15 to −0.34) |
| Tm5a | +0.06, +0.03, 0.00; +0.11, +0.18, +0.05 | the right eye only |
| Tm5b, Tm5c | −0.04 to +0.03 | nothing consistent |
| Tm20 | +0.04, −0.10, +0.01; +0.10, +0.21, +0.18 | the right eye only; the left's walks |
| MeTu (all types) | +0.16, +0.08, +0.03; +0.01, +0.07, +0.01 | the left eye only |
| Dm8, L3, Tm9 | −0.04 to +0.06 | nothing |
| R7, R8, firing | 0.00 to +0.01 | nothing anywhere: their histamine inhibits cells silent at rest |
| R7, R8, withdrawing | −0.01 to +0.05 | Dm8, Dm9, MeTu and TuBu fire; nothing steers |

Seed 3's DNa02s are silent in this scene, so it shows only what fires them
outright.

**Colour, through R7 and R8.** They are in the connectome: 608 R7 and 625 R8
in the left eye, 777 and 704 in the right (R7p, R7y, R7d, R8p, R8y, R8d and
untyped), of the 750 or so ommatidia an eye has, histaminergic by the
operating point's fix (`packages/brain/README.md`), with their outputs onto
Dm8, Dm9, Tm5a to c, Tm20, the MeTu cells that lead to the anterior optic
tubercle, Mi1, Mi4, Mi15, L1 and L3. Nothing drives them. Light depolarises
them and their histamine hyperpolarises their targets through the chloride
channel Ort (Gao et al. 2008, Neuron 60:328), and Dm8 is inhibited by
ultraviolet (Pagni et al. 2021, Curr. Biol. 31:1687). Driven that way, lit,
they reach nothing: every target is silent at rest. Darkened (their release
withdrawn, as L1's is), they reach Dm8, Dm9, MeTu and, beyond MeTu, the TuBu
neurons of the anterior visual pathway to the central complex's compass, and
none of it steers. The colour pathway's cells that do steer here (Tm5a, Tm20,
MeTu, in one eye each) turn the fly toward the eye where they fire; light
silences them in the fly, so through them the fly would, if anything, turn
away from it. And the picture has no ultraviolet to give R7 (The eyes,
above): driving it honestly needs a second, ultraviolet picture from the same
render, with each material's ultraviolet an assumption. None of that would
bring the fly to a light, so none of it was built.

**Lasting light, through L1.** L1's response has a transient and a sustained
component, and the sustained one codes luminance: in 10 s steps of light its
calcium settles at a level that falls with luminance and doesn't decline
(Ketkar et al. 2022, eLife 11:e74937, Figure 2A, E and F; the same paper's
L3 holds its level through a 90 s staircase). The input stage leaves it out
(`packages/brain/README.md`, Seeing). Mi1, which L1's withdrawals reach, is
the strongest route to steering in the table above. So it was built as an
experiment (branch `exp-l1-sustained-luminance`, `c3ac446`, TypeScript and
C++ alike): L1's drive is its transient contrast plus 0.3 times the facet's
light against its own level over 100 s, one depolarisation released above
rest as spikes and below it as withdrawals. 0.3 is read from that figure:
L1's plateau falls about 0.10 ΔF/F for each doubling of the light (Figure 2F,
0.25 to 0.5 and 0.5 to 1 of the maximum), where its transient to a step
up of that size is about 0.33 (Figure 2A, read from the mean trace, so
roughly). 100 s was chosen, as ten
times the steps over which the plateau held. Neither was set by what follows.

Held still, with nothing to move the light across its eyes, the fly leans
toward it (that branch's [lamp script](https://github.com/IsaacThoman/flies/blob/exp-l1-sustained-luminance/packages/brain/scripts/lamp.ts): a disc as bright as
the screen goes, 18° in radius, 90° to one side on the horizon of the adapted
dusk scene, about the panel at 30 mm, for 60 s, against an unlit control): the
turn command toward it averages +0.033 ± 0.015 over the minute, toward it in
12 of 12 pairs (seeds 1 to 6, both sides), about +0.1 in its first 3 s and
+0.02 to +0.04 by 30 to 60 s. The lean grows with the light (10 s, seeds 1,
2 and 4, 60° to the side: 10° in radius +0.034, 20° +0.12, 40° +0.29, every
pair toward). A turn of 0.03 is about 5° a second walking (`TURN_RATE`), and the
background alone holds the turn command at ±0.2 for tens of seconds (the unlit
controls of those 10 s, seeds 1, 2 and 4: +0.18, −0.19, +0.26).

Free to walk, it doesn't go to the light. The same assay as above, on that
branch, all trials, each cell the lit run less its unlit pair:

| Light | Seeds | Pairs | Lamina, Hz (unlit: 0) | Turn toward it | Facing it | End distance, mm | Took off (unlit: never) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| bulb, dusk, 30 mm | 1 to 8 | 16 | 1.61 | +0.004 ± 0.008 (12) | +0.02 ± 0.20 (8) | +10 ± 50 (6 nearer) | 3 of 16 |
| bulb, dusk, 30 mm | 9 to 16, held out | 16 | 1.82 | −0.005 ± 0.017 (8) | +0.14 ± 0.29 (10) | +13 ± 37 (5 nearer) | 6 of 16 |
| panel, dusk, 30 mm | 1 to 8 | 16 | 4.98 | +0.002 ± 0.019 (8) | +0.04 ± 0.25 (8) | +10 ± 65 (5 nearer) | 4 of 16 |
| panel, dusk, 30 mm | 9 to 16, held out | 16 | 5.32 | −0.007 ± 0.017 (5) | +0.12 ± 0.27 (10) | +14 ± 54 (8 nearer) | 8 of 16 |
| bulb, night, 30 mm | 1 to 4 | 8 | 1.36 | +0.005 ± 0.009 (7) | +0.12 ± 0.20 (5) | −44 ± 59 (7 nearer) | 1 of 8 |
| bulb, night, 10 mm | 1 to 8 | 16 | 2.66 | −0.005 ± 0.012 (5) | −0.04 ± 0.20 (6) | +19 ± 42 (4 nearer) | 3 of 16 |

The turn command doesn't follow the light in any of them, and neither do
heading and distance: the night bulb at 30 mm ended nearer in 7 of 8 pairs,
and the same bulb at 10 mm ended further in 12 of 16. Seeds 9 to 16 were run
only after the change and its two numbers were fixed.

Turning toward the light moves it across the eyes, which the eyes answer as
motion and brightening, and brings it into the front, where both eyes see it
alike; looking away puts it in the blind zone behind. The lean is too small
beside the background's turns to survive that. Nor is it free: with the panel
in view the brain fires 1.5 to 2.8 times the spikes it does in the unlit scene,
and 4 to 5 times with the 40° light (the lamp script), a lamina that has seen anything change keeps firing for
minutes where a steady scene now costs nothing, and the escape command peaks higher
(+0.15 with the panel, seeds 1 to 16), through Tm3 and LC4 as brightening
does: the panel took the fly off in 12 of 32 runs. So the input
stage keeps L1 transient, and the kit has no lamp: what the fly lacks is less
a signal of steady light than a way for a weak, lasting bias to steer it
against everything else that does.

```sh
# Which cells can steer: each type of the table, one eye at a time.
node packages/brain/scripts/routes.ts --type Mi1
node packages/brain/scripts/routes.ts --type /^R7/ --withdraw
```

<!-- docs-check: base apps/web/src -->

<!-- docs-check: base packages/body/src -->

<!-- docs-check: generated packages/brain/data/anatomy.bin -->
