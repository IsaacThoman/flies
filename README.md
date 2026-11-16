# apple-tv-fly

A fruit fly that lives on your Apple TV. It isn't scripted: a simulation of
the fly's whole nervous system, 166,700 neurons wired as they are in the real
animal, decides what it does from what it sees, tastes and feels. Feed it,
startle it, tickle it and watch it with the remote; leave it alone and it is a
living wallpaper.

```sh
npm install
npm run brain:fetch   # the packed connectome, 38 MB, once
npm run dev           # the game in a browser
npm test              # unit tests (Node)
npm run e2e           # plays the game in headless Chromium with the real brain
```

`docs/architecture.md` describes the parts and the rules. This file is about
the game (`apps/web`) and its packages: `packages/world` (where the fly can
stand, what it bumps into and eats), `packages/body` (its senses, what it makes
of the brain's commands, how it moves, what its eyes see) and `packages/ui`
(the menu kit). `docs/places.md` is about the places the fly can live and how
to add one.

## Playing

The fly can live in more than one place (`docs/places.md`), and the player can
carry it from one to another: the **Place** tool, or Settings → Where it
lives. Living in each in turn (the default), it moves on after 20 minutes of
wallpaper. It is the same fly, its brain running on; the world fades out, the
place is built behind the veil, and it is set down there.

The first place is the picnic: a round café table by a lake: lemonade, a jam jar, a
strawberry and a half, cherries, a slice of orange, a green apple, sugar cubes,
a drip of honey, a smear of jam, dew. The lemonade jar stands in a saucer:
up a gentle slope, a rounded rim to walk along, and down into a moat where
lemonade has dripped and pooled; drops from the jar, and the fly's own feet,
set rings spreading on the pool. The whole strawberry spreads at its foot so a
fly can walk up and over it, and there is juice on top. At the fly's own scale there are
biscuit crumbs (the big ones are boulders it can climb), two lemon pips, specks
and grains of spilt sugar, and the napkin is woven thread by thread in the
table's shader, with a stitched hem and the creases where it was folded, so it
stays crisp however close the camera comes. Drops of water are clear in the
middle and bright at the edge, and focus the sun into a spot on the table.
Everything is built in code.

Soap bubbles drift over the table on the breeze, and a few small ones skim
low past the fly; one that comes down on something level settles there as a
dome until it bursts. A bubble that reaches the fly, or that it walks into,
bursts on it, and it feels the film break (`touch`, below). The light follows
the clock unless you choose a time: morning, midday, golden hour, dusk and
night, eased from one to the next; by day a cloud now and then passes over the
sun and the light dims by a fifth for a few seconds. At dusk and at night
fireflies drift round the table and blink.

The lab bench is the bench of a fruit-fly lab, a quiet nod to where this fly's
wiring was traced: a stereo microscope with a fly pad on its stage (its base and
pillar are solid; a fly can land on it), a rack of plugged vials with pupae up
their walls, a vial with its foam plug pulled half out and cornmeal food at the
bottom, a foil-capped beaker, a wash bottle, a box of pipette tips, a lab timer
and a desk lamp. The fly can eat from a dish of grape-juice agar poured to the
brim (land on it, walk off over the rim) and from drips of food spilt when the
vials were filled. At its own scale there are dried crumbs of food to climb,
grains of cornmeal, forceps whose arms it can walk along, a fine paintbrush, a
crumpled wipe to climb, and an open notebook, thin enough to step onto, written
in squiggles with a cross, a tally of counts and a sketch of a fly; a drop of
water on the page magnifies the writing under it. The epoxy's flecks, the
foam's pores, the cornmeal's grains and the ink are worked out in the shaders,
crisp however close the camera comes, and glossy things show the windows and
the ceiling's panels in them. By day fluorescent panels light the room evenly
and the sun comes in at the windows behind the bench, laying their shapes,
frames and blinds across the bench and the floor, long and warm at golden hour;
from dusk the panels are off, a desk lamp pools warm light on the bench, and
the room is dark round it but for lit windows across the way. It sounds of the
air handling, the lights' hum, a fridge's compressor starting and stopping, and
a distant beep now and then. There are no bubbles or fireflies indoors.

The bar is the walnut counter of a small, warm bar in the evening: a cocktail
on the rocks with a wedge of lime on its rim, a tall beer with its head of
foam, salted peanuts heaped in a fluted ramekin (two have fallen out), two
maraschino cherries, printed card coasters, a folded paper napkin, and a
candle in a storm lantern whose cap is a perch and whose flame is out of
reach. A sticky ring of syrup marks where a glass stood; the cherries' syrup,
the lime, the beer's head and the cocktail itself are sweet too (a fly that
lands in the drink can climb out up the meniscus onto the rim), and spilt
beer takes its feet as rings, as does the cocktail when the ice settles. At
the fly's scale the walnut's grain and open pores show under the varnish,
with fine scratches and the milky rings of old glasses; salt crystals and
bits of peanut lie about; the cold glasses are beaded with condensation and
bubbles rise through the beer. Behind the bar, bottles glow on glass shelves
before an old mirror, under brass pendant lamps; off the counter's end a
window looks over a square to a row of houses. By day the room is unlit and
the light is the window's, falling away from it; at golden hour the sun comes
in low across the counter and the glasses throw long shadows coloured by what
is in them; at dusk and night the lamps, the flickering candle and the back
bar light it, and lights out of focus glow behind the fly. It sounds like a
quiet room: low voices, a glass or two touching, ice settling.

