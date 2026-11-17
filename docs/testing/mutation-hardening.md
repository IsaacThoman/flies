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

Final blind scores and validation are being collected.
