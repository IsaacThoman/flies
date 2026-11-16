# flies

A fruit fly that lives on your Apple TV, or in a browser tab. It isn't
scripted: a simulation of the fly's whole nervous system, 166,700 neurons
wired as they are in the real animal, decides what it does from what it sees,
tastes and feels. Feed it, startle it, tickle it and watch it with the
remote; leave it alone and it is a living screensaver.

```sh
npm install
npm run brain:fetch   # the packed connectome, 38 MB, once
npm run dev           # the game in a browser
npm test              # unit tests (Node)
npm run e2e           # plays the game in headless Chromium with the real brain, then the built site
npm run build         # the web build, plain files for any static host (docs/web.md)
npm run ios           # the iPhone and iPad app in a simulator (docs/ios.md)
npm run rooms         # the room server for tables with others (docs/online.md)
```

`docs/architecture.md` describes the parts and the rules. This file is about
the game (`apps/web`), which is also the iPhone and iPad app
([docs/ios.md](docs/ios.md)), and its packages: `packages/world` (where the fly can
stand, what it bumps into and eats), `packages/body` (its senses, what it makes
of the brain's commands, how it moves, what its eyes see) and `packages/ui`
(the menu kit). `docs/places.md` is about the places the fly can live and how
to add one, and `docs/web.md` about the web build: getting the brain to a
browser, running well on what people have, being a good tab, and hosting.
`docs/online.md` is about tables with others: up to eight people's flies at
one table, joined by a link, and the room server between them. For a Docker
Compose stack on your own server, behind your own HTTPS reverse proxy, see
[Self-hosting Flies](docs/deploy.md).
Releases to TestFlight, and setting them up, are in [docs/release.md](docs/release.md).

## Playing

In a browser, **Online** (on the menu) lists the rooms open to anyone and
makes new ones: named, public or unlisted, with a password if you like.
Whoever joins, by the list, a code or the room's link, sits their fly down
beside yours, up to eight, each marked with a dab of its player's colour
(`docs/online.md`).

The fly can live in more than one place (`docs/places.md`), and the player can
carry it from one to another: the **Place** tool, or Settings → Screensaver →
Where it lives, once the choice rests there a second or the row is left (the
places stepped past on the way aren't built). Living in each in turn (the default), it moves on after 20 minutes of
screensaver. It is the same fly, its brain running on; the world fades out, the
place is built behind the veil, and it is set down there.

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
bursts on it, and it feels the film break (`touch`, below). A bubble has no
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
overcast, mist or light rain. On "Now" it follows a forecast worked out from
the clock, the same for everyone at the same hour and on any restart: spells
of a few hours each, changing over an hour, in systems a day or two long, so
some days are fine and some grey. Mist forms only in the early morning and
burns off before noon; clouds gather before rain and clear after it.
Overcast greys every place's sky and takes the sun's light away, and mist
whitens the distance. At the picnic rain falls past the camera, splashes on
the table, the fruit and the lemonade's pool (crowns of droplets, rings in
the wet), beads the table and the fruit, soaks the napkin darker, speckles
the lake; the table dries over the next half hour or so, and if the sun
comes out while it's wet a rainbow stands opposite it. Rain bursts the bubbles, and the fireflies shelter from it. A
drop landing on the fly is felt (`touch`).

**The weather outside.** An Apple TV app built with WeatherKit
([docs/apple-tv.md](docs/apple-tv.md#the-weather-outside)) follows the real
weather instead (`apps/web/src/scene/outside.ts`). The first time, once the
title is up, the TV asks whether the app may know where it is; from then on,
while the app is open, Apple Weather is asked every 20 minutes for the
conditions about where the TV is and the day's sunrise and sunset. The Weather
tool's "Now" then says "Outside" and is the real weather, as near as the
game's four kinds go: the cloud cover is the cloud; fog, or seeing less than a
kilometre, is mist, fading out by eight, and a haze is some; precipitation is
rain, light rain at the heaviest, since that is all the game has. There is no
snow or thunder in the game yet, so each is the nearest it has: snow is a
white mist under a grey sky, with nothing falling (rain would be wrong),
flurries a grey sky; sleet, freezing rain and hail are rain; a thunderstorm is
heavy rain, with no lightning. The real wind speed is how windy the day is, a
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
About the fly. None of it reaches the fly but as everything else does: what
it sees and the wind it feels.

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
to find by walking and tasting. The butterfly, the ladybird and the falling
leaf are in the fly's world only as things it sees (and, for a brain without
eyes, things that can loom); they keep clear of it, and none of it is aimed
or timed at the fly: what it does about any of it is its brain's.

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

Wherever it lives, a fly that has stood in something sticky or wet leaves
footprints (`apps/web/src/scene/prints.ts`): faint prints of the two pads of
its feet, each where its gait set that foot down, lying on whatever it walks
on (the table, a fruit, a jar's rim, the sill). Honey leaves them amber; jam,
raspberry, wine and syrup red; the juices, lemonade, beer, the agar and the
lab's fly food their own colours. Water (dropped, the basil's saucer, a drop
or dew) leaves darker wet prints that dry in about half a minute; sticky ones
fade over a minute and a half. A foot carries only a little: the first steps
off the food print clearly, the next fainter and then only now and then, and
after ten or so it is clean, until it walks back into food. Sugar and crumbs
are dry and leave nothing. There are none on a drink, a head of foam or
anything drawn rougher than the fly feels it, and they stay behind when the
fly is carried somewhere else. They are only drawn: the fly doesn't taste or
feel its own prints, they aren't food, and nothing about them reaches its
brain.

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

It plays as well with a finger, a mouse or trackpad, a keyboard or a game pad
as with the remote. Your hand is a glowing ring on the table; until you move
it, it waits just in front of the fly's mouth, and it drifts back there 15 s
after you last did. The ring answers the hand: using a tool presses it in and
it springs back, holding Tickle or Blow keeps it in a little, and a press it
can't act on (the ball still in the air, Up past the last kind) shakes it.
Food that lands sets a faint ring spreading round it. None of this is in the
fly's world.

| On the remote | Does |
| --- | --- |
| Swipe on the touch surface | Moves your hand across the table. |
| Left / Right | Picks a tool from the shelf. |
| Up / Down | Picks the tool's kind: which food, how hard to blow, the time of day, the weather, the camera. |
| Select | Uses the tool: drops food, throws the ball. Hold it to tickle or blow. On Light, Weather and View it steps round the choices. |
| Play/Pause, or Back | The menu. Play/Pause, or Play on it, carries on. |
| Back on the menu | Leaves the app. |

Pointing, the screen itself is what you press, and there are no button hints:

| | With a finger | With a mouse or trackpad |
| --- | --- | --- |
| Your hand | Where you touch the table. Touching the fly is touching the fly, not the table behind it. | Under the cursor, on whatever it is over (the cursor is hidden there: the ring is the cursor). |
| Feed, Swoop | Tap where you mean. | Click there. |
| Tickle, Blow | Touch and hold, and drag: the feather strokes the fly while you hold it on it, and rests on it lightly while the hand is there; the puff follows the finger. | Hold the button, and drag. Hovering over the fly rests the feather on it. |
| Light, Weather, View, Place | The arrows either side of the tool's label (or a tap on the label, or a swipe along it) step its kind; tapping the tool again does too. Place has a Go button for somewhere the fly isn't. | The same, or the wheel over the label. |
| Closer and farther | Pinch. | The wheel, a trackpad's scroll up and down, or its pinch. |
| Round the fly | Drag anywhere but with the feather or the air in hand on the table (they go where the finger goes); or drag with two fingers. | Drag (the same), or drag with the right or middle button anywhere. A trackpad's sideways scroll. |
| The camera back | Double-tap the air. | Double-click the air. |
| Tools | Tap one on the shelf. | Click one; the wheel over the shelf steps along it. |
| Menus | Tap a row, a tab, a choice's arrows; a slider follows the finger. The round button at the top left, or a tap outside the pane, goes back. | The same, and a right click goes back. Hovering only brightens what is under the cursor: the focus ring is the remote's and the keys'. |
| The menu | The round button at the top left. | The same. |

In a browser the keyboard is the remote (arrows, Enter for Select, Escape for
Back, space for Play/Pause), its hints drawn as keys; the number keys pick a
tool, + and − held bring the camera in and take it out, Q and E held turn it
round the fly, and R (or Home) gives it back to the cameraman. After a mouse
or a finger the menus show no focus; the first arrow shows it, on what was
last pressed. A standard game pad (the Gamepad API) is the remote too: A is
Select, B Back, Start Play/Pause, the d-pad and the shoulder buttons the
arrows, the left stick moves your hand (and steps through a menu), the right
stick turns the camera round (pressed in, gives it back), the triggers bring
it in and take it out as far as they are pressed; its hints are drawn as its
buttons. A pad that can
rumble (`apps/web/src/haptics.ts`) is felt in the hand: a tick when food is
dropped and a softer one when it lands, a swell as the ball dives, two quick
knocks when a press can't do anything, light pulses while the feather is on
the fly, a low one while you blow, and a knock when the fly takes off. A
phone that can vibrate (Android) buzzes for the same; the iPhone and iPad app
plays its own haptics. Settings → Picture → Rumble turns the pad and Android
rumble off; it starts on and is kept between launches. It is never felt in
the screensaver. The hints always
show the thing last used, and the screen hides the system's cursor, text
selection, long-press menus, pull-to-refresh, double-tap and pinch zoom,
and scrolling.

The tools are **Feed** (sugar, honey, raspberry, water), **Swoop** (a dark
beach ball dives at the spot and veers away), **Tickle** (a feather: resting on
the fly is a light touch, holding Select strokes it), **Blow** (gently or hard,
from where you sit toward the spot), **Light** (now, which follows the clock,
or morning, midday, golden hour, dusk, night), **Weather** (now, which
follows the forecast, or clear, overcast, mist, rain), **View** (close up, follow, wide, the whole table, from above,
through the fly's eyes, and inside it, close up with the fly as glass; Up
brings the camera in, Down takes it out) and
**Place** (where it lives; Up and Down choose, Select carries it there). On
the shelf the four that act on the fly stand apart from the four about its
world and the camera; Left and Right go along all of them. Hints in the
corners show what the buttons do, until they have been used: the shelf's goes
once you have gone along it, and what Select does with a tool once you have
used it (held it, for Tickle and Blow), on later launches too. The way to the
menu, and how to move your hand while it waits by the fly, always show.
Turning Settings → Picture → Button hints off and on again brings them all
back. A caption at the top says what the fly is doing.

A launch starts on Feed with sugar, so that one press of Select gives the fly
something to find. It comes back to the view last chosen (but never through
the fly's eyes, which would open on no fly at all), and to a time of day or a
weather chosen in the last six hours; after that it is back on Now, so the
screensaver follows the clock again.

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
loading screen and the menu it keeps the fly small and to the left, clear of
them.

You can take the camera from the cameraman. Closer and farther is one smooth
range, from the facets of the fly's eyes out to the whole table (where it
turns from the fly to the table's middle); the named views are points on it,
and the View tool names the one it is nearest. It stays wherever you leave it.
Turned round the fly, it stays where you put it for five seconds after you let
go; then the cameraman carries on from there, moving only when it would have
anyway. A mouse or a trackpad orbits it freely instead: turned round the fly,
up or down, or brought in or out, it stays just where you put it, however the
fly turns, until you give it back; each click of a mouse wheel eases in, so a
turn of the wheel is one smooth move. Handed back (R, a double click or tap in
the air, the pad's right stick pressed in), or a view chosen on the View tool,
the cameraman takes it at once, at the named view nearest your zoom or the one chosen.
The screensaver takes it too, and gives your zoom back after.

After 30 seconds with no press (Settings → Screensaver: 15 s to 5 min, or never)
the hints, the shelf and the pointer fade, and the camera settles beside the
fly and follows it: the screensaver. A mouse resting on the desk doesn't keep it
away, and a nudge of the desk doesn't end it; a mouse moved as if meant does.
Its camera can take long slow shots of the
fly from one angle after another instead (Calm), or change them more often
(Lively). Any press, touch, tap, click, key or deliberate move of the mouse
brings the controls back and does nothing else.
A small picture of what the fly's eyes see sits in a corner of the screensaver
(Settings → On screen → Fly POV: off, in the screensaver, or always, the default, which keeps it in
the top right while you play too), and under it a picture of its nervous
system at work (Nervous system, the same choices). Each time the screensaver
moves on to a new shot, and at least once a minute, they fade out and come
back together in the next corner, so none is left in one place long
enough to mark an OLED screen. The corners aren't chosen: a picture pinned
to one would sit there for hours in a screensaver, its glass edge and its
words the sharpest, brightest things on screen, which is how an OLED screen
is marked, and keeping them moving costs nothing. Instead Size (small,
medium, the default, or large) and Opacity (solid, the default, soft or
faint, which also dims them for the screen) set how much of the screensaver
they take.

**Stats** (`apps/web/src/stats/`; On screen → Stats, off by default, then
Stats of: its brain, its day, both, or in and out) is a small panel of numbers, each a
figure and a word: the brain's spikes a second, neurons active and speed
against real time (from the brain's meter), under
a trace of its last twenty seconds; and, headed by what the fly is doing now
(the HUD's caption, so it can be read in the screensaver too), its day: how far
it has walked, its meals, its take-offs, and its time flying and grooming.
The day is counted from what the fly's life did (`life.ts`: its legs' steps
on its feet, a meal from its first taste, each leap into the air, each
second it was flying or grooming), once each, kept across launches as
`flies.day` and begun again at midnight. The panel sits across the screen
from the other pictures, at the same edge (at the top left while you play),
and moves round with them; on a screen too narrow for that, under them; its
cells two to a row on a narrow screen, and its brain beside its day on a
short one. In and out, also headed by what the fly is doing, is a bar for
each sense going into the brain as the body sends it (a loom at either eye,
touch, either antenna, wind, sweet, weight on its legs, a male's taste on
its front legs, and the light, the mean over every facet), and its hunger, and for each
command coming out (walk, steer, back up, escape, wings, groom, feed, sing),
with the firing rate of the neurons each is read from (DNg100, the two DNa02s,
MDN, DNp01, the flight motor neurons, DNg12, MN9, pIP10) in Hz: the senses beside the commands, under them on a narrow
screen, or split in two on a short one. It is drawn again only when a figure
or a bar it shows changes, at most four times a second.

There is one menu: the title at launch, and the same menu from play (Back,
Play/Pause, or the button at the top left), with the fly living on behind it.
It has **Play**, **Watch** (the screensaver straight away), **About**, and
**Settings**: a row of tabs over each part of the game, every setting two
steps from the menu and none scrolling: **Screensaver** (when it starts, how
its camera films, where the fly lives, and, on an Apple TV that can tell,
the real weather), **On screen** (everything that can show over the world:
what it sees, its nervous system and its stats in the corners, what the
stats are of, the corners' size and opacity, and the X-ray), and **Picture**
(pixel size, the eyes' detail, button hints, rumble, frame stats). In a browser it
also has **Online**, rooms shared with others. The menu never scrolls
either: on a screen too short for its rows (a phone on its side) they are
in two columns, Left and Right going across, Up and Down along the list as
ever. Where the settings' tabs are too
narrow to read (the smallest phones), they are one choice, the tab shown
between arrows.

## The fly's senses

Each frame `packages/body/src/senses.ts` works out what the body feels and
`apps/web/src/life.ts` hands it to the brain:

| Sense | From |
| --- | --- |
| `light` | When the brain has eyes (`BrainDriver.eyes`) and they're on: the brightness along each facet (below). Then no hand-wired looming is sent. |
| `loomLeft`, `loomRight` | Only when the brain has no eyes: how fast anything (the ball, the bubbles) grows in each eye, from its angular size frame to frame. Nothing below 0.8 rad/s or smaller than 0.08 rad; full at 4 rad/s. Held 80 ms, fading over 200 ms. |
| `touch` | The feather: 0.4 resting on the fly, 1 stroking. A soap bubble bursting on it: 0.3. Another fly pushing against it (at a table with others): 0.3. A raindrop landing on it: 0.25 (in light rain about one every 40 s, a rate chosen for a fly in drizzle, not measured). A falling leaf brushing it: 0.4. Hitting something in the air: full at 400 mm/s. Eases out over 0.3 s. |
| `bumpLeft`, `bumpRight` | Each antenna's tip, just ahead of the head and to its side, pressing into anything taller than a step, another fly's body, or past the table's edge. It drives that antenna's Johnston's organ neurons that sense a push (zones C and E). |
| `wind` | Its own speed through the air (its velocity less the air's: a puff, a gust, or flying, or falling), full at 1 m/s. A gust at the picnic blows 0.2 to 0.6 m/s over the table for 4 to 10 s. |
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
that a hungry one stops to eat (sweetness 0.4, as the bar's beer foam: 3 flies
in 20 start to feed, against 20 in 20 starved), takes strong sugar less
eagerly and leaves a little more of it, and walks about a third less.

The crop fills with what it eats and empties by half every minute (an hour,
over 60), and the abdomen swells with it: up to 12% wider and deeper and 5%
longer, round numbers chosen to be seen. Another player's fly at a table
doesn't show it: the crop isn't sent to the room.

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
  air it is drawn back inside 360 mm of the middle and below 320 mm.
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

The caption ("Walking", "Eating honey", "Grooming", "Flying") names what the
body is doing on the brain's commands; the stats' In and out shows the
commands and the neurons themselves.

## Flight

A swoop that fires the giant fiber makes the fly jump and fly: up for a second
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
change no flight; and without the floor every take-off is the same hop with
them as without. They don't make the reflex any less needed, and its floor
stays as it was. Measured in Node on the real connectome, the swoop thrown as
`apps/web/tests/swoop-escape.test.ts` throws it (eyes open, seeds 1 to 4, 8
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

Every take-off with the eyes open is a flight of 1.5 to 1.6 s, 375 to 407 mm
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
is in the air the eyes refresh every frame: the looming detectors answer how
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
model's eye, 80–100 µm of photoreceptors under the lens. Nerves follow the
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

**What stays dark, and what it can't show.** The retina, smell and the legs',
wings and thorax's and abdomen's sensory neurons never fire in this model (the
light enters one synapse in, at the lamina; there is no sense of smell; of
the body's senses only touch and the legs' load are driven): they are drawn,
and stay dark. The mushroom body, lateral horn, superior protocerebrum,
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

## The frame

On the Apple TV the game renders 640×480, laid out for 16:9 (the picture is
squeezed into the 4:3 buffer and stretched back out), with no antialiasing and
a pixel ratio of 1. Elsewhere (`apps/web/src/display.ts`) the frame takes the
screen's shape with square pixels and the same number of them, 640×480 =
307,200: 739×416 in a 16:9 window, exactly 640×480 at 4:3, 376×815 on a phone
held upright, 853×360 on an ultrawide. So the pixels are as chunky for the
size of the screen as on the TV (each covers about the same area of it), the
GPU fills as many, and nothing costs more for the shape. Settings → Picture →
Pixels renders the world at a half or a third of the frame each way (on the
TV 320×240 or 214×160) under crisp menus at the frame's own size. Resizing or
turning the screen lays the frame and every layout out again at the start of
the next frame; nothing in the world is built again.

The shots are framed for 16:9. On a wider screen the camera keeps their
height and sees more to the sides; on a narrower one it keeps seven tenths of
the extra height as field of view (`camera.ts`, `fieldOfView`), so on a phone
held upright the fly is about two fifths of the screen across in Follow (on
the TV, a quarter of its width) rather than a quarter (keeping the TV's width,
a small fly in a great deal of sky and table) or a half (keeping its pixels,
too big to turn round in). The whole table keeps its width, so it always
fits. Playing on a short screen, where the shelf and the label take more of
the height, the fly is raised clear of them and drawn a little smaller
(`ui/layout.ts`, `playRoom`). Every layout (the shelf, the hints, the
caption, the fly's-eye picture and the corner one, the title, the menus,
About) is worked out from the frame in design units (480
to the shorter side, and at least 1.25 CSS pixels on a touch screen, so that
a finger has room) inside the screen's safe area, and comes out exactly where
it always was on the TV.

The backdrop (sky, clouds, hills, lollipop trees, lawn, daisies,
lake) and the table are two passes with their own depth ranges. Static things
are merged by material into a handful of meshes with vertex colours and frozen
matrices (the crumbs, pips and saucer go into those too, and the small things'
contact shadows are one merged mesh); seeds, sugar grains, dew, trees,
daisies, clouds, bubbles, fireflies, puffs and food are instanced. Rain is
three draws, only while it rains: the streaks (one quad a drop, placed and
moved entirely in the shader from the time), the splashes (a pool of 56, each
a ring and a crown of droplets, one instanced draw) and the beads on the fruit;
the table's own beads and puddles are in its shader, as many as there are
pixels for. The ripple round food that has just landed is one draw for under
a second. Each visitor is one draw while it is about, the gull's shadow is
in the table's and the fly's own shading, and nothing is allocated per frame.
The footprints are one instanced draw while any are left (at most 128, two
triangles each), multiplied into what they lie on, so they need no light; a
print is written only when a foot is set down, and fades in the shader.
Menus and hints are one 2D canvas drawn over the frame,
uploaded only when something on it changes (at most 30 times a second; the
in-game shimmer at 10).

Measured in Chromium on an M-series Mac (Settings → Picture → Frame stats shows it live,
and the canvas's `data-calls`, `data-triangles`, `data-frame-ms` and
`data-eyes-ms`): playing, 23 draws and about 106,000 triangles a frame (in
rain 26 and 118,000, and about 0.07 ms more JavaScript; with a butterfly, a
ladybird, a falling leaf, the gull, the boat and a drop of juice all about at
once, a draw for each in view and 0.04 ms; with footprints, one more draw
and at most 256 triangles, and about 7 µs of JavaScript a frame in V8's
interpreter); on a
frame the eyes refresh, about 70 draws and 280,000 triangles (the most the
end-to-end run sees is about 85 draws and 300,000), the eyes' own part about 45
draws and 1.5 to 2.5 ms (mostly the read-back). JavaScript per frame about 1 to
2.5 ms in the browser. The corner picture of what it sees (in the screensaver,
or always) is one more draw (its panel and every facet are instances of one
quad, drawn with the menus) and about 3,500 triangles, with no measurable
JavaScript. The X-ray is one more draw (the nervous system: one mesh, posed by
the body's joint uniforms, its glow a uniform array of 24 vec4s, a float for each of its 93 parts) and about
16,000 triangles; the panel one more draw (the same geometry, its backdrop the
first two triangles) and the same triangles; JavaScript per frame within the
noise of none (the glow, the X-ray's easing and the corners together are
about 12 µs a frame in V8's interpreter alone). The end-to-end test fails above 150
draws or 500,000 triangles. Physical Apple TV measurements and the unattended
soak command are in [docs/apple-tv.md](docs/apple-tv.md).

In a browser the game watches its own pace (`apps/web/src/quality.ts`): frames
falling behind, or the brain running slower than real time, and it draws less
(the eyes' finer detail, then 30 frames a second, then bigger pixels, then the
eyes refreshing half as often, then bigger pixels still), never more than
Settings asks for, and never at the brain's expense. `docs/web.md` has the
measurements. On the Apple TV it is drawn as it always was.

## Remote and host

The game reads the remote only as `packages/contracts/src/remote.ts` describes,
and sets `window.__flyAtRoot` while on the title (or loading), where Back
leaves the app. A host that wraps the web build (the iPhone and iPad app)
shows it edge to edge and says what its notch and home indicator cover by
assigning `window.__flySafeArea` (`packages/contracts/src/screen.ts`) and
dispatching a `resize`; otherwise CSS `env(safe-area-inset-*)` says. Arrow presses that arrive during a fast swipe are taken as the
swipe's and ignored. In a browser the brain is `packages/brain` in a Web Worker
(`apps/web/src/brain/worker-driver.ts`), fed the connectome in its wire form
(`apps/web/src/brain/wire.ts`: 14 MB gzipped where plain gzip makes 21),
which `apps/web/src/brain/download.ts` fetches with its bytes counted, keeps
in the browser's cache and checks against the digest the build recorded
(`scripts/webBuild.ts`; the dev server serves the same file). The page sleeps
while hidden, holds the screen awake while it is the screensaver, and recovers
from a lost graphics context (`apps/web/src/page.ts`); `docs/web.md` has the
rest. On the Apple TV it is `globalThis.__native.brain`
(`apps/web/src/brain/native-driver.ts`), which allocates nothing per frame.
The settings, the shelf's kept choices and what the hints have taught are in
`localStorage` (`apps/web/src/settings.ts`); from a save made by another
build, or a broken one, only what this build can use is kept.

## Tests

`npm test` runs, without a browser: the clocks' hands (where they point at
given times, in any time zone, moving on smoothly); the sky by the clock (each
palette at its hour, nothing jumping minute to minute through a whole day, the
sun up by day
and the moon by night, or a lamp's light on and still through the night, for
every place's palettes and an indoor-like set; a room sees less of the
weather); the
weather (the same forecast for the same hour, changing slowly over a month,
every kind over two months with clear the commonest, mist only in the morning
and rain only under cloud, wetting and drying); the weather outside
(WeatherKit's conditions to the game's weathers, snow and thunder to the
nearest; the real sunrise and sunset on the clock's day for long and short
days, a sunset before the clock's, polar day and night, never jumping; easing
in and out, too old an answer, turning it off, one kept from the last run, and
feeding it in a browser); the pacing of the picnic's
goings-on (none while the remote is in use, never two close together, each
about as often as it should be); the world's standing, bumping, ray and food
queries, round and rectangular tops, and becoming another place; every place
(the fly starts standing, its food can be tasted where it lies, every time of
day, every shot keeps the camera out of everything with the fly in view); the body's thresholds, motion, collisions, falls, flight, landing,
wall turning and mouth alignment; every sense; the facet layout, cube mapping
and resampling; both brain drivers against fakes and the worker's host (a
stalled brain fails, a page asleep for an hour doesn't count, each failure
says what it is, trying again carries on); the connectome's wire form (byte
for byte back however it arrives, and damaged, cut-short or foreign data
refused); the brain's download (bytes counted, each part kept and taken from
the cache next time, a broken part resumed, a host that ignores ranges, a page
closed halfway, missing, offline, damaged, a full storage, no Cache API); how
much picture the device can afford (stepping down and back up with growing
patience, a slow brain given cheaper pictures only if they let it keep up,
noise not mistaken for help, hidden time and a reset not counted); the web build itself
(nothing fetched from another site, relative paths, hashed names, the
manifest, the service worker's list, the brain in parts of a few MB); the
brain meter; the menu kit's focus, values, scrolling and navigation; what is
kept between launches (the settings, the shelf's choices and what the hints
have taught come back as saved, old and broken saves fall back to the
defaults, the light and the weather only for six hours, never the fly's eyes),
which hints show once something has been used, and the settings' pages
(every setting on one page, a step from the top, none scrolling); the
camera (the fly's size on screen in each view, kept in the picture through a
long wandering walk and a jump, never inside anything, never jumping); the
corner pictures (when what it sees and its nervous system show, their way
round the corners together, stacked and never overlapping, clear of the
hints, every facet a dot inside its picture); the nervous system (every
region drawn and every part lit by exactly one, on its own side and in its
role's colour; a glow is its rate on its region's scale and rises and falls
as it should; the X-ray only where it's asked for and the fly is big enough;
the brain inside the head and the cord on the thorax's floor, the nerves
inside the legs in every pose; nothing allocated per frame); the
bubbles (low ones mostly pass the fly, pop on surfaces without settling,
keep coming, and burst on the fly and are felt);
that the crumbs, pips, strawberry and saucer can be walked over, and the
lemonade's lid and straw are drawn where the fly stands; at the windowsill the
banana, the bowl, the basil's saucer and its crown, the alarm clock and its
bells, the honey jar and the finds from the beach, with the glass a wall and
a ledge at its foot, and no hollow where a falling fly could be caught; that
the bar's clock is out of reach and seen over the counter from anywhere on
it; that the ball comes over what is in its way, and round a window.

`npm test` also checks the frame at every shape (the pixel count, the design
units, the safe area), every layout at eleven shapes (inside the safe area,
nothing overlapping, a finger's room for every target drawn, the TV's numbers
unchanged), the menu kit's hit map and its pointer operations, the gestures
(a tap, a drag, a pinch, the wheel, a mouse moved as if meant), which device
is in hand, the keyboard's and the pad's buttons, what a pointer on the screen
points at in the world, and the camera's framing at every aspect, held and let
go.

`npm run e2e` plays the game with the real brain: the title
appears once the brain wakes, the menus and the settings' tabs are walked with
the keys (the first arrow only showing the focus), honey is tasted and eaten,
the ball is thrown until the fly takes off, Play/Pause and Back open the menu
and carry on, the screensaver comes and goes with what it sees in a
corner, with its nervous system under it (and, set to always, they stay while
playing but not over View → Fly's eyes or the menu), the X-ray comes in
the follow shot, goes in the wide one and comes with View → Inside it, the fly is carried to every place, the weather
outside, fed as the Apple TV would give it, is what "Now" shows until it is
too old, Back reaches the root, a reload finds the settings, the view, the
light and the weather as they were left, the shelf on Feed and the hints for
what was used gone, and the frame stays within its draw budget. Then
`apps/web/e2e/pointer.e2e.ts` plays it with fingers on a phone with a notch
(the menus and the shelf tapped, honey dropped and eaten, the feather and the
puff held on the fly, a pinch, a look round that stays a while, the phone
turned on its side, the screensaver woken by a tap that does nothing else) and
with a mouse and keys on a desktop (hovering moves no focus, the wheel zooms
smoothly and stays, drags with each button turn the camera without dropping
food and it stays where it was put, R and a double click give it back, a trackpad's pinch and + zoom too). Then it builds the site and serves it from a folder of a static
server (`apps/web/e2e/web.e2e.ts`): a first visit on a slow connection that
breaks off partway counts the brain's bytes and carries on from the break, a
second loads with the network off, a hidden tab sleeps and wakes without a
jump, the screensaver holds the screen awake, a lost graphics context comes
back, losing the network on a first visit and a browser without WebGL 2 each
say so, and nothing is asked of any other site. A browser has no weather outside: scripts
feed it with `__fly.outside.feed({...})` (`OutsideConditions` without its
`source`, or `null` to take it away; `node scripts/play.ts eval:...`), and the
canvas's `data-weather-from` (`outside`, `forecast` or `chosen`),
`data-sun-from` (`outside`, `clock` or `chosen`), `data-outside` (the
service's state: `none` without one, `off`, `fed`, `locating`, `fetching`,
`ok`, `denied`, `no-location`, `offline`, `unauthorised`, `failed`) and
`data-outside-age` (seconds) say where the weather comes from and how old it
is. `node scripts/play.ts` drives and screenshots the game step by step (see
the comment at its top); `node scripts/measure.ts` measures it on a throttled
CPU and in other browsers, and `npm run soak:web -- --built` leaves it running
for a long time, moving between places, watching what it holds on to.

Longer headless body and real-brain soaks run with `npm run fuzz`. See
[the fuzzing guide](docs/fuzzing.md) for seeds, duration, place selection,
invariants, failure replay and open design cases.

## Credits

The wiring, and the shapes its nervous system is drawn with, are the
[FlyEM male CNS connectome](https://male-cns.janelia.org/)'s (Janelia
Research Campus, CC-BY 4.0). The neuron model follows Shiu et al.,
"A Drosophila computational brain model reveals sensorimotor processing",
Nature 634 (2024).
