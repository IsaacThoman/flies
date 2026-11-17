# packages/fly

The fly's body: a male *Drosophila melanogaster* built entirely in code (no
model files, no downloaded textures), posed every frame from a `FlyPose`.
It implements `FlyModel` from `packages/contracts/src/fly.ts`:
`createFly()` returns the `object` the game moves, turns and scales,
`update(pose, dt)`, `anchor(name, out)` and `dispose()`.

```sh
npm run fly:viewer          # the workbench, on http://localhost:5287
node --test packages/fly/tests/
node --test packages/fly/tests/update.budget.ts   # its speed, alone
```

## Anatomy, and what each part is made of

Units are body lengths (front of the head to the tip of the abdomen, about
2.5 mm in a male). The fly stands on y = 0, faces +z, +x is its left. The
measurements are in `src/anatomy.ts`; the shapes and colours in `src/body.ts`.

| Part | Built from |
| --- | --- |
| Head | A wide capsule flattened at the back where it meets the thorax: orange frons between the eyes, pale face below, darker vertex and occiput. A short membranous neck joins it to the thorax. |
| Compound eyes | Ellipsoid caps sunk into the sides of the head, deep brick red. The fragment shader draws a hexagonal lattice of about 900 facets, each a small dome that catches the light, and the **pseudopupil**: the dark spot where you look straight down the ommatidia, which follows the viewer across the eye. Both fade out by their screen-space derivatives once facets are smaller than a pixel, so the eye never shimmers. |
| Ocelli | Three glossy amber domes in a triangle on a dark ocellar triangle on the vertex. |
| Antennae | Scape, pedicel and the oval third segment hanging in front of the face, and the **arista**: a fine plumose bristle from the top of the third segment with branches above and below. Each antenna is a joint that twitches. |
| Proboscis | Rostrum, haustellum and the two-lobed labellum with its food channels, each a joint. Folded up under the head at rest; extended it reaches the surface just in front of the head (the haustellum telescopes as far as it needs to), the lobes spread flat on the food and pulse. |
| Thorax | A deformed ellipsoid: broad blunt shoulders, the scutum arching up behind the neck, flatter sternum. Tan, darker above, paler pleura, faint dorsocentral stripes. The **microchaetae** (the rows of tiny hairs) are a procedural pattern that fades out when small; the **macrochaetae** are real geometry: humerals, notopleurals, supra- and post-alars, dorsocentrals, katepisternals. |
| Scutellum | A flattened lobe over the base of the abdomen with its basal bristles and the long crossing apical scutellars. |
| Abdomen | Six visible segments (a male), each tergite ridged where it overlaps the next and dark along its back edge, A5 and A6 dark all over; pale pleural membrane and sternites underneath. Two joints, so it breathes, lifts in flight and bows when feeding. |
| Legs | Six, each coxa, femur (with the trochanter as a collar), tibia (with its preapical bristle), basitarsus and tarsomeres 2–5 ending in two claws and two pale pulvilli: five joints a leg. The coxae cluster under the thorax in the real arrangement, the front pair long and close together behind the head. The male's sex comb has ten stout teeth along the front basitarsus. |
| Wings | Flat blades in the Drosophila outline (with the alula), venation painted into a 256×128 mipmapped `DataTexture`: costa, subcosta, L1–L6, anterior and posterior crossveins, a faint smoky membrane and a thin-film sheen (three's iridescence). Folded flat over the abdomen at rest, one over the other. |
| Halteres | Pale knobs on short stalks behind the wings, which buzz with them. |
| Bristles | Thin black cones curving back over the body. When a bristle gets thinner than about a third of a pixel it shrinks back to its root rather than being drawn as a broken line, so a small fly is not furred with flickering hairs. |

## The nervous system

`src/nerves/` builds the fly's brain, optic lobes, neck connective, ventral
nerve cord and nerves, inside the body, for the game's X-ray and its corner
panel (the game's README, Its nervous system, says how they are shown and
lit). `createFly()` returns it as `nerves`: its 93 parts (`parts.ts`: each
with a role, sensory, central or motor, and a kind), a `glow` array the game
fills (a float a part), and `xray`, 0 to 1.

- **Measured.** The neuropils' shapes are fitted to the FlyEM male CNS v1.0's
  neuropil meshes by `scripts/nerves.ts` (`node packages/fly/scripts/nerves.ts`,
  which downloads about 150 MB of meshes once and rewrites
  `src/nerves/measured.ts`): each as its radius in a grid of directions round
  its centre, the lamina as a curved plate round the sphere that fits it, the
  mushroom body's lobes and the protocerebral bridge as rods, the ellipsoid
  body as a torus, and where the cord's nerves leave it. `anatomy.ts` places
  the brain in the head (0.88 of true size, its optic lobes under the eyes)
  and the cord on the thorax's floor (true size), and says what the dataset
  doesn't hold (the retina, the neck's path, the pars intercerebralis).
