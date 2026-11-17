# Mutation experiment

The catalogue in `scripts/mutation-cases.ts` introduces one deliberate fault
at a time. `node scripts/mutate.ts --out /tmp/mutations.json` runs only the
covering test files. `--module <substring>` and `--fault <id>` narrow it.
`--catalogue challenges` runs the separate independently proposed faults.
No new dependency. Sources and workspace package links are copied to a
scratch checkout; original files are never mutated. Clean tests must pass
first. Invalid mutations and process timeouts are errors, not kills.

This is a fixed, hand-selected sample, not a claim about every possible
mutation. Keep the same catalogue across comparisons. Equivalent faults
must be explained individually and kept visible in the raw counts.
The floor and ray implementation is excluded because another experiment
owns that code; existing spatial tests still run during final validation.

## Rubric

Independent reviewers score each criterion 0–10. A 10 means:

| Criterion | What a 10 requires |
| --- | --- |
| Mutation score per module | Every meaningful fault in the fixed sample is killed in every sampled module; survivors and exclusions justified, broader blind challenges covered. |
| Behaviour and refactors | Tests use public interfaces and observable contracts, with independent expected outcomes; an internal refactor would preserve them. |
| Determinism and speed | Explicit game/test clocks, no wall-clock waits, bounded work, full-suite CPU cost grows at most 10%. |
| Real bugs | Reproducible real failures are tested first and corrected separately, with scope and evidence clear. No invented bug claims. |
| Readability | Small tests explain the caller's need, inputs and failures clearly; harness and measurements are reproducible. |

## Measurements and blind reviews

The fixed sample has 68 faults over 11 modules. Initial targeted routing
killed 20; including the existing server restart test in the table campaign
kills 21 in the control. All scores below use that covering-test correction
where noted. No equivalent faults have been excluded.
Seven independent challenges were proposed. Six are killed: constant salt,
double patch recovery, reversing tied room codes, repeating the first bite
amount, a 0.94 brain threshold, and missing mist-only light invalidation.
All seven survived Q2. They stay in a separate catalogue and never change
the original 68-fault denominator.

The seventh, changing rain naming from `> 0.3` to `>= 0.3`, remains visible
as a survivor. It is not mathematically equivalent. No caller-facing
contract specifies that exact internal blend threshold, so an assertion
locking it down was rejected as implementation coupling. This is a triage
decision, not an excluded kill or a claim of complete mutation coverage.

Reports include Node/platform information, SHA-256 fingerprints of the
catalogue and each source/test input, exit status, and failure diagnostics.
The runner also works from a source archive without Git metadata.

| Module | Initial killed/sample | Hardened killed/sample |
| --- | --- | --- |
| net protocol | 3/8 | 8/8 |
| net limits | 5/8 | 8/8 |
| server tables | 3/6 (4/6 with restart coverage) | 6/6 |
| server lock | 1/4 | 4/4 |
| settings | 5/6 | 6/6 |
| settle | 0/5 | 5/5 |
| quality | 1/7 | 7/7 |
| pantry | 1/6 | 6/6 |
| light | 1/6 | 6/6 |
| weather | 0/6 | 6/6 |
| online connection | 0/6 | 6/6 |

### Real failures

Each reproduction was committed while failing; its correction is a separate
commit immediately following it.

| Reproduction | Failure | Correction |
| --- | --- | --- |
| ef56d81 | A failed filesystem save clears the dirty flag, so a retry silently writes nothing. | c15432e restores the flag on failure. |
| 2f46fa9 | JSON `null` throws in both room readers. | 935c1c3 ignores non-message values. |
| 95fbc3d | A welcome without a numeric room time joins the line and poisons its clock. | fb89b65 rejects invalid welcome/pong clock values. |

The last failure was also proposed independently by a blind reviewer.

### Review log

Evidence is copied to neutral paths outside the repository. Fresh reviewers
receive only the rubric, evidence and paths, never this log or its key.
Baseline key: K7. First candidate key: Q2. Later comparisons randomize the
presentation order; reviewers independently score each set and force a ranking.

Scores are in rubric order: mutation, behaviour, determinism/speed, real
bugs, readability. Baseline reviewers saw one set. Comparison reviewers
were all fresh and received sets without version labels.

| Round | Reviewer | Set | Scores /10 | Ranking |
| --- | --- | --- | --- | --- |
| 0 | 1 | K7 | 2.8, 6, 5, 2, 6 | single set |
| 0 | 2 | K7 | 2.8, 6, 5, 1, 6 | single set |
| 0 | 3 | K7 | 2.8, 6, 5, 2, 6 | single set |
| 1 | 1 | Q2 | 8.9, 8.5, 6, 9, 7 | Q2 > K7 |
| 1 | 1 | K7 | 2.8, 6, 6, 0, 5 | |
| 1 | 2 | Q2 | 8.6, 8, 7, 9, 7 | Q2 > K7 |
| 1 | 2 | K7 | 2.6, 6, 6.5, 0, 5.5 | |
| 1 | 3 | Q2 | 8.74, 8, 7, 9, 7 | Q2 > K7 |
| 1 | 3 | K7 | 2.65, 6, 6, 0, 5 | |

Round 0 mean: **4.29**. Round 1 candidate mean: **7.92**; all three
reviewers ranked it higher. The separate regression reviewer found no
concrete regressions. Reviewer 2's prose misstated K7's total as 22; its
per-module table and the measurement file total 20. Measured counts take
precedence over that arithmetic error.

Round 1 acted on survivors with packet boundaries, exact callback counts,
public clocks, persistence recovery, and light/weather transitions. It
also corrected two real failures. Reviewers independently reproduced both.
Rejected: calling the lamp-threshold survivor equivalent (a probe outside
midnight distinguishes it); treating a target-only routing survivor as
proof the whole suite misses it. The control was re-measured with the
server restart test included, raising it from 20 to 21 kills.

