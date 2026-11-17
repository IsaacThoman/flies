# Headless life fuzzing

The harness drives the existing worlds without drawing. It never supplies an
extra decision to the live brain. Recovery probes run separate copies of the
body, with deliberately chosen intents, to ask whether physics permits an
escape.

```sh
npm run --silent fuzz -- --kind body --place all --seeds 1,2,3 --duration 21600
npm run --silent fuzz -- --kind life --place windowsill --seeds 1,2,3 --duration 1200
npm run --silent fuzz -- --kind body --place restaurant --seeds 1,2,3 --duration 21600 --high-starts
```

- `--kind body|life|both` (default `both`). Body runs need no connectome;
  life runs need the packed connectome (`npm run brain:fetch` if absent).
- `--place all|picnic|windowsill|lab|restaurant|greenhouse|kitchen` (default `all`).
- `--seeds 1,2,3` lists actual unsigned 32-bit seeds, not a seed count.
- `--duration 3600` is simulated **seconds per seed per place**, default one
  hour. Thus three seeds at 21600 seconds give 18 hours per place for
  each selected kind.
- `--high-starts` also samples standing surfaces up to 400 mm above the place's flight
  ceiling in the body fuzzer. Ordinary random starts are standable surfaces
  inside the floor, at or below that ceiling, with room over them for the fly's
  body; every run also exercises the normal start. In a place with slabs a
  start also draws a height and stands on the surface at or below it, so
  starts fall on the floor under the tables, chair seats, table tops, the
  bar, shelves and lamps alike. The windowsill frame tops are above even the
  high-start limit. In the restaurant the top shelves and lamps are
  sampleable without high starts; high starts also reach the exit sign.

Reports are JSON lines on stdout, with life progress each simulated minute on
stderr. Redirect stdout to keep summaries and save the original invocation for
replay. A caught step or check failure stops the run, naming the place, seed,
step, simulated time, replay command and state. Body failures include the
input and a single-step checkpoint; recovery failures identify an assertion in
the counterfactual probe. Setup and data-loading errors can lack that context.
Full body replay with the same source, options and duration rebuilds private
wall-turn state too; the checkpoint alone does not. The printed body replay
rounds the duration up, so retain the original duration for failures on a
clipped final frame. Physics regressions reduce discovered failures to small
independent tests in `packages/body/tests/motion.test.ts`.

The body fuzzer changes intents abruptly, including contradictory feeding,
walking, backing and flight drives; draws frames from 10 microseconds to two
seconds (clipped to the remaining duration); blows gusts with horizontal
components up to 600 mm/s; and starts elsewhere every simulated minute. Each
step checks finite coordinates, velocities, normals and selected motion
scalars. It checks the feet's vertical column for 1.3 mm of body clearance,
standing height and slope, floor membership, standing-surface identity,
landing events and bounded floor and ceiling excursions.

`checkReach` in `scripts/fuzz/body.ts` samples head, thorax and abdomen points
in the air. On its feet it checks rays toward body and leg reach points
against sides and slopes too steep to stand on, stepping over low rises with
at most eight stair advances per ray. These reach checks allow 0.02 mm of
overlap. Leg overlap is also allowed when sampled nearby sides face each other
and prevent clearance on both sides. These are sampled checks, not a test of
the full drawn body. Straight grounded motion with an unchanged heading is
also ray-checked for tunneling when displacement aligns with the heading; bent
sliding paths cannot be checked using their chord. Dedicated regressions cover
thin walls and a grazing box corner in `packages/body/tests/motion.test.ts`,
and panes, walls, corners, a card thinner than the head, a slab's edge and a
gap narrower than the legs in `packages/body/tests/reach.test.ts`.

From the first step and then every 30 simulated seconds, recovery probes
remove wind and wings, require a landing within 20 seconds, then try up to
eight walking headings (up to 3 seconds each), stopping at success, and up to
eight take-off headings. At least one walking heading must travel more than 3
mm and at least one launch must rise more than 2 mm, except under something
lower than that over its body, where the launch requirement is waived, and in
a pocket whose sampled ways out within those 3 mm are narrower than its body,
where the walking requirement is waived. These checks sample recovery; they
are not an exhaustive proof of every point in the world.