In a browser the keyboard is the remote (arrows, Enter for Select, Escape for
Back, space for Play/Pause) and dragging the mouse over the picture is the
touch surface.

| On the remote | Does |
| --- | --- |
| Swipe on the touch surface | Moves your hand (the glowing ring) across the table. Until you do, it waits just in front of the fly's mouth, and it drifts back there after 15 s. |
| Left / Right | Picks a tool from the shelf. |
| Up / Down | Picks the tool's kind: which food, how hard to blow, the time of day, the camera. |
| Select | Uses the tool: drops food, throws the ball. Hold it to tickle or blow. On Light and View it steps round the choices. |
| Play/Pause, or Back | The pause menu. Play/Pause or Back again carries on. |
| Back on the title | Leaves the app. |

The tools are **Feed** (sugar, honey, raspberry, water), **Swoop** (a dark
beach ball dives at the spot and veers away), **Tickle** (a feather: resting on
the fly is a light touch, holding Select strokes it), **Blow** (gently or hard,
from where you sit toward the spot), **Light** (now, which follows the clock,
or morning, midday, golden hour, dusk, night), **View** (close up, follow, wide, the whole table, from above,
and through the fly's eyes; Up brings the camera in, Down takes it out) and
**Place** (where it lives; Up and Down choose, Select carries it there). The
screen always shows what each button does now, and a caption at the top says
what the fly is doing.

The camera (`apps/web/src/camera.ts`) works like a patient nature cameraman.
In Follow the fly is about 170 pixels long, seen from low down and a little
behind its side, with the table, the fruit or the place's view (the picnic's lake) behind it; Close up is
about twice that, Wide about a third. It keeps its place round the fly and
moves only when it has to (the fly has turned its back for more than a
second, something is in the way, or there is fruit or a jar to have behind
it), never crossing over the fly when it can help it. Every move is a
critically damped spring, so nothing overshoots or pops; walking it keeps
pace a little ahead, and in a jump it pulls back, widens and whips round
after the fly. It is never inside anything, nor closer to the fly than most of
the shot's distance. With the ball in hand it goes round to the side across the
fly from where the ball will come, so the dive is seen past the fly. Behind the
loading screen and the title it keeps the fly small and to the left, clear of
the menus.

After a minute with no press (Settings: 30 s to 5 min, or never) the hints,
the shelf and the pointer fade, and the camera settles beside the fly and
follows it: the wallpaper. Settings can have it take long slow shots of the
fly from one angle after another instead (Calm), or change them more often
(Lively). Any press or touch brings the controls back and does nothing else.
A small picture of what the fly's eyes see sits in a corner of the wallpaper
(Settings, What it sees: off, in the wallpaper, or always, which keeps it in
the top right while you play too). Each time the wallpaper moves on to a new
shot, and at least once a minute, it fades out and comes back in the next
corner, so it is never left in one place long enough to mark an OLED screen.

The title also offers **Just watch** (the wallpaper straight away), **Inside
its brain** (live: every sense going in, every command coming out with the
neurons it is read from and their firing rates, spikes a second, active
neurons), **About the fly**, and **Settings** (where it lives, sound and surroundings volume, pixel
size, wallpaper timing and camera, the eyes' detail, what it sees in a corner,
button hints, frame stats).

## The fly's senses

Each frame `packages/body/src/senses.ts` works out what the body feels and
`apps/web/src/life.ts` hands it to the brain:

