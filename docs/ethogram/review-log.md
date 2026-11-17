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
machine-readable scoring eligibility gate. `validatedScore` and
`validatedOverall` therefore stay null: unsupported or incompatible evidence
cannot earn biological-agreement credit. Separate exploratory distances are
labelled as such and always show coverage.

Rejected behaviour changes: fitting speed to an unmatched female dataset,
raising turn gain until saccades appear, and scripting feeding/grooming patterns.
No behaviour improvement or completed hill-climb round is claimed from this
citation audit.

## Implementation comparison (results received so far)

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

Both independently reproduced the targeted tests (13 and 11 respectively),
found identical production model/body code, and verified the central source
numbers. They reproduced R8's airborne-angle contamination and nonfinite-time
corruption; F3 excluded those observations. They explicitly found **no behavioural
improvement**. Main remaining objections: unmatched assays still have numerical
exploratory distances, missing real behavioural evidence within their permitted
files, and insufficiently visible inherited motor/background stand-ins. The CLI
now explicitly lists those stand-ins. A third implementation review and the
separate regression review remain outstanding; this is not a completed hill-climb.

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
