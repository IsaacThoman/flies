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
now explicitly lists those stand-ins. All three implementation reviewers ranked F3 higher; mean 4.58 versus 3.83. At this evidence freeze a separate regression review was outstanding; later regression reviews are recorded below. This is an auditor improvement, not a behavioural climb.

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

## Continuous-flight estimator and current-dev evidence

Key: **R6 = schema-3 continuous first-flight estimator; N4 = identical decoy;
Z7 = cumulative estimator**. All production brain/body/world/Life sources
are identical across the three archives. Both raw optical cohorts and the
supplementary one-hour record are shared; copying them adds no animals.
Presentation orders: F8 N4/R6/Z7; J2 Z7/N4/R6; S5 N4/R6/Z7.
Each fresh reviewer independently checked primary publications on the web,
verified source hashes and recomputed the trial summaries/fits/scorecards.

| Reviewer | Set | Validity | Honesty | Behaviour | Regressions/cost | Mean | Forced ranking |
|---|---|---:|---:|---:|---:|---:|---|
| F8 | R6 / N4 | 7 | 6 | 2 | 7 | 5.50 | N4 > R6 > Z7 |
| F8 | Z7 | 6 | 5 | 2 | 9 | 5.50 | |
| J2 | R6 / N4 | 8 | 7 | 2 | 7 | 6.00 | N4 > R6 > Z7 |
| J2 | Z7 | 6 | 6 | 2 | 8 | 5.50 | |
| S5 | R6 / N4 | 7 | 7 | 2 | 6.5 | 5.625 | N4 > R6 > Z7 |
| S5 | Z7 | 5 | 5 | 2 | 8 | 5.00 | |

Mean R6/N4 **5.7083**, Z7 **5.3333**. Every reviewer assigned identical
decoy scores and explicitly called their order a presentation tie-break.
No noise threshold was exceeded. All preferred the continuous estimator to
the cumulative one, although F8's four-criterion mean tied. This is an audit
correctness preference, not a physical behaviour improvement. Broad behaviour
remained 2/10 in every set; six optical comparisons do not establish broad
whole-animal agreement.

All central numerical references held up. F8 could not independently resolve
two detailed method statements (Itskov 30 ms-bin modes; Fotowat SD/SE wording);
J2/S5 independently verified the corresponding primary text, and S5 confirmed
both. These are retained with the source's exact uncertainty conflict rather
than choosing a favourable interpretation. No reviewer found a fabricated
numeric target. They accepted withholding scores for all unmatched free-motion
and unsupported feeding rows.

All three reproduced both optical composites, **3.9375** and **4.7361/10**,
including the same Wilson intervals and OLS coefficient SEs. Both cohorts have
44/48 black responses; checkerboard 26/48 and 27/48. Every recorded jump also
met the continuous criterion, so changing the estimator does not change these
observations. Synthetic interrupted-flight, landing/relaunch and exact-ten-frame
probes distinguish the estimators. The schema-2 CLI cannot replay schema 3;
it remains historical, not a supported analysis path.

Remaining shared limits: unvalidated flight surrogate/body support, one
supplementary free seed, missing broad biological coverage, and engineering
fit-spread scales rather than biological acceptance bands. Reviewers proposed
compact frame/run-length traces for independent continuity replay. Current
records expose only the maximum run and derived success; the tests verify the
tracker, but raw frame continuity cannot be independently reconstructed.

Fresh regression-only reviewer V4, order Z7/R6/N4, scored R6/N4 **8/10** and
Z7 **5/10**, ranking R6 > N4 > Z7 (decoy tie-break). It reran 46/46 versus
45/45 targeted/motion tests. It found that all validators accepted a takeoff
at 1,000,000 ms or a 1,000,000 s powered run. Capture/replay now share the exact
response and follow-up windows; records exceeding either are rejected. A
targeted boundary test accepts the last observable takeoff/run and rejects
one additional frame. Both complete recorded cohorts pass the tighter gate
and retain their scores. This small follow-up fix is tested, not independently
rescored. Current focused audit tests: **25/25 passed**.

V4 requested completed budget measurements. A subsequent dedicated current-code
run passed three cases (including optical swoop, 8/8 responses) and skipped the
brain-cost case after three reference medians 4.88/4.90/4.87 ms exceeded the
4.8 ms contention guard. The full suite had passed two budgets and skipped two.
Neither result establishes all four current budgets passing. The exact same
production runtime passed all four with the weaker estimator at 0.273 CPU s/s;
the separate unchanged-dev control failed at 0.585 against 0.500. These varied
under contention; no idle reproduction or introduced cost regression is claimed.

