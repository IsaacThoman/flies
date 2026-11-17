# Rendering and the nervous-system display

[Documentation index](../README.md#documentation).

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
  cropped to the brain and the cord, with no heading. It shares
  its corner with what it sees, under it (over it at the bottom; beside it,
  smaller, where the screen is too short, as a phone on its side), at the
  corner itself when that isn't shown, and moves round the corners with it;
  while playing it keeps to the top right. It never shows over a menu or
  View → Fly's eyes.

**The anatomy** (`packages/fly/src/nerves/`). The neuropils are measured from
the FlyEM male CNS v1.0's own neuropil meshes (one male's brain, neck and
cord in one EM volume, CC-BY 4.0) by `packages/fly/scripts/nerves.ts`, which
writes `packages/fly/src/nerves/measured.ts`: each neuropil's surface as radii derived from subsampled mesh vertices
within 15° of each direction, filling gaps, smoothing neighboring directions
and rounding the radii (left side only, mirrored, so the drawing is symmetric); the
lamina as a curved plate round the centre of the sphere that fits it; the
mushroom body's peduncle and lobes and the protocerebral bridge as rods
through slices of their meshes; the ellipsoid body as the torus that fits it;
and where each of the cord's nerves leaves it. The brain is drawn at 0.88 of
nominal atlas size (using a 2.4 mm body length; the model's head is a little narrower than a real male's, its
eyes true to size) and tipped 7° nose-down so the subesophageal zone sits over
the proboscis; the cord at nominal atlas size, tipped up 6° to lie along the thorax's
floor, its leg neuropils over the coxae and their nerves leaving where the
dataset's do (the hind leg's straight back off T3, as in the fly). The
dataset is a CNS dissected out of the fly, so its brain–cord posture isn't
the fly's: the two are placed separately and joined by a connective through
the neck. The retina isn't in the dataset; it is drawn as a cup bent to the
model's eye, a schematic plate 0.026 body lengths thick at most: 62.4 µm in the
2.4 mm atlas convention, 65 µm at the game's 2.5 mm fly scale. Nerves follow the
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

**Where each region is drawn** (`apps/web/src/nerves/regions.ts`). The 61
placed regions each light their own anatomy. The `unplaced` group mixes
neurons whose annotations do not establish a location; `head-sensory-other`
has no recorded organ. Their rates are retained but light nothing. The
connective's midline and pharyngeal nerves stay as unlit anatomical context,
rather than assigning those neurons to an unsupported location or organ.
Every lit part belongs to exactly one region or command group (a test holds it).
Where several regions share a place in
the fly, each is drawn as what is its own there: motor neurons as their
cell bodies at the cord's edge and the nerves their axons leave by, sensory
neurons as the organs and nerves they come in from, descending and ascending
neurons as the tracts they run in, and the neuropils go to the neurons that
fill them.

