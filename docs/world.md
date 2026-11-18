# The world

[Documentation index](../README.md#documentation).

The place catalog includes Picnic table, Windowsill, Lab bench,
Greenhouse, Restaurant and Kitchen counter (`apps/web/src/places/catalog.ts`). Greenhouse adds
a bench with pots, seed trays, fruit and a water saucer of plain water
(`packages/world/src/greenhouse.ts`).

The fly can live in more than one place (`docs/places.md`), and the one it
lives in is its home: every launch finds it there, and play is there. At
home, the **Place** tool or Settings → Screensaver → Where it lives carries it
to another, which is home from then on. The setting applies once the choice
rests there a second or the row is left (places stepped past on the way
aren't built). On a visit to a room open to everyone, the Place tool goes to
that place's room and home stays where it was ([online.md](online.md#playing)).
At a named room, its starter changes place with the Place tool; the setting
does not move the room. Everyone rotates places by its clock; other guests
follow their room starter.

Settings → Screensaver → Places chooses what the screensaver does: Home only
(the default) keeps the fly at home; Each in turn, alone at home, carries it on to the
next place after 20 minutes watched in one (`apps/web/src/places/tour.ts`),
counting only screensaver time, and carries it home again as soon as play
begins. A save from before the fly had a home lived each in turn, then the
default: it lives where it was last and keeps going round in the screensaver.
It is the same fly, its brain running on; the world fades out, the place is
built behind the veil, and it is set down there.

## Picnic

The first place is the picnic: a round café table by a lake: lemonade, a jam
jar, a strawberry and a half, cherries, a slice of orange, a green apple,
sugar cubes, a drip of honey, a smear of jam, dew. The lemonade jar stands in
a saucer: up a gentle slope, a rounded rim to walk along, and down into a moat
where lemonade has dripped and pooled; drops from the jar, and the fly's own
feet, set rings spreading on the pool. Its lid is pressed with a rolled rim
and a raised ring and knurled round its side, and the straw goes through it by
a grommet. The whole strawberry spreads at its foot so a fly can walk up and
over it, and there is juice on top; its seeds sit in little pits. At the fly's
own scale there are biscuit crumbs (the big ones are boulders it can climb),
two lemon pips, specks and grains of spilt sugar, and the napkin and the jam
jar's cover are woven thread by thread, the napkin with a stitched hem and the
creases where it was folded, so they stay crisp however close the camera
comes. The table's white enamel shows its use: spots where dew dried, arcs
where it was wiped that catch the low sun, hairline scratches, pollen, a chip
or two at the rim, and the sticky ring a jar of lemonade once left. The apple
is freckled and streaked with blush, russet round its stalk; the orange's
segments are packed with juice sacs; the jam has pieces of fruit and seeds in
it, behind glass that brightens at its edge; the sugar cubes are pressed from
crystals that glint. Drops of water are clear in the middle and bright at the
edge, and focus the sun into a spot on the table. On the lawn below, the table
casts its shadow, and the grass is mown in stripes. Everything is built in
code.

Soap bubbles drift over the table on the breeze, and a few small ones bob
low past the fly; one that touches the table or anything standing on it
pops. A bubble that reaches the fly, or that it walks into,
bursts on it, and it feels the film break ([touch](simulation.md#the-flys-senses)). A bubble has no
light of its own: its film shows the sky's light and its glints the sun's or
the moon's, so at night it is faint, to the player and to the fly's eyes alike
(drawn as bright as by day, each one drifting past set the fly off now and
then with nothing thrown at it). At dusk and at
night fireflies drift round the table and blink.

The sky follows the clock unless you choose a time (the **Sky** tool's time of day):
between each place's five palettes the colours ease with the hour, the sun
rises out of the morning's side, crosses through each palette's place and
sets, and the moon rises after it (indoors, where a lamp lights the evening,
it comes on and stays), so dawn and dusk come over half an hour or more. A
room sees less of the weather than the open air (`docs/places.md`). By day a
cloud now and then passes over the sun and the light dims by a
fifth for a few seconds. The hours are a fixed summer day's (sunrise about
5:40, sunset about 20:10), unless the Apple TV can tell the real sunrise and
sunset (the weather outside, below).

Indoors the clocks (the alarm clock on the windowsill, the one on the
kitchen wall and the lab's on its wall) tell the real
time, whatever light you have chosen: a clock that showed another time would be a
broken one, and a twelve-hour dial can't tell three in the afternoon from
three in the morning, so it never looks wrong under the night's light. Its
hands are drawn in its dial's shader, turned by the time each frame, so they
cost no draw and stay sharp however close the camera comes.

So does the weather, unless you choose one (the **Sky** tool's weather): clear,
overcast, mist, light or heavy rain, thunderstorm, snow or sleet. On "Now" it follows a forecast worked out from
the clock, the same for the same local date and hour and on any restart: spells
of a few hours each, changing over an hour, in systems a day or two long, so
some days are fine and some grey. Mist forms only in the early morning and
burns off before noon; clouds gather before rain and clear after it.
Overcast greys every place's sky and reduces direct sunlight, and mist
whitens the distance. At the picnic rain falls past the camera, splashes on
the table, the fruit and the lemonade's pool (crowns of droplets, rings in
the wet), beads the table and the fruit, soaks the napkin darker, speckles
the lake; the table dries over the next half hour or so, and if the sun
comes out low while it is wet, a rainbow can stand opposite it. Rain bursts the bubbles, and the fireflies shelter from it. A
drop landing on the fly is felt (`touch`). Heavy rain thickens into windblown
sheets; storm gusts enter through the same wind sense. Thunderstorms are
silent: lightning brightens actual scene lights and the eyes, with an
occasional distant fork. The retinal model now includes L1-mediated brightening input as well as
darkening input; either can reach the escape pathway. No startle
command is manufactured.

Snow drifts past the picnic and through indoor views, dusts exposed picnic
surfaces, and gradually melts into wetness. The layer is cosmetic and thinner
than 0.35 mm, with no changed collision surface. Lab and windowsill panes
frost at their edges; the restaurant receives the shared weather light.
Cold itself is not modelled in the brain and no sluggishness is imposed.
A possible labelled stand-in is a proposal requiring owner approval, not an
active behavior ([weather details](places.md#storms-and-winter-precipitation)).
The invented forecast assumes northern temperate seasons: winter snow and
summer storms. Shared tables use protocol 5 so clients agree on that forecast.

## Outside weather

**The weather outside.** An Apple TV app built with WeatherKit
([docs/apple-tv.md](apple-tv.md#the-weather-outside)) follows the real
weather instead (`apps/web/src/scene/outside.ts`). The first time, once the
title is up, the TV asks whether the app may know where it is; from then on,
while the app is open, Apple Weather is asked for conditions and the day's sunrise and sunset.
While continuously active, after a successful answer the next timed request waits 20 minutes to an hour,
following its expiration date; failures retry sooner. The Weather
tool's "Now" then says "Outside" and is the real weather, as near as the
game can show it: cloud cover is the cloud; fog, or seeing less than a
kilometre, is mist, fading out by eight kilometres, and haze is some. Heavy rain and
thunderstorm conditions retain their intensity and lightning; snow and
flurries fall as snow, while sleet and wintry mix combine rain and snow.
Freezing rain and hail use rain as a visual approximation; no ice impact
or cold physiology is modelled. The real wind speed is how windy the day is, a
fresh breeze (10 m/s) the windiest, so the picnic's gusts come more often and
harder on a windy day and the trees and the lake move more. The Sky's time
of day "Now" stretches or squeezes the clock's day so that its sun comes up at the
real sunrise and goes down at the real sunset, each colour of the day keeping
its place between: on a winter afternoon it is dark at five. Where the sun
doesn't set that day, the light swings slowly between high noon and a low
golden sun, highest at the real noon; where it doesn't rise, between before
dawn and deep night. A new observation comes in over ten minutes, and the
switch between the real weather and the made-up one over a minute. With no
answer (no permission, no network, WeatherKit refusing the app) or one more
than two hours old (two days for sunrise and sunset, which move by minutes a
day), it is the forecast and the summer day as before, and the tool says
"Now". Settings → Screensaver → Real weather turns it off. Apple Weather's attribution is in
About the fly. Weather conditions reach the fly through what it sees, the wind it feels
and rain touching its body. Retained sunrise and sunset also inform its
internal daily rhythm, described in the [retained sleep reference](../README.md#sleep-and-the-daily-rhythm).

While nobody is using the remote (the screensaver, or a minute of play without
a press), the picnic has its own goings-on, about ten an hour, never two
starting within 45 s of each other, each only when the time of day and the
weather allow it: a gust (the fly feels it as `wind`; the bubbles are blown
on, the table's leaf lifts, ripples run over the napkin, the trees sway and it
runs across the grass and the lake), a gull gliding high over
whose shadow sweeps the table (the fly's eyes see it darken), a leaf coming
down on a gust to lie where it lands until another blows it off the table, a
butterfly that flutters over and may settle on the fruit a while, a ladybird
that walks across and around anything standing, a sailboat crossing the lake,
and now and then something new to find: a drop of juice seeping from a
strawberry, or a crumb blown in on a gust, put out in the pantry for the fly
to find by walking and tasting. The butterfly and ladybird are in the fly's world as things it sees
(and, without eye input, things that can loom); they keep clear of whichever
fly is nearest. A falling leaf can also brush any fly with touch input, and the scheduler does not force a neural response: what each fly does about
these events follows its brain commands and the documented body stand-ins.

## Kitchen counter

The kitchen counter is a metre-wide stone worktop with a glazed ceramic
fruit bowl, spotty bananas and purple grapes, a cut peach on a scarred wooden
chopping board, toast crumbs, a tumbler of orange juice with a splash spilt
beside it, a honey jar and a spill, and a compost caddy with its lid ajar. A checked tea
towel hangs over one corner and a wall dial tells the real time. The fly begins
on the peach's cut face. Split fruit, peach flesh, grape juice,
honey and orange juice are food; feet disturb the liquid pools. A tiled splashback
and a window frame the worktop, with cabinets and the kitchen beyond; warm
pendant light takes over from window daylight at dusk. The garden in the
window is a stylised backdrop, not a simulated outdoor place. Heavy rain
runs faster down the pane, storm flashes light the room, and snow falls
outside, dusting the garden and frosting the foot of the pane.

## Windowsill

The windowsill is the deep sill of a cottage kitchen window, painted cream
over sage over pine, its old gloss crazed where the sun bakes it and chipped
along its front edge, its bottom rail flaking and tide-marked where
condensation runs down the glass. The light comes in through the panes of a
casement window, so the frame, the mullion and the glazing bars lay their
shadows across the sill and the kitchen and swing round with the day; by day
the room throws some of it back, and from dusk the lamp over the kitchen table
lights it and the glass turns to a dark mirror with the lamp in it. The white
tiles round the window turn into its reveals. On the sill: a red enamel
wind-up alarm clock with two bells and its alarm set for half past six, which
a fly can land on and walk across; a spongeware bowl with a peach and two
plums, whose side a fly can walk up, round its rim and down to where plum
juice has run; an overripe, freckled banana it can climb from its tip, split
near the stalk; half a peach on a plate with its stone; a pot of basil in a
saucer with water round the pot's foot, a bushy mound of broad, glossy, veined
leaves in opposite pairs, coming into flower, that a fly can land on; a glass
bottle of orange juice that has dripped a pool on the sill, where drips and the fly's
feet set rings spreading, as they do on the saucer's water; a teaspoon with
honey in it and the jar it came from, glowing when the sun is behind it;
crumbs of toast and spilt sugar, drops from watering the basil, pebbles,
shells and a piece of sea glass from the beach along the back, a postcard of a
lighthouse propped at the end, and a linen tea towel woven thread by thread in
its shader. A fly can stand on the rail at the foot of the glass but never get
through it, and nor can the ball, which comes round from where it has room.
Across the kitchen are the dresser with its plates and cups, the range in its
chimney breast with pans and tins on the mantel and the kitchen clock over it,
a doorway and the fridge. Outside are a garden with a striped lawn, an apple
tree and washing moving in the breeze, a picket fence with hollyhocks and
foxgloves, and the backs of a little street of houses with smoke from their
chimneys, a church spire, clouds and passing birds; at night their windows
light up and the stars and the moon come out. Under a grey sky the window's
shadows go soft; on cold mornings and damp days the glass mists at its foot;
in mist the houses fade to ghosts; in the rain it falls across the garden,
drops bead on the pane and run down it, and it stays streaked as it dries.
There are no bubbles or fireflies indoors.

## Greenhouse

The greenhouse is a weathered wooden potting bench behind rain-streaked glass,
with a garden beyond its green glazing bars. Filled terracotta pots hold solid
leafy crowns, and a twelve-cell seed tray sits beside an old green watering can.
A trowel, flat plant labels, coiled string and scattered soil keep their human
scale beside the 2.5 mm fly. Fallen overripe tomatoes and an opened fig provide
food on their surfaces and in a little juice on the wood; the water in a
terracotta saucer responds with rings to the fly's feet and a roof leak. The
fly is set down on the fig's flesh, so the shared close views begin among its
seeds rather than on an empty part of the bench. The
leak starts only during quiet rainy spells, at a fixed point on the roof, and reaches
the fly through touch alone. Glazing bars lay moving shadows over the grain;
the wood darkens when damp, rain beads and runs down the panes, and condensation
clouds their lower edges at dawn. Storms send faster runoff down the glass and
lightning brightens it; snow and sleet frost the glazing bars while flakes fall
in the garden beyond. Weather reaches 70% of its light. The garden
backdrop is shared with the windowsill; there are no bubbles, and fireflies
appear at dusk. Plant crowns are solid approximations, with leaf veins drawn
in their surfaces rather than air beneath individual leaves.

The lab bench is the bench of a fruit-fly lab, a quiet nod to where this fly's
wiring was traced: a stereo microscope with a fly pad on its stage (its base
and pillar are solid; a fly can land on it), a rack of plugged vials with
pupae up their walls, a vial with its foam plug pulled half out and cornmeal
food at the bottom, a foil-capped beaker, a wash bottle, a box of pipette
tips, a lab timer and a desk lamp. The fly can eat from a dish of grape-juice
agar poured to the brim (land on it, walk off over the rim) and from drips of
food spilt when the vials were filled. At its own scale there are dried crumbs
of food to climb, grains of cornmeal, forceps whose arms it can walk along, a
fine paintbrush, a crumpled wipe to climb, and an open notebook, thin enough
to step onto, written in squiggles with a cross, a tally of counts and a
sketch of a fly; a drop of water on the page magnifies the writing under it.
The epoxy's flecks, the foam's open pores, the cornmeal's grains and the ink
are worked out in the shaders, crisp however close the camera comes, and the
satin bench and the glossy things show the windows, in the colour of the sky
outside, and the ceiling's panels in them. Between two of the windows hangs a
wall clock that tells the real time, its red second hand sweeping round. Round
the room are shelves of fly stocks, boxes of gloves, an incubator, a
centrifuge and a water bath, a sink, a whiteboard, and a spider plant on the
sill trailing its runners. By day fluorescent panels light the room evenly and
the sun comes in at the windows behind the bench, laying their shapes, frames
and blinds across the bench and the floor, long and warm at golden hour; from
dusk the panels are off, a desk lamp pools warm light on the bench, and the
room is dark round it but for lit windows across the way. Under a grey sky the
view outside goes flat and grey, in mist it fades to a pale veil, and in the
rain it falls past the windows. There are no bubbles or fireflies indoors.

## What you build

The Build tool (`apps/web/src/tools/build.ts`) sets pieces of a kit down in
whichever place the fly lives (`packages/world/src/kit.ts`, drawn in
`apps/web/src/scene/kit.ts`): glazed dishes 22 mm across in blue and yellow,
with a gentle outside to walk up, a rounded rim and a flat well where food
lies; glazed tiles 14 mm square and half a millimetre high, in blue, yellow
and red; a biscuit crumb, a boulder to a fly but low and round enough to
climb; a twig, a rail too high to step over and round on top; a fallen leaf
lying flat, a green floor; a wooden ramp up to a wall's height; and walls
20 mm long and 3 mm high, too high to step over, that meet end to end and
at corners into a maze or an arena. The colours are told apart by a fly's
eyes as by ours: the blue is bright to its blue-green photoreceptors, the
yellow middling and the red dark ([the eyes](../packages/body/src/vision.ts)).

A piece set down is a solid like the place's own: the fly stands on it,
walks into it, steps onto the tiles and the leaf, up the ramp and into a
dish, and sees it; the camera and the cameraman keep out of it; food dropped
on it lies on it. Pieces rest on the place's own level surfaces (the table,
a slab such as the restaurant's tables, the flat top of something standing
there), never on one another, and keep clear of the fly, of where the place
sets the fly down and of food they would cover. They are kept per place
between launches, up to 40 each; a save made by a build whose place has
changed keeps only those that still fit. In the open air they get wet in
the rain and take the snow, and the gull's shadow passes over them;
indoors they stay dry, as the rooms' own things do. Nothing about them
reaches the brain except through what it sees, feels and tastes.

## Food

Each place has food of its own, eaten down and slowly coming back, and Feed
drops more (`packages/world/src/pantry.ts`). Every food tastes of sugar,
plain water or bitterness, each 0 to 1, which reach the brain as `sweet`,
`water` and `bitter` ([the fly's senses](simulation.md#the-flys-senses)):
each drives its taste neurons at that fraction of their most
([the brain's senses](../packages/brain/README.md#senses)). So each food's
taste is how hard a fly's taste neurons answer it, as a fraction of the most
they answer, worked out the same way for every food from what it is made of
(`packages/world/src/tastes.ts`):

- **What it holds.** Its water, sugars and caffeine in 100 g, from USDA
  FoodData Central (each entry's ID is in `packages/world/src/tastes.ts`). Where an entry doesn't
  split its sugars, they are split as the nearest entry that does (raw figs as
  dried figs', toast as bread's), or taken as sucrose where the food is far
  past 1 M (jam, hard sweets), which changes nothing (below). Foods made of
  others are mixed from them: the coulis is raspberry purée with sugar, the
  lab's fly food the stock center's cornmeal and molasses recipe, its agar a
  published grape juice agar, the espresso dregs and Bitter sugar sugar soaked
  in espresso. The syrups are maple syrup (FoodData Central has no coffee
  syrup), the tart's pastry and the picnic's biscuit shortbread.
- **What the fly tastes it in.** A fly tastes what is dissolved, with sensilla
  at the tips of its labellum and feet, so a food is its sugar dissolved in its
  own water: a raspberry's 4.4 g of sugar in its 86 g of water, 0.27 M, mostly
  fructose and glucose. A food with less water than dissolves its sugar (sugar,
  honey, sweets, cake, a dried juice ring) is a saturated solution at its
  surface, as a fly's saliva on dry sugar makes one. Concentrations are per
  litre of the solution (the water and the sugar's own volume).
- **Sweet.** The labellum's sugar-sensing neuron, recorded from its L-type
  sensilla at 10 mM to 1 M of sucrose, glucose and fructose (Hiroi,
  Marion-Poll & Tanimura 2002, Zool Sci 19:1009, Figure 6, read off the
  figure): the one study to record all three from the same sensilla the same
  way. Between recordings it is interpolated on a log scale; past 1 M it holds,
  since none falls off by then. 1 is the most any sugar drove it to (84
  spikes/s, glucose at 1 M): sucrose at 1 M is 0.98, which is a lump of sugar.
  Sugars mixed are taken to add as each standing in for as much of another as
  gives the same answer (not recorded). Maltose, galactose and lactose weren't
  recorded and drive nothing.
- **Bitter.** Caffeine's answer from the bitter neurons at 1, 3 and 10 mM
  (Dweck, Sang & Carlson 2021, eLife 10:e64317, the only series across
  concentrations found), over 10 mM's, which is an espresso's and the scale's 1.
  Below 1 mM, where the threshold lies for most bitter compounds (Weiss et al.
  2011, Neuron 69:258), nothing is assumed: cola's 0.5 mM tastes of none.
  Chocolate's theobromine drives the bitter neurons at no concentration
  recorded (ibid.).
- **Water.** The water-sensing neurons answer sugar up to 0.2 M as they do
  water, and a third as much by 0.5 to 1 M (Cameron et al. 2010, Nature 465:91,
  Figure 1e, calcium imaging). Past 1 M nothing was recorded for sugar, and a
  food tastes of none (in the same figure 1 M of salt takes them to a sixth).
  Only sugar is counted, so for coffee, lemon and the like it is an upper bound.

| Food | Before (sweet / water / bitter) | Now | Sugar in its water |
|---|---|---|---|
| Sugar (Feed), sugar and spilt sugar | 1 / 0 / 0 | 0.98 / 0 / 0 | saturated (2.6 M) |
| Honey | 1 / 0 / 0 | 1 / 0 / 0 | saturated |
| Raspberry (Feed) | 0.8 / 0 / 0 | 0.73 / 0.94 / 0 | 0.27 M |
| Water: Feed's, the saucers | 0 / 1 / 0 (the greenhouse's 0.05 sweet) | 0 / 1 / 0 | none |
| Coffee (Feed) | 0 / 0 / 1 | 0 / 1 / 1 | none; 11 mM of caffeine |
| Bitter sugar (Feed), the espresso's dregs | 1 / 0 / 0.5; 0.9 / 0 / 1 | 0.98 / 0 / 0.85 | saturated; 4.9 mM of caffeine |
| jam | 0.95 / 0 / 0 | 0.98 / 0 / 0 | saturated |
| strawberry juice | 0.8 and 0.7 / 0 / 0 | 0.73 / 0.93 / 0 | 0.28 M |
| lemonade | 0.7, 0.65 / 0 / 0 | 0.93 / 0.37 / 0 | 0.55 M |
| orange | 0.6 / 0 / 0 | 0.89 / 0.63 / 0 | 0.40 M |
| orange juice | 0.6 to 0.7 / 0 / 0 | 0.88 / 0.71 / 0 | 0.36 M |
| juice ring (dried orange juice) | 0.55 / 0 / 0 | 1 / 0 / 0 | saturated |
| banana | 0.9, 0.95 / 0 / 0 | 0.98 / 0.36 / 0 | 0.75 M |
| peach, peach juice | 0.85 to 0.9 / 0 / 0 | 0.89 / 0.72 / 0 | 0.36 M |
| plum juice | 0.8 / 0 / 0 | 0.97 / 0.37 / 0 | 0.54 M |
| grape juice | 0.8 / 0 / 0 | 0.98 / 0.35 / 0 | 0.84 M |
| grape | 0.85 / 0 / 0 | 0.98 / 0.34 / 0 | 0.95 M |
| tomato juice | 0.72 / 0 / 0 | 0.58 / 1 / 0 | 0.15 M |
| fig flesh | 0.95 / 0 / 0 | 0.98 / 0 / 0 | 1.01 M |
| grape agar | 0.75 / 0 / 0 | 0.7 / 0.99 / 0 | 0.25 M |
| fly food | 0.85 / 0 / 0 | 0.83 / 1 / 0 | 0.22 M |
| ketchup | 0.6 / 0 / 0 | 0.99 / 0 / 0 | 1.37 M |
| bread crumbs (restaurant) | 0.3 / 0 / 0 | 0.85 / 0.36 / 0 | 0.68 M |
| toast crumbs (kitchen) | 0.25 / 0 / 0 | 0.94 / 0.35 / 0 | 0.86 M |
| lemon | 0.3 / 0 / 0 | 0.63 / 1 / 0 | 0.14 M |
| syrup | 0.95, 0.8 / 0 / 0 | 0.98 / 0 / 0 | saturated |
| cake crumbs | 1 / 0 / 0 | 0.98 / 0 / 0 | saturated |
| coulis | 1 / 0 / 0 | 0.97 / 0.35 / 0 | 0.88 M |
| tart crumbs, biscuit crumb (found) | 1, 0.5 / 0 / 0 | 0.98 / 0 / 0 | saturated |
| mints | 0.6 / 0 / 0 | 0.98 / 0 / 0 | saturated |
| soda (cola) | 0.9 / 0 / 0 | 0.88 / 0.37 / 0 | 0.58 M; 0.5 mM of caffeine |

A raspberry is less sweet than an orange now, as its sugar is; bread, toast,
ketchup, the mints and the lemon are sweet, since what decides it is how
strong the sugar is in the water it is dissolved in, and bread holds little
water. Dilute juices and fruit taste of water too, which takes something off
sugar's answer in the brain (`packages/brain/README.md`, Senses), and a food's
water stands in for how much it quenches
([thirst](simulation.md#the-flys-senses)).

What it leaves out, and where it could be wrong:

- **Fructose and glucose.** Other recordings find the labellum's sugar neuron
  answering fructose and glucose far more weakly than sucrose (Dahanukar et al.
  2007, Neuron 56:503; Jiao et al. 2008, Curr Biol 18:1797), and how strongly
  it answers fructose differs between strains (Uchizono & Tanimura 2017, Chem
  Senses 42:287). Hiroi et al.'s flies answer both well; with those others'
  numbers, fruit, juice and bread would be much less sweet. One study is used
  so that every sugar is measured the same way.
- **Below 10 mM and past 1 M**, and how sugars mixed add: not recorded.
- **The other sensilla and organs.** `sweet` drives the taste pegs' and
  pharynx's sugar neurons too, taken to answer as the labellum's L-type
  sensilla do; nothing records theirs across concentrations.
- **Acid and salt.** Acids drive the bitter neurons and quiet the sugar ones,
  more the lower the pH (Charlu et al. 2013, Nat Commun 4:2042), and high salt
  drives the bitter neurons too (Jaeger et al. 2018, eLife 7:e37167, by
  calcium imaging). Both were recorded without sugar, and in the same study more
  sugar overcame acid's quieting of the sugar neurons; what a fruit's acid does
  to its bitterness with its sugar there isn't recorded, so neither is counted:
  a lemon's citric acid and ketchup's salt taste of nothing here.
- **Water** counts only a food's sugar, and drops to none past 1 M, where
  nothing was recorded: the fig, at 1.01 M, tastes of none, the grape, at
  0.95, of a third.
- **How well a food feeds** (hunger) still follows its `sweet`, a game unit
  (`packages/body/src/hunger.ts`).

Whether the fly eats is the brain's. `node scripts/foods.ts` sets a fly down
with its mouth on each food (each place's own as it lies, Feed's on a bare
table), at a new fly's hunger and starved, and watches ten seconds, seeds 1
to 3:

- **Eaten as before**: sugar, honey, jam, the syrups, cake, tart and figs,
  every time, 7.6 to 10 s of the ten; and never plain water, Coffee, Bitter
  sugar or the espresso's dregs (sweet as they are, 0.85 bitter is past where
  the brain's taste stops feeding).
- **Eaten much more**: whatever holds its sugar in little water. The bread and
  toast crumbs, which no new fly ate, every fly now eats for 6 to 10 s; ketchup,
  the mints, the dried juice ring, the orange, orange juice and lemonade, once
  taken for a second or two, for 4 to 10 s.
- **Eaten much less**: the dilute ones, sweet at 0.7 or so and tasting of water
  as much as of sugar, which takes from sugar's answer. Feed's Raspberry and
  the picnic's strawberry juice are taken by every fly but one new one, and a
  new fly feeds 0 to 1.6 s of the ten (4 to 7 before) and a starved one 1.4 to 3.4 (6 to 9); the
  lab's agar and fly food likewise. The greenhouse's tomato juice (0.58) is all
  but left: one new fly in three and two starved flies took it, for a
  second at most. The lemon (0.63) is as it was, a moment's taste for one or two flies
  in three.

| Food | New fly (hunger 0.7): ate; seconds fed, before → now | Starved (1) |
|---|---|---|
| Feed: Sugar | 3/3, 8.5–9.3 s → 3/3, 8.7–9.7 s | 3/3, 8.5–9.8 s → 3/3, 9.2–9.9 s |
| Feed: Honey | 3/3, 8.5–9.3 s → 3/3, 7.6–8.7 s | 3/3, 8.5–9.8 s → 3/3, 8.7–9.7 s |
| Feed: Raspberry | 3/3, 4.1–6.8 s → 3/3, 0.4–1.3 s | 3/3, 6.3–8.7 s → 3/3, 1.4–3.4 s |
| Feed: Water | 0/3, 0.0 s → 0/3, 0.0 s | 0/3, 0.0 s → 0/3, 0.0 s |
| Feed: Coffee | 0/3, 0.0 s → 0/3, 0.0 s | 0/3, 0.0 s → 0/3, 0.0 s |
| Feed: Bitter sugar | 0/3, 0.0 s → 0/3, 0.0 s | 0/3, 0.0 s → 0/3, 0.0 s |
| greenhouse: tomato juice | 3/3, 3.1–5.4 s → 1/3, 0.0–0.3 s | 3/3, 3.6–5.9 s → 2/3, 0.0–1.0 s |
| greenhouse: fig flesh | 3/3, 7.2–9.3 s → 3/3, 8.7–9.7 s | 3/3, 9.6–9.9 s → 3/3, 9.2–9.9 s |
| greenhouse: water | 0/3, 0.0 s → 0/3, 0.0 s | 0/3, 0.0 s → 0/3, 0.0 s |
| picnic: honey | 3/3, 8.5–9.3 s → 3/3, 7.6–8.7 s | 3/3, 8.5–9.8 s → 3/3, 8.7–9.7 s |
| picnic: jam | 3/3, 7.2–9.3 s → 3/3, 8.7–9.7 s | 3/3, 9.6–9.9 s → 3/3, 9.2–9.9 s |
| picnic: strawberry juice (and the 0.7 bruise) | 3/3, 4.1–6.8 s → 2/3, 0.0–1.6 s | 3/3, 6.4–8.7 s → 3/3, 1.4–2.8 s |
| picnic: lemonade | 3/3, 1.6–4.2 s → 3/3, 7.3–7.9 s | 3/3, 4.9–5.9 s → 3/3, 7.6–8.7 s |
| picnic: orange | 3/3, 0.0–0.9 s → 3/3, 4.0–6.0 s | 3/3, 2.2–2.7 s → 3/3, 7.2–8.9 s |
| picnic: sugar | 3/3, 8.5–9.3 s → 3/3, 8.7–9.7 s | 3/3, 8.5–9.8 s → 3/3, 9.2–9.9 s |
| picnic: spilt sugar | 3/3, 8.5–9.3 s → 3/3, 8.7–9.7 s | 3/3, 8.5–9.8 s → 3/3, 9.2–9.9 s |
| windowsill: banana | 3/3, 7.1–8.9 s → 3/3, 6.2–8.9 s | 3/3, 8.2–9.5 s → 3/3, 9.3–9.9 s |
| windowsill: peach juice | 3/3, 4.9–8.0 s → 3/3, 4.4–7.7 s | 3/3, 7.7–8.8 s → 3/3, 5.7–8.5 s |
| windowsill: plum juice | 3/3, 4.1–6.8 s → 3/3, 7.7–8.2 s | 3/3, 6.4–8.7 s → 3/3, 8.6–9.6 s |
| windowsill: honey | 3/3, 8.5–9.3 s → 3/3, 7.6–8.7 s | 3/3, 8.5–9.8 s → 3/3, 8.7–9.7 s |
| windowsill: orange juice | 3/3, 0.0–0.9 s → 3/3, 4.1–7.7 s | 3/3, 1.8–2.7 s → 3/3, 6.1–9.4 s |
| windowsill: water | 0/3, 0.0 s → 0/3, 0.0 s | 0/3, 0.0 s → 0/3, 0.0 s |
| windowsill: spilt sugar | 3/3, 8.5–9.3 s → 3/3, 8.7–9.7 s | 3/3, 8.5–9.8 s → 3/3, 9.2–9.9 s |
| lab: grape agar | 3/3, 3.7–5.4 s → 2/3, 0.0–0.8 s | 3/3, 4.8–8.0 s → 3/3, 1.6–2.5 s |
| lab: fly food | 3/3, 4.9–8.0 s → 3/3, 2.8–3.6 s | 3/3, 7.7–8.8 s → 3/3, 2.9–5.8 s |
| restaurant: sugar | 3/3, 8.5–9.3 s → 3/3, 8.7–9.7 s | 3/3, 8.5–9.8 s → 3/3, 9.2–9.9 s |
| restaurant: orange juice | 3/3, 1.6–4.2 s → 3/3, 4.1–7.7 s | 3/3, 4.9–5.9 s → 3/3, 6.1–9.4 s |
| restaurant: juice ring | 1/3, 0.0–0.9 s → 3/3, 7.6–8.7 s | 3/3, 1.3–1.8 s → 3/3, 8.7–9.7 s |
| restaurant: ketchup | 3/3, 0.0–0.9 s → 3/3, 8.9–9.3 s | 3/3, 1.8–2.7 s → 3/3, 7.8–9.5 s |
| restaurant: crumbs | 0/3, 0.0 s → 3/3, 5.5–8.1 s | 1/3, 0.0–0.3 s → 3/3, 7.3–9.0 s |
| restaurant: espresso | 0/3, 0.0 s → 0/3, 0.0 s | 0/3, 0.0 s → 0/3, 0.0 s |
| restaurant: peach | 3/3, 7.1–8.9 s → 3/3, 4.4–7.7 s | 3/3, 8.2–9.5 s → 3/3, 5.7–8.5 s |
| restaurant: lemon | 0/3, 0.0 s → 2/3, 0.0–0.4 s | 1/3, 0.0–0.3 s → 2/3, 0.0–1.0 s |
| restaurant: lemonade | 3/3, 1.0–3.4 s → 3/3, 7.3–7.9 s | 3/3, 3.1–5.3 s → 3/3, 7.6–8.7 s |
| restaurant: syrup | 3/3, 7.2–9.3 s → 3/3, 8.7–9.7 s | 3/3, 9.6–9.9 s → 3/3, 9.2–9.9 s |
| restaurant: cake crumbs | 3/3, 8.5–9.3 s → 3/3, 8.7–9.7 s | 3/3, 8.5–9.8 s → 3/3, 9.2–9.9 s |
| restaurant: coulis | 3/3, 8.5–9.3 s → 3/3, 7.4–8.4 s | 3/3, 8.5–9.8 s → 3/3, 8.4–9.6 s |
| restaurant: tart crumbs | 3/3, 8.5–9.3 s → 3/3, 8.7–9.7 s | 3/3, 8.5–9.8 s → 3/3, 9.2–9.9 s |
| restaurant: mints | 3/3, 0.0–0.9 s → 3/3, 8.7–9.7 s | 3/3, 1.8–2.7 s → 3/3, 9.2–9.9 s |
| restaurant: soda | 3/3, 7.1–8.9 s → 3/3, 4.1–7.6 s | 3/3, 8.2–9.5 s → 3/3, 6.7–9.2 s |
| restaurant: grape | 3/3, 4.9–8.0 s → 3/3, 7.0–9.3 s | 3/3, 7.7–8.8 s → 3/3, 9.4–9.9 s |
| kitchen: banana | 3/3, 7.1–9.3 s → 3/3, 6.0–8.9 s | 3/3, 9.6–9.9 s → 3/3, 9.3–9.9 s |
| kitchen: peach juice | 3/3, 7.1–8.9 s → 3/3, 4.4–7.7 s | 3/3, 8.2–9.5 s → 3/3, 5.7–8.5 s |
| kitchen: grape juice | 3/3, 4.1–6.8 s → 3/3, 8.2–9.9 s | 3/3, 6.3–8.7 s → 3/3, 8.5–9.1 s |
| kitchen: orange juice | 3/3, 1.0–3.4 s → 3/3, 4.1–7.7 s | 3/3, 3.1–5.3 s → 3/3, 6.1–9.4 s |
| kitchen: honey | 3/3, 8.5–9.3 s → 3/3, 7.6–8.7 s | 3/3, 8.5–9.8 s → 3/3, 8.7–9.7 s |
| kitchen: crumbs | 0/3, 0.0 s → 3/3, 7.1–8.9 s | 0/3, 0.0 s → 3/3, 7.9–9.7 s |

(Before: the hand-set tastes, at the commit before these; now: these, on
`56d9f3b`. "3/3" with 0.0 s means a bite in the last frame.)

### Smell

Food also gives off odour, which the air carries to the fly's antennae
(`packages/world/src/plume.ts`) and which reaches the brain as `odor`, each of
five odorants at each antenna, 0 to 1, where 1 is as strong as the 10⁻²
dilutions its smell neurons were recorded with
([the brain's Smell](../packages/brain/README.md#smell)). Which odorants a food
gives off is from what it is; how strongly is chosen, in three steps, since
nothing measured turns a food's own air into that scale. What the brain can't
smell (none of the five) a food doesn't give off here.

| Food | Gives off | Why |
|---|---|---|
| The lab's fly food | ethyl acetate, acetic acid, ethanol, isoamyl acetate and CO₂, each 1 | it ferments once flies and their yeasts live on it. Fermenting yeast gives off ethanol and acetic acid, which with three others make a mimic of its odour as attractive to flies as fermenting fruit (Becher et al. 2012, Funct Ecol 26:822, abstract), CO₂ one molecule for each of ethanol, and yeast's esters ethyl and isoamyl acetate (Verstrepen et al. 2003, J Biosci Bioeng 95:110, known from its abstract and citing work only). The strengths are the olfaction protocol's fermenting fruit (chosen) |
| Banana | isoamyl acetate 1, ethyl acetate and ethanol 0.1 | isoamyl acetate is among banana essence's most abundant and most often smelled volatiles (Jordán et al. 2001, J Agric Food Chem 49:4813, abstract); a ripe fruit's trace, below |
| Ketchup | acetic acid 1 | it is made with vinegar (21 CFR 155.194(a)(2)(i)) |
| Spilt soda | CO₂ 0.3 | the gas it is made fizzy with, less once spilt (chosen) |
| Ripe fruit and its juice, the coulis and the grape agar | ethyl acetate and ethanol, 0.1 each | ripe fruit makes ethanol and ethyl acetate, more as it goes off (strawberries kept short of air: Larsen and Watkins, known from abstracts only; in overripe mango ethanol and acetic acid are among what flies' antennae answer: Zhu, Park & Baker 2003, J Chem Ecol 29:899, abstract). A fresh fruit's own esters, its butanoates and hexanoates, aren't among the five: a trace (chosen) |
| Sugar, honey, syrup, jam, sweets, cake, biscuit, bread and toast, coffee, water, a dried juice ring | nothing | sugar isn't volatile; what the others smell of (honey's, coffee's and baked bread's aromas, cooked fruit's) isn't among the five, or how much of it reaches the air (coffee's acetic acid) wasn't found |

The air carries it as the steady solution of advection and diffusion from a
point on a floor in uniform air, normalised to the food's edge:
C = min(1, (r₀/r) · exp(−U(r − x)/2D)), r the distance from the food's centre
to the antenna, x its part downwind, r₀ the food's radius, D 10 mm²/s (about
these volatiles' diffusivity in air), U the air's own speed where the fly is:
a gust, the restaurant's draught, a puff. In still air, most of the time, it
is diffusion's r₀/r, the same every way. Each odorant is the food's strength
times C, summed over every food and held at 1; it fades with the food's taste
over its last quarter, and under 0.01 it is none, so a fly away from food
smells nothing and its brain runs as it did. What it leaves out: turbulence
and the patchiness of real plumes, the time a smell takes to spread, walls
and lids in its way. Each device works out the smell of a shared table's food
itself, from what it is; nothing about smell crosses the wire.
[The protocol](smell-protocol.md) fixed all of this before anything was
measured, and says what was measured with it ([simulation.md](simulation.md#the-flys-senses), Smell).

## Footprints

Wherever it lives, a fly that has stood in something sticky or wet leaves
footprints (`apps/web/src/scene/prints.ts`): faint prints of the two pads of
its feet, each where its gait set that foot down, lying on whatever it walks
on (the table, a fruit, a jar's rim, the sill). Honey and plain syrup leave them amber; jam,
raspberry red; the juices, lemonade, the agar and the
lab's fly food their own colours; Bitter sugar, the espresso's dregs' brown. Water (dropped, the basil's saucer, a drop
or dew) and Coffee leave darker wet prints that dry in about half a minute; sticky ones
fade over a minute and a half. A foot carries only a little: the first steps
off the food print clearly, the next fainter and then only now and then, and
after ten or so it is clean, until it walks back into food. Sugar and crumbs
are dry and leave nothing. There are none on a drink or
anything drawn rougher than the fly feels it. Changing place clears the
prints and cleans its feet. They are only drawn: the fly doesn't taste or
feel its own prints, they aren't food, and nothing about them reaches its
brain.

## Restaurant

The restaurant is a whole room, not a tabletop: a small city bistro, closed
for the night. The fly starts on a round marble table in the window, between
a glass caddy of sugar packets and a tumbler with orange juice left in it, a rose
in a bud vase and an unlit votive beside them, a torn sugar packet spilt
across the marble and the ring a glass left; from there it can walk under
the table, fly to the next, to the floor's black and white penny rounds, to
the zinc bar or the kitchen's pass. Chairs are pushed in, or upturned on two
of the oak four-tops; the tables are cleared but not spotless (ketchup and a
menu on one, the bread basket on another, an espresso cup with sugar in the
bottom on the banquette's). Along the bar are leather stools under three
enamel pendants, the middle one left on; on the hammered zinc a bowl of
fruit with a bruised peach, a board with a cut lemon, a mat with syrup
spilt on it, a milk jug upturned to dry, glasses of orange juice and
lemonade and a cake under a glass cloche. Behind it, bright bottles of
coffee syrups, juice, water and oil on shelves before an old mirror over the
drinks fridge's glowing doors; at the back, a plate sent back to the pass with crumbs of tart and
raspberry coulis, under the heat lamps' faint red; by the door the host's
stand with a sticky menu and a bowl of mints, the exit sign's green over it.
The marble's veins, the cane's weave, the zinc's hammering, the oak's grain,
the floor's glaze and grout and the pressed-tin ceiling are worked out in the
shaders, crisp however close the camera comes. Outside the shop front is a
street with an ice-cream parlour's neon cone across it; by day the daylight comes in at
the glass, its frames laying their shadows across the tables and the floor,
long and gold at golden hour; after dark the street lamp throws the window's
shape in and the tables' shadows back, passing cars sweep their headlamps
across the ceiling, the pendant pools warm light on the zinc, and in the rain
water runs down the glass. Now and then, while nobody plays, the ventilation
comes on and a slow draught falls from its diffusers. The room is drawn in
areas, each in detail only while the camera is near it (`docs/places.md`, "A
large place"). There are no bubbles or fireflies indoors.

<!-- docs-check: base apps/web/src -->

<!-- docs-check: base packages/body/src -->

<!-- docs-check: generated packages/brain/data/anatomy.bin -->