The final rebase onto dev `7b69740e` includes no additional brain/body/world
change relative to measurement base `58481d6c`. `Life` adds companion support:
mutable driver, an unused set-down helper and a pantry-update flag defaulting
true. These solo no-food assays retain the same path. Production source has
zero feature diff from the final dev base; the actual measurement hashes stay
recorded, rather than being relabelled as a fresh simulation on the rebase.

The launch candidate lost; the continuous estimator won on correctness without
changing any supplied response. No accepted body mapping or broad fidelity
gain is claimed. Further body constants cannot repair absent sip events or
parallel escape decisions. Proposals remain separate from protected neural work.


## Paired dev snapshots and replicated checkerboard loss

Key: **D9 = dev 58481d6c; C5 = dev cb9b9da2**, with the same scoring/audit
implementation in both archives. These compare upstream snapshots, not a
feature-owned neural/body candidate. Presentation orders: L8 C5/D9; T4 D9/C5;
V6 C5/D9. Each fresh reviewer verified all 105 supplied source hashes, checked
primary papers independently through web search and recomputed all four raw
optical batteries, including Wilson intervals, fits, coefficient SEs and scores.

| Reviewer | Set | Validity | Honesty | Behaviour | Regressions/cost | Mean | Ranking |
|---|---|---:|---:|---:|---:|---:|---|
| L8 | D9 | 6 | 6 | 3 | 7 | 5.50 | D9 > C5 |
| L8 | C5 | 6 | 6 | 2 | 8 | 5.50 | |
| T4 | D9 | 7 | 6 | 2.5 | 8 | 5.875 | D9 > C5 |
| T4 | C5 | 7 | 6 | 2 | 7 | 5.50 | |
| V6 | D9 | 7 | 8 | 3 | 7 | 6.25 | D9 > C5 |
| V6 | C5 | 7 | 8 | 2 | 6 | 5.75 | |

Mean **D9 5.875**, **C5 5.5833**. Every reviewer preferred D9's replicated
checkerboard agreement; L8's four-criterion means tied because C5 had stronger
check evidence. Both remain poor broad-fidelity demonstrations. No numerical
reference target was found fabricated; incompatible assays remain unscored.
L8 requested a more precise Cruz label, now "Paper walking fraction; model
activity proxy" rather than implying the instantaneous model classifier is
Cruz's walking segmentation.

Checkerboard responses changed 26/48 → 11/48 and 27/48 → 11/48. Paired
losses/gains are 18/3 and 17/1, with identical readiness/eligibility for every
paired seed. Black responses changed 44/48 → 45/48 and 44/48 → 44/48. Flash
remained 8/8 and blank 0/8. Optical engineering composites changed 3.9375 →
3.104167 and 4.736103 → 3.413598. The free hours were separately rerun on the
same seed and yield exactly equal behavioural summaries; they are not added
anatomical replication. No gain is attributed to this branch, and protected
upstream visual work is not reverted or modified. The finding is in the owner
proposal and versioned reports.

Fresh regression-only reviewer N7, order D9/C5, gave overall regression
assurance **D9 6/10, C5 4/10**. It confirmed the checkerboard loss and found the
inherited HS selectivity test relaxed from 2× to 1.3×. It also observed that the
passing all-senses brain budget has no changing facet input, so cannot clear
active ON-pathway cost. These are upstream findings, not changes in this
feature diff. A bounded alternating native/WASM visual benchmark is proposed;
no unmeasured current performance delta is asserted.

The paired packet includes C5's 1105 farm unit passes, lint/types/build passes,
seven Apple-silicon WASM parity passes, all five budgets passing (brain 0.263
against 0.500 CPU s/s) and the arm64 FMA guard. D9 retains both its 0.585 failure
and a matching-production repeat passing all four budgets at 0.273. The
code/estimator scope difference of that repeat is explicit; passing later does
not erase earlier failure. Neither snapshot was measured on an idle machine.

All three full reviewers again requested independently replayable raw frames:
free-hour JSON contains only derived summaries, and optical records expose the
maximum powered episode rather than its underlying states. Compact traces and
replay are the next audit change; these do not alter the biological score.

## Completed farm browser checks and scope

The supplied snapshot packet froze before all browser checks completed. Later
results, not seen in full by those reviewers: web/offline e2e **passed** (257 s).
Play failed at wallpaper wake on the feature (549 s) and unchanged cb9b9da2
control (626 s). Pointer failed reading undefined `held` at orientation change
(860 s). Tables failed waiting for restaurant/epoch 1 after a move (441 s).
These are retained failures. No production UI or browser-test feature diff
exists, and only the wallpaper failure was independently rerun on the control.
The farm command cleaned up its Docker containers and owned worktrees.