| Sense | From |
| --- | --- |
| `light` | When the brain has eyes (`BrainDriver.eyes`) and they're on: the brightness along each facet (below). Then no hand-wired looming is sent. |
| `loomLeft`, `loomRight` | Only when the brain has no eyes: how fast anything (the ball, the bubbles) grows in each eye, from its angular size frame to frame. Nothing below 0.8 rad/s or smaller than 0.08 rad; full at 4 rad/s. Held 80 ms, fading over 200 ms, as in the desktop pet. |
| `touch` | The feather: 0.4 resting on the fly, 1 stroking. A soap bubble bursting on it: 0.3. Hitting something in the air: full at 400 mm/s. Eases out over 0.3 s. |
| `bumpLeft`, `bumpRight` | Each antenna's tip, just ahead of the head and to its side, pressing into anything taller than a step, or past the table's edge. |
| `wind` | Its own speed through the air (its velocity less the air's: a puff, or flying, or falling), full at 1 m/s. |
| `sweet` | Food under its feet or at its mouthparts (flies taste with both), while it stands: the food's sweetness, less as it runs out. Water is touched but isn't sweet. |
| `grounded` | On its feet. |

## What the body adds

The brain decides; the body carries it out (`packages/body/src/behavior.ts`,
with the desktop pet's thresholds, smoothing and hysteresis: walk above 0.3
until below 0.15, back up when `back` beats `walk` by 0.15, take off as
`escape` rises past 0.5, groom and wing poses above 0.2, feed above 0.15 until
below 0.05, commands older than 500 ms ignored). Steering is continuous: `turn`
sets the yaw rate (3 rad/s at full turn walking, a third of that standing, 5
in the air).

Things the body does that the brain did not decide, each written down where it
lives (`packages/body/src/motion.ts` unless noted):

- **Physics.** It stays on the surface it walks on and tilts with it, slides
  along what it walks into, steps up nothing taller than 0.9 mm, and falls off
  ledges and slopes steeper than 65°. In the air it has weight, drag (7/s) and
  the push of its wings: lift in proportion to the `wings` command (0.6 holds
  its weight) and thrust along its heading.
- **The take-off's direction.** The escape command launches it (380 to 620 mm/s
  up and 160 to 340 away, by how far past 0.5 it went); the direction is the
  body's: away from the ball if the ball is in the air, else straight ahead.
- **Staying in the world.** It doesn't walk off the table's edge, and in the
  air it is drawn back inside 360 mm of the middle and below 320 mm.
- **Turning from a wall.** Pressed against a wall it faces for 2 s, it turns
  away (about 125°). The brain feels the wall on its antennae, but nothing in
  the model turns it.
- **Landing.** Coming down on something it can stand on puts it on its feet.
- **Lining its mouth up with food.** Once the brain wants to feed and its feet
  or mouth are on something sweet, the body shuffles the last millimetre to put
  its mouth on it. Stopping is the brain's (sugar stops DNg100); the shuffle
  isn't.
- **The pose.** Grooming is shown only while it stands, and a bout lingers
  about 1.5 s after the command fades (as in the pet). The crouch follows the
  raw escape command.

The caption ("Walking", "Eating honey", "Grooming", "Flying") names what the
body is doing on the brain's commands; "Inside its brain" shows the commands
and the neurons themselves.

## Flight

Flight is simple physics driven by the brain's flight motor neurons. With this
connectome the wings beat hard only while something looms (the escape) and a
little in wind, and losing ground contact doesn't start flight (see
`packages/brain/README.md`). So in practice a take-off is a short powered jump that comes down wherever it
comes down, steered by `turn`, sometimes onto the sugar or the fruit.

## The eyes

`apps/web/src/eyes/eyes.ts` and `packages/body/src/vision.ts`. Every 50 ms
(Settings, The fly's eyes: Low is 16×16 views at 20 Hz, High 32×32 at 30 Hz,
Off sends no light) the world is rendered round the fly's head as six 90° views
of a low-detail layer of the scene (sky, table, fruit and jars, ball, bubbles,
food, feather; never the menus or the pointer), read back once, and resampled
to each facet (bilinear, by the facet's direction in the head frame).
Brightness is weighted as a fly's outer photoreceptors (Rh1, mostly blue-green)
see it, 0.1 R + 0.45 G + 0.45 B, so a blue sky is bright to it. While the ball
is in the air the eyes refresh every frame: the looming detectors answer how
fast dark area grows, and at 20 Hz a throw set off the escape about one time in
six against one in two at 60 Hz.

The ball is dark in green and blue for the same reason: the eyes answer
darkening, not brightening. It dives in low from the fly's front-right (higher
over anything standing in its way), where the connectome's looming pathway is
strongest and where the fly is seen against the bright table, stops just short,
hangs a moment and veers away on a side that is clear. It casts a shadow. With
all that, the fly takes off about half the time: that is the model's answer,
not a dice roll in the game.

**View → Fly's eyes** shows the same picture to the player: one dot per facet
(the brain's 1,772, or, for a brain without eyes, a stand-in layout labelled as
such), laid out by where each looks, left eye on the left.

