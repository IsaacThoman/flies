# Manual mutation checks

Mutation testing is an optional script, **not part of `npm test`**. Run it
explicitly, without installing another dependency:

```sh
node scripts/mutate.ts --out /tmp/mutations.json
node scripts/mutate.ts --catalogue challenges --out /tmp/mutation-challenges.json
```

`--module <substring>` or `--fault <id>` narrows the run. Each fault runs
only its covering tests in a disposable source copy. Clean tests must
pass first; reports record source/test hashes and failure diagnostics.
Invalid mutations and timeouts are errors, never counted as kills.

## Integration with the room-server audit

Re-measured on audit head `4ab5274ded26962b99d172eb032553e6973cdf40`,
merged into `dev` by `2f1d4a093a63420a5d57acb7c5541f0aa191f789` (#92).
The audit and that merge have identical trees. The PR now adds **35 tests**
and no production-code changes relative to the audit.

The audit owns failed-save recovery and room-message validation. The three
overlapping production-fix commits were dropped. Its five-stage save-failure
test replaces this branch's redundant retry test. Null/clock rejection
assertions were consolidated into the audit's malformed-message test, using
otherwise valid welcomes to isolate clock validation. The binary-send test
now supplies and verifies the bite epoch. Other protocol and limit tests
retain distinct boundary coverage; the lock matrix also checks non-string
hashes that expose a removed type guard despite the audit's length checks.

The same 68 fault IDs were re-run. The lock-shape anchor follows the audit's
local-variable rename; the intended removed type check is unchanged.
Both control and branch now include the audit's covering server-hardening
tests. No faults were removed from the denominator.

| Module | Audit-only killed/sample | Branch killed/sample |
| --- | --- | --- |
| `packages/net/src/protocol.ts` | 3/8 | 8/8 |
| `packages/net/src/limits.ts` | 5/8 | 8/8 |
| `apps/server/src/tables.ts` | 4/6 | 6/6 |
| `apps/server/src/lock.ts` | 1/4 | 4/4 |
| `apps/web/src/settings.ts` | 5/6 | 6/6 |
| `apps/web/src/ui/settle.ts` | 0/5 | 5/5 |
| `apps/web/src/quality.ts` | 1/7 | 7/7 |
| `packages/world/src/pantry.ts` | 1/6 | 6/6 |
| `apps/web/src/scene/light.ts` | 1/6 | 6/6 |
| `apps/web/src/scene/weather.ts` | 0/6 | 6/6 |
| `apps/web/src/online/connection.ts` | 0/6 | 6/6 |

Total: **21/68** in the audit-only control; **68/68** with this branch's
tests; **zero errors**. The separate independent catalogue remains **7/8**
killed. Its sole survivor changes rain naming from `> 0.3` to `>= 0.3`.
It is observable and is not counted as equivalent or killed; a test locking
that exact internal tuning boundary was deliberately left as follow-up.
The sample is hand-selected, not an exhaustive mutation-coverage claim.

The [historical blind-review log](mutation-history.md) contains the original
rubric, each reviewer's scores, neutral-set keys and rejected ideas. Its
final mean of 9.06 predates this rebase; no new subjective score is claimed.

Validation after integration:

- `npm test`, including serial CPU budgets: **784 passed, 46 existing skips**.
- Audit-only control: **749 passed, the same 46 skips**.
- `npm run lint` and `npm run typecheck`: passed.
- Room e2e with the cached real connectome: passed in **158 seconds**, including
  reconnect/restart, passwords, food, removal and the eight-fly screen sweep.
- Matched data-free full-suite CPU: **149.44 s control, 148.29 s branch**,
  within the 10% growth budget. One shared-machine pair is not a speedup claim.

The harness remains confined to `scripts/mutate.ts`, `scripts/mutation-cases.ts`
and `scripts/mutation-challenges.ts`. Neither the package test commands nor test
files import or invoke it. The owner has authorized marking #79 ready;
the merge shepherd handles CI and merging.