Round 2 adds the independently proposed cases, fixes invalid clock
messages in a separate test/fix pair, bounds the food-consumption loop,
replaces the inherited server sleep with a socket acknowledgement, and
adds deterministic connection clocks plus reproducible report fingerprints.
The lamp boundary is checked at 22:00. The rain-boundary challenge above
was rejected as a test target; its survival is reported honestly.

Round 2 key: C9; H3 is Q2 under a neutral name; V6 is an identical C9
decoy. Presentation orders were C9/H3/V6, H3/C9/V6, and H3/V6/C9.
Every reviewer gave the duplicate sets identical scores, so no noise
expansion was needed.

| Round | Reviewer | Set | Scores /10 | Ranking |
| --- | --- | --- | --- | --- |
| 2 | 1 | C9 and V6 | 9.5, 8.5, 8.5, 9, 9 | C9 = V6 > H3 |
| 2 | 1 | H3 | 8.5, 7.5, 6, 9, 7 | |
| 2 | 2 | C9 and V6 | 9.8, 9, 8, 9, 8.5 | C9 = V6 > H3 |
| 2 | 2 | H3 | 8.5, 8.5, 6, 9, 6.5 | |
| 2 | 3 | C9 and V6 | 9.45, 9, 8, 10, 8 | C9 = V6 > H3 |
| 2 | 3 | H3 | 8.27, 8, 6, 10, 7 | |

Round 2 mean: **8.88**. All three ranked it higher. The separate regression
reviewer found an unbounded pong barrier introduced by replacing the sleep.
That finding was accepted. The rain equality survivor was retained as
reported above; it was never counted as killed or mathematically equivalent.

Round 3 bounds the acknowledgement by a failure watchdog and rejects a
closed/errored socket, with listeners cleaned up. Suppressing all pongs
now produces a normal test failure after about two seconds, rather than
an indefinite hang. Successful tests still wait for the event, never a
wall-clock delay. A public wire test now checks initial and periodic pings
and the subsequent clock update; deleting the ping send survives C9 but
is killed here. This adds an eighth independent challenge, for **7/8**
kills. The fixed sample remains **68/68**. Workspace package manifests
also keep archived runs isolated when dependency links point elsewhere.

Round 3 key: R8; C9 is the retained comparison set. Presentation orders
were R8/C9, R8/C9, and C9/R8. Reviewers were fresh and used the owner's
updated effort setting.

| Round | Reviewer | Set | Scores /10 | Ranking |
| --- | --- | --- | --- | --- |
| 3 | 1 | R8 | 9.55, 9, 9, 9.5, 9 | R8 > C9 |
| 3 | 1 | C9 | 9.36, 8.5, 8, 9.5, 8.5 | |
| 3 | 2 | R8 | 9.55, 9, 8, 9, 8.5 | R8 > C9 |
| 3 | 2 | C9 | 9.36, 8.5, 7, 9, 8 | |
| 3 | 3 | R8 | 9.82, 9.5, 8.5, 9, 9 | R8 > C9 |
| 3 | 3 | C9 | 9.73, 9, 7.5, 9, 8.5 | |

Round 3 mean: **9.06** (module scores averaged equally, then the five
criteria and three primary reviewers; regression reviewers are not folded
into that mean). All three scored and ranked R8 higher. The separate
regression reviewer found no introduced regression. The experiment stops
at the requested mean of at least nine.

| Round | Mean | Sample kills | Independent challenges |
| --- | --- | --- | --- |
| 0 | 4.29 | 20/68; corrected covering-test control 21/68 | not yet proposed |
| 1 | 7.92 | 67/68 | 0/7 in retrospective probes of Q2 |
| 2 | 8.88 | 68/68 | 6/7 |
| 3 | 9.06 | 68/68 | 7/8 |

The single best result is the room-save retry regression: it protects
unsaved rooms after a filesystem failure. The additions are worth merging
as a test-hardening change, with the limited mutation sample and remaining
gaps stated plainly. The pull request stays draft for the maintainer.

## Validation

`npm test` includes the project's serial CPU budget tests. All added tests
run unconditionally; the optional-data/tool skips below predate this change.

| Configuration | Tests | Passed | Existing skips | CPU seconds | Elapsed seconds |
| --- | --- | --- | --- | --- | --- |
| Control bd88a01, optional connectome absent | 725 | 683 | 42 | 134.76 | 106.79 |
| Branch, same optional-data configuration | 763 | 721 | 42 | 105.46 | 65.95 |
| Branch with cached real connectome | 763 | 759 | 4 | 515.92 | 393.90 |

The matched configuration shows no >10% CPU growth. These are shared-machine
measurements, not evidence of a speedup; the real-connectome run does more
work and is not compared with the data-free control. An earlier control
snapshot lost executable bits; that failed setup run was discarded and
replaced by the passing control above.

`npm run lint` and `npm run typecheck` pass. The affected room e2e suite
passes with the real brain: two devices share food, rest and reconnect,
survive a server restart, move places, enforce passwords and removal, and
an eight-fly room stays within the existing budgets over every screen
shape. It completed in 128 s. Servers, browser and heavy slots were released.

No camera, body collision, world collision, native-brain or rendering code
was edited. Broader mutations of floor/rays and other online adapters, and
deeper runtime validation of welcome fields, remain useful follow-up work.


The legacy room-list test helper bounds each individual message wait but
not the total number of incorrect lists; a flooding faulty server can keep
it waiting. Reviewers also identified incomplete welcome payloads with a
finite clock and unsolicited future-timestamp pongs as useful next input
validation cases. Those are follow-up gaps, not claims that the normal
server emits them or that this experiment proves complete wire validation.
