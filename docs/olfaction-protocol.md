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
