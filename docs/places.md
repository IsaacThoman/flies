# Places

The fly can live in more than one place, and the player can carry it between
them (the Place tool, or Settings → Wallpaper → Where it lives; "Each in turn" moves it on
after 20 minutes of wallpaper). It is the same fly with the same brain, running
on: the world fades to black, the new place is built behind the veil, and the
fly is set down where that place starts it.

A place is two things, kept apart on purpose:

| | Where | What |
| --- | --- | --- |
| Its world | `packages/world/src/<place>.ts`, a `Place` | Exactly what the fly's body meets: the table top, what stands on it, its food, where the fly starts, how high it may fly. No three.js. |
| Its scene | `apps/web/src/places/<id>/index.ts`, a `Scene` | How it looks and sounds: its light through the day, the table and everything on it, everything beyond, the camera's view of the whole place, its ambient sound. |

The scene is built from the world's description, so that what the fly stands
on is exactly what is drawn. `apps/web/src/places/types.ts` is the contract;
the picnic (`packages/world/src/picnic.ts`, `apps/web/src/places/picnic/`) is
the worked example.

## The world

The world is a height field in millimetres, y up, the table top at y = 0 and
centred on the origin. A fruit fly is about 2.5 mm long; it steps up nothing
taller than 0.9 mm and can't stand on anything steeper than 65°.

- **The floor** is a disc (`{ kind: "circle", r }`) or a rectangle
  (`{ kind: "rect", hx, hz }`, half-sizes). The fly can't walk off it, and in
  the air it is drawn back over it once past its edge.
- **Solids** are columns standing on it: a footprint (circle, ellipse or box,
  turned by an angle) and a top (flat, a dome, or a dish). Nothing is hollow
  and nothing overhangs: the fly can't go under anything. A wall or a window
  pane is a tall thin box; solids may stand beyond the floor's edge, and still
  stop the camera standing inside them.
- **Patches** are the place's own food, eaten down and coming back over 90 s.
  Mark a liquid one `pool: true` and the fly's feet set rings spreading on it
  (through `SceneSet.ripple`).
- **The start** is where the fly first stands and its yaw. **The ceiling** is
  how high it may fly before it is drawn back down.

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
  worked examples (`places/picnic/rain.ts`, `table.ts`, `backdrop.ts`). Rain
  bursts the bubbles and sends the fireflies to shelter wherever they are.
- **What the fly's eyes see** (`SceneSet.seen`): the big shapes only. They are
  rendered six times at 16 or 32 pixels for the brain's eyes, so the small
  details stay out, and what is in `seen` costs six times its triangles.
- **The camera** (`SceneCamera`): `whole` is View → Whole table
  (`around: "table"` circles the table's middle; keep it on the room side of
  any wall). A room gives `focus`: the point the view circles, how much it
  follows the fly from there, and how far toward the fly it aims, so that it
  stays inside the room and keeps the fly in the picture wherever it goes. `vista` is the way the best of the view lies: with nothing
  standing behind the fly, the camera likes to have that there. Every other
  shot, the wallpaper's included, stays on the fly and is shared by every
  place.
- **Sound** (`ambience`): an `Ambience` in `apps/web/src/audio/sounds.ts`, a loop
  synthesised sample by sample (the Apple TV's audio has no oscillators or
  filters), built the first time it is needed. Its optional `rain` (0 to 1,
  0.3 if left out) is how loud rain is heard there: 1 out in it, less through
  walls and glass. Its optional `birds` is how loud the birds outside are (1
  out among them, less and muffled through glass; none if left out): they
  call by day, mostly keep quiet in the rain, and go to roost from dusk. A gust blowing at the fly (`Felt.air`, below) is heard as
  a rush of air wherever it blows.
- **Goings-on** (`SceneSet.live`, optional): the place's own life, called each
  frame the fly lives with an `Around`: where the fly is, the world, the
  pantry, the weather, and `quiet` (nobody has touched the remote for a
  while). It leaves what reaches the fly in `around.felt`: `air` (a gust, mm/s:
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
  camera sees: the near pass's far plane, the camera's, and the fly's eyes'. The restaurant's
  is 12 m. The near plane stays at 0.5 mm, so a distant depth is coarse:
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
  The picnic draws in about 23 calls and 105,000 triangles while playing
  (Settings → Picture → Frame stats, or the canvas's `data-calls` and `data-triangles`);
  a new place should stay close to that, near the fly and in its whole view.
- **Building is a pause behind the veil.** `data-place-ms` on the canvas says
  how long the place took to build: the picnic 36 ms in desktop Chromium, so
  about half a second on the TV. Keep it there.
- **Register it** in `catalog.ts` and `index.ts`. `apps/web/tests/places.test.ts`
  then checks it like every other place: the fly starts standing on the table,
  its food can be tasted where it lies, it has every time of day, and every
  shot keeps the camera out of everything with the fly in the picture.
