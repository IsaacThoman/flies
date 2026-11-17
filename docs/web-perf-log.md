# Web performance experiment log

All scores below are independent reviewer scores, in rubric order: benchmark
soundness, measured wins, unchanged output/behavior, simplicity/safety.
The branch remains a draft experiment targeting dev.

| Round | Neutral sets and key | Reviewer 1 | Reviewer 2 | Reviewer 3 | Mean /10 | Ranking |
| --- | --- | --- | --- | --- | ---: | --- |
| Baseline | T4 = runtime at bd88a018; P9 = identical decoy | 5/0/7/5 | 6/0/8/6 | 5/0/8/6 | 4.67 | All identified a tie; arbitrary forced tie-breaks T4, P9, T4 |

All six screenshot pairs in the duplicate baseline were judged the same.
No reviewer scored identical sets differently, so no noise expansion was needed.
This round establishes the baseline, not a performance win.

The initial harness incorrectly marked brain readiness as title and could leave
play samples in screensaver mode. Its numbers are retained as provisional
evidence and excluded from implementation comparisons. The corrected run marks
the published title and wakes screensaver through normal input before play.

The first memory capture lost its inspector session at 381.4 seconds. The last
completed sample showed the brain running. This is a failed capture, not proof
of an application crash or a successful ten-minute check. The retry holds frames
during inspector collection and uses two five-minute active batches separated
by the required two-minute cooldown. Active and wall time are recorded separately.

Reviewers requested comparative evidence, deterministic behavior/fingerprint
tests, better workload reporting, a complete memory checkpoint, and attention to
cold-phone transfer cost. Candidate work removes redundant pre-message copies
only for full, unshared Float32 eye buffers, retaining rounding and compact
snapshots for other inputs; it also defers the TypeScript worker fallback.
Acceptance depends on measured comparisons and fresh blind review.
