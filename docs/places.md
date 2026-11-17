# Places

The fly can live in more than one place, and the player can carry it between
them (the Place tool, or Settings → Screensaver → Where it lives, which carries it
once the choice rests a second or the row is left, not to each place stepped
past; "Each in turn" moves it on after 20 minutes of screensaver). It is the same fly with the same brain, running
on: the world fades to black, the new place is built behind the veil, and the
fly is set down where that place starts it.

A place is two things, kept apart on purpose:

| | Where | What |
| --- | --- | --- |
| Its world | `packages/world/src/<place>.ts`, a `Place` | Exactly what the fly's body meets: the table top, what stands on it, its food, where the fly starts, how high it may fly. No three.js. |
| Its scene | `apps/web/src/places/<id>/index.ts`, a `Scene` | How it looks: its light through the day, the table and everything on it, everything beyond, the camera's view of the whole place. |

The scene is built from the world's description, so that what the fly stands
on is exactly what is drawn. `apps/web/src/places/types.ts` is the contract;
the picnic (`packages/world/src/picnic.ts`, `apps/web/src/places/picnic/`) is
the worked example.

## The world

The world is in millimetres, y up, its floor at y = 0 and centred on the
origin: a table top, a sill, a bench or a bar, or a room's own floor (the
restaurant's). A fruit fly is about 2.5 mm long; it steps up nothing taller
than 0.9 mm, can't stand on anything steeper than 65°, and needs 1.3 mm of
room over its feet (`FLY_HEIGHT`, up to its folded wings).

- **The floor** is a disc (`{ kind: "circle", r }`) or a rectangle
  (`{ kind: "rect", hx, hz }`, half-sizes). The fly can't walk off it, and in
  the air it is drawn back over it once past its edge.
- **Solids** are a footprint (circle, ellipse or box, turned by an angle) and
  a top (flat, a dome, or a dish). Without a `bottom` a solid is a column
  standing on the floor. With one it is a slab, solid only from its bottom up
  to its top, with air beneath it: a table top on its legs, a chair seat, a
  shelf, a lamp. Its top's heights stay absolute, and a dish slab's outside
  falls to its bottom (a plate on a table top). A slab may rest on another's
  top (`bottom` equal to it: a plate on a table, a bottle on a shelf), and
  faces may meet: heights within `TOUCH` (a millionth of a millimetre) are
  the same. A wall or a window pane is a tall thin box; solids may stand
  beyond the floor's edge, and still stop the camera standing inside them.
  Nothing is hollow other than a slab's underside: a gap under a slab lower
  than the fly's 1.3 mm is as good as solid to it.
- **Patches** are the place's own food, eaten down and coming back over 90 s.
  Mark a liquid one `pool: true` and the fly's feet set rings spreading on it
  (through `SceneSet.ripple`). Where one point has several surfaces over it,
  its `y` says which it lies on: the surface there at or below `y` (left out,
  the highest). What the fly's feet carry off a patch for its footprints (a
  colour, or nothing for something dry) is found by the patch's name in
  `apps/web/src/scene/prints.ts`, and `apps/web/tests/prints.test.ts` asks it
  of every patch. A solid whose drawn top isn't the world's smooth one (a
  drink, a head of foam, something drawn rougher) is named there too, so that
  no print floats over it.
- **The start** is where the fly first stands, its yaw and, with slabs, its
  `y` (the surface at or below it, as for patches). **The ceiling** is how
  high it may fly before it is drawn back down.

Over one point there can be several surfaces, one above another (the floor,
a chair seat, the table top over both), so the world's questions about a
point say which by a height (`packages/world/src/world.ts`): `surface` and
`heightAt` give the highest surface at or below one, and how far the air over
it goes (`underside`); `underside` where the air over a height ends;
`solidAt` whether a point is inside anything; `topAbove` where a point inside
something comes out at the top; `wallNormal` the way out of whatever fills a
band of heights; and `raycast` meets tops from above, undersides from below
and sides between them, sweeping a body's height when asked. With no height
given, `surface` is the highest there is, which over a room with a ceiling
slab is its top: say where the start, the food and anything else is.

