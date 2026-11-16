# Places

The fly can live in more than one place, and the player can carry it between
them (the Place tool, or Settings → Where it lives; "Each in turn" moves it on
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
  4 m from the camera) is drawn over the backdrop (`buildBackdrop`, from
  200 mm to 3,000 km). Indoors, a room's far walls, a window's view, a bar's
  lights can all be backdrop.
- **Light** (`palettes`): the five times of day, eased between. Indoors the
  "sun" is the light coming in at the window and the sky what is seen through
  it; a lamp at night can be a warm low "sun". `stars` (0 to 1) is how dark it
  is. `env` scales the reflections in the set's `materials`.
- **What the fly's eyes see** (`SceneSet.seen`): the big shapes only. They are
  rendered six times at 16 or 32 pixels for the brain's eyes, so the small
  details stay out.
- **The camera** (`SceneCamera`): `whole` is View → Whole table
  (`around: "table"` circles the table's middle; keep it on the room side of
  any wall). `vista` is the way the best of the view lies: with nothing
  standing behind the fly, the camera likes to have that there. Every other
  shot, the wallpaper's included, stays on the fly and is shared by every
  place.
- **Sound** (`ambience`): an `Ambience` in `apps/web/src/audio/sounds.ts`, a loop
  synthesised sample by sample (the Apple TV's audio has no oscillators or
  filters), built the first time it is needed.
- **Bubbles and fireflies** are built for the picnic's open air and size; a
  place says whether it has them.
- **The Place tool's name** for it, what it is carried "to", and what the fly
  stands on there ("Whole sill"), are in `apps/web/src/places/catalog.ts`.

## Rules

- **Through the senses, never around them** (`docs/architecture.md`). Anything
  in a place that moves (a gust, a drip, a shadow) reaches the fly only through
  what it can see, feel or taste, and the brain decides what to do about it.
- **The Apple TV's budget.** JavaScript costs about 16 times what it does in a
  desktop browser, and the cost follows objects and draw calls. Merge static
  things by material (`Batch` in `apps/web/src/scene/build.ts`), instance
  repeated ones, freeze their matrices, put detail in shaders and textures
  rather than meshes, allocate nothing per frame, and keep `update` small.
  The picnic draws in about 23 calls and 105,000 triangles while playing
  (Settings → Frame stats, or the canvas's `data-calls` and `data-triangles`);
  a new place should stay close to that.
- **Building is a pause behind the veil.** `data-place-ms` on the canvas says
  how long the place took to build: the picnic 36 ms in desktop Chromium, so
  about half a second on the TV. Keep it there.
- **Register it** in `catalog.ts` and `index.ts`. `apps/web/tests/places.test.ts`
  then checks it like every other place: the fly starts standing on the table,
  its food can be tasted where it lies, it has every time of day, and every
  shot keeps the camera out of everything with the fly in the picture.
