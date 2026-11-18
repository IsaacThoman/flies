# Smell gates, second round: protocol

Written and committed before any measurement it describes. It continues the
[olfaction study](olfaction-study.md) under its [protocol](olfaction-protocol.md)
and [recovery protocol](olfaction-recovery-protocol.md), which stay as they are,
on a changed model: the olfactory receptor neurons (ORNs) now fire at rest and
answer odorants as recorded (`packages/brain/src/olfaction.ts`,
`orn-table.ts`), and the left antenna's less completely traced ORNs carry
completeness factors (`params.ts`). Those constants come from the recordings
and the wiring by rules written in those files; none is chosen by anything
measured here. Nothing below changes them, whatever it finds. The model under
test is the commit that adds this file.

The gates stay in order: a gate that fails stops the ones after it.

## Part A: the recorded assays, again

On the changed model, without editing them: `scripts/olfaction.ts --part
simulate` (seeds 1–3) and the recovery follow-up (`olfaction-controls.ts`:
calibration seeds 101–120, evaluation 21–23, both contexts, every family),
reduced by their own reducers. Their pulses now add to the ORNs' resting
firing. Each is reported against its own decision rule; no criterion changes.
The same assays on unchanged `dev` are run beside them, so the model's change
and the ORNs' resting firing can be told apart.

## Part B: what the one-second endpoint measures

The study's recommended next experiment. The recovery criterion compares a
pulsed run with its control one second at a time, 60 s later. Both start
from the same state and the same random streams, so the pair is identical
until the pulse; afterwards any difference in a spiking network may grow and
fluctuate whether or not anything of the pulse persists. This part measures
how far apart the smallest possible perturbation leaves them.

- **Minimal perturbation:** one spike, forced in one neuron at the pulse's
  onset (recorded second 2), through an input group appended after the
  study's, at a rate that fires it in one 1 ms step, then 0. Every run,
  controls included, has that group. Neurons, fixed by body ID: the lowest
  body ID of each of the five glomeruli's ORNs (DM1, VA2, DA2, V, DM5) and of
  each glomerulus's matched bristle set (`matchedInputs`): ten per seed.
- **Schedule:** exactly the recovery follow-up's pinned context: 20 s settling,
  67 s recorded, seeds 21–23, its pinned background levels, its observables.
- **Endpoint:** each command's absolute final-second paired residual,
  as in the follow-up.

Decision, recorded now:

1. If at least half of the 30 minimal perturbations fail the original 0.05
   command bound, the original endpoint is reported as unable to pass for any
   input to this network, olfactory or not, and is kept as a description, not
   a gate.
2. Recovery then passes when (a) Part A's late-population (1 Hz in each late
   five-second block), persistent-cell (no 20 Hz flag) and LH dose-response
   rules all pass for the 75 pinned odour pulses on the changed model, and
   (b) for no command are those pulses' absolute final-second residuals
   larger than the minimal perturbations': a one-sided Mann–Whitney U test
   (normal approximation, tie-corrected; a command whose residuals are all
   zero is skipped) at 0.05/8 for each command.
3. If fewer than half fail, the original endpoint stands as the gate.

## Valence

Bilateral commands carry no direction (the original protocol). Valence is
measured by gate 3: attraction is turning toward the antenna with more of an
attractive odour, aversion turning away. DM1 (Or42b) and VA2 (Or92a) are the
attractive channels and V (Gr21a/Gr63a, CO₂) the aversive one by their
published behaviour (olfaction-study.md), not by anything measured here.

## Part C: gate 3, steering

The brain alone, open loop, as the game runs it: wandering background on,
hunger 1, clock and sleep 0, standing, eyes shut, resting senses. A fresh
brain per run, 20 s settling, then 5 s with the odour. Seeds 31–40, used by
nothing before. Each seed also runs a control with no odour. Turn is the mean
of the `turn` command over the 5 s (positive toward the right).

| Condition | Left antenna | Right antenna | Prediction |
|---|---|---|---|
| P1, primary | ethyl acetate 1 | none | toward |
| S1 | CO₂ 1 | none | away |
| S2 | ethyl acetate 0.25 | none | toward |
| S3 | ethyl acetate 1 | ethyl acetate 0.5 | toward the stronger |
| S4 | the left antenna's DM1 ORNs +100 Hz | none | toward |
| S5 | isoamyl acetate 1 | none | reported, no prediction |