All completed stages were recorded under farm run 20261117T035954-181689;
script-only container failure under 20261117T041210-195633; unchanged-dev play
control under 20261117T043112-212105. The script-only container cannot see linked
Git metadata; its intended eight tests pass on the farm host in the matching
checkout. This is a wrapper workaround, not an infrastructure fix.


## Raw-frame verification round

Key: **B4 = summary-only cb9b9da2; J6 = traced cb9b9da2**. Orders were H4
B4/J6, P7 J6/B4, A3 J6/B4. Fresh independent reviewers saw only rubric,
neutral source archives and unlabelled measurements; each searched primary
papers independently. Production sources and all original observations match.

| Reviewer | Set | Validity | Honesty | Behaviour | Regressions/cost | Mean | Ranking |
|---|---|---:|---:|---:|---:|---:|---|
| H4 | B4 | 6 | 7 | 2 | 8 | 5.75 | J6 > B4 |
| H4 | J6 | 7 | 7 | 2 | 8 | 6.00 | |
| P7 | B4 | 6.5 | 6.5 | 2 | 8 | 5.75 | J6 > B4 |
| P7 | J6 | 7.5 | 7 | 2 | 8 | 6.125 | |
| A3 | B4 | 6.5 | 7.5 | 2 | 8 | 6.00 | J6 > B4 |
| A3 | J6 | 7.5 | 8 | 2 | 8.5 | 6.50 | |

Mean **J6 6.2083**, **B4 5.8333**; all three prefer J6. The gain is audit
assurance, not changed biological behaviour. All three checked source hashes
and independently decoded 360,000 free frames plus all 224 optical traces.
Free motion, complete/censored bouts, first departure and uninterrupted power
reproduce. The 9.65 mm/s speed median is the documented histogram-bin centre;
the exact frame median is 9.6004 mm/s. Current optical composites reproduce
3.104167 and 3.413598. Central numeric reference values hold up again. H4
could not complete the light-off and SD/SE wording checks; P7/A3 independently
confirmed those primary-source statements. No acceptance range is inferred.

All 8,734 counted powered first-bout frames have raw wing command below 0.6
and reflex floor at least 0.6. Reviewers correctly treat this as descriptive,
not a causal ablation. One connectome, one free seed, unmatched assays,
unsupported feeding and missing broad validation keep behaviour at 2/10.
Retaining readiness waiting and delivered facet fields is their shared next
idea. Those arrays are not in this trace format; the limitation is explicit.

Fresh regression-only reviewer W5, order B4/J6, scored no-regression assurance
**J6 8/10, B4 7/10**, preferring J6. Its rubric vectors were J6 [7,8,2,8] and
B4 [6,7,2,8]. It found no production regression, independently reproduced the
frames and rejected corrupt in-memory records. Its three findings were the
old activity-as-walking label (corrected), unresolved browser failures, and
unmeasured observer cost. The latter prompted a subsequent deterministic
fixture: five fresh processes per condition, 360,000 frames each, identical
metric hashes, median CPU 0.033760 s off / 0.616647 s on; peak RSS 82,688 /
83,456 KiB; 14,400,008 bytes per traced fixture. This measures writing, not
full replay or CNS throughput. Procedure/scope are in `traces.md`. Reviewers
did not see this later fixture; their scores are not retrospectively raised.

The final exact-source farm run 20261117T051219-241399 tested bb92d33f:
1108 functional passes, zero failures, three skips; lint/web types/tvOS types/
build pass. Eight host script tests pass. The unchanged production core also
has seven local WASM parity passes, its arm64 FMA guard and all five CPU
budgets passing. Browser failures and missing active-ON workload cost coverage
remain recorded; no all-green or idle-machine claim follows.

## Observer-cost verification and identical control

Key: **F2 = traced cb9b9da2 with observer fixture; V8 = byte-identical decoy**.
Presentation orders: C8 V8/F2; M2 V8/F2; Q5 F2/V8. All were fresh independent
reviewers at high reasoning effort, with only the rubric, neutral permitted
code and evidence. Each searched primary papers and independently decoded the
225 recordings. This is the eighth full blind evidence round.

| Reviewer | Sets | Validity | Honesty | Behaviour | Regressions/cost | Mean | Forced order |
|---|---|---:|---:|---:|---:|---:|---|
| C8 | F2 = V8 | 7 | 7 | 2 | 8 | 6.00 | V8 > F2, presentation tie-break |
| M2 | F2 = V8 | 7 | 7 | 2 | 8 | 6.00 | V8 > F2, presentation tie-break |
| Q5 | F2 = V8 | 7 | 7 | 2 | 8 | 6.00 | F2 > V8, presentation tie-break |

