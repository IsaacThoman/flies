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

Pending baseline measurement. All review evidence is copied to neutral
paths outside the repository. The key and review scores will be recorded
here; reviewers receive neither.
