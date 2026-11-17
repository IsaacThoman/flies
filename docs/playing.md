# Playing

[Documentation index](../README.md#documentation).

Online works on the browser and Apple hosts; see [joining and hosting rooms](online.md#playing).

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
as with the remote. Your hand is a glowing ring on the table; until you move
it, it waits just in front of the fly's mouth, and it drifts back there 15 s
after you last did. The ring answers the hand: dropping food, throwing the ball or starting Tickle or Blow presses it in
and it springs back; holding Tickle or Blow keeps it in a little, and a press it
can't act on (the ball still in the air, Up past the last kind) shakes it.
Food that lands sets a faint ring spreading round it. None of this is in the
fly's world.

| On the remote | Does |
| --- | --- |
| Swipe on the touch surface | Moves your hand across the table. With View in hand, turns the camera round the fly and up or down instead. |
| Left / Right | Picks a tool from the shelf. |
| Up / Down | Picks the tool's kind: which food, how hard to blow, the time of day, the weather, the camera. |
| Select | Uses the tool: drops food, throws the ball. Hold it to tickle or blow. On Light, Weather and View it steps round the choices. |
| Play/Pause, or Back | The menu. Play/Pause, or Play on it, carries on. |
| Back on the menu | On Apple TV, leaves at the root. In the browser, returns to play after play has begun. |

Pointing, the screen itself is what you press, and there are no button hints:

| | With a finger | With a mouse or trackpad |
| --- | --- | --- |
| Your hand | Where you touch the table. Touching the fly is touching the fly, not the table behind it. | Under the cursor, on whatever it is over (the cursor is hidden there: the ring is the cursor). |
| Feed, Swoop | Tap where you mean. | Click there. |
| Tickle, Blow | Touch and hold, and drag: the feather strokes the fly while you hold it on it, and rests on it lightly while the hand is there; the puff follows the finger. | Hold the button, and drag. Hovering over the fly rests the feather on it. |
| Light, Weather, View, Place | The arrows either side of the tool's label (or a tap on the label, or a swipe along it) step its kind; tapping the tool again does too. Place has a Go button for somewhere the fly isn't. | The same, or the wheel over the label. |
| Closer and farther | Pinch. | The wheel, or a trackpad's pinch. |
| Round the fly | Drag anywhere but with the feather or the air in hand on the table (they go where the finger goes); or drag with two fingers. | Drag (the same), or drag with the right or middle button outside the HUD. A trackpad's two-finger scroll, round and up or down. |
| Back to Follow | Double-tap the air. | Double-click the air, or R. |
| Tools | Tap one on the shelf. | Click one; the wheel over the shelf steps along it. |
| Menus | Tap a row, a tab, a choice's arrows; a slider follows the finger. The round button at the top left, or a tap outside the pane, goes back. | The same, and a right click goes back. Hovering only brightens what is under the cursor: the focus ring is the remote's and the keys'. |
| The menu | The round button at the top left. | The same. |

In a browser the keyboard is the remote (arrows, Enter for Select, Escape for
Back, space for Play/Pause), its hints drawn as keys; the number keys pick a
tool, + and − held bring the camera in and take it out, Q and E held turn it
round the fly, W and S up and down, and R (or Home) takes it back to Follow's distance and height. After a mouse
or a finger the menus show no focus; the first arrow shows it, on what was
last pressed. A standard game pad (the Gamepad API) is the remote too: A is
Select, B Back, Start Play/Pause, the d-pad and the shoulder buttons the
arrows, the left stick moves your hand (and steps through a menu), the right
stick turns the camera round and up (pressed in, back to Follow), the triggers bring
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
show the thing last used, and the screen hides the system's cursor over the world and in the
screensaver, using arrow, pointing or grabbing cursors elsewhere. It suppresses text
selection, long-press menus, pull-to-refresh, double-tap and pinch zoom,
and scrolling.

The tools are **Feed** (sugar, honey, raspberry, water, and Clear dropped, which
removes your offerings, including those still falling, leaving the place’s own food), **Swoop** (a dark
beach ball dives at the spot and veers away), **Tickle** (a feather: resting on
the fly is a light touch, holding Select strokes it), **Blow** (gently or hard,
from where you sit toward the spot), **Light** (now, which follows the clock,
or morning, midday, golden hour, dusk, night), **Weather** (now, which
follows the forecast, or clear, overcast, mist, rain, heavy rain, thunderstorm, snow, sleet), **View** (close up, follow, wide, the whole table, from above,
through the fly's eyes, and inside it, close up with the fly as glass; Up
brings the camera in, Down takes it out) and
**Place** (where it lives; Up and Down choose, Select carries it there). On
the shelf the four that act on the fly stand apart from the four about its
world and the camera; Left and Right go along all of them. Hints in the
corners show what the buttons do, until they have been used: the shelf's goes
once you have gone along it, and what Select does with a tool once you have
used it (held it, for Tickle and Blow), on later launches too. The way to the
menu stays visible. With hints enabled, a remote or pad also teaches hand
movement until that lesson is learned; it is kept between launches.
Settings → Picture → Hints controls whether this teaching is shown. A caption at the top says what the fly is doing.

A launch starts on Feed with sugar, so that one press of Select gives the fly
something to find. It comes back to the view last chosen (but never through
the fly's eyes, which would open on no fly at all), and to a time of day or a
weather chosen in the last six hours; after that it is back on Now, so the
screensaver follows the clock again.

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

One rule keeps it out of things. When something comes between the fly and
the camera, or the camera would be in it or so near it that the edge of the
picture cuts into it, the camera comes in along its line of sight until it
isn't, quickly but smoothly, looking a moment ahead of where your turn and the
fly are taking it, so it is in front of a bottle before the bottle is in the
way. Once the way has been clear for a moment it goes back out, gently. Where
coming in would bring it nearer than you can zoom, down in a bowl or on a
slope, it looks from a little higher instead, as little as opens the way, and
comes back down to where you had it once it can. It never turns round
anything. An obstruction that outruns the
smoothing can pull the camera inward immediately during collision recovery.

The View tool's views are places on the same orbit, reached over a moment.
Follow is nominally 11 mm out, low over the table. A historical TV-sized
reference put the fly about 170 pixels long, Close up about twice that size
and Wide about a third (capture date, machine and pose unknown); framing
depends on aspect and obstruction correction. Whole table goes out
to the whole place, to the side the screensaver films it from; From above
looks down from behind the fly. Each sets only how far out and how far up
(and those two, which way round); you can turn and zoom from there at once,
and the View tool names the view you are nearest. R, a double click or tap in
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
the hints, the shelf and the pointer fade, and the camera settles beside the
fly and follows it: the screensaver. A mouse resting on the desk doesn't keep it
away, and a nudge of the desk doesn't end it; a mouse moved as if meant does.
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
touch, either antenna, wind, sweet, bitter, water, weight on its legs, a male's taste on
its front legs, wingbeat, and the light, the mean over every facet), and its hunger, and for each
command coming out (walk, steer, back up, escape, wings, groom, feed, sing),
with the firing rate of the neurons each is read from (DNg100, the two DNa02s,
MDN, DNp01, the flight motor neurons, DNg12, MN9, pIP10) in Hz: the senses beside the commands, under them on a narrow
screen, or split in two on a short one. It is drawn again only when a figure
or a bar it shows changes, at most four times a second.

There is one menu: the title at launch, and the same menu from play (Back,
Play/Pause, or the button at the top left), with the fly living on behind it.
It has **Play**, **Watch** (the screensaver straight away), **About**, and
## Settings

**Settings**: a row of tabs over each part of the game, every setting two
steps from the menu, with rows scrolling on shorter screens: **Screensaver** (when it starts, how
its camera films, where the flies live, how many, and, on an Apple TV that can tell,
the real weather), **On screen** (everything that can show over the world:
what it sees, its nervous system and its stats in the corners, what the
stats are of, the corners' size and opacity, and the X-ray), and **Picture**
(pixel size, the eyes' detail, Hints, rumble, frame stats). Where it
can be online, the menu has **Online**, rooms shared with others: the game
sits with everyone where the fly lives by default, and Online → Disconnect
plays alone until Go online. The title menu shows all its rows: on a screen too short for its rows (a phone on its side) they are
in two columns, Left and Right going across, Up and Down along the list as
ever. Where the settings' tabs are too
narrow to read (the smallest phones), they are one choice, the tab shown
between arrows.

<!-- docs-check: base apps/web/src -->

<!-- docs-check: base packages/body/src -->

<!-- docs-check: generated packages/brain/data/anatomy.bin -->
