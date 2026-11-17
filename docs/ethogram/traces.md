# Frame traces and independent replay

`--trace-dir` selects a fresh directory. Files are created exclusively and
cannot overwrite a previous capture. Every manifest records an absolute path,
SHA-256, frame count and byte stride. The file length, eight-byte magic, digest,
sequential indices, state flags and finite values are checked during replay.
Paths may be relocated with the corresponding files; their bytes/digests must
stay unchanged. They contain scientific observations, not the connectome.

Free files begin with ASCII `FLYFREE1`. Every 40-byte record is little endian:
uint32 frame index, uint32 flags, Float64 x/y/z in mm and body yaw in radians.
Flag bits 0–3 are on-feet after the step, head-groom display, consumption and
jump event. The manifest stores the position, raw/unwrapped heading and feet
state immediately preceding the first recorded frame, the floor geometry and
10 ms step. Replay derives displacement, angular velocity, joint ground state
and outer-half-area position before feeding the metric accumulator. Both
observation endpoints retain the same censoring rules.

Optical files begin `FLYESC01`. Every 64-byte record is little endian: uint32
frame index, uint32 flags, then seven Float64 values: raw neural wing command,
body wing intent, reflex floor, wingbeat signal, delivered escape command,
left direct-loom sense and right direct-loom sense. Bits 0–1 are on-feet and
jump event. All stimulus frames, including follow-up, are retained at 5 ms.
Readiness waiting frames and retinal facet arrays are not retained. The analytic
stimulus, clock, seed, screen geometry and trial condition remain in the JSON.

Replay derives the first departure inside the registered response window,
TTC, first landing and longest uninterrupted powered airborne run directly
from states, independently of the capture counter. A landing ends that first
bout. It also counts powered frames with reflex ≥0.6 while raw neural wing
command is below 0.6. This is descriptive attribution, not a counterfactual
proof that the reflex caused every such frame: command smoothing also exists.
The 50 ms operational endpoint and body support remain biological limitations.

Schema 4 runs hash-check and replay each retained file before reporting.
Schema 3 has no such trace proof. Either can supply the same limited optical
engineering comparison; raw traces do not make mismatched assays biologically
valid or create absent feeding, grooming or flight-control circuits. Whole-fly
fidelity stays unidentified. A score is not increased merely for retaining data.

## Recorded verification and observer cost

The dev cb9b9da2 capture retains 360,000 free frames and 224 optical traces in
225 files, 20,723,976 bytes. Three blind reviewers used independent decoders
and reproduced the reported observations; the two engineering composites stay
3.104167 and 3.413598. See [current measurements](current-dev.md) for exact
runtime hashes and the distinction between neural command and body support.

A synthetic on/off fixture isolates writing cost without running a brain.
It feeds 360,000 identical 10 ms frames to `Ethogram`, moving 0.1 mm per frame
for the middle 100 frames of each 200-frame cycle, otherwise stopping.
Tracing additionally writes the resulting position and flags through
`FrameWriter` and closes/hashes the file. Ten fresh Node processes use order
off/on/on/off/off/on/on/off/off/on, five measurements per condition. Every
result has the same metric SHA-256. Files are removed after each sample.

| Measurement | Tracing off, median | Tracing on, median |
|---|---:|---:|
| Loop plus close CPU time | 0.033760 s | 0.616647 s |
| Whole-process peak RSS | 82,688 KiB | 83,456 KiB |
| Bytes written | 0 | 14,400,008 |

Incremental median CPU is **0.582887 s per 360,000 frames**; median peak-RSS
difference is 768 KiB. CPU excludes imports/construction and includes file
close/hash. RSS includes process startup; Node reports `resourceUsage().maxRSS`
in [KiB](https://nodejs.org/api/process.html#processresourceusage). Local cached
filesystem behaviour and host load (about 3.4) limit extrapolation. This fixture
measures writing, not whole-file replay cost or complete real-CNS throughput.
It establishes identical observed metrics for this deterministic input and
quantifies offline observer cost; it is not an app CPU-budget result.
