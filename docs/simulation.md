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
| `grounded` | On its feet: its legs' load sensors bear its weight. |
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
strongly the sweet taste neurons pass on what they taste and how restless the
fly is (`packages/brain/README.md`, Hunger). A real fly gets hungry over hours
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
sets it. Its brain is not kept: it wakes afresh at every launch, as it always
has. How deeply it sleeps and how long it has been still start again from
nothing, as the brain does. Only the body's own state is kept, never what the
brain makes of it.

Nothing of the record leaves the device. At a table, another player sees the
fly as ever, its body's pose; the crop isn't sent.

The record is JSON with a version, `v` (1). A feature that keeps more about a
fly (what its brain has learned, its first moments) adds one field of its own,
versioned inside. A record from a newer build keeps its id and every field it
has, carried through each save, but none of its state is read. A record that
can't be read is a new fly in that place in line; a field that can't be read
starts fresh. A record is at most 96 KB of JSON: a larger one isn't saved, and
the one before it stays. That bound is for the Apple TV, which keeps
`localStorage` in its app's `NSUserDefaults`, limited to 500 KB in all: three
flies' records fit there beside the settings. A browser allows about 5 MB to a
site, and the iPhone and iPad app's `WKWebView` the same.

## What the body adds

The brain decides; the body carries it out (`packages/body/src/behavior.ts`,
with thresholds, smoothing and hysteresis: walk above 0.3
until below 0.15, back up above `back` 0.3 when it also beats `walk` by 0.15, take off on its feet when rearmed and outside the 1.5 s refractory period, as
`escape` reaches 0.4 (the giant fiber at 80 Hz: why there, in `behavior.ts`), groom and wing poses above 0.2, feed above 0.15 until
below 0.05, sing above 0.4 until below 0.2 and only on its feet (pIP10, the
song command neuron: why there, in `behavior.ts`), commands older than 500 ms ignored). Steering is continuous: `turn`
sets the yaw rate (3 rad/s at full turn walking, 35% of that standing, 5
in the air).

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
- **The take-off's direction.** The escape command launches it (380 to 620 mm/s
  up and 160 to 340 away, by how far past 0.4 it went); the direction is the
  body's: away from the ball if the ball is in the air, or from the
  fingertip while it moves fast, else straight ahead.
- **Flying on: the tarsal reflex** (`behavior.ts`, see Flight). Off its feet,
  the body keeps a floor under the wings' drive until it lands.
- **Facing its course.** In the air it turns to face the way it is going (at
  up to 8/s of the angle between), and the brain's `turn` steers on top:
  thrust is along its body, so a jump away from the ball would otherwise
  have its wings carry it straight back.
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
and a half to three, a few hundred millimetres away from the ball,
then a glide down onto whatever is under it. Flight is simple physics (lift in
proportion to the wings' drive, 0.6 holding its weight, and thrust along its
body), driven by the brain's flight motor neurons and, while its feet are off
the ground, by a body reflex standing in for circuitry the model lacks.

**What the brain does.** It decides whether to go: the body takes off only when
the giant fiber (DNp01) fires, and nothing else starts a take-off. It steers in
the air (`turn`, 5 rad/s at full). Its own wing drive counts whenever it is
higher than the reflex's: the hand-wired loom (eyes off) drives the flight motor
neurons to `wings` 0.8 to 0.9, and the fly then climbs and flies longer.

**What the body adds: the tarsal reflex** (`packages/body/src/behavior.ts`,
`TARSAL_ONSET`). In a fly, losing contact with the ground under its feet starts
the wings beating and keeps them going until its feet touch something again
(Fraenkel 1932): a fly held in the air flies for as long as its feet find
nothing. The model has nothing that does it. Leaving the ground silences only
the legs' 13 load sensors, which changes nothing measurable, and the wings' own
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
| With the wings' sensors | 31 of 32 flew: 1.5 to 1.6 s, 375 to 407 mm; the brain's `wings` 0.19 to 0.23 on average in the air, peaks 0.32 to 0.49 | 32 of 32 hopped: 0.05 to 0.10 s, 5 to 13 mm |
| Without them | 29 of 32 flew: 1.5 to 1.6 s, 380 to 415 mm; the brain's `wings` 0.07 to 0.14, peaks 0.26 to 0.48 | 32 of 32 hopped: 0.05 to 0.10 s, 6 to 13 mm |

