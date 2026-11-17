# The fly in the game

Historical timings and trial counts have [measurement provenance](measurements.md).

The body turns the world into senses and the brain's commands into motion.
For the neuron model, data and limits of the biology, see the
[brain reference](../packages/brain/README.md#what-it-does-and-doesnt-reproduce).

## The fly's senses

Each frame `packages/body/src/senses.ts` works out what the body feels and
`apps/web/src/life.ts` hands it to the brain:

| Sense | From |
| --- | --- |
| `light` | When the brain has eyes (`BrainDriver.eyes`) and they're on: the brightness along each facet (below). Then no hand-wired looming is sent. |
| `loomLeft`, `loomRight` | When the brain has no eyes, or Settings turns them Off: how fast anything (the ball, the bubbles) grows in each eye, from its angular size frame to frame. Nothing below 0.8 rad/s or smaller than 0.08 rad; full at 4 rad/s. Held 80 ms, fading over 200 ms. |
| `touch` | The feather: 0.4 resting on the fly, 1 stroking. A soap bubble bursting on it: 0.3. Another fly pushing against it (at a table with others): 0.3. A raindrop landing on it: 0.25 (in light rain about one every 40 s, a rate chosen for a fly in drizzle, not measured). A falling leaf brushing it: 0.4. Hitting something in the air: full at 400 mm/s. Eases out over 0.3 s. |
| `bumpLeft`, `bumpRight` | Each antenna's tip, just ahead of the head and to its side, pressing into anything taller than a step, another fly's body, or past the table's edge. It drives that antenna's Johnston's organ neurons that sense a push (zones C and E). |
| `wind` | Its own speed through the air (its velocity less the air's: a puff, a gust, or flying, or falling), full at 1 m/s. Picnic gusts last 4 to 10 s; their strength follows the weather, easing in and out with flutter (see `apps/web/src/places/picnic/life.ts`). |
| `sweet` | Food under its feet or at its mouthparts (flies taste with both), while it stands: the food's sweetness, less as it runs out. Water is touched but isn't sweet. |
| `grounded` | On its feet: its legs' load sensors bear its weight. |
| `maleTaste` | A front leg's tarsus on another fly's body, while it stands (at a table with others; every fly there is a male): the taste of a male's cuticle, 1 while touching, easing out over 0.3 s. |
| `hunger` | Not a sense: how hungry it is (below). |
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
fly starts at 0.7, hungry enough to go and look for food.

What changes, all through the brain: a just-fed fly leaves weak sugar alone
that a hungry one stops to eat (sweetness 0.4, as the bar's beer foam: 2 flies
in 20 start to feed, against 20 in 20 starved), takes strong sugar less
eagerly and leaves a little more of it, and walks about a third less.

The crop fills with what it eats and empties by half every minute (an hour,
over 60), and the abdomen swells with it: up to 12% wider and deeper and 5%
longer, round numbers chosen to be seen. Another player's fly at a table
doesn't show it: the crop isn't sent to the room.

The body also supplies clock and sleep-pressure state; see
[Sleep and the daily rhythm](../README.md#sleep-and-the-daily-rhythm).
The [brain reference](../packages/brain/README.md#sleep-and-the-daily-rhythm)
contains its model and measurements.

## What the body adds

The brain decides; the body carries it out (`packages/body/src/behavior.ts`,
with thresholds, smoothing and hysteresis: walk above 0.3
until below 0.15, back up when `back` beats `walk` by 0.15, take off as
`escape` rises past 0.4 (the giant fiber at 80 Hz: why there, in `behavior.ts`), groom and wing poses above 0.2, feed above 0.15 until
below 0.05, sing above 0.4 until below 0.2 and only on its feet (pIP10, the
song command neuron: why there, in `behavior.ts`), commands older than 500 ms ignored). Steering is continuous: `turn`
sets the yaw rate (3 rad/s at full turn walking, a third of that standing, 5
in the air).

Things the body does that the brain did not decide, each written down where it
lives (`packages/body/src/motion.ts` unless noted):

- **Physics.** It stays on the surface it walks on and tilts with it, slides
  along what it walks into, steps up nothing taller than 0.9 mm, and falls off
  ledges and slopes steeper than 65°. In the air it has weight, drag (7/s, through
  the air, which a puff or a gust moves) and
  the push of its wings: lift in proportion to the `wings` command (0.6 holds
  its weight) and thrust along its heading.
- **The take-off's direction.** The escape command launches it (380 to 620 mm/s
  up and 160 to 340 away, by how far past 0.4 it went); the direction is the
  body's: away from the ball if the ball is in the air, else straight ahead.
- **Flying on: the tarsal reflex** (`behavior.ts`, see Flight). Off its feet,
  the body keeps a floor under the wings' drive until it lands.
- **Facing its course.** In the air it turns to face the way it is going (at
  up to 8/s of the angle between), and the brain's `turn` steers on top:
  thrust is along its body, so a jump away from the ball would otherwise
  have its wings carry it straight back.
- **Staying in the world.** It doesn't walk off the table's edge, and in the
  air restoring forces pull it back toward the current place's floor boundary
  and below its ceiling. Those are soft limits; wind and wings can carry it past them.
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
- **Other flies** (`packages/body/src/crowd.ts`, at a table with others:
  `docs/online.md`). Two flies can't stand in the same spot: walking into
  another fly's body it is pushed back out, so it stops against it or slides
  past, and flying into one it bounces off. Each device moves only its own
  fly, out of where it sees the others.
- **The song's wing.** Singing, it holds out the wing on the side
  of the nearest other fly (else the one it last sang with; a male extends the
  wing nearer the one he courts), vibrating too fast to see as strokes. The
  song is shown, not heard. In
  practice it never does: nothing it meets reaches the courtship neurons (P1)
  that make pIP10 sing, a male's taste and the sight of one included
  (`packages/brain/README.md`, Courtship). Another player's fly is not shown
  singing (the table doesn't carry it).
- **The pose.** Grooming is shown only while it stands, and a bout lingers
  about 1.5 s after the command fades. The crouch follows the
  raw escape command.

The caption ("Walking", "Eating honey", "Grooming", "Flying", "Asleep") names what the
body is doing on the brain's commands; the stats' In and out shows the
commands and the neurons themselves.

## Flight

A swoop that fires the giant fiber makes the fly jump and fly. The sampled
bare-floor runs below kept it up for a second and a half to three, a few
hundred millimetres away from the ball,
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

- a take-off goes straight into it (the giant fiber drives the jump muscle and,
  through the PSI, the wings' power muscles, so the first downstroke comes
  with the jump); off its feet any other way, walking off a ledge, it starts
  0.05 s later, so a step down of a few millimetres is over first;
- for 0.7 s it holds 0.62, a little over its weight, so it flies on at about
  0.28 m/s (a fruit fly cruises at about 0.3 m/s);
- then over 0.4 s it eases to 0.54, short of its weight, and the fly glides
  down at about 0.14 m/s until its feet touch, which ends the reflex, as tarsal
  contact does in the fly.

How long that is, and so where it comes down, is the stand-in's: what a real fly
does with an escape flight and where it chooses to land is decided in circuits
the model doesn't reproduce well enough to read, and no landing command is read
from it. Without a brain (its commands stale) there is no reflex either.

**The wings' own sensors** (`wingbeat`, The fly's senses) feel the strokes the
floor makes as they would any others, so the reflex reaches the brain only
through them, as a fly's own strokes would: no neuron is driven for it. They
raise the brain's own wing drive in the air, but never to the floor, so they
changed no flight in those measurements; without the floor the sampled
take-offs were short hops with them or without. They don't make the reflex any less needed, and its floor
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

In these sampled bare-floor runs, a take-off with the eyes open gave a flight of 1.5 to 1.6 s, 375 to 407 mm
along its way, rising 59 to 72 mm, and lands on its feet; with the eyes shut
(the hand-wired loom, 6 throws a seed), 2.0 to 3.2 s and 507 to 781 mm.
Before the reflex they were in the air for 0.07 to 0.12 s. The
fly often crosses the edge of the picnic table and is drawn back over it to land
(Staying in the world). The camera keeps a flying fly in the picture: pulled
back while it is in the air, and led ahead of it by up to 120 mm once it has
been up for a quarter of a second (a hop is over by then), as it is led a
little ahead of a walking fly. The caption says "Flying" and the
stats count the time; the X-ray and the stats' In and out show the brain's own
flight motor neurons, which the reflex reaches only through the wings' own
sensors, so they glow only as much as the brain answers the strokes.

## The eyes

`apps/web/src/eyes/eyes.ts` and `packages/body/src/vision.ts`. Every 50 ms
(Settings → Picture → The fly's eyes: Low is 16×16 views at 20 Hz, High 32×32 at 30 Hz,
Off sends no light) the world is rendered round the fly's head as six 90° views
of a low-detail layer of the scene (sky, table, fruit and jars, ball, bubbles,
food, feather; never the menus or the pointer), read back once, and resampled
to each facet (bilinear, by the facet's direction in the head frame).
Brightness is weighted as a fly's outer photoreceptors (Rh1, mostly blue-green)
see it, 0.1 R + 0.45 G + 0.45 B, so a blue sky is bright to it. The picture is
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
is in the air the eyes target 60 Hz, skipping a refresh while an asynchronous
readback or an environment reflection refresh is pending: the looming detectors answer how
fast dark area grows, and at 20 Hz a throw set off the escape about one time in
six against one in two at 60 Hz.

The ball is dark in green and blue for the same reason: the eyes answer
darkening, not brightening. It dives in low from the fly's front-right (higher
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

## Its nervous system

The fly's brain, nerve cord and nerves can be watched at work, in two ways
that draw the same model with the same glow, so they never disagree:

- **The X-ray** (Settings → On screen → X-ray: off, in the screensaver, or
  always; or View → Inside it while playing, which also brings the camera in
  close). The fly's cuticle turns to smoky glass, faint across its face and
  stronger at its edges, still glossy, and its nervous system shows through
  inside it, posed by the same rig as the body: the head turns the brain, the
  legs carry their nerves as they walk, the proboscis its labial nerves as it
  feeds. When the fly is under about 110 pixels long on screen (a wide shot,
  the whole table) the X-ray eases back, and below 60 the fly is its ordinary
  self: its brain would be a smudge of a few pixels. It is sorted with the
  places' glass jars by distance, so a jar in front of the fly is in front of
  it.
- **The panel** (Settings → On screen → Nervous system: off, in the
  screensaver, the default, or always): the same model from above, head up,
  the fly's left on the left, standing at rest so that it holds still,
  cropped to the brain and the cord, labelled "Nervous system". It shares
  its corner with what it sees, under it (over it at the bottom; beside it,
  smaller, where the screen is too short, as a phone on its side), at the
  corner itself when that isn't shown, and moves round the corners with it;
  while playing it keeps to the top right. It never shows over a menu or
  View → Fly's eyes.

**The anatomy** (`packages/fly/src/nerves/`). The neuropils are measured from
the FlyEM male CNS v1.0's own neuropil meshes (one male's brain, neck and
cord in one EM volume, CC-BY 4.0) by `packages/fly/scripts/nerves.ts`, which
writes `measured.ts`: each neuropil's surface as its radius in each direction
round its centre, the farthest of its mesh's vertices within 15° of each
direction (left side only, mirrored, so the drawing is symmetric); the
lamina as a curved plate round the centre of the sphere that fits it; the
mushroom body's peduncle and lobes and the protocerebral bridge as rods
through slices of their meshes; the ellipsoid body as the torus that fits it;
and where each of the cord's nerves leaves it. The brain is drawn at 0.88 of
true size (the model's head is a little narrower than a real male's, its
eyes true to size) and tipped 7° nose-down so the subesophageal zone sits over
the proboscis; the cord at true size, tipped up 6° to lie along the thorax's
floor, its leg neuropils over the coxae and their nerves leaving where the
dataset's do (the hind leg's straight back off T3, as in the fly). The
dataset is a CNS dissected out of the fly, so its brain–cord posture isn't
the fly's: the two are placed separately and joined by a connective through
the neck. The retina isn't in the dataset; it is drawn as a cup bent to the
model's eye. The source cites 80–100 µm for biological retinal depth,
but the rendered cup is thinner: at most 62.4 µm (0.026 body lengths),
thinning toward its rim. Nerves follow the
literature and the dataset's nerve stubs: each leg's motor axons go as far as
the tibia (there are no muscles in the tarsus), its sensory axons from the
tip of the tarsus; the flight motor axons up the posterior dorsal
mesothoracic nerve to the indirect flight muscles and the wing's steering
muscles; the wing nerve, the haltere nerve, the cervical nerve to the neck
muscles, the labial nerves down the proboscis, the antennal nerve's smell
and Johnston's-organ strands, the abdominal nerve trunk with a branch to
each segment. Sense organs are small clusters: the bristles' sockets where
the model's bristles are, the femoral chordotonal organs, the campaniform
sensilla on the legs and at the bases of the wings and halteres.

**Where each region is drawn** (`apps/web/src/nerves/regions.ts`). All 63 of
the brain's regions have a place and every part of the drawing belongs to
exactly one region (a test holds it). Where several regions share a place in
the fly, each is drawn as what is its own there: motor neurons as their
cell bodies at the cord's edge and the nerves their axons leave by, sensory
neurons as the organs and nerves they come in from, descending and ascending
neurons as the tracts they run in, and the neuropils go to the neurons that
fill them.

| Regions | Drawn as |
| --- | --- |
| retina, lamina, medulla, lobula, lobula plate (each side) | their neuropils |
| optic lobe, other · visual projection · visual centrifugal | the inner chiasm's fibres · the optic tracts into the central brain · fibres back out |
| antennal lobe, mushroom body, superior protocerebrum, lateral horn, ventrolateral (with the optic tubercle), inferior and ventromedial, subesophageal (each side); central complex | their neuropils; the mushroom body as calyx, peduncle and lobes; the central complex as bridge, fan-shaped body, ellipsoid body, noduli |
| central brain, other | the rind of cell bodies round the central brain, drawn as an edge (that is where those neurons' cell bodies are) |
| smell · Johnston's organ · head bristles · mouthparts · head sensory, other | the third antennal segment and its strand of the antennal nerve · the second segment's organ and its strand to the AMMC · the head's bristle sockets · the labellum, the pharynx's taste organs and the labial nerves' sensory axons · the pharyngeal nerves |
| head motor · neuroendocrine | the labial nerves' motor axons · the pars intercerebralis, its nerve to the corpora cardiaca, the frontal ganglion |
| descending · ascending (each side) · unplaced | tracts from the brain down the neck and along the cord's top · from the cord's floor up into the brain · a thread down the connective's midline |
| front, middle, hind leg motor (each side) · wing and haltere motor · neck motor · abdomen motor | cell bodies at the leg neuropil's edge and the leg nerve's motor strand · cell bodies over the wing tectulum and the dorsal nerves · the cervical nerve · the abdominal trunk's motor strand |
| leg sensory · wing, haltere and thorax sensory · abdomen sensory · proprioceptors · body bristles | the leg nerves' sensory strands · the wing and haltere nerves · the abdominal trunk's sensory strand · the chordotonal organs and campaniform sensilla · the body's bristle sockets |
| cord interneurons (each side) · cord, midline · cord, efferent | the leg neuropils T1, T2, T3, the abdominal neuromeres and the neck, wing and haltere tectulum of its side · the cord's ventral midline · its dorsal median fibres and median nerves |

The cord is drawn segment by segment, so when the brain reports its
interneurons by segment (the dataset has each one's neuromere) only this
table changes.

**How a rate becomes a glow** (`apps/web/src/nerves/glow.ts`). A region's
glow heads for min(1, rate / fullHz): its mean firing rate over all its
neurons (a 100 ms average in the brain) on the scale the brain package
measured for it, where strong stimulation comes near 1 and busy rest shows
at under a quarter. It rises toward that with a 50 ms time constant and falls
with 400 ms, so a burst of tens of milliseconds is seen for half a second and
nothing flickers between brain states. **How a glow is drawn**
(`packages/fly/src/nerves/materials.ts`, one function for both views): a
part's colour goes from its tissue's toward its role's, blue for sensory
neurons, amber for the neurons between, red for motor and neurosecretory
ones, by (glow / 0.4)², all the way at 0.4, covering more of what is behind
it as it does, and it gives off light in that colour in proportion to
glow². The square keeps the low hum of background activity near the tissue's
colour and lets a burst stand out: in a ball's dive the optic lobes go from
about 0.07 to 0.35. Nothing else lights a part. Its tissue is drawn
unlit by activity: in the world lit by the scene's lights like the rest of the
fly, with a faint constant cool tone strongest at its edge so the shape
reads in a dark room (the same at all times for every part, as an X-ray
shows bone); in the panel a faint constant stain on the dark glass, as a
neuropil stain shows anatomy in a micrograph.

**What stays dark, and what it can't show.** The retina and smell neurons
are not driven: light enters one synapse in, at the lamina, and there is no
sense of smell. The body does drive selected sensory neurons: bristles,
Johnston's organ, taste, the legs' load sensors and the wings' and halteres'
strain sensors. A whole sensory region need not glow visibly when only a
few of its neurons are active. The mushroom body, lateral horn, superior protocerebrum,
antennal lobe and central complex fire under 2 Hz on a 5 Hz scale and stay
nearly dark. A region glows with the mean of all its neurons, so a command
carried by a few hardly shows: the giant fibre's escape is one neuron among
660 descending ones, and what shows of an escape is the optic lobes, the
visual projection neurons and the motor neurons it sets going (the jump's
are among the middle leg's). The cord's interneurons light their side's
whole cord together, for now. The shapes are an anatomical drawing, not where
each neuron is. The canvas's `data-xray` (how far the fly is glass),
`data-nerves` (the panel's corner, or `hidden`) and `data-glow` (each region
glowing at 0.05 or more, brightest first) say what is shown.