- **Posed by the rig.** Like the body, every vertex belongs to one joint and is
  stored in its space (the shapes are laid out on a rest pose and carried
  into each joint's frame); a tube can run through several joints, a ring to
  a joint, so the connective bends at the neck and each leg nerve at every
  leg joint. The X-ray's vertex shader reads the body's own joint uniform.
- **Drawn.** One mesh, one draw, with the body's joints and a uniform array of
  glows, shaded from three's Lambert material (so its tissue takes the scene's
  lights), blended premultiplied so its tissue covers what is behind it and
  its light adds on top. While `xray` is above 0 the body is drawn with a glass
  variant of its material (smoky across its face, stronger at its edges, its
  reflections kept) and sorted with the world's glass; at 0 it is exactly the
  opaque body again and the nervous system isn't drawn. Thin tubes and small
  organs are kept at least a pixel wide, as the legs are.
- **The panel's view.** `createNervesPanelMaterial` draws the same geometry
  and glow from above into a rectangle of the frame, posed at rest; the first
  two triangles of the geometry are its backdrop.

## How it moves

`src/rig.ts` turns the pose into a frame for every rigid piece. Inputs are
smoothed first (first-order lags and rate limits), so any pose, however
jumpy, gives continuous motion.

- **Walking** (`src/gait.ts`). A continuous speed-dependent phase spread
  gives wave-like support when slow, tetrapod-like overlaps between, and
  alternating tripods at speed. The stance advances each planted foot by the
  pose's translation and yaw, including turning and backing; swing targets
  centre the next stance around home. Stance travel is ~0.85–0.95 mm,
  with a 22–35 ms recovery. This approximates the published stance-duration
  scaling; it is not a replay or a fitted neural locomotor circuit. First
  swing samples use a half-frame offset so recovery remains visible at 30 Hz.
  `node packages/fly/scripts/gait.ts` extracts contacts at 1 kHz, prints duty
  factors, relative lift phases, step travel and support counts, and compares
  stance duration to DeAngelis et al.'s equation 1. The numerical timing and
  phase spread are animation choices informed by Mendes et al. (2013),
  Wosnitza et al. (2013) and DeAngelis et al. (2019); those experiments differ
  in substrate, temperature, sex and sampling, so the table is a dimensional
  comparison rather than a claim of a universal gait.
- **Legs** (`src/leg.ts`). The tarsus is laid along the ground back from the
  claw, the coxa turns partly toward it, and femur and tibia close the gap
  as a two-bone chain with the knee up and out. Each knee remembers its
  last bend so it swings round rather than flipping when its pole passes
  through the line of the leg. Out-of-reach targets are approached, never
  stretched to; each leg also has a reach the gait keeps its feet within.
- **Standing**: the abdomen breathes, the head glances about, the antennae
  twitch, and now and then a foot shifts. This is animation, not behaviour:
  it never moves the fly, and it fades out whenever the pose asks for
  anything.