Both mean **6.00/10**. All found equality and assigned identical scores within
each pair; no duplicate-control discrepancy requires additional reviewers.
They confirmed the numeric references, assay exclusions, both optical fits/
scores and independent raw-frame reconstruction again. All ran the synthetic
observer fixture, obtaining identical metric hashes. Recorded medians recompute
to 0.582887 incremental CPU s; independent pairs varied, as expected. The
fixture does not measure whole-file replay or full CNS throughput.

Their shared unresolved problems are limited biological coverage, reflex-
supported flight, weak checkerboard/timing agreement, engineering rather than
biological acceptance scales, and incomplete active-vision/browser cost checks.
Readiness/retinal trace retention and orientation-stratified held-out assays
remain proposals. There is no fabricated target or uncorrected numeric
transcription finding. No physical fidelity gain is claimed from this round.
The shared loop stops at its eight-round limit, below the desired score of 9;
there is no accepted body-mapping candidate. The earlier launch candidate lost
and remains reverted. Further progress needs validated observables/calibration
or separately owned neural biology rather than fitting body constants.

## Integration after the frozen evidence packet

The final packet predates the rebase onto dev 6eda5cb4. Arena/optical CNS,
body, Life and world physics are byte-identical; added places are unselected.
Farm run 20261117T061341-274724 at 5feae07b passes lint, web/tvOS types and
build. Functional results: **1172 pass, 1 fail, 3 skips**. The failure is the
TV soak's exact floating-point equality: 3,600,000.0000000005 ms versus
3,600,000 ms after dividing time among the expanded place list. The test,
soak script and place catalog match dev exactly. Unchanged-dev control run
20261117T062234-282436 reproduces the same failing test (2 pass, 1 fail).
No unrelated test or timing constant is changed to hide it.

The rebase budget run passes four cases and skips brain cost after invalid
calibration samples, despite host load about 1.21–1.46 on 18 logical CPUs.
Rejected work ratio 1.52 > 1.35, then reference ratios 2.26/2.27 > 2; one
bounded repeat rejects 1.45, 2.73 and 2.49. This is not a measured limit failure.
Prior identical CNS source passed all five budgets at 0.263 against 0.500.
Both outcomes and historical failures remain retained. Review scores above
are not retroactively raised or lowered using checks absent from their packet.

The eighth round's fresh regression-only reviewer E7 saw order V8/F2 and
assigned equal rubric vectors **[7,8,2,7]**, no-regression assurance **7/10**
to both. Its forced order V8/F2 was presentation-only. It independently decoded
all 225 binaries, checked 94 selected source hashes, verified primary numeric
citations, and reran both fixture modes in both sets. No relative regression
was found. Browser/control gaps, the inherited checkerboard/timing discrepancy,
body support and missing domains remain its objections. It independently
confirmed the 0.582887 CPU s observer increment and 768 KiB median RSS difference.
Its readiness/retina-digest proposal is retained; no unreviewed causal or
whole-animal success claim is added.

Completed integration results, after all blind reviewers finished:

| Stage | Result |
|---|---|
| Lint, web/tvOS types, build | Pass |
| Functional suite | 1172 pass, 1 reproduced inherited failure, 3 skips |
| Root scripts on matching farm host | 8 pass |
| Local documentation links/commands | 4 pass |
| Browser play | Pass, 810 s |
| Browser pointer | Pass, 695 s |
| Browser web/offline | Pass, 166 s |
| Browser tables | Fail, 525 s; extra-device brain loading wait |
| Rebase budgets | 4 pass, brain calibration skip; bounded repeat also skips |
| Earlier matching CNS source budgets | 5 pass; brain 0.263 vs 0.500 |
| Earlier matching CNS native checks | 7 WASM passes and arm64 FMA guard pass |

Tables passed the restaurant/epoch transition that failed previously, then
its additional-device tab timed out after 30 s with brain=loading, neurons=0,
phase=download and 0/14,288,331 bytes received. It was not repeated on the
unchanged-dev control, so attribution remains unestablished. No production
UI or browser-test feature diff exists. Only the TV-soak unit failure and the
earlier wallpaper failure have direct unchanged-dev controls. Later successful
play/pointer runs include upstream fixes and are not gains of this auditor.

The helper removed its owned checkout and containers after completion. Raw
logs and binaries remain outside git. A post-rebase CLI replay of the primary
recording matched every one of its 360,000 free frames and 112 trial results;
its one full analysis cost observation is recorded in `traces.md` and is not
retrospectively included in frozen reviewer scores. No accepted production
body mapping or neural change remains in the feature diff.