**What it sees** (`apps/web/src/eyes/inset.ts`) is that picture small, in a
corner over the camera's: the same layout and colours, the dots snapped to the
frame's pixels and widened toward the top and bottom, where the layout spreads
the facets apart. It says "What it sees" when it is what the brain is being
sent, and "A picture it doesn't see" for a brain without eyes, whose eyes are
then rendered for the picture alone. With the eyes off in Settings it doesn't
show: rendering them for the picture would bring back the cost that setting
saves, and it would no longer be what the brain is sent. It never shows on the
title, over a menu, or while View → Fly's eyes is up.

## The frame

The game renders 640×480, laid out for 16:9 (the picture is squeezed into the
4:3 buffer and stretched back out), with no antialiasing and a pixel ratio of
1; Settings → Pixels renders the world at 320×240 or 214×160 under crisp
640×480 menus. The backdrop (sky, clouds, hills, lollipop trees, lawn, daisies,
lake) and the table are two passes with their own depth ranges. Static things
are merged by material into a handful of meshes with vertex colours and frozen
matrices (the crumbs, pips and saucer go into those too, and the small things'
contact shadows are one merged mesh); seeds, sugar grains, dew, trees,
daisies, clouds, bubbles, fireflies, puffs and food are instanced. Menus and hints are one 2D canvas drawn over the frame,
uploaded only when something on it changes (at most 30 times a second; the
in-game shimmer at 10).

Measured in Chromium on an M-series Mac (Settings → Frame stats shows it live,
and the canvas's `data-calls`, `data-triangles`, `data-frame-ms` and
`data-eyes-ms`): playing, 23 draws and about 105,000 triangles a frame; on a
frame the eyes refresh, about 70 draws and 280,000 triangles (the most the
end-to-end run sees is about 85 draws and 300,000), the eyes' own part about 45
draws and 1.5 to 2.5 ms (mostly the read-back). JavaScript per frame about 1 to
2.5 ms in the browser. The corner picture of what it sees (in the wallpaper,
or always) is one more draw (its panel and every facet are instances of one
quad, drawn with the menus) and about 3,500 triangles, with no measurable
JavaScript. The end-to-end test fails above 150
draws or 500,000 triangles. Physical Apple TV measurements and the unattended
soak command are in [docs/apple-tv.md](docs/apple-tv.md).

## Remote and host

The game reads the remote only as `packages/contracts/src/remote.ts` describes,
and sets `window.__flyAtRoot` while on the title (or loading), where Back
leaves the app. Arrow presses that arrive during a fast swipe are taken as the
swipe's and ignored. In a browser the brain is `packages/brain` in a Web Worker
(`apps/web/src/brain/worker-driver.ts`), fed `brain/connectome.bin`, which the
dev and preview servers serve and the production build copies in
(`vite.config.ts`). On the Apple TV it is `globalThis.__native.brain`
(`apps/web/src/brain/native-driver.ts`), which allocates nothing per frame.
Sound is synthesised into buffers at start-up (no oscillators or filters):
wing buzz following the wings, patter while it walks, each place's own
surroundings (the picnic's breeze, lake and birds), and small sounds for the
tools and menus. Settings are kept in
`localStorage`.

## Tests

`npm test` runs, without a browser: the world's standing, bumping, ray and food
queries, round and rectangular tops, and becoming another place; every place
(the fly starts standing, its food can be tasted where it lies, every time of
day, every shot keeps the camera out of everything with the fly in view); the body's thresholds, motion, collisions, falls, flight, landing,
wall turning and mouth alignment; every sense; the facet layout, cube mapping
and resampling; both brain drivers against fakes and the worker's host; the
brain meter; the menu kit's focus, values, scrolling and navigation; the
camera (the fly's size on screen in each view, kept in the picture through a
long wandering walk and a jump, never inside anything, never jumping); the
corner picture of what it sees (when it shows, its way round the corners, clear
of the hints, every facet a dot inside it); the
bubbles (low ones pass the fly, settle as domes, burst on it and are felt);
that the crumbs, pips, strawberry and saucer can be walked over.

`npm run e2e` plays the game with the real brain: the title
appears once the brain wakes, the menus are walked with the keys, honey is
tasted and eaten, the ball is thrown until the fly takes off, Play/Pause
pauses and resumes, the wallpaper comes and goes with what it sees in a
corner (and, set to always, it stays while playing but not over View → Fly's
eyes or the pause menu), Back reaches the root, and the frame stays within its
draw budget. `node scripts/play.ts` drives and
screenshots the game step by step (see the comment at its top).

## Credits

The wiring is the [FlyEM male CNS connectome](https://male-cns.janelia.org/)
(Janelia Research Campus, CC-BY 4.0). The neuron model follows Shiu et al.,
"A Drosophila computational brain model reveals sensorimotor processing",
Nature 634 (2024).
