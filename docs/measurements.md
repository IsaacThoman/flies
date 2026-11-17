# Measurement provenance

The reference keeps historical measurements rather than replacing them with
estimates. They are observations of the revision and setup used at the time,
not guarantees for today's `dev`. The source documents did not preserve exact
capture dates for every table. The dates below are the dates of the retained
source revisions, **not invented measurement dates**. A missing machine or
capture date remains unknown; remeasure before using those figures as a
current performance claim.

| Evidence | Retained source revision and date | Machine or runtime recorded with it |
| --- | --- | --- |
| [Frame cost](rendering.md#frame-and-cost), [flight and vision](simulation.md#flight) | `11f3a15`, 16 November 2026 | Chromium on an M-series Mac for the frame; Node/browser for flight and vision; exact model not recorded |
| [World queries and build cost](places.md#the-world) | `1c8354f`, 16 November 2026 | Desktop Node/Chromium; exact machine not recorded |
| [Browser comparisons](web.md#measured) | `ac957d9`, 16 November 2026 | M5 Pro, shared under load; browser versions and throttling are beside the tables |
| [Native brain speed and memory](../packages/brain-native/README.md#speed-and-memory) | `7d452a3`, 16 November 2026 | Apple M5 Pro, one thread, release C++; TV figures there are estimates |
| [Neuron engine](../packages/brain/README.md#neuron-model), [region cost](../packages/brain/README.md#cost-1) | `11f3a15`, 16 November 2026 | M5 Pro; parameters, stimuli and seeds are beside the tables |
| [Fly update cost](../packages/fly/README.md#budgets) | `d91c8dd`, 16 November 2026 | Node with JIT and V8 interpreter; exact machine not recorded |

[Apple TV](apple-tv.md#checking-it) and [iOS](ios.md) retain their own dated,
named-device measurements. CPU budget thresholds are separate from historical
wall-time observations: `scripts/cpuBudget.ts` calibrates them in M5 Pro CPU
milliseconds, and tests run the budgets serially.

For another measurement, record the capture date, commit, machine/device,
OS and runtime, workload/seed, sample count and whether other work was running.
Keep raw evidence outside the source branch and link a compact results table.
