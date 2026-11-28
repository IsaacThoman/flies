# Playing

[Documentation index](../README.md#documentation).

The fly lives at home: alone, in the place it lives, where every launch
finds it. Rooms with others are somewhere you take it, from Online, on the
browser and Apple hosts; see [visiting and hosting rooms](online.md#playing).

**Settings → Screensaver → Flies** chooses one to four (up to three on Apple TV), shown as enamel
dots in the table colours, kept between launches. Each is a whole fly, with
its own brain, body, senses and eyes, and the same fly from launch to launch,
as hungry and as sleepy as it left and, alone, where it stood
([From launch to launch](simulation.md#from-launch-to-launch)); a fly taken
off by a lower count comes back when the count is raised again; they see and meet one another, eat
from the same pantry, feel the place's wind and goings-on where they are,
and the tools and bubbles reach any of them. Movement and activity commands come from their brains; body reflexes and
procedural posing still apply (`apps/web/src/company.ts`). The camera follows the first:
the pointer drifts back to it, and the eyes' picture, nervous system,
stats, X-ray, activity and day's tally are its. Alone with several, it
wears yellow enamel and the others the next colours; a lone fly wears none.
At a table the device gets as many flies as there is room for. An older
Apple TV host that can run only one brain shows no Flies row.

## Controls

It plays as well with a finger, a mouse or trackpad, a keyboard or a game pad
as with the remote, and the controls keep out of the way: while you only
watch, nothing is drawn over the world but the corner pictures you have
chosen. Reach for anything (a press, a touch, the mouse moved as if meant)
and they come back; about 4 s after you last did anything they fade again.
On a touch screen the button for the tray and the menu's stay, faint, so
there is always something to reach for.

Your hand is a glowing ring on the table; until you move it, it waits just in
front of the fly's mouth, and it drifts back there 15 s after you last did.
The ring answers the hand: dropping food, throwing the ball, setting a piece
down or stroking the fly presses it in and it springs back; holding keeps it
in a little, and a press it can't act on (the ball still in the air, a piece
where it won't go) shakes it. Food that lands sets a faint ring spreading round
it. None of this is in the fly's world; the feather, the fingertip, the food,
the ball and the pieces are.

**The hand does what makes sense for what is under it and what it holds**
(`apps/web/src/controls.ts`, `apps/web/src/game.ts`). A launch starts with it
empty. Empty, held on the fly it strokes it with the feather (drawn there
while it does, and felt as the feather's full touch: [the
senses](simulation.md#the-flys-senses)); it never rests on the fly while it
only waits by it. Pressed on a piece you built, it takes it up; held still on
the table, it puts your fingertip down there ([Finger](#the-fingertip)).
Holding something, Select or a tap uses it where the hand is: food is dropped,
the ball dives, a piece is set down (and stays in hand for the next, unless it
was one taken up from where it stood, which leaves the hand empty again), the
camera takes a picture. The feather and a puff are held where the hand is.

**The tray** (`apps/web/src/tools/tray.ts`, drawn by `apps/web/src/ui/tray.ts`)
is everything the hand can take up, out of sight until it is asked for: Play/Pause
on the remote, the space bar or Tab, a pad's Y or Start, or the button at the
foot of the screen, which shows what is in hand. It opens as a ring of
bubbles round the middle of the screen (stretched across into an oval on a
short, wide screen, so each bubble keeps a finger's size), two deep at most:

| In the first ring | Is |
| --- | --- |
| Hand | The empty hand. |
| Food | Sugar, honey, raspberry, water, coffee and bitter sugar (what a fly makes of each is in [the world](world.md#food)). |
| Build | The kit's pieces ([below](#building)). |
| Toys | The feather (resting on the fly is a light touch, held a full one), a breath and a puff of air (gently or hard, from where you sit toward the hand), and the ball (a dark beach ball dives at the spot and veers away). |
| Finger | Your fingertip ([below](#the-fingertip)). |
| Photo | The camera, for the fly's [journal](#journal). |
| Look | The views: close up, follow, wide, the whole table, from above, through the fly's eyes, inside it (close up with the fly as glass) and [Why?](#why). Choosing one leaves the hand as it was. |
| World | The time of day (now, which follows the clock, or morning, midday, golden hour, dusk, night), the weather (now, which follows the forecast, or clear, overcast, mist, rain, heavy rain, thunderstorm, snow, sleet), the place it lives, and clearing what you dropped or built. |

What is in hand, or chosen, is marked pink; the remote's choice is lit, its
name in the middle of the ring, where a tap goes back a ring. Taking anything
closes it; a press anywhere outside it closes it and does nothing else. What
can't be taken here (building on a visit, the sky and the place at a table)
is dimmed. With a finger, each bubble's name is under it. Taken up, a
thing's name shows over the button at the foot for a moment.

| On the remote | Does |
| --- | --- |
| Swipe on the touch surface | Moves your hand across the table. With the camera in hand, or Why? playing, turns the camera round the fly and up or down instead (on Why?, goes back and forth through it). With the tray open, lights what is that way round it. |
| Select | Uses what is in hand; the empty hand takes up the piece it is on. Hold it to stroke, tickle or blow. |
| Left / Right | Turns the camera an eighth of a turn round the fly; with a piece in hand, turns the piece. |
| Up / Down | Brings the camera in, and takes it out. |
| Play/Pause | Opens the tray, and closes it. |
| Back | Out of the fly's eyes, inside it or Why?; then puts away what is in hand; then the menu. With the tray open, back a ring. |
| Back on the menu | On Apple TV, leaves at the root. In the browser, returns to play after play has begun. |

Pointing, the screen itself is what you press, and there are no button hints:

| | With a finger | With a mouse or trackpad |
| --- | --- | --- |
| Your hand | Where you touch the table. Touching the fly is touching the fly, not the table behind it. | Under the cursor, on whatever it is over (the cursor is hidden there: the ring is the cursor). |
| Stroke the fly | Touch it with the hand empty and hold, and drag. | Hold the button on it. |
| Move a piece | Press on it and drag; let go where it should go, or over the buttons at the foot to put it away. A tap takes it up into the hand. | The same with the button. |
| Your fingertip | Touch the table with the hand empty and hold still. | Hold the button still on the table. |
| Feed, the ball, a piece, Photo | Tap where you mean. | Click there. |
| Feather, a puff | Touch and hold, and drag: the feather strokes the fly while you hold it on it, and rests on it lightly while the hand is there; the puff follows the finger. | Hold the button, and drag. Hovering over the fly rests the feather on it. |
| The tray | The button at the foot; tap a bubble. | The same; hovering over a bubble names it. |
| Turn a piece in hand, put away what is in hand | The buttons either side of the one at the foot. | The same. |
| Closer and farther | Pinch. | The wheel, or a trackpad's pinch. |
| Round the fly | Drag anywhere but on the fly or a piece with the hand empty, or the feather, the air or the fingertip in hand on the table; or drag with two fingers. On Why?, the same drag goes back and forth through it. | Drag (the same), or drag with the right or middle button. A trackpad's two-finger scroll, round and up or down. |
| Back to Follow | Double-tap the air. | Double-click the air, or R. |
| Menus | Tap a row, a tab, a choice's arrows; a slider follows the finger. The round button at the top left, or a tap outside the pane, goes back. | The same, and a right click goes back. Hovering only brightens what is under the cursor: the focus ring is the remote's and the keys'. |
| The menu | The round button at the bottom left. | The round button at the top left. |

In a browser the keyboard is the remote (arrows, Enter for Select, Escape for
Back, the space bar for Play/Pause), its hints drawn as keys; in play Tab opens
the tray too (elsewhere, and always with the page's controls for a screen
reader, it moves the browser's focus as ever), + and − held bring the camera in and take it out, Q and E held turn
it round the fly (on Why?, go back and forth through it), W and S up and down,
and R (or Home) takes it back to Follow's distance and height. After a mouse
or a finger the menus show no focus; the first arrow shows it, on what was
last pressed. A standard game pad (the Gamepad API) is the remote too: A is
Select, B Back, Y and Start Play/Pause, the d-pad and the shoulder buttons the
arrows, the left stick moves your hand (and goes round the tray, and steps
through a menu), the right stick turns the camera round and up (pressed in,
back to Follow; on Why?, across goes back and forth through it), the triggers
bring it in and take it out as far as they are pressed; its hints are drawn as
its buttons. A pad that can
rumble (`apps/web/src/haptics.ts`) is felt in the hand: a tick when food is
dropped and a softer one when it lands, a swell as the ball dives, two quick
knocks when a press can't do anything, light pulses while the feather is on
the fly, a low one while you blow, and a knock when the fly takes off. A
phone that can vibrate (Android) buzzes for the same; the iPhone and iPad app
plays its own haptics. Settings → Picture → Rumble turns the pad and Android
rumble off; it starts on and is kept between launches. It is never felt in
the screensaver. The hints always
show the thing last used, and the screen hides the system's cursor over the world and in the
screensaver, using arrow, pointing or grabbing cursors elsewhere. It suppresses text
selection, long-press menus, pull-to-refresh, double-tap and pinch zoom,
and scrolling.

Hints at the foot show the remote's, the keys' or the pad's buttons until they
have been used, on later launches too: Play/Pause for the tray, the arrows for
the camera, a swipe for the hand, and Select (or holding it) for each thing in
hand. The tray's button shimmers until it has been opened, with a pointer too.
Settings → Picture → Hints controls whether this teaching is shown. While the
controls show, a caption at the top says what the fly is doing.

### Building

**Build** sets pieces of a kit down on the table, the sill or the bench
where the fly lives: a blue and a yellow dish (food dropped into one lies in
its well), blue, yellow and red tiles, a crumb, a twig, a leaf, a ramp and a
wall. Taking a piece up brings the camera out (to at least 70 mm and a little
higher) so that something several times the fly's size can be seen where it
goes, and putting it away takes the camera back. A glassy ghost of the piece
shows where it will go, on a grid so that walls meet end to end into a maze or
an arena, and turns red where it won't go (into something, off the edge, onto
a slope, on the fly or on food). Waiting in front of the fly, the hand sets a
piece down just beyond it, as near as it has room. Left and Right (or the
button left of the one at the foot) turn the piece in hand an eighth of a turn,
and the next pieces go down that way. With the hand empty, a piece under it
glows: pressed (or Select), it is taken up into the hand, to go wherever it is
set down next, or back in the kit when the hand is emptied. World → Clear
built takes away everything built there. A place keeps up to 40 pieces,
between launches too, each place its own. Building is for home: on a visit or
at a table the kit is dimmed in the tray, and the pieces are put away until the
fly is home again ([online](online.md#who-owns-what)). The pieces are real to
the fly: it stands on them, walks into them and sees them, and the camera keeps
out of them ([the world](world.md#what-you-build)).

A launch comes back to the view last chosen (but never through the fly's eyes,
which would open on no fly at all), and to a time of day or a weather chosen in
the last six hours; after that it is back on Now, so the screensaver follows
the clock again.

## Why?

**View → Why?** answers "why did it do that?" with what its nervous system
did, and nothing else (`apps/web/src/why/`). The game keeps the followed
fly's last six seconds all the time, 30 times a second: each region's firing
rate as the nervous-system display gets it, the rate of each group of neurons
a command is read from, the commands, every sense as its body sent it, and
what the body did with them. Choosing Why? takes a copy of that and plays it
back at a quarter of the speed, over and over, in a large glass card where
what it sees would be: its nervous system from above, glowing as it did (the
same drawing and glow as the corner panel, [rendering.md](rendering.md#its-nervous-system)),
the In and out bars (as Stats → In and out has them) as they were, and under
them a timeline with a line where the body acted.

What it plays is the most striking thing the body began in those seconds: a
take-off, then feeding, backing up, grooming, singing, a turn either way, and
walking; the latest of the same. Each is the body's own state, so it begins
where the body acted on a command (the take-off where the giant fiber passed
its threshold). Marked on it: that command's row in Out, and rings round the
somata of the neurons the brain package reads it from (DNp01 and the flight
power motor neurons for a take-off, MN9 for feeding, MDN for backing, DNg12
for grooming, pIP10 for song, the DNa02 of the side it turned to, DNg100 for
walking), brighter as they fired, with their rates on the timeline and their
names over it. Marked before it: each sense whose bar rose by a tenth in the
second and a half before, and each region where senses come in (the eyes'
pathway as far as the visual projection neurons, the antennae, the bristles,
the taste organs, the legs' and wings' sensors) whose glow rose by 0.15. The
light (a mean over both eyes, which a ball at one eye hardly moves), hunger
and thirst (which move over minutes) aren't picked; with its eyes open a ball looms in
its eyes' regions, not in the Loom bars, which carry only the loom felt with
them shut. While something is marked, the rest of the drawing glows at 0.35
of what was recorded, so the marked parts stand out; nothing is lit that
didn't fire. If it began nothing in those seconds, it shows what it is still
doing, without a run-up; if it did nothing at all, the last three seconds,
unmarked. That something rose first doesn't say it caused what followed:
Why? shows what came before and what fired.

It pauses nothing: the fly lives on behind the card, and its brain keeps
running. Going through it is the camera's gesture: a swipe on the remote, Q and E, a pad's right stick across, a drag with a mouse or a
finger (to the right, later; a drag the screen's width is all of it); it
holds where it is left for a moment and plays on. Back, or another view,
leaves it at once. Coming back to it takes what is kept then. It is
never kept between launches. It is this device's own: nobody else at a table
sees it, and it sends nothing.

## The fingertip

**Finger** puts your fingertip in the fly's world (`apps/web/src/tools/finger.ts`): a
finger laid along the table, its rounded tip and nail, rising at the knuckle
toward a hand out of the picture, at the fly's scale (15 mm across, a fly 2.5 mm
long). Unlike the ring, it is really there: the fly's eyes see it, its body
bumps into it and stands on it, its antennae feel it as they feel any wall. It
comes in from above where your hand is, pointing at the fly, and is held a
little way up; Select (Enter, A, a click or a tap) puts it down on whatever is
under it, and again lifts it. Moving the hand moves it (a swipe, the left
stick, the mouse, a finger on the screen), as fast as your hand goes. It
stays where you leave it: unlike the ring it never drifts back to the fly,
which would carry a fly standing on it along, or press on one under it. It
never presses into anything: lowered onto the fly it comes to rest on its back
or its head, a light touch felt where it rests (its notum and wings, or that
side's eye: [the senses](simulation.md#the-flys-senses)), slid into it rides up
over it (a full touch), and slid onto a sugar cube or a crumb it rests on that.

Nothing about it steers the fly. A fly walks onto it if its brain walks it
there: on its feet over the finger's skin, it is standing on it. Lifted and
moved, the finger carries whoever stands on it (its feet stay where they
stand: the body's contact with a moving surface), and the fly feels the air
of being carried as wind and sees the world go by through its own eyes. Set
down, it walks off when its brain walks it off; and if it takes off from the
finger, it takes off. Put away (another tool, the screensaver), the finger
sets down where it is and lifts away once nothing stands on it.

One stand-in: the body walks up nothing steeper than 65° (Physics, in
[what the body adds](simulation.md#what-the-body-adds)), where a real fly's
feet climb a finger's side. So the finger's skin flares where it meets what it
rests on, as a pressed fingertip's pad spreads, and is never steeper than 61°:
drawn exactly as it is felt.

What its brain makes of it, measured on the real connectome:

- **Walking onto it.** A fly set down facing the finger, the edge of its tip
  4 mm ahead of its head, walked onto it in 0 of 5, 0 of 5 and 2 of 7 tries
  of up to a minute each, over 5 minutes of its life at 10:00, seeds 1 to 3
  (`node scripts/finger.ts`, its eyes given a ray-cast picture of the
  finger, the table and the sky). Most of that time it rests. A fly stood on
  it by hand in the game walked off 1 to 15 s after it was set down, in six
  runs. Carried on it lifted, in the last three runs it stayed on in 2 of 7
  tries, walked off its edge and fell in 4, and took off in 1
  (`apps/web/e2e/finger.e2e.ts`).
- **Seeing it.** Down in front of it, 6 to 13% of its facets see the finger
  (114 to 225 of 1,772 at midday, in eight runs). Its skin is drawn as skin
  reflects: about 0.6 of red light, a third of green and a quarter of blue
  (Anderson & Parrish 1981), so a fly's outer photoreceptors take 0.32 of a
  white's light from it, as they take 0.31 from real skin. A photograph's skin
  colour, the finger's first, gave them 0.43. In the eyes' picture, skin
  against the picnic table now has a contrast of 0.40, from 0.30 before.
  Real skin on white paint would give 0.58
  ([the eyes](simulation.md#the-eyes)); the picture loses some of it.
- **A fast finger.** Slid along the table at it at 600 mm/s and at 15 mm/s,
  from straight ahead, from its front right (70°) and from its right side
  (90°), three times each, in six runs: it took off in none of the 54 fast
  approaches, nor of the slow. Its looming detectors peaked at medians of
  0.8 to 3.9 Hz either way, and its giant fibre's escape command at 0.05 to
  0.28. The ball, in the same runs, drove them to 5.8 to 9.2 Hz. In this model
  a finger coming straight at its face doesn't startle it at any contrast,
  even black, because the looming detectors that face forward (LPLC2) hardly
  answer here. From its side one can, through LC4, if it is dark enough
  against what is behind it: a 12 mm disc at 600 mm/s and real skin's
  contrast (0.57) took it off for 2 of 6 seeds from its front right, and 0 of
  6 at the contrast skin had in the picture
  (`packages/brain/scripts/fingertip.ts`). Skin on the table, as the game's
  eyes see it, isn't dark enough. With its brain's eyes shut, the tip looms as the
  ball does, fully when fast and 0.26 when slow, and both drove escape to 1
  (`apps/web/tests/finger-loom.test.ts`).
- **Asleep under it.** A fly asleep (01:00, still five minutes), the finger
  held over it and lowered onto it: its round end resting on all of it, it
  was felt on its notum (0.40), its wings (0.08), its eyes (0.10) and the
  front of its head (0.13), and it slept on for the 20 s watched (one run;
  `apps/web/e2e/finger.e2e.ts`, (e)).

At a table with others, the finger is yours alone ([online](online.md#who-owns-what)).

## Camera

The camera in play (`apps/web/src/orbit.ts`) is a plain orbit round the
fly, on three numbers that only you change: how far round it is, how far up,
and how far out. A drag turns it round and up by the same amount for the same
distance dragged, every time, at every zoom, and stops when you stop; it can
go from just above the table to nearly overhead; a trackpad's two-finger
scroll turns it the same way. The wheel or a pinch brings it in or takes it out, from near enough for the fly
to fill the picture to the whole place, and changes nothing else: the fly
remains the tracking target and zoom leaves the field of view unchanged. HUD
layout and aspect changes can offset the target or alter the field of view. The
camera goes along with the fly, a little smoothed so a stride doesn't shake
the picture, but never turns by itself: not when the fly turns, not after a
while, not to find a better side. Where you leave it, it stays.

The camera follows your orbit through scenery. A prop or wall can block the
view of the fly as you turn or zoom past it.

The views in the tray's Look are places on the same orbit, reached over a moment.
Follow is nominally 11 mm out, low over the table. A historical TV-sized
reference put the fly about 170 pixels long, Close up about twice that size
and Wide about a third (capture date, machine and pose unknown); framing
depends on aspect. Whole table goes out
to the whole place, to the side the screensaver films it from; From above
looks down from behind the fly. Each sets only how far out and how far up
(and those two, which way round); you can turn and zoom from there at once,
and Look marks the view you are nearest. R, a double click or tap in
the air, or the pad's right stick pressed in takes an orbit view back to Follow's
distance and height, on the same side of the fly. The screensaver takes the
camera from the orbit and hands back smoothly from its current shot;
the earlier orbit yaw is not restored.

Behind the loading screen and the menu, and in the screensaver, the camera
films the fly by itself (`apps/web/src/cameraman.ts`), like a patient nature
cameraman. It keeps the fly small and to the left, clear of the menu, or in
the middle once the menu has faded; it keeps its place round the fly and
moves only when it has to (the fly has turned its back for more than a
second, something is in the way, or there is fruit or a jar to have behind
it), never crossing over the fly when it can help it. Every move is a
critically damped spring, to smooth its movement; walking it keeps
pace a little ahead, and in a jump it pulls back, widens and whips round
after the fly. Going into play eases from its shot into yours, and out again.

## Screensaver and displays

After 30 seconds with no press (Settings → Screensaver: 15 s to 5 min, or never)
the controls and the pointer fade, and the camera settles beside the
fly and follows it: the screensaver. A mouse resting on the desk doesn't keep it
away, and a nudge of the desk doesn't end it; a mouse moved as if meant does.
The fly stays home, in the place it lives, unless Settings → Screensaver →
Places is Each in turn: then, alone at home, the screensaver carries it on to
the next place after 20 minutes watched in one, and play begins with it
carried home ([The world](world.md)).
Its camera can take long slow shots of the
fly from one angle after another instead (Calm), or change them more often
(Lively), or keep the whole place in view with a slow drift (Whole place).
Activity sets how its day goes: Lively, the default, keeps it about through
the day and the evening and asleep in the small hours; Natural is a male
fly's day, busy round dawn and dusk, with a long midday siesta and the night
asleep ([Sleep and the daily rhythm](../README.md#sleep-and-the-daily-rhythm)).
Recognized game buttons, pointer gestures and deliberate mouse movement
bring the controls back; unrelated keyboard keys need not wake it. The wake
event is consumed, though held inputs can act on subsequent frames.
See [eye-picture details](simulation.md#the-eyes) and
[neural display details](rendering.md#its-nervous-system).

A small picture of what the fly's eyes see sits in a corner of the screensaver
(Settings → On screen → Fly POV: off, in the screensaver, or always, the default, which keeps it in
the top right while you play too), and under it a picture of its nervous
system at work (Nervous system, the same choices). Each time the screensaver
moves on to a new shot, and at least once a minute, they fade out and come
back together in the next corner, reducing how long bright edges stay in one
place; this is not a guarantee against OLED burn-in. The corners aren't chosen: a picture pinned
to one would sit there for hours in a screensaver, its glass edge and its
words the sharpest, brightest things on screen, which is how an OLED screen
is marked, so the overlays move periodically. Instead Size (small,
medium, the default, or large) and Opacity (solid, the default, soft or
faint, which also dims them for the screen) set how much of the screensaver
they take.

## Stats

**Stats** (`apps/web/src/stats/`; On screen → Stats, off by default, then
Stats of: its brain, its day, both, or in and out) is a small panel of numbers, each a
figure and a word: the brain's spikes a second, neurons active and speed
against real time (from the brain's meter), under
a trace of its last twenty seconds; and its day: how far
it has walked, its meals, its take-offs, and its time flying and grooming.
The day is counted from what the fly's life did (`life.ts`: its displacement while
on its feet, a meal when actual eating begins, each leap into the air, each
second it was flying or grooming), once each, kept across launches as
`flies.day` and begun again at midnight. It is the followed fly's: the first
in line, the same fly from launch to launch. The panel sits across the screen
from the other pictures, at the same edge (at the top left while you play),
and moves round with them; on a screen too narrow for that, under them; its
cells two to a row on a narrow screen, and its brain beside its day on a
short one. It retains the values and their units, without repeating the
behaviour caption. In and out is a bar for
each sense going into the brain as the body sends it (a loom at either eye,
touch, either antenna, wind, sweet, bitter, water, smell (the strongest odorant at either antenna), weight on its legs, a male's taste on
its front legs, wingbeat, its legs stepping (the faster side), and the light, the mean over every facet), and its hunger and thirst, and for each
command coming out (walk, steer, back up, escape, wings, groom, feed, sing),
with the firing rate of the neurons each is read from (DNg100, the two DNa02s,
MDN, DNp01, the flight motor neurons, DNg12, MN9, pIP10) in Hz: the senses beside the commands, under them on a narrow
screen, or split in two on a short one. It is drawn again only when a figure
or a bar it shows changes, at most four times a second.

There is one menu: the title at launch, and the same menu from play (Back,
Play/Pause, or the button at the top left), with the fly living on behind it.
It has **Play**, **Watch** (the screensaver straight away), **Settings**,
**Online** (where it can be), **Journal** and **About**.

## Journal

**Journal** (`apps/web/src/ui/screens/journal.ts`) is the fly's pictures,
newest first, each with its date and, for a first, an icon and a word or two
where an icon can't say it (the food, the place, what it walked onto). The
arrows go along and down them, Select opens one big, and there Left and Right
go through them; Down reaches its buttons. With a finger or a mouse, a tap
opens one, a drag or the wheel scrolls, and the arrows either side go through
them.

Two kinds of picture are in it. The player's own, taken with Photo from the tray,
and the fly's firsts, each kept once in its life and pictured as it happens:
its first flight (a second of its wings beating in the air), its first meal of
each food, its first groom (half a second of it), the first time it walks
from one thing onto another, its first escape (its brain's escape command
taking it off), its first sleep, and its first visit to each place. Each is
read from what its life did (`apps/web/src/journal/moments.ts`, from the
same counts and activity the day's tally keeps), never from a guess at how it
felt. A first's picture is taken from a frame already drawn, as the camera
films it then (yours in play, the cameraman's in the screensaver and behind
the menu), within ten seconds of it and only from a frame that shows the fly
well: in front of the camera, clear of the picture's edges, big enough to
see, nothing fading over it. Arriving somewhere, the picture waits three
seconds for the place to be seen. A first with no such frame in time is kept
with its icon instead. Nothing waits on a picture and the camera is never
moved for one: the frame is copied on the GPU and read back later, and made
into a JPEG a millisecond a frame (`apps/web/src/journal/capture.ts`). Your
hand's ring is left out of the frame a picture is taken from, so it blinks
out for that one frame.

The journal is kept on this device and never sent anywhere: not to the room,
not to the other players, who see nothing of it. In a browser and the iPhone
and iPad app it is kept in IndexedDB, up to 240 pictures, the player's at
the screen's own size (up to 960 pixels across); on the Apple TV, which has
only `localStorage` (in `NSUserDefaults`, where tvOS gives an app little
room), up to 16, small (`apps/web/src/journal/store.ts`). When there is no
more room the player's photos go, oldest first; a first loses its picture
only once there are no photos left to go, and never its place in the
journal. A broken save is read for what can be read. Where the host can hand
a picture on, a picture opened big has **Save** (a download) or, on a phone,
**Share** (the system's share sheet, where Save Image is); the player's own
photos also have **Remove**. On the Apple TV the journal is the only place
they are kept. It is the followed fly's, kept by its record's id
([From launch to launch](simulation.md#from-launch-to-launch)): a
companion, or a new fly, has none.

## Settings

**Settings**: a row of tabs over each part of the game, every setting two
steps from the menu, with rows scrolling on shorter screens: **Screensaver** (when it starts, how
its camera films, where the flies live and whether the screensaver goes round
the places, how many, and, on an Apple TV that can tell,
the real weather), **On screen** (everything that can show over the world:
what it sees, its nervous system and its stats in the corners, what the
stats are of, the corners' size and opacity, and the X-ray), and **Picture**
(pixel size, the eyes' detail, Hints, rumble, frame stats). Where it
can be online, the menu has **Online**, rooms shared with others: the fly
is at home, alone, until you take it to visit a room open to everyone, or
to make or join a room of your own, and Online → Go home brings it back. The title menu shows all its rows: on a screen too short for its rows (a phone on its side) they are
in two columns, Left and Right going across, Up and Down along the list as
ever. Where the settings' tabs are too
narrow to read (the smallest phones), they are one choice, the tab shown
between arrows.

<!-- docs-check: base apps/web/src -->

<!-- docs-check: base packages/body/src -->

<!-- docs-check: generated packages/brain/data/anatomy.bin -->