The fly stands on the surface under its feet. Walking, that is the highest
surface within a step of them, with room over it for its body; an underside
lower than that, there or under its head, is a wall it walks into, and one
higher is nothing to it. In the air its feet sweep the way it goes with its
body over them: an underside stops it with its body just under it and
bounces it back down, and it goes on along under it; it lands on what it
comes down onto from above (the top within a step under its feet, or of
what its feet went into), never on something it is under; beside a slab it
falls past it. Under something less than 2 mm higher than its body, it can
only walk out.

Its body reaches past its feet: its head and its abdomen's tip half a body
length ahead and behind, its thorax's sides, and on its feet its six legs,
out to 1.65 mm ahead and 1.3 mm to the side (`BODY_REACH` and `FEET_REACH` in
`packages/body/src/motion.ts`, where the drawn fly's are). After every step
these are kept out of the sides of things, and of slopes too steep to stand
on: a fly flying at a pane bounces off it with its head on the room's side, a
fly turning beside a wall swings its legs clear of it, one walking into a wall
stops with its front feet at it. Moved out of one thing into another, it is
moved again; between two things too close for it as it faces, they turn it
along the slot between them, or a quarter turn, if it fits so; where nothing
fits its legs (closer than 2.65 mm), its body is kept out and it stands evenly
between them. On its feet what rises less than a step under its body is what
it steps up onto, and so is a stair a step higher than the one before it (the
alarm clock's slices), and a slope it could walk up is not in its way; in the
air its body rides up over a slope it could stand on.
So nothing it can reach may be closer to a wall than that: a gap narrower than
the fly's legs is a gap it only stands in with its legs against both sides.

The world files every solid in a grid of flat arrays, its cells 32 mm or,
in a bigger place, doubled until there are no more than 16,384 of them (the
restaurant's are 64 mm); a solid over more than 1,024 cells (the
restaurant's ceiling) is instead on a short list every query checks. A ray
walks the cells it crosses, nearest first, so a long one costs what it
passes. Circles and boxes at angle 0 are the cheapest footprints and flat
the cheapest top; a ray finds a dome or a dish by sampling it, so keep big
things flat. `World.load` files the restaurant's 415 solids in about a
tenth of a millisecond in desktop Node.

A round thing lying on its side (the windowsill's alarm clock) is a row of thin
flat-topped boxes following its curve to a fraction of a millimetre. Don't let
domes overlap so that they leave a hollow where they meet: a falling fly can
be caught in it. A plant's leaves can't have air under them: the windowsill's
basil is a solid crown the fly lands on, with every leaf drawn within it.

Anything drawn but not in the world must be flat enough not to matter to a fly
(under half a millimetre, like the picnic's specks of biscuit), or out of its
reach (beyond the floor's edge, above it, or in the backdrop).

## The scene

- **Two passes** (`apps/web/src/stage.ts`): the set (`buildSet`, from 0.5 mm to
  4 m from the camera, or its camera's `reach`) is drawn over the backdrop
  (`buildBackdrop`, from 200 mm to 3,000 km). Indoors, a room's far walls, a
  window's view, a bar's lights can all be backdrop.
- **Light** (`palettes`): the five times of day. Chosen on the Light tool, the
  light eases to one and holds it; on "Now" it follows the clock between them
  (`scene/light.ts`, `clockLight`): each palette's colours are full at its
  hour (morning 7:30, midday 10:30 to 15:15, golden 17:45, dusk 20:00, night
  21:30 to 4:30, and dawn borrows dusk's colours at 5:55). Where the dusk
  palette's sun is low (`sunUp` under 0.25: it is setting), the sun rises from
  under the horizon on the morning's bearing, passes through each day
  palette's place at its hour and sets past dusk's, and the night palette's
  light (the moon) rises after it and sets before dawn, its light fading as it
  goes down. Where it is high (the evening's light is a lamp, as the lab's
  is), the light's direction and strength ease between the palettes with
  their colours, so the lamp stays lit and still through the night. Either
  way a palette's `sunUp` and `sunAround` are where its light is at that
  hour. Where the Apple TV knows the real sunrise and sunset, the hour is
  moved first so that the clock's day comes up and goes down with the real
  one (`scene/outside.ts`): a place's palettes don't change for it. Indoors
  the "sun" is the light coming in at the window and the sky what is seen
  through it; a lamp at night can be a warm "sun". `stars` (0 to 1) is how
  dark it is. `env` scales the reflections in the set's `materials`.
- **Weather** (`scene/weather.ts`): clear, overcast, mist or light rain, from
  the Weather tool or, on "Now", the weather outside where the Apple TV can
  tell it (`scene/outside.ts`), else a forecast worked out from the clock. Every
  place gets its light from it without doing anything, as much as its
  optional `open` lets in (1 if not said; the lab's is 0.4 and the bar's
  0.35, as they see the sky only through windows, and after dark, lit by
  their lamps, they hardly feel it): overcast greys the `Daylight`'s sky colours
  and takes most of the sun's light (much less of the night's), mist whitens the
  horizon and the haze. Showing it in the place itself is up to the place,
  and optional: `SceneSet.update` and `SceneBackdrop.update` are handed the
  `Weather` (`cloud`, `mist`, `rain`, `wet`, `wind`, each 0 to 1, and its
  `kind`) as their last argument, which a place that ignores it can leave off.
  A windowsill can run rain down its pane by `rain` and leave it streaked by
  `wet`; the picnic's rain, wet table, overcast deck, mist and rainbow are
  worked examples (`places/picnic/rain.ts`, `table.ts`, `backdrop.ts`), and
  the lab shows it in the view through its windows (`places/lab/room.ts`). Rain
  bursts the bubbles and sends the fireflies to shelter wherever they are.
- **What the fly's eyes see** (`SceneSet.seen`): the big shapes only. They are
  rendered six times at 16 or 32 pixels for the brain's eyes, so the small
  details stay out, and what is in `seen` costs six times its triangles.
- **The camera** (`SceneCamera`): `whole` is View → Whole table
  (`around: "table"` circles the table's middle; keep it on the room side of
  any wall). A room gives `focus`: the point the view circles, how much it
  follows the fly from there, and how far toward the fly it aims, so that it
  stays inside the room and keeps the fly in the picture wherever it goes.
  `vista` is the way the best of the view lies: with nothing standing behind
  the fly, the camera likes to have that there. A wall or a window standing
  past the table's edge counts for nothing behind the fly; the view counts
  for about as much as something tall standing some 280 mm behind it. Every
  other
  shot, the screensaver's included, stays on the fly and is shared by every
  place. Wherever it is, the camera keeps out of everything and clear of the
  surface under it and of what is over it, and anything standing between it
  and the fly (a wall behind it, a table top over the fly) brings it in front
  of that: taken out by hand in a room, it stops at the walls.
- **Goings-on** (`SceneSet.live`, optional): the place's own life, called each
  frame the fly lives with an `Around`: where the fly is, where the device's
  other flies are (`company`), the world, the pantry, the weather, and
  `quiet` (nobody has touched the remote for a while). Anything that keeps
  clear of the fly keeps clear of whichever is nearest; `SceneSet.feel`
  gives what reaches each of the others. It leaves what reaches the fly in `around.felt`: `air` (a gust, mm/s:
  felt as wind, and it carries the fly in flight as a puff does), `touch` (a
  raindrop landing on it, 0 to 1) and `looming` (things it could see coming,
  for a brain without eyes). Food goes into the pantry with `pantry.add`, to
  be found by walking and tasting. Start comings and goings only while
  `quiet`, so what the fly does while someone plays answers what they do. The
  picnic's (`places/picnic/life.ts`, paced in `pace.ts`) are the worked
  example.
- **A shadow passing over** (`scene/shade.ts`, optional): `shaded(material)`
  teaches a lit material to take a shadow cast from high up (the picnic's
  gull), set in `SHADE`; the fly takes it already.
- **A clock** (`scene/clock.ts`, optional): a `WallClock`, updated in the
  place's `update`, turns a dial's hands to the real time by a uniform; the
  hands are drawn in the dial's own material (`CLOCK_GLSL`, found by where the
  dial is in the world, `onDial`), so they cost no draw. It tells the real
  time under any chosen light. The windowsill's, the lab's and the bar's are
  worked examples. Behind a fly on the table, the medium shot frames only from
  the table up to about a seventh of the way back, so anything meant to be
  seen behind the fly, a clock included, stands low.
- **Bubbles and fireflies** are built for the picnic's open air and size; a
  place says whether it has them.
- **The Place tool's name** for it, what it is carried "to", and what the fly
  stands on there ("Whole sill"), are in `apps/web/src/places/catalog.ts`.

## A large place

The restaurant is a whole room, not a tabletop: 8.4 by 6 metres, where the
fly can live at any table, at the bar or on the floor, and the camera can be
anywhere in it. Drawn as one, its detail would cost far more than the Apple
TV has (`places/restaurant/`):

- **Areas.** The room is split into areas (`areas.ts`): each table with its
  chairs and what is on it, the bar in three lengths, the back bar in two,
  the pass, the host's stand, the service station, the banquette in two, the
  window's ledge. Each area's detail is merged by material into a mesh or two
  of its own, drawn only while the camera is within 650 mm of it.
- **Two levels of detail.** Every area also has a stand-in: its things at
  their felt shapes, few-sided (a few hundred triangles a table), merged with
  the room's shell (floor, walls, ceiling, the shop front) into one room-wide
  mesh, always drawn. Each stand-in vertex carries its area in its `kind`
  (kind + 128 × area), and a uniform mask of the areas in detail folds their
  stand-ins away in the vertex shader. Each frame is a loop over the areas'
  distances from the camera, a few `visible` flags and the mask: no rebuilding
  and no draws for what is far away (`set.ts`). `SceneSet.update` is handed the
  camera for this.
- **One material, kinds in the shader.** Everything solid in the room is one
  physical material and everything clear another; what each vertex is made of
  (marble, oak, zinc, the floor's penny rounds, the tin ceiling...) is its
  `kind`, shaded in the fragment shader from where it is in the room, so a
  whole area is one or two draws and the detail is in the shader, crisp close
  up and faded where a pixel can't show it (`kinds.ts`, `surfaces.ts`). The
  room is built in parts, each owning the world's solids it draws and a range
  of kinds of its own (`parts.ts`).
- **The eyes' stand-in.** The fly's eyes see the room-wide mesh again, with
  nothing folded away and the shop front's openings bright: the big shapes,
  six times a refresh, so it is kept lean.
- **Reach.** `SceneCamera.reach` (mm, 4,000 if not said) is how far the
  camera sees: the near pass's far plane, the camera's, and the fly's eyes'.
  The restaurant's is 12 m. The near plane stays at 0.5 mm, so a distant depth is coarse:
  nothing is drawn coplanar, stains and print are in the shaders, and what
  rests on a surface sinks into it a hair.
- **Light.** Still a hemisphere and one "sun" from the stage, the sun coming
  in only through the glass (the frames cast their shadows, worked out in
  the shader). The room's own lights are uniforms in the materials, with no
  three.js lights and no shadow maps: the sky or the lit street seen through
  the shop front as a rectangle of light (Lambert's formula), the fridge's
  glass doors, the exit sign, the heat lamps and the kitchen through the pass
  as more rectangles, the one pendant left on over the bar as a lamp with its
  highlights. The tables, chairs, stools and the zinc shadow the sun, the
  street lamp and the pendant as blocks; the things of the area the camera is
  in shadow them exactly, as upright columns (`light.ts`); soft shadows on
  the floor under everything are painted once from the layout.
- **Built in steps.** The whole room is several times the picnic's work to
  build, so it is built a part a frame behind the veil (`SceneSet.more`): the
  game holds the veil until it is done, and no one frame is longer than the
  picnic's whole build. Then each part of it that is hidden (an area's
  detail) is drawn once behind the veil, a frame each, so its buffers are on
  the GPU before the veil lifts: nothing is uploaded when the camera first
  comes near it, and what the place holds on the GPU is the same however the
  camera has gone (the browser soak checks it, `docs/web-soak.md`).

## Rules

- **Through the senses, never around them** (`docs/architecture.md`). Anything
  in a place that moves (a gust, a drip, a shadow) reaches the fly only through
  what it can see, feel or taste (`Felt`, the pantry, its eyes), and the brain
  decides what to do about it. Nothing is aimed or timed at the fly: things
  that move may keep clear of it, but not seek it.
- **The Apple TV's budget.** JavaScript costs about 16 times what it does in a
  desktop browser, and the cost follows objects and draw calls. Merge static
  things by material (`Batch` in `apps/web/src/scene/build.ts`), instance
  repeated ones, freeze their matrices, put detail in shaders and textures
  rather than meshes, allocate nothing per frame, and keep `update` small.
  The picnic draws in about 23 calls and 106,000 triangles while playing
  (Settings → Picture → Frame stats, or the canvas's `data-calls` and `data-triangles`);
  a new place should stay close to that, near the fly and in its whole view.
- **Building is a pause behind the veil.** `data-place-ms` on the canvas says
  how long the place took to build. A reference picnic build was 36 ms in
  desktop Chromium, so about half a second on the TV. Keep it there, or build in steps
  (`SceneSet.more`, above): then `data-place-step-ms` is the longest frame
  of it, and that is what to keep there.
- **Register it** in `catalog.ts` and `index.ts`. `apps/web/tests/places.test.ts`
  then checks it like every other place: the fly starts standing on the table,
  its food can be tasted where it lies with room over it for a fly, it has
  every time of day, and every shot keeps the camera out of everything with
  the fly in the picture. Add it to the fuzzers' places too
  (`scripts/fuzz/body.ts`).

## Checking the picnic's picture

Compare the picnic at 1920×1080 with `scripts/play.ts`, keeping its chunky
internal resolution. Hold the same fly pose and camera for title, follow,
close, wide, whole table, screensaver, fruit and glass studies; repeat under
midday, golden hour, dusk, night and midday rain. Pinned poses belong only in
the capture harness: ordinary play remains the brain's choice.

Judge composition at TV distance, light and colour, materials, millimetre
scale, detail without clutter, life and weather, and rendering artefacts.
Record `data-calls` and `data-place-ms` alongside the pictures. Compare calls
at the same eye-refresh phase: frames that refresh the brain's six eye views
include those extra draws. Compare repeated builds on the same machine;
wall-clock build times on a busy machine vary considerably.

The picnic shares one fruit material between the glazed things, cherries,
apple, citrus and berries; a per-vertex skin kind chooses the surface in the
shader. The strawberry skin varies its roughness; the cut berry has a pale
core, radiating flesh fibres and a darker rind. The cut fruit still follows
the world's low dome, rather than pretending to be a flat walkable slice.
Fine cloth detail fades with its pixel footprint and stays subordinate to
the fly's legs. Small glass base and fill-edge accents join the existing
glazed batch.

Tabletop shadows follow the chosen sun or moon without extra lights, shadow
maps or draws. They use the world's footprints and peak heights as columns:
a deliberate silhouette approximation for rounded fruit, not a change to its
collision surface. Only direct light is shadowed; the sky still fills it.
Rain rings spread on the tabletop and in the saucer's pool. Hits on the fly
or raised objects throw splash droplets without a suspended horizontal ring;
the fly feels the same rain touch as before.