Each condition runs as written (more on the left) and mirrored (more on the
right). Its steering index for a seed is T = (turn mirrored − turn as
written) / 2: the seed's own side bias cancels, and T > 0 is turning toward
the antenna given more. Every other command is reported too.

**Gate 3 passes when P1's T is positive in at least 8 of the 10 seeds and its
mean's 95% t-interval excludes 0.** Each other condition is judged by the
same rule against its prediction and reported, pass or fail; S1 decides
whether CO₂ is called avoided.

## Part D: gate 4, the plume (only if gates 2 and 3 pass)

Opt-in, in a script (`scripts/plume.ts`); the game is not changed by it.

- **Field.** A steady point source on the floor in uniform wind: the exact
  solution of steady advection–diffusion in three dimensions, doubled by the
  floor, normalised to the food's edge: C = min(1, (r₀/r)·exp(−U(r − x)/(2D)))
  for each odorant, where r is the distance from the food's centre to the
  antenna, x its downwind component, r₀ the food's radius. U = 20 mm/s, a
  slow indoor draught (chosen), D = 10 mm²/s, about these small volatiles'
  molecular diffusivity in air (chosen; Fuller estimates give 6–16 mm²/s).
  No turbulence, intermittency or time to build up: a labelled simplification.
- **Sampling.** Each antenna's tip, where the body already places it for touch,
  into reused buffers, as `BrainSenses.odor`. Nothing else changes: no
  steering term, no distance bonus, no food-directed background.
- **Assay.** The ethogram's 43 mm arena, eyes open on uniform grey, clock 06:00,
  30 s settling with no odour, then 180 s. A food patch (r₀ 2 mm, sweet 1)
  12 mm upwind of the start and 5 mm to one side; the fly starts facing
  across the wind toward the other side. Mirrored layout: the patch to the
  other side, the fly facing the other way. The patch emits ethyl acetate,
  acetic acid, ethanol, isoamyl acetate and CO₂ at 1 each (fermenting fruit;
  chosen), or nothing in the odour-off runs, which are otherwise identical.
- **Success:** the head within r₀ + 1 mm of the patch's centre at any time
  in the 180 s. Seeds 51–70, both layouts, odour on and off: 80 runs.
- **Report:** successes over all 40 runs with odour and without, each with a
  Wilson 95% interval, the paired difference and an exact one-sided McNemar
  test on the discordant pairs, and every run's outcome and time. Smell
  **helps** if odour-on succeeds more often with p < 0.05. Only then is it
  turned on in the game, with the plume constants above unchanged.

No constant above is changed after a measurement of this part.

## Amendment 1, before any measurement on the configuration it names

Part C ran as written on the model above (the result stands and is
reported: P1 passed). Before Parts A, B or D were measured, the brain's own
tests found a fault that model's resting firing causes. At the recorded
resting rates (mean 13 Hz), the antennal lobe's broad local neurons, each
summing about 30,000 ORN synapses in one point compartment, fire at 250–310
Hz (il3LN6, lLN2F, lLN2T, lLN2P), the GABAergic multiglomerular MZ_lv2PN at
210 Hz, and most projection neurons fall silent (median 0 Hz); real local
neurons fire about 5–20 Hz at rest. Their inhibition reaches the backing
pathway's premotor inputs: touch's backing at night (sleep.test, depth 0,
touch 0.6) fell from 0.24 to 0.06. The cause is the model's single
compartment and missing presynaptic gain control, not the recordings, and
no measured constant could be found to repair it without choosing one.

So the model under test is now the same model with the ORNs' resting firing
off (`BrainOptions.restingSmell`, default false): each ORN fires at its
recorded answer to the odorants present, from silence, inhibition floored at
silence. With no odour it is the brain as it was, spike for spike. The
recordings and every other constant are unchanged.

On it, unchanged otherwise: Part A, Part B (decision rules as written) and
Part C again on seeds 41–50, used by nothing before, with the same rule (the
reducer's seed list is the only change). Part D, if reached, runs on it too.
Also reported, with no decision: the touch trial above with fermenting-fruit
odour (the five odorants at 1) at both antennae.

<!-- docs-check: generated scripts/plume.ts -->

<!-- docs-check: base packages/brain/src -->

<!-- docs-check: base packages/brain -->

<!-- docs-check: base packages/brain/scripts -->
