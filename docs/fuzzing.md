# Headless life fuzzing

The harness drives the existing worlds without drawing. It never supplies an
extra decision to the live brain. Recovery probes run separate copies of the
body, with deliberately chosen intents, to ask whether physics permits an
escape.

```sh
npm run fuzz -- --kind body --place all --seeds 1,2,3 --duration 21600
npm run fuzz -- --kind life --place windowsill --seeds 1,2,3 --duration 1200
```

- `--kind body|life|both` (default `both`). Body runs need no connectome;
  life runs need `npm run brain:fetch`.
- `--place all|picnic|windowsill|lab|bar` (default `all`).
- `--seeds 1,2,3` lists actual unsigned 32-bit seeds, not a seed count.
- `--duration 3600` is simulated **seconds per seed per place**, default one
  hour. Thus three seeds at 21600 seconds give 18 hours per place.
- `--high-starts` also samples standing surfaces above the place's flight
  ceiling in the body fuzzer. Ordinary random starts are standable surfaces
  inside the floor, below that ceiling; every run also exercises the normal
  start. High starts also explore the window frame, far above the documented
  flight ceiling.

Reports are JSON lines on stdout, with life progress each simulated minute on
stderr. Redirect stdout to keep summaries. A failure stops the run, naming the
place, seed, step, simulated time, replay command and state. Body failures
include the input and a single-step checkpoint; recovery failures identify
an assertion in the counterfactual probe. Replaying the seed reproduces
private wall-turn state too. Physics regressions reduce discovered failures
to small independent tests in `packages/body/tests/motion.test.ts`.

The body fuzzer changes intents abruptly, including contradictory feeding,
walking, backing and flight drives; varies frames from 10 microseconds to two
seconds; blows gusts up to 600 mm/s; and starts elsewhere every simulated
minute. Each step checks finite coordinates, velocities, normals and motion
scalars, nonpenetration, standing height/slope/floor, landing events and
bounded excursions from the floor and ceiling. Straight walking paths are
also ray-checked for tunneling; bent sliding paths cannot be checked using
their chord. Dedicated regressions check thin walls and a grazing box corner.
Every 30 simulated seconds, recovery probes remove wind and wings, require a
landing inside 20 seconds, then try eight walking headings (3 seconds each)
and take-off headings. At least one walking heading must travel 3 mm and at
least one launch must rise 2 mm. These checks sample recovery; they are not an
exhaustive proof of every point in the world.

The life fuzzer uses `InProcessBrain`, a synchronous `BrainDriver` backed by
`createBrain`, sharing the same senses/commands contract as the worker and
native drivers. Time goes through the brain rather than being skipped, and
no `light` is sent, so hand-wired looming remains enabled. Random events drop
food near and far, stroke the fly, blow air, move a looming sphere, and carry
the fly to another place and back. Excursions are instantaneous so the reported
time belongs to the named place. Carries preserve the brain, set the fly at
the new start standing still, and replace all food with the new patches.
Commands, readout/region rates, stats, senses and food amounts are checked.
Rolling ten-minute checks require walking, resting and motion with a live
brain; runs of at least ten minutes must also eat. Reports include the
observed activity durations, travel, meals, take-offs, stimuli and carry modes.
Separate tests guarantee carries during walking, flight and eating even when
a random run misses a short flight.

`npm test` uses three five-minute body seeds per place and a short fixed-seed
real-brain run in each place, including eating. The real-brain tests share one
brain to avoid rebuilding the connectome repeatedly, and skip with an explicit
message when the data is absent. Longer runs belong behind `npm run fuzz`.

## Design cases to keep visible

The ceiling and floor edge exert restoring forces, rather than hard clamps.
Sustained maximum wings or wind can hold a fly beyond them; checks allow
250 mm beyond the floor and 400 mm above the ceiling, and require recovery
with those drives removed. Making those boundaries hard would change the
body's documented physics.

An artificial start atop the windowsill's 560 mm frame, above its 260 mm
flight ceiling, can leave the fly behind the window when blown over its
head. The glass then blocks the restoring force's way home. Reproduce with:

```sh
npm run fuzz -- --kind body --place windowsill --seeds 4 --duration 2017 --high-starts
```

This needs a decision about the playable volume or out-of-world recovery;
the harness does not add a scripted climb or teleport around the brain.
The basil's drawn leaves are also a separate scenery/collision design task.
