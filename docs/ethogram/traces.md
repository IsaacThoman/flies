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
