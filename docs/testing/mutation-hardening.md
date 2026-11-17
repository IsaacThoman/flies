# Mutation experiment

The catalogue in `scripts/mutation-cases.ts` introduces one deliberate fault
at a time. `node scripts/mutate.ts --out /tmp/mutations.json` runs only the
covering test files. `--module <substring>` and `--fault <id>` narrow it.
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

Scores and final validation are being collected.
