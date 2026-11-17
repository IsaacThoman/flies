# Findings requiring follow-up

## Historical open-edge antennal contact

This finding was captured on dev `c53a64c` and handed to the antenna-contact
owner. It is now fixed upstream by #114; the fresh `cb9b9da2` hour records zero
bump input and zero grooming. No antenna code is changed by this branch.

The one-hour disc run spent 84.38% of recorded time displaying head grooming,
94.59% of grounded time in the outer half of the disc, and only 4.91% translating.
This is an environmental diagnostic, not a published grooming comparison.

`SenseTracker.#pressing` (`packages/body/src/senses.ts`) then returned `body.onFeet`
when an antenna tip lies outside `world.onTable`. Empty space beyond the floor
therefore supplies full contact to that antenna. This drives Johnston's-organ
C/E input, which the existing brain README documents as causing head grooming
and suppressing walking. An empty boundary does not physically deflect an
antenna. The code path is established; its quantitative contribution to this
run has **not** been isolated with a controlled intervention or contact tally.
The elevated grooming occupancy alone does not prove that this is its sole cause.

Proposal for the body/collision owner: distinguish an actual object touching the
antenna from absent floor under its tip. Keep existing physical-wall and other-fly
contact, and leave grounded/load input to its owner. Validate an antenna extending
past an open ledge with no object, a real wall at the same position, and an airborne
antenna inside a solid. Then compare paired seeds through the real brain and body,
reporting both contacts and behaviour; do not replace the contact with an edge-turn
command. No production change is made here because boundary/collision work is
owned by another experiment.

## Steering calibration

No threshold-qualified ground saccades occurred in the hour. The documented
command-to-yaw cap is 3 rad/s (about 172 deg/s), below the 200 deg/s detection
threshold used by Geurten et al. The absence is not a zero-duration saccade.
Raising a gain to cross that threshold would fit the scorecard.

The independent bilateral DNa02 recordings linked in the README offer a possible
rate-to-motion calibration. Extract a slope, its variation across flies and its
temporal filter before changing the body mapping. Preserve a held-out kinematic
reference; plotting limits are not calibration data.

## Assay coverage

Individual feeding contacts/bursts, dust loads and posterior grooming
readouts are missing. Optical looming is now executable,
as documented in `assays.md`; its surrogate limitations remain explicit.
Continuous intake cannot be counted as repeated
sips, head grooming cannot establish a whole-body hierarchy, and injecting the
loom-detector input cannot validate a projected visual escape. Hunger and the eyes'
ON pathway remain with their existing owners. More unconditioned simulation hours
cannot repair these measurement gaps.

## Optical pattern selectivity and light-off (do not tune the motor threshold)

The optical pilot at 06:00 (ZT0), with the real facets and zero direct loom
inputs, yielded 1/6 black-square jump-and-flight responses, 0/6 checkerboard,
1/1 uniform dark flash and 0/1 blank. These tiny pilot counts motivate the
independent cohort; they do not estimate population probabilities reliably.
Fotowat et al. (2009), Results/Figures 2–3, reports 82% and 87% looming
responses, while red-eyed WT light-off had 0/10 responses. Our uniform flash
is not the paper's four-LED apparatus and pigmentation is absent, so it remains
an unscored diagnostic. The contrast between the model's patterns may expose
luminance-driven escape rather than robust expansion selectivity.

The source distinguishes parallel non-GF visually guided escape from the GF
light-off pathway. The model's takeoff command reads the giant fibers; a
body-level launch mapping cannot manufacture the absent descending decision.
Do not lower ESCAPE_ON to make checkerboards succeed. Eye ON-pathway or
other protected neural work belongs to its owners; this finding is a proposal
for pathway/readout validation, not a code change to those areas.

The historical dev `588da9b1` 112-trial cohort (seeds 20000–20111, 06:00) confirmed the pattern:
20/48 black squares, 1/48 checkerboards, 7/8 uniform flashes, 0/8 blanks;
all met stationary readiness. Black-square TTC fit: slope 2.259 (model SE
0.442), intercept −81.574 ms (model SE 11.833). The paper's central intercept
is −6 ms; negative model TTC was retained. One checkerboard response cannot
support a timing fit. The body impulse-direction experiment preserved every
first-response time and success in this paired cohort; changing launch
mechanics cannot create the missing visually guided decision.