The life fuzzer uses `InProcessBrain`, a synchronous `BrainDriver` backed by
`createBrain`, sharing the same senses/commands contract as the worker and
native drivers. Time goes through the brain rather than being skipped, and no
`light` is sent, so hand-wired looming remains enabled. Random events drop
food near and far, stroke the fly, blow air, move a looming sphere, and carry
the fly to another place and back. Excursions are instantaneous so the
reported time belongs to the named place. Carries go to any of the other
places, preserve the brain, set the fly at the new start (on the surface its
`y` names) standing still, and replace all food with the new patches. Food
dropped at the fly or a random start lies on the surface at or below that
height, rather than an overhead surface. Commands, readout/region rates,
stats, senses and food amounts are checked, along with the shared body-state
and reach assertions. Recovery probes run from the first step and then every
simulated minute; life runs do not use the body fuzzer's walking-sweep check.
Rolling ten-minute checks require walking, resting and motion with a live
brain; runs of at least ten minutes must also eat. Reports include the
observed activity durations, travel, meals, take-offs, stimuli and carry
modes. Separate tests guarantee carries during walking, flight and eating even
when a random run misses a short flight.

`npm test` uses three five-minute body seeds per place, the restaurant
included, and in a small diner of slabs (`packages/world/tests/diner.ts`)
with rails just over the floor, one too low to pass under and one the fly
just fits beneath; and a short fixed-seed real-brain run in each place,
including eating. The real-brain tests share one
brain to avoid rebuilding the connectome repeatedly, and skip with an explicit
message when the data is absent. Longer runs belong behind `npm run fuzz`.

## Design cases to keep visible

The ceiling and floor edge exert restoring forces, rather than hard clamps.
Sustained maximum wings or wind can hold a fly beyond them; checks allow
250 mm beyond the floor and 400 mm above the ceiling, and require recovery
with those drives removed. Making those boundaries hard would change the
body's documented physics.

The windowsill regression in `packages/body/tests/motion.test.ts` models a 560
mm frame and a fall behind the window. The current window and surrounding wall
extend to the kitchen ceiling (1350 mm), above the entire 660 mm flight
excursion volume, matching the drawn plaster above the opening. These
windowsill and restaurant room-wall tops are outside even the high-start
domain. The high-start seed is retained as a regression in
`packages/body/tests/fuzz.test.ts`:

```sh
npm run --silent fuzz -- --kind body --place windowsill --seeds 4 --duration 2017 --high-starts
```

The basil uses collision crowns rather than individual leaf colliders
(`packages/world/src/windowsill.ts`). Main foliage is held to those crowns
with a small drawing allowance; flowering-tip bracts use their own columns
(`apps/web/src/places/windowsill/sill.ts`).

The restaurant's pass is open through the back wall above its shelf. The
kitchen behind it now has a bench and side walls, defined by `PASS.kitchen` in
`packages/world/src/restaurant.ts`. Regressions in
`packages/body/tests/slabs.test.ts` retain the fruit-bowl sliding case,
sliding past plates beyond the floor, and continued movement under a high rail
after take-off. The original fuzz-run capture dates and machines for these
design cases are unknown; they are not fresh run results.


## Ordinary-frame cost

`node --expose-gc scripts/bodyCost.ts --baseline <git-ref> --steps 10000 --rounds 15` is intended to compare the body and world query code from a git
revision with the current code, on identical current place geometry. Walking
and airborne starts are precomputed from seed 42. Construction, placement and
explicit collection happen outside the timer; two warm-up batches precede
measured batches, whose before/after order alternates. It reports median CPU
microseconds per 1/60 s step using Node's thread CPU timer (process CPU time
on older Node), so time spent descheduled is excluded. The process-timer
fallback can include other threads, and CPU timing does not remove all
contention effects. These are Node measurements, not a measurement of
JavaScriptCore on the TV. The benchmark extracts only source files into a
temporary directory and removes them before exiting.

The chosen baseline needs compatible source files and geometry conventions
(`scripts/bodyCost.ts`). No fresh performance measurement is reported here.