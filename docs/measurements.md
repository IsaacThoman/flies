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
| [Frame cost](rendering.md#the-frame), [flight and vision](simulation.md#flight) | `11f3a15`, 16 November 2026 | Chromium on an M-series Mac for the frame; Node/browser for flight and vision; exact model not recorded |
| [World queries and build cost](places.md#the-world) | `1c8354f`, 16 November 2026 | Desktop Node/Chromium; exact machine not recorded |
| [Browser comparisons](web.md#measured) | `ac957d9`, 16 November 2026 | M5 Pro, shared under load; WebKit 26 and throttling are recorded; the Chromium version was not retained |
| [Native brain speed and memory](../packages/brain-native/README.md#speed-and-memory) | `7d452a3`, 16 November 2026 | Apple M5 Pro, one thread, release C++; TV figures there are estimates |
| [Neuron engine](../packages/brain/README.md#neuron-model), [region cost](../packages/brain/README.md#cost) | `11f3a15`, 16 November 2026 | M5 Pro; workloads are described; scripts supply default seeds, while capture seeds were not recorded |
| [Fly update cost](../packages/fly/README.md) | `d91c8dd`, 16 November 2026 | Node with JIT and V8 interpreter; exact machine not recorded |
| [Phototaxis](simulation.md#a-light-on-the-table) | `f8a9225` with `scripts/phototaxis.ts`, 17 November 2026 | Apple M5 Pro, Node 26.12.0, shared with other work (load 8 to 31); seeds and setups are in the table |

[Apple TV](apple-tv.md#checking-it-1) and [iOS](ios.md) retain their own dated,
named-device measurements. CPU budget thresholds are separate from historical
wall-time observations: `scripts/cpuBudget.ts` calibrates them in M5 Pro CPU
milliseconds, and tests run the budgets serially.

For another measurement, record the capture date, commit, machine/device,
OS and runtime, workload/seed, sample count and whether other work was running.
Keep raw evidence outside the source branch and link a compact results table.

Sleep measurements are maintained in the brain reference's sleep section.
Their grounded/wingbeat remeasurement is reserved for the separate sleep
follow-up; this pass leaves those tables intact.

## Artifact sizes

Measured 16 November 2026 on an Apple M5 Pro, macOS, Node 26.12.0 with
zlib 1.2.12, at source revision `4a7db80` (sleep and grounded/wingbeat merged):

| Artifact | Bytes | Local Node default gzip bytes |
| --- | ---: | ---: |
| Packed connectome | 40,404,208 | 21,081,614 |
| Anatomy sidecar | 1,668,256 | 936,365 |
| Browser WebAssembly module | 290,598 | 114,240 |

The connectome SHA-256 is
`51c97031b39f93c04a683f16683d88f15d291f1e1062694fc0a215e23c3b895c`,
verified by `npm run brain:fetch`. These are local file/compression sizes,
not a fresh measurement of the complete web build or a server's transfer
encoding. The retained 268 KB / 106 KB module measurements predate the sleep
module; download and compilation timings beside them remain historical.

A read-only instantiation during the native-source audit on the same machine
and Node runtime allocated 99,680,256 bytes (95.0625 MiB) of WebAssembly linear
memory after creating the real brain. This is the module's memory capacity,
not total worker or browser resident memory.