A further readout mismatch deserves a separate neural/interface experiment:
`DNp01` is smoothed with tau=40 ms and normalized at 200 Hz before the body's
0.4 (80 Hz) takeoff threshold. A single spike in one of the two GF neurons,
observed over a 5 ms chunk, produces `(1-exp(-5/40))*1000/(5*2*200)` =
0.05875 command units, far below 0.4. Fotowat et al. describes single-GF-spike
motor activation, while WT visually guided escape can use a parallel non-GF
pathway. Lowering the body threshold to manufacture checkerboard success
would neither restore that missing pathway nor establish correct WT light-off
selectivity. The clipped, smoothed command also cannot be treated as an exact
single-spike timestamp. No threshold change is made here.

Current dev `58481d6c` changes the quantitative picture: black-square responses
are 44/48 in both independent cohorts, checkerboard 26/48 and 27/48, flash
8/8 and blank 0/8. The two complete optical engineering composites are 3.9375
and 4.7361/10. Timing and checkerboard selectivity remain poor; the historical
counts above must not be presented as current measurements. Upstream antenna,
collision and sleep work landed together, so no isolated mechanism is inferred.
See `current-dev.md` for exact fits and uncertainty. A body impulse change did
not alter response timing in its paired experiment and was rejected in review.


## Visual update and paired checkerboard loss

A fresh rebase onto dev `cb9b9da2` includes the protected ON pathway (#104).
Using the same assay and fixed seeds as dev `58481d6c`, checkerboard responses
fell 26/48 to 11/48 and 27/48 to 11/48 in the two independent seed cohorts.
There were 18 paired losses/3 gains and 17 losses/1 gain. Readiness times and
eligibility match exactly; black-square responses changed 44/48 to 45/48 and
44/48 to 44/48, flash stayed 8/8 and blank 0/8. Every free-hour diagnostic
matches exactly. The six-comparison engineering composites changed 3.9375 to
3.104167 and 4.736103 to 3.413598. These are upstream snapshot observations,
not changes made by this branch or population-level biological statistics.

The brain README describes ON activity inhibiting OFF-pathway responses and
weak directional selectivity; that is a possible mechanism, not isolated here.
Proposal to the visual-pathway owner: replay this fixed-screen 4×4 checkerboard
battery, inspect L1 withdrawals, T4/T5, LC4/LPLC2 and descending activity, and
separate the ON interaction from the missing parallel escape readout. The
paper pools an orientation mixture, while this model uses a right-side screen;
counterbalance that reconstruction asymmetry in a separate validation assay.
Do not raise sensory gain or lower a body threshold solely to recover 87%.
No protected eye or neural code is edited here.

The regression review also found that the inherited HS direction-selectivity
guard changed from 2× to 1.3× in `packages/brain/src/seeing.test.ts`. A pass
under the latter bound does not establish preservation of the former. This
change belongs to the upstream visual work, not the ethogram feature diff.
All five current CPU budgets pass, but the all-senses brain case supplies only
scalar senses; it does not exercise active visual withdrawals. A controlled
native/WASM checkerboard, grating and flicker cost replay remains needed.


## Steering raw-data audit — no calibrated gain claimed

The public bilateral DNa02 source is [Rayshubskiy et al., eLife 102230,
Figures 2–3](https://pmc.ncbi.nlm.nih.gov/articles/PMC12279373/), with
[data DOI 10.7910/DVN/0NCLP1](https://doi.org/10.7910/DVN/0NCLP1). Four paired recordings are
available. The shortest file (a2_d_13) was downloaded and matched its published
MD5 `c3f95c76e9efc1a5b2277e7ee958143e`; SHA-256
`a460eb313b503b039b3eeec554efd902b54119aadfd783c72210efaee2daee24`.
It contains 5,750,000 samples in each voltage channel and 57,500 ball samples,
not a ready-made neuronal-rate-to-yaw calibration. The paper uses virgin
females 1–2 days after eclosion on a spherical treadmill, unlike the male model.

The [archived secondary-analysis import notebook](https://github.com/wilson-lab/rayshubskiy_elife_102230_secondary_analysis_code/blob/7e2895349266b5cc5fa1bf53ad56e8ecc6c842e8/import_preprocess_data.ipynb) identifies ephys_A/B as left/
right DNa02 and selects a prominence of 15 for its a2_d_13 example, while noting
that thresholds need per-recording inspection. It uses 12.5 ms bins / 25 ms
Gaussian smoothing; the paper's Methods state 1.25 ms / 2.5 ms. These describe
different preprocessing scales and must be reconciled against the final figure
pipeline before a transfer gain is promoted as validated. The notebook also
contains provisional unit-scaling notes. Neither plot-axis limits nor one
unreconciled recording supplies a universal body gain. No steering constant is
changed or numeric calibration target invented here. A further experiment
should establish units, per-recording spike extraction, temporal alignment,
state conditioning and between-fly uncertainty across all four recordings.
