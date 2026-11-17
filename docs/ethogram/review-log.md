# Blind review record

## Reference-registry baseline

The rubric is in `review-rubric.md`. Three fresh independent reviewers each
received only that rubric and two neutral evidence paths. Each independently
verified all numeric targets against primary papers via web search. Their order
was randomized (T9/M4, M4/T9, T9/M4). The key: **M4 and T9 were identical copies
of the initial reference registry**, a deliberate duplicate control. No reviewer
saw earlier scores or the author's reasoning.

| Reviewer | Set | Citation validity | Honesty | Behaviour agreement | Regression evidence | Mean |
|---|---|---:|---:|---:|---:|---:|
| A | T9 and M4 | 5 | 6 | 0 | 0 | 2.75 |
| B | M4 and T9 | 4 | 6 | 0 | 0 | 2.50 |
| C | T9 and M4 | 5 | 6 | 0 | 0 | 2.75 |

All three found the sets identical and assigned equal scores within each pair.
Forced presentation-order rankings were respectively T9/M4, M4/T9 and T9/M4;
all said the scientific ranking was a tie. No duplicate-control noise threshold
was exceeded. Mean across reviewers: **2.67/10**. Zeros signify absent evidence,
not observed failure of the simulated animal.

All 15 central reference numbers were independently confirmed. The important
corrections were feeding sex/deprivation metadata, Cruz's source subsection and
activity classifier, and precise figure-panel citations. These are incorporated
in the current registry. The paper's wall-following exclusions, duration/gap
filtering, and borrowed SE comparison scales remain explicit assay limitations.
No claim of validated biological agreement is made.

The reviewers' three shared objections were lack of measured behaviour and
regression evidence; non-equivalent assay/observable definitions; and inadequate
population metadata and acceptance-scale justification. All recommended a strict
machine-readable scoring eligibility gate. A whole-animal point score therefore stays unidentified: unsupported or incompatible evidence
cannot earn biological-agreement credit. The initial implementation retained separate exploratory distances; the subsequent assay revision removes them entirely.

Rejected behaviour changes: fitting speed to an unmatched female dataset,
raising turn gain until saccades appear, and scripting feeding/grooming patterns.
No behaviour improvement or completed hill-climb round is claimed from this
citation audit.

## Implementation comparison

Private key released here: R8 is the auditor at `223fd4c`; F3 is the working
implementation with input validation, ground-window exclusion, provenance
capture, airborne naming and lease scheduling. Evidence was frozen under neutral
paths. Presentation orders were R8/F3, F3/R8, F3/R8. Each reviewer received only
the rubric, evidence paths and the requirement to verify sources independently.
The one-hour report and full validation had not finished when these evidence
sets were frozen, so their behavioural/regression scores must not be read as
judgments on later measurements.

| Reviewer | Set | Citation/metric validity | Honesty | Behaviour agreement | Regression evidence | Mean | Ranking |
|---|---|---:|---:|---:|---:|---:|---|
| V7 | F3 | 6 | 7 | 0 | 5 | 4.50 | F3 > R8 |
| V7 | R8 | 5 | 6 | 0 | 4 | 3.75 | |
| D2 | F3 | 5 | 7 | 0 | 5 | 4.25 | F3 > R8 |
| D2 | R8 | 4 | 6 | 0 | 4 | 3.50 | |
| J4 | F3 | 6 | 9 | 0 | 5 | 5.00 | F3 > R8 |
| J4 | R8 | 5 | 8 | 0 | 4 | 4.25 | |

Both independently reproduced the targeted tests (13 and 11 respectively),
found identical production model/body code, and verified the central source
numbers. They reproduced R8's airborne-angle contamination and nonfinite-time
corruption; F3 excluded those observations. They explicitly found **no behavioural
improvement**. Main remaining objections: unmatched assays still have numerical
exploratory distances, missing real behavioural evidence within their permitted
files, and insufficiently visible inherited motor/background stand-ins. The CLI
now explicitly lists those stand-ins. All three implementation reviewers ranked F3 higher; mean 4.58 versus 3.83. A separate regression review remains outstanding; this is an auditor improvement, not a behavioural climb.

## Validation received after evidence freeze

- Full functional suite: 732 passed, 0 failed, 2 optional-data/toolchain skips.
- All CPU-budget cases except the all-senses brain bound passed. The bound is
  0.5 M5 Pro CPU seconds per simulated second: initial run 0.609; targeted repeat
  0.538; unchanged R8 control 0.529. The affected production and budget sources
  are byte-identical. The budget remains failing; no threshold is relaxed.
- Full lint and typecheck: passed.
- No UI/runtime source changed, so no browser e2e suite is touched by this audit.
- One real-brain hour is recorded in `baseline.md`. No multi-seed baseline or
  condition-matched overall score is claimed. The additional replicate sweep was
  cancelled without a completed report; more unmatched hours do not establish
  validity.

