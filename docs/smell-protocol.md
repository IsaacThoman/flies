# Smell in the world: protocol

Written and committed on 18 November 2026, before any measurement it
describes. It puts food's odour into the game's world and fixes how that is
judged. The [olfaction study](olfaction-study.md) is its background; this
protocol takes over where the study's rule stopped it.

## The owner's decision

On 18 November 2026 the owner retired gate 2 of the
[second-round protocol](olfaction-gates-protocol.md) as mis-specified. It
measures the network's sensitivity to any perturbation, not a fault in smell:
a matched pulse on the head's bristles fails it about as often as odour does,
and touch is already in the game. Gate 2 is not passed, as written or as
amended, and it is not amended again: it is retired. Gate 3 (steering)
passed. The owner approved putting smell in the world, validated by the
whole-animal experiment the study's
[next-experiment section](olfaction-study.md#limits-and-the-next-experiment)
describes, which is Part D of the second-round protocol, run as written below.

Part D's last rule (smell goes into the game only if it helps the fly find
food) is replaced by the owner's ship rule: smell goes into the game by
default unless it breaks an existing behaviour that tests or documented
measurements hold (the checks below say what counts). Then it stops, is
written up, and stays behind an off-by-default option. Whether the fly finds
food sooner is reported, whichever way it comes out.

## The field

As Part D fixed it, in `packages/world/src/plume.ts`: for each source,

C = min(1, (r₀ / r) · exp(−U (r − x) / 2D))

the steady solution of advection and diffusion from a point source on a floor
in uniform air, normalised to the food's edge (r the distance from the food's
centre to the antenna, x its downwind component, r₀ the food's radius).

| Constant | Value | Where it comes from |
|---|---|---|
| D | 10 mm²/s | Part D: about these volatiles' diffusivity in air (chosen; Fuller estimates 6–16) |
| U, in the assay | 20 mm/s | Part D: a slow indoor draught (chosen) |
| U, in the game | the air's own velocity where the fly is, across the ground | the place's gusts and draughts, the player's puffs (the same air the fly feels as wind, less what carrying it adds); in still air U = 0 and C = r₀ / r |
| Source strength | the food's odour (`TASTES`, `packages/world/src/tastes.ts`) times C, each odorant | which odorants from what the food is; how strong chosen in three steps (1, 0.3, 0.1) |
| Fading | as taste fades: full until the last quarter of the food is eaten | `tasteIntensity` |
| Floor | 0.01 | chosen: under it nothing is sent, so a fly away from food smells nothing and its brain is spike for spike what it was; at 0.01 the strongest answer in the table (V to CO₂, +220 Hz) adds 2.2 Hz |
| Sources add, each odorant held at 1 | | mixtures add in the brain too (Silbering & Galizia 2007) |

The antennae sample it where the body already puts their tips (for touch and
temperature), into reused buffers, as `BrainSenses.odor`. Nothing else: no
steering term, no distance bonus, no food-directed background. A labelled
simplification: no turbulence or intermittency, no time to build up, and
solids don't block it.

## The whole-animal assay (Part D)

Unchanged from Part D except where marked. `scripts/plume.ts --part reach`.

- **The fly.** The game's `Life` (body, senses, the TypeScript brain), 10 ms
  steps, the ethogram's 43 mm arena, eyes open on uniform grey 0.5, clock held
  at 06:00 (sunrise 06:00, sunset 18:00). Hunger held at 1 throughout (the task
  asks for a hungry fly; Part D left it unstated: added here).
- **The air.** A uniform draught of 20 mm/s toward +z, which the fly also feels
  as air, in both conditions.
- **The food.** A patch of r₀ 2 mm, sweet 1, on the floor 12 mm upwind of the
  start (z = −12) and 5 mm to one side (x = +5, layout A; x = −5, layout B).
  The fly starts at the centre facing across the wind, away from the food's
  side. With odour, it gives off the five odorants at 1 (the lab's fermenting
  food in `TASTES`, Part D's fermenting fruit); without, nothing, the run
  otherwise identical.
- **Time.** 30 s settling with no odour in both conditions (so each pair is
  identical until odour starts, which the reducer checks), then 180 s.
- **Success:** the head within r₀ + 1 = 3 mm (across the ground) of the food's
  centre at any time in the 180 s. Time to reach: the first such time.
- **Seeds 51–70**, used by nothing before, both layouts, odour on and off:
  80 runs.
- **Report:** successes over all 40 runs with odour and without, each with a
  Wilson 95% interval, the paired difference and an exact one-sided McNemar
  test on the discordant pairs; every run's outcome, time and closest
  approach; the median time over all trials (a time only if more than half
  reach). Smell **helps** if odour-on succeeds more often with p < 0.05.

**Still air (added, reported with no decision).** The same 80 runs with no
draught, U = 0: the game's usual air, where the field is diffusion's alone.

No constant above is changed after a measurement.

## Checks on existing behaviour (the ship rule)

Each paired, odour against none, on the same seeds. A check that fails stops
smell going into the game by default.

| Check | How | Fails if |
|---|---|---|
| Feeding on reaching food | the reach assay: of pairs where both runs reach the food, whether it eats (`Life.eating`) within 10 s of first reaching it | fewer eat with odour, exact one-sided McNemar p < 0.05 (both airs) |
| Escape from a loom | the ethogram's black looming square at each of its six l/v, seeds 30000–30003 (24 trials each way), 06:00; an odour-only source of r₀ 3 mm, the five at 1, 8 mm from the platform's centre, still air | fewer escape with odour among pairs eligible both ways, exact one-sided McNemar p < 0.05 |
| Sleep at night near food | 01:00 held, an hour, seeds 1–6, the arena in still air, an odour-only source of r₀ 2 mm, the five at 1, at its centre, the fly started 6 mm from it; natural hunger | the mean share of the hour asleep with odour is under half of that without |
| The brain's cost | `npm test`'s budgets, with odour added to "everything at once" | any budget fails, unrelaxed |
| The tests | `npm test` with smell in the game | any test that holds a behaviour fails |

Reported with no decision: the share of time walking at rest near food (13:00,
ten minutes, otherwise as the night check), the walking share during the reach
assay, CPU time per simulated second at rest and with the five odorants at 1
at both antennae (seeds 1–3), and the senses' sampling cost.

## What the game says

The About screen says only what was measured: that it turns toward a food it
smells (gate 3), and whether, in this assay, that brings it there sooner.
Homing is expected only near the food: quarter-strength odour barely turns
it, and nothing here follows the wind upwind.
