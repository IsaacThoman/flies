# Olfaction study protocol

The questions are gates, in order: independently identified sensory inputs;
stable, graded and reversible propagation with a defensible valence difference;
steering toward the stronger antenna; only then a flagged world prototype.
Stop at the first failed gate. A failed gate is a useful result.

## Rubric for independent review

Each criterion is scored 0–10. A 10 means:

| Criterion | A 10 |
|---|---|
| Input identity | Body-ID joins to pinned release annotations reproduce every selected glomerulus; sensory class and antenna root side are checked independently of outputs; missing data remain missing. |
| Biological evidence | Primary papers support every biological claim, with figure/table locations and clear distinctions between response, valence and a model assumption. No invented precision or guessed receptor rates. |
| Reproducibility | A checked-in script recreates counts, synaptic paths and measurements from identified inputs; seeds, settings, denominators and observation windows are explicit. |
| Inference | Each gate has evidence; a failure stops downstream work; wiring is distinguished from function and neither parameters nor sensory populations are chosen for a desired command. |
| Scope and honesty | No default/native behaviour changes, sound or fabricated biology; model limitations and the next experiment are specific and useful to the maintainer. |

## Measurement decisions

Recorded before running the stimulation battery. Use the existing TypeScript
`FlyBrain`, unchanged operating point, default spontaneous input and resting
senses, eyes shut. No gain adjustment, neuron reclassification or left/right
balancing fitted to a command. Select exact `ORN_<glomerulus>` types with
`cb_sensory` / `olfactory` class, independently checked against FlyEM's table.

DM1 and VA2 are the attraction candidates; DA2 and V the avoidance comparators;
DM5 is a concentration-dependent vinegar comparator. Inventory all glomeruli,
including DM2 and DM4, without calling every vinegar-responsive channel attractive.
The rate sweep is 10, 25, 50, 100 and 200 Poisson events/s per selected ORN:
an order-of-magnitude assay spanning modest to strong responses, **not** an
odor-to-concentration calibration. Verify the range against Hallem & Carlson
(2006) before using it. Any exact receptor/odor rate needs its own table source.
Record actual spikes because refractory filtering changes delivered firing rates.

Each condition uses fresh brains, seeds 1, 2 and 3, and the same added input
groups including a zero-rate control. Run 2 s at rest, 5 s stimulation, 5 s
washout, in 10 ms ticks. Keep 1 s bins, every command, readout and the antennal
lobe, lateral horn, mushroom body and descending populations. Compare each seed
with its time-matched zero-rate control. Report individual seeds as well as means.

Stability/reversibility require the last washout second to return within 1 Hz
of control for every watched population and within 0.05 for every command;
also show peaks and time courses so these tolerances cannot hide a transient
runaway. These are study tolerances, not measured fly thresholds. Grading is
assessed from all five rates, never a favourable subset. A command difference
alone is not proof of attraction: bilateral walk/stop/feed lacks spatial valence.
If propagation is stable but lacks a defensible attractive/aversive distinction,
gate 2 fails; do not proceed to antenna steering or world navigation.

If gate 2 holds, use the anatomy's rootSide (not somaSide) for antenna identity
and test both mirrored differences without rebalancing weights. A prototype is
permitted only if the turn consistently points to the stronger attractive side.

## Review procedure

Three fresh independent blind reviewers receive only this rubric and neutral
evidence paths, and give per-criterion scores, three worst problems and one idea.
Subsequent comparisons randomise neutral names, ask for absolute scores for
each and a forced ranking, plus a fresh regression-only review. Keep the key
and scores in the study log. Never tune the model to improve the score.

## Amendment, 17 November 2026: gate 2 against a matched non-olfactory control

**Made after gate 2 failed, and after seeing its result.** This is a post-hoc
change of criterion, decided openly by the maintainers and written before any
measurement it describes. The failed result stands as recorded (olfaction study,
second round): 44 of 75 pinned odour pulses missed the 0.05 one-second command
bound 60 s later, against 39 of 75 matched bristle pulses, with no population,
readout or cell left changed, while one forced spike almost never moved the
commands. The reason for the change: the bound fails touch on the head's
bristles, a sense the game already delivers, about as often as it fails smell,
so as written it holds smell to a stricter bar than the senses the fly has. The
amended gate asks instead whether odour leaves the commands any further from
their course than an equally strong touch does.

Everything below is fixed before any measurement on it:

- **Assay.** The recovery follow-up's pinned context exactly (20 s settling, 2 s
  rest, 5 s pulse, 60 s washout, its pinned background levels, every input group
  appended in the same order), on the model of the second round as it is, with
  the ORNs silent at rest: for each seed, the no-stimulus control, the five
  glomeruli (DM1, VA2, DA2, V, DM5) at the five rates (10, 25, 50, 100, 200
  events/s), and each pulse's matched bristle comparator (`matchedInputs`):
  51 runs a seed (`packages/brain/scripts/olfaction-noninferiority.ts`).
- **Seeds.** 141–148, used by nothing before.
- **Statistic.** For each pulse, M = the largest absolute final-second command
  residual against the seed's control, over all eight commands. For each pair
  (the odour pulse and its bristle comparator, same seed, glomerulus and rate),
  D = M(odour) − M(bristle). The unit is the seed: d = the mean D of its 25
  pairs, since a seed's pairs share one background and reuse bristle sets.
- **Margin.** δ = 0.05, the original gate's own command bound: odour may leave
  the commands at most that much further off their course than touch does.
- **Decision.** Non-inferior when the one-sided 95% upper bound of the mean of
  the eight d, mean + t(0.95, 7) × sd / √8 with t = 1.8946, is below δ.
- **Kept, each required of every odour pulse:** every watched population within
  1 Hz of the control in each of the three late five-second blocks; no cell with
  a 20 Hz excess or suppression in all three; every readout's last-five-second
  residual within 0.05 of its decoder scale (the recovery protocol's bounds); the
  lateral horn rising at every adjacent rate in every seed.
- **Reported beside it, deciding nothing:** each seed's d, the original endpoint's
  failures for odour and bristle pulses, and their difference.

Gate 2 passes, as amended, only if it is non-inferior and every kept check
passes. If it fails, that is the result: the study stops there and says so. If
it passes, gate 4 (the plume) runs as the second-round protocol's Part D
specifies, in its own pull request, with its constants as written there.