## Registry verification with optical policy

Three fresh reviewers received identical copies P6/H2 of the 21-row registry,
metric/scoring utilities and assay ledger, in orders P6/H2, H2/P6, H2/P6.
This duplicate control checks transcription; it is not a blind preference
comparison against the prior implementation. All corresponding scores matched.

| Reviewer | Both sets: validity | Honesty | Behaviour | Regressions | Mean | Forced presentation tie-break |
|---|---:|---:|---:|---:|---:|---|
| L5 | 7 | 7 | 0 | 0 | 3.50 | P6 > H2 |
| C8 | 7 | 7 | 0 | 0 | 3.50 | H2 > P6 |
| W1 | 7 | 6 | 0 | 0 | 3.25 | H2 > P6 |

Mean 3.42. All 21 central values and SD/SE ambiguity were independently
confirmed. No raw measurements or runner code were in this restricted packet,
so the zero behaviour/regression scores signify absent evidence. Remaining
findings and dispositions: explicit 200 Hz stimulus / 400 fps video metadata;
w1118 feeding strain; trial-backed scoring gate that rejects scalar coefficients
and recomputes estimates; separate probability/timing means with equal composite
weight; and registry-only bounds, never whole-animal fidelity bounds. These
changes are incorporated. Their integration still requires a fresh code review.

No duplicate-control noise threshold was exceeded. This transcription check
by itself is not counted as a behavioural hill-climb improvement.

## Launch mapping comparison — rejected

Key: **B3 = inherited launch; X8 = balanced launch components with conserved
initial impulse energy**. The source roots had independent local @fly module
resolution. Each received its own exact-source full tests, raw optical battery,
scorecard table and mechanics probe. The supplementary one-hour free record
was explicitly shared context, not a paired comparison. Orders were B3/X8,
X8/B3, X8/B3, independently randomized. Three fresh reviewers independently
checked all references and the Card & Dickinson mechanical source via the web.

| Reviewer | Set | Validity | Honesty | Behaviour | Regressions/cost | Mean | Ranking |
|---|---|---:|---:|---:|---:|---:|---|
| U2 | B3 | 8 | 8 | 2 | 9 | 6.75 | B3 > X8 |
| U2 | X8 | 8 | 8 | 2 | 7 | 6.25 | |
| G6 | B3 | 7.5 | 8 | 2 | 9 | 6.625 | B3 > X8 |
| G6 | X8 | 7.5 | 8 | 2.5 | 7 | 6.25 | |
| K9 | B3 | 8 | 7 | 2 | 9 | 6.50 | B3 > X8 |
| K9 | X8 | 8 | 7 | 3 | 6 | 6.00 | |

Mean: B3 **6.625**, X8 **6.167**. All three preferred the control, so the
launch change is **reverted**. They accepted the central reference numbers and
mechanical rationale, but not a universal exact 45° distribution or a broad
fidelity claim. All 112 optical readiness, takeoff, TTC and flight outcomes
were unchanged; probability agreement stayed 3.7375/10. No climb is claimed.
The candidate full suite failed one brain CPU case (0.502 versus 0.500), while
the control passed at 0.400. Separate unchanged-brain measurements also failed
at 0.546. Reviewers did not establish a causal body-to-brain-cost regression,
but did not count the failed required check as passing.

A separate fresh regression reviewer, R5, had inspected earlier neutral roots
A9/D4 (A9 inherited, D4 balanced), order A9/D4. It scored D4 7/10 and A9 5/10,
primarily because only D4's motion hash had full/play transcripts. That packet
was incomplete for a fair regression preference. The paired exact-source full
runs above supplied the missing control evidence; the provisional ranking is
not treated as proof of behavioural improvement. R5 flagged reduced vertical
clearance and requested the paired optical cohort, subsequently recorded.

The full reviewers found poor checkerboard selectivity, late black-square
responses (18/20 after projected collision), unmatched walking/grooming/feeding
assays, and body-supported flight. G6 also found that the optical classifier
could accumulate disjoint powered frames. Schema 3 now requires ≥50 ms
**continuous power in the first airborne episode**, records its longest run,
and refuses a later jump as evidence for the first departure. A trace test
covers disconnected runs and landing; historical schema 2 is not silently
rescored as schema 3. Feeding modes now explicitly retain the 30 ms-bin
histogram definition. No numeric source transcription was found false.

## Current-dev replication

Dev advanced during the experiment. The branch is rebased on `58481d6c`, with
upstream antenna/contact, collision and sleep-after-grounded work. Production
brain/body/world/Life source has **zero feature diff** from that dev. Earlier
588da9b1 measurements are versioned history in `dev-588da9b1.md`. A fresh hour
and optical battery at 06:00 use the continuous first-bout endpoint; any upstream
phenotype improvement is not attributed to the rejected launch experiment.
