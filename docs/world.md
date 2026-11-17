# The world

[Documentation index](../README.md#documentation).

The place catalog includes Picnic table, Windowsill, Lab bench, Bar,
Greenhouse, Restaurant and Kitchen counter (`apps/web/src/places/catalog.ts`). Greenhouse adds
a bench with pots, seed trays, fruit and a water saucer; its saucer water has
configured sweetness 0.05 (`packages/world/src/greenhouse.ts`).

The fly can live in more than one place (`docs/places.md`). In solo play,
the **Place** tool or Settings → Screensaver → Where it lives carries it
elsewhere. The setting applies once the choice rests there a second or the
row is left (places stepped past on the way aren't built). At a named room,
its starter changes place with the Place tool; the setting does not move
the room. Everyone locks Place and rotates places by its clock; other guests
follow their room starter. In solo play, living in each in turn (the default),
it moves on after 20 minutes of accumulated screensaver time at that place.
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

The sky follows the clock unless you choose a time (the **Light** tool):
between each place's five palettes the colours ease with the hour, the sun
rises out of the morning's side, crosses through each palette's place and
sets, and the moon rises after it (indoors, where a lamp lights the evening,
it comes on and stays), so dawn and dusk come over half an hour or more. A
room sees less of the weather than the open air (`docs/places.md`). By day a
cloud now and then passes over the sun and the light dims by a
fifth for a few seconds. The hours are a fixed summer day's (sunrise about
5:40, sunset about 20:10), unless the Apple TV can tell the real sunrise and
sunset (the weather outside, below).

Indoors the clocks (the alarm clock on the windowsill and the one on the
kitchen wall, the lab's on its wall, the bar's behind the bar) tell the real
time, whatever light you have chosen: a clock that showed another time would be a
broken one, and a twelve-hour dial can't tell three in the afternoon from
three in the morning, so it never looks wrong under the night's light. Its
hands are drawn in its dial's shader, turned by the time each frame, so they
cost no draw and stay sharp however close the camera comes.

So does the weather, unless you choose one (the **Weather** tool): clear,
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
frost at their edges; bar and restaurant receive the shared weather light.
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
harder on a windy day and the trees and the lake move more. The Light tool's
"Now" stretches or squeezes the clock's day so that its sun comes up at the
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
chopping board, toast crumbs, a stemmed glass with red wine left in it, a
honey jar and a spill, and a compost caddy with its lid ajar. A checked tea
towel hangs over one corner and a wall dial tells the real time. The fly begins
on the peach's cut face. Split fruit, peach flesh, grape juice,
honey and wine are food; feet disturb the liquid pools. A tiled splashback
and a window frame the worktop, with cabinets and the kitchen beyond; warm
pendant light takes over from window daylight at dusk. The garden in the
window is a stylised backdrop, not a simulated outdoor place. Heavy rain
runs faster down the pane, storm flashes light the room, and snow falls
outside, dusting the garden and frosting the foot of the glass.

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
leaves in opposite pairs, coming into flower, that a fly can land on; a bottle
of red wine that has dripped a pool on the sill, where drips and the fly's
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

## Bar

The bar is the walnut counter of a small, warm bar in the evening: a cocktail
on the rocks with a wedge of lime on its rim, a tall beer with its head of
foam, salted peanuts heaped in a fluted ramekin (two have fallen out), two
maraschino cherries, printed card coasters, a folded paper napkin, and a
candle in a storm lantern whose cap is a perch and whose flame is out of
reach. A sticky ring of syrup marks where a glass stood; the cherries' syrup,
the lime, the beer's head and the cocktail itself are sweet too (a fly that
lands in the drink can climb out up the meniscus onto the rim), and spilt beer
takes its feet as rings, as does the cocktail when the ice settles. At the
fly's scale the walnut's grain and open pores show under the varnish, with
fine scratches and the milky rings of old glasses; salt crystals and bits of
peanut lie about; the cold glasses are beaded with condensation and bubbles
rise through the beer. Behind the bar, labelled bottles glow on glass shelves
before an old mirror, under brass pendant lamps, and in the walnut pier
between the shelves hangs an old drop-dial clock with a brass bezel and an
ivory face. It tells the real time: its blued hands turn and a red second hand
sweeps, and in the evening a little brass lamp lights its face. The walls are
papered in green flock over walnut panelling and hung with paintings, and a
buttoned leather banquette runs along the far wall; off the counter's end a
window looks over a square to a row of houses. By day the room is unlit and
the light is the window's, falling away from it, and the varnish mirrors the
dark room and the bright window; at golden hour the sun comes in low across
the counter and the glasses throw long shadows coloured by what is in them; at
dusk and night the lamps, the flickering candle and the back bar light it, and
lights out of focus glow behind the fly.

## Footprints

Wherever it lives, a fly that has stood in something sticky or wet leaves
footprints (`apps/web/src/scene/prints.ts`): faint prints of the two pads of
its feet, each where its gait set that foot down, lying on whatever it walks
on (the table, a fruit, a jar's rim, the sill). Honey and plain syrup leave them amber; jam,
raspberry, wine and cherry syrup red; the juices, lemonade, beer, the agar and the
lab's fly food their own colours. Water (dropped, the basil's saucer, a drop
or dew) leaves darker wet prints that dry in about half a minute; sticky ones
fade over a minute and a half. A foot carries only a little: the first steps
off the food print clearly, the next fainter and then only now and then, and
after ten or so it is clean, until it walks back into food. Sugar and crumbs
are dry and leave nothing. There are none on a drink, a head of foam or
anything drawn rougher than the fly feels it. Changing place clears the
prints and cleans its feet. They are only drawn: the fly doesn't taste or
feel its own prints, they aren't food, and nothing about them reaches its
brain.

## Restaurant

The restaurant is a whole room, not a tabletop: a small city bistro, closed
for the night. The fly starts on a round marble table in the window, between
a glass caddy of sugar packets and a glass with red wine left in it, a rose
in a bud vase and an unlit votive beside them, a torn sugar packet spilt
across the marble and the ring a glass left; from there it can walk under
the table, fly to the next, to the floor's black and white penny rounds, to
the zinc bar or the kitchen's pass. Chairs are pushed in, or upturned on two
of the oak four-tops; the tables are cleared but not spotless (ketchup and a
menu on one, the bread basket on another, an espresso cup with sugar in the
bottom on the banquette's). Along the bar are leather stools under three
enamel pendants, the middle one left on; on the hammered zinc a bowl of
fruit with a bruised peach, a board with a cut lemon, a mat with syrup
spilt on it, two glasses of wine and a cake under a glass cloche. Behind
it, bottles on shelves before an old mirror over the drinks fridge's glowing
doors; at the back, a plate sent back to the pass with crumbs of tart and
raspberry coulis, under the heat lamps' faint red; by the door the host's
stand with a sticky menu and a bowl of mints, the exit sign's green over it.
The marble's veins, the cane's weave, the zinc's hammering, the oak's grain,
the floor's glaze and grout and the pressed-tin ceiling are worked out in the
shaders, crisp however close the camera comes. Outside the shop front is a
street with a corner bar's neon across it; by day the daylight comes in at
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