- **Grooming**: a sustained command starts with foreleg rubbing, then eye
  and antennal sweeps. The hind legs subsequently sweep the abdomen, folded
  wings, and rub together. The opposite pair stays planted during each stage.
  The sequence crossfades through six-foot support and repeats every 12 s.
  Seeds et al. (2014) motivates anterior-to-posterior ordering and interleaved
  leg rubbing. The command has no dirt level or cleaning-site selection:
  the clock and site targets are explicitly an animation stand-in, not a
  simulated suppression hierarchy. Feeding takes precedence; walking and
  flight suspend the sequence.
- **Feeding**: the body lowers and the head bows, the proboscis unfolds to
  the surface and its labellum spreads and pulses; the mouth anchor is on
  the surface.
- **Wings**: opening sweeps them out from the folded position; beating
  spreads eight copies of each wing across the stroke (cosine-spaced, so
  denser at the stroke reversals where a real wing lingers) with a
  translucent haze joining their mid-chords, a slight per-frame jitter and
  one brighter copy. It reads as a blurred, buzzing wing at 30 and at 60
  frames a second instead of strobing, because it does not depend on
  sampling a 200 Hz beat. On the ground the amplitude follows `wings`.
- **Take-off and flight**: `crouch` lowers the body, draws the middle legs in
  and raises the wings a little. When `airborne` turns on the legs stay
  extended for a moment as if pushing off, then fold (front legs under the
  head, the others trailing). In the air the body takes `pitch` and `roll`
  and the stroke plane tilts. `landing` extends them during approach while the wings keep beating. The
  game's pose maps descending trajectory and surface distance to this amount;
  it is a time-to-contact animation proxy, not optic-flow sensing or a command
  to the physics (van Breugel & Dickinson 2012). Without an approach value,
  `airborne` turning off extends them; the body dips as they take its weight.

## Why it is animated this way

The Apple TV runs the game's JavaScript with no JIT, and a frame's cost
follows the number of objects and draw calls. So:

- **Two meshes, two draw calls**: the opaque body and the transparent wings
  (single pass, though double-sided). Shadow passes reuse the same joint
  uniforms through custom depth materials.
- **Rigid skinning in the vertex shader from a uniform array.** An insect's
  exoskeleton does not bend inside a segment, so every vertex belongs to
  exactly one joint, with no weights. Vertices are stored in their joint's
  own space; the rig writes each joint's 3×4 matrix into a `Float32Array`
  that *is* the uniform (`vec4 uJoints[123]`), and the shader applies one
  matrix per vertex. This was chosen over a `SkinnedMesh` because that would
  mean 41 bone `Object3D`s for three to traverse and update every frame, a
  4×4 matrix per bone, an inverse-bind multiply and a bone texture upload,
  all in JavaScript; and over a CPU rewrite of the vertices because that
  costs thousands of vertices of JavaScript. Here the per-frame JavaScript
  is a few hundred multiplies on typed arrays, and there is no scene-graph
  node per joint.
- **Nothing allocated per frame.** All scratch is preallocated; the tests
  run the update in V8 with its compilers off and check that it allocates
  nothing but the boxed numbers V8's interpreter makes (JSC does not box
  doubles at all).
- **Built on three's physical material** (via `onBeforeCompile`), so the fly
  takes the game's lights, shadows, fog and environment. Roughness,
  clearcoat and sheen come per vertex. When the scene has no environment
  map the shader reflects a soft painted sky with a studio "window", so the
  cuticle and eyes stay glossy under any lights; with one, it uses that.
- **Thin parts stay at least a pixel wide.** Tubes (legs, arista, bristles)
  carry their axis and radius; the vertex shader measures the radius in
  pixels and pushes the surface out to about half a pixel if it is thinner,
  so legs never break into dots in a 640×480 frame without antialiasing.
  The viewport height comes from `onBeforeRender`.