| Regions | Drawn as |
| --- | --- |
| retina, lamina, medulla, lobula, lobula plate (each side) | their corresponding optic structures (the retina is an organ) |
| optic lobe, other · visual projection · visual centrifugal | the inner chiasm's fibres · the optic tracts into the central brain · fibres back out |
| antennal lobe, mushroom body, superior protocerebrum, lateral horn, ventrolateral (with the optic tubercle), inferior and ventromedial, subesophageal (each side); central complex | their neuropils; the mushroom body as calyx, peduncle and lobes; the central complex as bridge, fan-shaped body, ellipsoid body, noduli |
| central brain, other | the rind of cell bodies round the central brain, drawn as an edge (that is where those neurons' cell bodies are) |
| smell · Johnston's organ · head bristles · mouthparts | the third antennal segment and its strand of the antennal nerve · the second segment's organ and its strand to the AMMC · the head's bristle sockets · the labellum, the pharynx's taste organs and the labial nerves' sensory axons |
| head sensory, other | organ unknown; no activity assigned to a specific organ |
| head motor · neuroendocrine | the labial nerves' motor axons · the pars intercerebralis, its nerve to the corpora cardiaca, the frontal ganglion |
| descending · ascending (each side) | tracts from the brain down the neck and along the cord's top · from the cord's floor up into the brain |
| unplaced | not assigned an anatomical location; no activity drawn |
| front, middle, hind leg motor (each side) · wing and haltere motor · neck motor · abdomen motor | cell bodies at the leg neuropil's edge and the leg nerve's motor strand · cell bodies over the wing tectulum and the dorsal nerves · the cervical nerve · the abdominal trunk's motor strand |
| leg sensory · wing, haltere and thorax sensory · abdomen sensory · proprioceptors · body bristles | the leg nerves' sensory strands · the wing and haltere nerves · the abdominal trunk's sensory strand · the chordotonal organs and campaniform sensilla · the body's bristle sockets |
| cord interneurons (each side) · cord, midline · cord, efferent | the leg neuropils T1, T2, T3, the abdominal neuromeres and the neck, wing and haltere tectulum of its side · the cord's ventral midline · its dorsal median fibres and median nerves |

The cord is drawn segment by segment, so when the brain reports its
interneurons by their available segment annotations only this
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
ones, by (glow / 0.35)², all the way at 0.35, covering more of what is behind
it as it does, and it gives off light in that colour in proportion to
glow². The square keeps the low hum of background activity near the tissue's
colour and lets a burst stand out: an uncaptured historical ball sample reported optic-lobe glow from
about 0.07 to 0.35 (capture date and machine unknown). Nothing else lights a part. Its tissue is drawn
unlit by activity: in the world lit by the scene's lights like the rest of the
fly, with a faint constant cool tone strongest at its edge so the shape
reads in a dark room (the same at all times for every part, as an X-ray
shows bone); in the panel a faint constant stain on the dark glass, as a
neuropil stain shows anatomy in a micrograph.

**Command-group somata** (`packages/fly/src/nerves/somata.ts`). The 64
neurons already read for walking, steering, backing, escape, flight power,
grooming, feeding and song are also drawn as tiny cell bodies at their actual
`somaLocation` from `packages/brain/data/anatomy.bin`. `node packages/fly/scripts/somata.ts`
regenerates the static atlas after validating the anatomy/connectome SHA-256
pair. The same fitted brain and cord frames used for the neuropil meshes
register these points; they retain the specimen's asymmetry. Every member is
included, with no subsampling and no `tosomaLocation` fibre fallbacks. A
3.6 µm nominal glyph radius is enlarged to a two-pixel diameter when necessary.
This is a display convention, not a measurement of soma size.
They are merged into the existing nervous-system geometry: no extra draws.

These are **group-rate markers, not individual spike flashes**. Every soma
in a readout shares that group's actual smoothed mean rate, normalized by
the command's existing full-scale rate (40 Hz walking/steering/backing/
feeding/song, 60 Hz grooming, 120 Hz flight power, 200 Hz giant fibre), with
the same 50 ms rise and 400 ms fall as the regions. A bright point does not
establish that this individual neuron fired. The workers and the native TV
already report these nine rates; no new messages, counters, simulation work
or inferred axon paths are added. A host missing a readout leaves its group
dark. Region surfaces remain region averages. The static blue tissue stain
and outline have higher contrast; only activity changes their warm glow.