With the floor each flight spends 0.78 s at power and the rest gliding, and
lands on its feet. Nothing runs away: the wings fold the step it lands, and a
second later the brain's `wings` is 0 to 0.12 with the floor or without it
(as at rest). The brain alone, flying on its own drive as the body would
without the floor, lets its wings down within half a second
(`packages/brain/README.md`, What it does and doesn't reproduce).

The recorded take-offs with the eyes open were flights of 1.5 to 1.6 s, 375 to 407 mm
along their way, rising 59 to 72 mm, and landed on their feet; with the eyes shut
(the hand-wired loom, 6 throws a seed), 2.0 to 3.2 s and 507 to 781 mm.
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
(`apps/web/tests/swoop-escape.budget.ts`, seeds 1 to 5, 8 throws each), 38
throws of 40 with the ON pathway against 39 without. In the game the count
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
Measured at `f8a9225` ([provenance](measurements.md)); at `e862fa6`, before
the brain's neuromodulation and thermosensation, it came out the same:

| Light | Pairs | Lamina, Hz (unlit: 0) | Turn toward it | Facing it | End distance, mm | Took off (unlit: never) |
| --- | --- | --- | --- | --- | --- | --- |
| bulb, dusk, 30 mm | 16 | 0.63 | +0.002 ± 0.014 (9) | −0.10 ± 0.15 (5) | +24 ± 50 (5 nearer) | 2 of 16 |
| panel, dusk, 30 mm | 16 | 3.10 | +0.002 ± 0.013 (11) | −0.00 ± 0.14 (8) | +6 ± 70 (8 nearer) | 5 of 16 |
| bulb, night, 30 mm | 8 | 0.77 | +0.004 ± 0.014 (6) | +0.06 ± 0.17 (4) | +8 ± 61 (5 nearer) | 1 of 8 |
| bulb, night, 10 mm | 16 | 1.34 | −0.002 ± 0.017 (8) | −0.06 ± 0.16 (6) | +9 ± 55 (7 nearer) | 5 of 16 |

"Turn toward it" is the brain's own turn command (DNa02, right minus left)
signed toward the light's side, over the whole run; with the light off it
averages 0.02 to 0.03, at the left lean's level. "Facing it" is the cosine of
the light's bearing (1 facing it). The fly walks half the time, lit or
not, and goes 900 mm or so in 3 minutes, past the light and away from it as
it does past the place an unlit one would stand. Lit, it goes a little
further (40 to 100 mm more, in 10 to 13 pairs of 16), in no particular
direction.

The eyes do see the light: the lamina, silent in a steady scene, fires each
time the fly's own movement sweeps the light or its pool across the facets,
and the ON pathway answers. But nothing downstream turns the fly toward the
bright side. The input stage codes contrast, a change against the facet's
recent mean (`packages/brain/README.md`, Seeing): a steady light, once
adapted to, drives nothing. What it does drive comes as brightening and
motion while the fly moves, and none of it moves DNa02 toward the light's
side. The fly's phototaxis
rests on what the model leaves out: colour, the eyes' light being what R1–R6
alone catch with ultraviolet left out (The eyes, above), where the fly's
phototaxis is strongest to ultraviolet, through the inner photoreceptors R7
and R8 and their medulla targets Dm8 and Tm5 (Gao et al. 2008, Neuron 60:328;
Karuppudurai et al. 2014, Neuron 81:603); and lasting levels of light (L1's
sustained component). Whether the fly can go
to a light waits on those, on the brain's side, and is worth measuring again
with this script when they come.

Brightening has one answer the fly shouldn't give: it takes the fly off,
through LC4 (`packages/brain/README.md`, Seeing). The panel did it in 7 of
16 runs, the bulb in 2 of 16 at dusk and 6 of 24 at night; with the light
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

<!-- docs-check: base apps/web/src -->

<!-- docs-check: base packages/body/src -->

<!-- docs-check: generated packages/brain/data/anatomy.bin -->