## Budgets

| | |
| --- | --- |
| Draw calls | 2 (plus 1 each in any shadow pass); the X-ray 1 more |
| Triangles | about 15,400 (body 14,900, wings 530); the nervous system about 16,100 |
| Joints | 41 body joints (thorax, head, 2 antennae, 3 proboscis, 2 abdomen, 2 halteres, 30 leg segments) and 16 wing copies |
| `update` | about 2.4 µs in Node with its JIT, about 78 µs in V8's interpreter alone (the nearest Node gets to the TV) |
| Textures | one 256×128 RGBA `DataTexture` (wing venation) |
| Uniforms | the body's 41 joints (123 vec4), the nervous system's glow (24 vec4) |

## The viewer

`npm run fly:viewer` serves `viewer/` on port 5287: sliders for every pose
value, presets for each behaviour, a turntable, slow motion, a fixed 30 or
60 fps step (to judge the wing blur), the environment map and shadows on or
off, and the **in-game view**: a 640×480 buffer with no antialiasing,
stretched to 16:9 like the TV, with the fly a chosen number of pixels long.
With "walk over the ground" on, the fly moves over a grid as the pose says,
so a sliding foot shows. Under Nervous system: the X-ray's amount and test
patterns to light the parts (all of them, one role, one part, a ramp of
levels, or a wave through them in order), which only the viewer makes; the
game lights them from the brain. `?shot` starts it paused with the panel
hidden, and `window.viewer` lets a script pose, step and frame it, light the
nervous system (`xray`), draw the corner panel's view of it large (`panel`),
and show only some meshes on a plain background (`only`, `background`).

## Accuracy

Right, or close: the three tagmata and their proportions, the big red eyes
with facets and a pseudopupil, three ocelli, antennae with a plumose arista,
the proboscis and its extension, coxae arranged as in the fly, five-part legs
with claws and pulvilli, the wing outline and its vein pattern, folded flat
one over the other, halteres, the main thoracic and head macrochaetae, the
male's banded abdomen with a dark tip and his sex combs, the speed-dependent coordination with
short swings and metachronal phase spread, feet that stay planted.

Simplified: tarsomeres 2–5 are one rigid piece; the trochanter is part of
the femur; the coxae swing but do not twist; the eye is an ellipsoid cap and
its facets are a texture effect, not geometry; the pseudopupil is one soft
spot; the microchaetae are a pattern; bristle positions are approximate and
there are fewer than on a real fly; leg hairs are left out; the wing is flat
and its beat is drawn as a blur rather than simulated; the wingbeat
kinematics (stroke plane, rotation at reversal) are approximate; the head
groom path is a stylised sweep.

## What I would do with more time

- Shade the thorax with its sutures and sclerites (notopleural and
  transverse sutures, the humeral calli) and add hairs to the legs.
- Model the tarsus as four bending segments that roll onto the ground.
- Fit per-leg trajectories to a shared male walking dataset, including
  curved walks and backing, beyond the dimensional stance comparison.
- A female variant (pointed, striped abdomen, no sex combs).

## Movement references

- Mendes et al. (2013), [Quantification of gait parameters](https://doi.org/10.7554/eLife.00231).
- Wosnitza et al. (2013), [Inter-leg coordination in the control of walking speed](https://doi.org/10.1242/jeb.078139).
- DeAngelis et al. (2019), [The manifold structure of limb coordination](https://doi.org/10.7554/eLife.46409).
- Seeds et al. (2014), [A suppression hierarchy among competing motor programs](https://doi.org/10.7554/eLife.02951).
- van Breugel & Dickinson (2012), [The visual control of landing](https://doi.org/10.1242/jeb.066498).
- Kopp (2011), [Drosophila sex combs as a model of evolutionary innovations](https://doi.org/10.1111/j.1525-142X.2011.00507.x).

See `docs/fly-realism.md` for the experiment rubric, measurements and blind review log.