**What stays dark, and what it can't show.** The retina and smell have no
direct sensory drive: light enters at the lamina and there is no smell input.
Body inputs also include antenna displacement, wind, sweet taste, male taste,
leg load and wingbeat, as well as touch; sensory regions must not be assumed
silent. Historical observations put the mushroom body, lateral horn, superior
protocerebrum, antennal lobe and central complex under 2 Hz on a 5 Hz scale;
these are observations, not enforced activity limits. A region glows with the mean of all its neurons, so in its regional surface a command
carried by a few hardly shows: each side's giant fibre is one neuron among roughly
660 descending ones (662 left, 654 right), and what shows of an escape is the optic lobes, the
visual projection neurons and the motor neurons it sets going (the jump's
are among the middle leg's). The cord's interneurons light their side's
whole cord together, for now. The region shapes are an anatomical drawing; only the command-group somata
are individual measured positions. The canvas's `data-xray` (how far the fly is glass),
`data-nerves` (the panel's corner, or `hidden`) and `data-glow` (each region
glowing at 0.05 or more, brightest first) say what is shown.

## The frame

On the Apple TV the game renders 640×480, laid out for 16:9 (the picture is
squeezed into the 4:3 buffer and stretched back out), with no antialiasing and
a pixel ratio of 1. Elsewhere (`apps/web/src/display.ts`) the frame takes the
screen's shape with square pixels between aspect ratios 1:4 and 4:1
(more extreme shapes stretch), with rounded dimensions near 640×480 =
307,200 pixels: 739×416 in a 16:9 window, exactly 640×480 at 4:3, 376×815 on a phone
held upright, 853×360 on an ultrawide. So the pixels are as chunky for the
size of the screen as on the TV (each covers about the same area of it), the
GPU fills approximately as many; visible geometry and layout costs can still vary. Settings → Picture →
Pixels renders the world at a half or a third of the frame each way (on the
TV 320×240 or 214×160) under crisp menus at the frame's own size. Resizing or
turning the screen lays the frame and every layout out again at the start of
the next frame; nothing in the world is built again.

The shots are framed for 16:9. On a wider screen the camera keeps their
height and sees more to the sides; on a narrower one it keeps seven tenths of
the extra height as field of view (`display.ts`, `fieldOfView`), so on a phone
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

At the picnic, the backdrop (sky, clouds, hills, lollipop trees, lawn, daisies,
lake) and the table are two passes with their own depth ranges. Static things
are merged by material into a handful of meshes with vertex colours and frozen
matrices (the crumbs, pips and saucer go into those too, and the small things'
contact shadows are one merged mesh); seeds, sugar grains, dew, trees,
daisies, clouds, bubbles, fireflies, puffs and dropped food are instanced. Rain and lingering wetness use
three instanced meshes, each gated separately: the streaks (one quad per drop, positioned in the shader from shared
camera, offset and weather uniforms; JavaScript advances the shared offset), the splashes (a pool of 56, each
a ring and a crown of droplets in one instanced mesh) and the beads on the fruit, which can remain while it dries;
the table's own beads and puddles are in its shader, as many as there are
pixels for. The ripple round food that has just landed is one draw for under
a second. Each visitor is one draw while it is about, the gull's shadow is
in the table's and the fly's own shading, with reusable animation state.
The footprints are one instanced draw while any are left (at most 128, two
triangles each), multiplied into what they lie on, so they need no light; a
print is written only when a foot is set down, and fades in the shader.
Menus and hints are one 2D canvas drawn over the frame,
uploaded when dirty, normally capped at 30 redraws a second between resizes;
a resize permits an immediate redraw. The in-game shimmer marks it dirty at 10 Hz.

Historical measurements in Chromium on an M-series Mac (exact model and capture date not recorded) (Settings → Picture → Frame stats shows it live,
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
about 12 µs a frame in V8's interpreter alone). These historical counts and timings
are not current multi-fly or anatomy budgets; the glow-array layout above is a
historical description too, not the current geometry's uniform capacity. The end-to-end test fails at or above 150
draws or 500,000 triangles. Physical Apple TV measurements and the unattended
soak command are in [docs/apple-tv.md](apple-tv.md).

In a browser the game watches its own pace (`apps/web/src/quality.ts`): frames
falling behind, or the brain running slower than real time, and it draws less
(the eyes' finer detail, then 30 frames a second, then bigger pixels, then the
eyes refreshing half as often, then bigger pixels still), never more than
Settings asks for, and never at the brain's expense. `docs/web.md` has the
measurements. On the Apple TV it is drawn as it always was.

<!-- docs-check: base apps/web/src -->

<!-- docs-check: base packages/body/src -->

<!-- docs-check: generated packages/brain/data/anatomy.bin -->
