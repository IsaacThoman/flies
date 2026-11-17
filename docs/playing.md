# Playing

For the places and their weather, see [the world](world.md). For rooms with
others on any platform, see [Online](online.md#playing).

## Controls

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
| Back on the menu | Apple TV leaves the app. In a browser it returns to play once play has begun; at first launch it stays at the menu. |

## Touch, mouse and trackpad

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
| Menus | Tap a row, a tab, a choice's arrows; a slider follows the finger. The round button at the top left, or a tap outside a submenu pane, goes back. Outside taps on the root menu do not dismiss it. | The same, and a right click goes back. Hovering only brightens what is under the cursor: the focus ring is the remote's and the keys'. |
| The menu | The round button at the top left. | The same. |

## Keyboard and game pad

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
dropped and a softer one when it lands, one longer rumble when the ball is thrown, two quick
knocks when a press can't do anything, light pulses while the feather is on
the fly, a low one while you blow, and a knock when the fly takes off. A
phone that can vibrate (Android) buzzes for the same; the iPhone and iPad app
plays its own haptics. Settings → Picture → Rumble turns the pad and Android
rumble off; it starts on and is kept between launches. It is never felt in
the screensaver. The hints always
show the thing last used, and the screen suppresses text
selection, long-press menus, pull-to-refresh, double-tap and pinch zoom,
and page scrolling. The cursor is hidden over the world, but menus, HUD
buttons and orbit drags use their own system cursor shapes.

## Tools

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
menu and moving your hand are not permanently learned away; they still
depend on Button hints, the device and the HUD being visible.
Turning Settings → Picture → Button hints off and on again brings them all
back. A caption at the top says what the fly is doing.

A launch starts on Feed with sugar, so that one press of Select gives the fly
something to find. It comes back to the view last chosen (but never through
the fly's eyes, which would open on no fly at all), and to a time of day or a
weather chosen in the last six hours; after that it is back on Now, so the
screensaver follows the clock again.

## Camera

The camera (`apps/web/src/camera.ts`) works like a patient nature cameraman.
In Follow the fly is about 170 pixels long, seen from low down and a little
behind its side, with the table, the fruit or the place's view (the picnic's lake) behind it; Close up is
about twice that, Wide about a third. It keeps its place round the fly and
moves only when it has to (the fly has turned its back for more than a
second, something is in the way, or there is fruit or a jar to have behind
it), never crossing over the fly when it can help it. Ordinary tracking uses critically damped springs; cuts, manual yaw and
emergency collision correction can be immediate. Obstacle feelers usually bring
it in over several frames and let it out more slowly once the way stays clear. Walking, it keeps
pace a little ahead, and in a jump it pulls back, widens and whips round
after the fly. Collision checks try to keep it outside solids, taking precedence over
the desired shot distance; in tight spaces it can come much closer. With the ball in hand it goes round to the side across the
fly from where the ball will come, so the dive is seen past the fly. Behind the
loading screen and the menu it frames it around the title/menu layout: small and left on wide screens,
more central on tall ones.

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

## Screensaver and corner pictures

After 30 seconds with no press (Settings → Screensaver: 15 s to 5 min, or never)
the hints, the shelf and the pointer fade, and the camera settles beside the
fly and follows it: the screensaver. A mouse resting on the desk doesn't keep it
away, and a nudge of the desk doesn't end it; a mouse moved as if meant does.
Its camera can take long slow shots of the
fly from one angle after another instead (Calm), or change them more often
(Lively). A bound press, tap, touch or deliberate mouse move brings the controls
back. One-shot presses and pointer taps are consumed; held Select or camera
axes can act immediately on waking. When the title menu fades into the
screensaver, the fly eases into the middle of the picture; play-only corner
pictures stay hidden.
A small picture of what the fly's eyes see sits in a corner of the screensaver
(Settings → On screen → Fly POV: off, in the screensaver, or always, the default, which keeps it in
the top right while you play too), and under it a picture of its nervous
system at work (Nervous system, the same choices), above at bottom corners
or beside it on short screens. Each time the screensaver
moves on to a new shot, and at least once a minute, they fade out and come
back together in the next corner, so none is left in one place long
enough to leave a fixed bright image for hours. The corners aren't chosen: a picture pinned
to one would sit there for hours in a screensaver, its glass edge and its
words the sharpest, brightest things on screen, which can contribute to OLED wear. Moving them reduces a fixed pattern;
it does not guarantee against burn-in. Instead Size (small,
medium, the default, or large) and Opacity (solid, the default, soft or
faint, which also dims them for the screen) set how much of the screensaver
they take.

**Stats** (`apps/web/src/stats/`; On screen → Stats, off by default, then
Stats of: its brain, its day, both, or in and out) is a small panel of numbers, each a
figure and a word: the brain's spikes a second, neurons active and speed
against real time (from the brain's meter), under
a trace of its last twenty seconds; and, headed by what the fly is doing now
(the activity caption without the HUD's food-name suffix), its day: how far
it has walked, its meals, its take-offs, and its time flying and grooming.
The day is counted from what the fly's life did (`life.ts`: its displacement while on its feet, including crowd pushes, a meal when eating starts, each leap into the air, each
second it was flying or grooming), once each, kept across launches as
`flies.day` and begun again at midnight. The panel sits across the screen
from the other pictures, at the same edge (at the top left while you play),
and moves round with them; on a screen too narrow for that, under them; its
cells two to a row on a narrow screen, and its brain beside its day on a
short one. In and out, also headed by what the fly is doing, is a bar for
each sense going into the brain as the body sends it (a loom at either eye,
touch, either antenna, wind, sweet, weight on its legs, a male's taste on
its front legs, its wingbeat, and the light, the mean over every facet), and its hunger, and for each
command coming out (walk, steer, back up, escape, wings, groom, feed, sing),
with the firing rate of the neurons each is read from (DNg100, the two DNa02s,
MDN, DNp01, the flight motor neurons, DNg12, MN9, pIP10) in Hz: the senses beside the commands, under them on a narrow
screen, or split in two on a short one. It redraws when displayed content or trace history changes, normally
throttled to four times a second; layout changes can invalidate it immediately.

## Menu and settings

There is one menu: the title at launch, and the same menu from play (Back,
Play/Pause, or the button at the top left), with the fly living on behind it.
It has **Play**, **Watch** (the screensaver straight away), **About**, and
**Settings**: a row of tabs over each part of the game, settings grouped by subject: **Screensaver** (when it starts, how
its camera films, where the fly lives, and, on an Apple TV that can tell,
the real weather), **On screen** (everything that can show over the world:
what it sees, its nervous system and its stats in the corners, what the
stats are of, the corners' size and opacity, and the X-ray), and **Picture**
(pixel size, the eyes' detail, button hints, rumble, frame stats). It also has **Online**, rooms shared with others on the web, Apple TV,
iPhone and iPad. The root menu can use two columns
on short screens; settings and Online lists can scroll when their rows do
not fit. In the root menu's two-column layout, Left and Right go across, and Up
and Down move along the list. Where the settings' tabs are too
narrow to read (the smallest phones), they are one choice, the tab shown
between arrows.

