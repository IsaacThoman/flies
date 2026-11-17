# Headless life fuzzing

The harness drives the existing worlds without drawing. It never supplies an
extra decision to the live brain. Recovery probes run separate copies of the
body, with deliberately chosen intents, to ask whether physics permits an
escape.

```sh
npm run fuzz -- --kind body --place all --seeds 1,2,3 --duration 21600
npm run fuzz -- --kind life --place windowsill --seeds 1,2,3 --duration 1200
npm run fuzz -- --kind body --place restaurant --seeds 1,2,3 --duration 21600 --high-starts
```

- `--kind body|life|both` (default `both`). Body runs need no connectome;
  life runs need `npm run brain:fetch`.
- `--place all|picnic|windowsill|lab|bar|restaurant` (default `all`).
- `--seeds 1,2,3` lists actual unsigned 32-bit seeds, not a seed count.
- `--duration 3600` is simulated **seconds per seed per place**, default one
  hour. Thus three seeds at 21600 seconds give 18 hours per place.
- `--high-starts` also samples standing surfaces up to 400 mm above the place's flight
  ceiling in the body fuzzer. Ordinary random starts are standable surfaces
  inside the floor, below that ceiling, with room over them for the fly's
  body; every run also exercises the normal start. In a place with slabs a
  start also draws a height and stands on the surface at or below it, so
  starts fall on the floor under the tables, chair seats, table tops, the
  bar, shelves and lamps alike. The current windowsill frame is above even the high-start limit. In the
  restaurant, high starts can explore the top
  shelves, the lamps and the exit sign.

The harness reports are JSON lines on stdout (`npm run --silent fuzz -- ...`
suppresses npm's own banner), with life progress each simulated minute on
stderr. Redirect stdout to keep summaries. Caught step or probe failures stop
the run with place, seed, step, simulated time, replay command and state.
Setup, loading and random-start errors outside those blocks can lack this
context. Caught body failures
include the input and a single-step checkpoint; recovery failures identify
an assertion in the counterfactual probe. Replaying the seed reproduces
private wall-turn state too. Physics regressions reduce discovered failures
to small independent tests in `packages/body/tests/motion.test.ts`.

The body fuzzer changes intents abruptly, including contradictory feeding,
walking, backing and flight drives; draws candidate frames from 10 microseconds to two
seconds (the final frame can be clipped below that range); blows gusts with each horizontal component up to 600 mm/s; and starts elsewhere every simulated
minute. Each step checks finite coordinates, velocities, normals and motion
scalars, nonpenetration (its feet out of every solid, and its body's 1.3 mm
over them clear of every underside, walking or flying), its reach (`checkReach`:
its head, thorax and abdomen out of everything in the air, and on its feet
those and its legs out of every side, and every slope too steep to stand on,
past a step over its feet; its legs only where it stands between two things
facing each other, against both, closer than they reach), standing on the
surface at or below its feet (height, slope, floor, and the surface it
thinks it stands on), landing events and bounded excursions from the floor
and ceiling. Straight walking paths are
also ray-checked for tunneling; bent sliding paths cannot be checked using
their chord. Dedicated regressions check thin walls and a grazing box corner,
and what the body reaches at panes, walls, corners, a card thinner than its
head, a slab's edge and a gap narrower than its legs (`packages/body/tests/reach.test.ts`).
Every 30 simulated seconds, recovery probes remove wind and wings, require a
landing inside 20 seconds, then try up to eight walking headings (up to 3 seconds each, stopping at
the first success)
and take-off headings. At least one walking heading must travel 3 mm and at
least one launch must rise 2 mm, except under something lower than that over
its body, where walking out is the only way, and in a pocket it fell into
whose every way out within those 3 mm is narrower than its body, where flying
out is the only way. These checks sample recovery; they are not an
exhaustive proof of every point in the world.

The life fuzzer uses `InProcessBrain`, a synchronous `BrainDriver` backed by
`createBrain`, sharing the same senses/commands contract as the worker and
native drivers. Time goes through the brain rather than being skipped, and
no `light` is sent, so hand-wired looming remains enabled. Random events drop
food near and far, stroke the fly, blow air, move a looming sphere, and carry
the fly to another place and back. Excursions are instantaneous so the reported
time belongs to the named place. Carries go to any of the other places,
preserve the brain, set the fly at the new start (on the surface its `y`
names) standing still, and replace all food with the new patches. Food
dropped where the fly or a random start is lies on that surface, not on
whatever is over it.
Commands, readout/region rates, stats, senses and food amounts are checked,
and the body as the body fuzzer checks it, its reach included.
Rolling ten-minute checks require walking, resting and motion with a live
brain; runs of at least ten minutes must also eat. Reports include the
observed activity durations, travel, meals, take-offs, stimuli and carry modes.
Separate tests guarantee carries during walking, flight and eating even when
a random run misses a short flight.

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

The windowsill used to have a 560 mm frame that could be sampled by high
starts, letting a fly fall behind the window. The window and surrounding wall
now extend to the kitchen ceiling (1350 mm), above the entire 660 mm flight
excursion volume, matching the plaster already drawn above the opening.
Room-wall tops are outside even the high-start domain. The regression case is:

```sh
npm run fuzz -- --kind body --place windowsill --seeds 4 --duration 2017 --high-starts
```

For the basil's visual/collision approximation, see [the place guide](places.md#the-world).

The restaurant's pass opens onto a modelled kitchen bench between side
walls (`packages/world/src/restaurant.ts`, `PASS.kitchen`). The old account
of an unmodelled void beyond the shelf no longer describes this geometry.
Regressions in `packages/body/tests/slabs.test.ts` cover sliding off the
fruit bowl, moving around plates beyond the floor, and continuing along an
underside instead of stopping dead beneath it.

## Ordinary-frame cost

`node --expose-gc scripts/bodyCost.ts --baseline <git-ref> --steps 10000 --rounds 15`
compares the body and world query code from a git revision with the current
code, on identical current place geometry. Walking and airborne starts are
precomputed from seed 42. Construction, placement and explicit collection
happen outside the timer; two warm-up batches precede measured batches,
whose before/after order alternates. It reports median CPU microseconds per
1/60 s step using Node's thread CPU timer (process CPU time on older Node),
so other tasks descheduling this busy machine do not inflate the results.
These are Node measurements, not a measurement of JavaScriptCore on the TV.
The benchmark extracts only source files into a temporary directory and
removes them before exiting.

The benchmark currently fails for `--baseline HEAD` (and the inspected
`origin/dev`): its extracted motion imports shape helpers from a generated
world entry that does not export them. This is a suspected extraction bug
in `scripts/bodyCost.ts`; the command describes the intended comparison,
not a successfully reproduced benchmark on this revision.
