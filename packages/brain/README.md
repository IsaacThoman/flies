# @fly/brain

A spiking simulation of the male fruit fly's whole central nervous system, about 167,000 neurons wired as they are in the real animal, that drives this game's fly. `src/types.ts` is the senses-and-commands contract with the game; this package turns senses into firing of the fly's sensory neurons (and, for the eyes, of the first neurons behind the photoreceptors) and reads its descending and motor neurons back out as commands, and, for display, how fast every part of the nervous system fires (Regions). `createBrain(data, { seed })` (`src/runtime.ts`) builds one from the packed connectome in about 0.3 s; it uses no Node APIs, so it runs in the browser game's Web Worker.

## Data

The wiring is the [FlyEM male CNS](https://male-cns.janelia.org/) connectome from Janelia Research Campus, published under [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/). Anything that ships the packed file, or shows behaviour derived from it, should credit "FlyEM male CNS connectome, Janelia Research Campus (CC-BY 4.0)". The packed file records the dataset, license and URL in its header.

It is not in git. The quickest way to get it is to download the packed file (21 MB) from the original data release, hosted in `IsaacThoman/ladybug`; the download is checked against a known hash. The same command downloads FlyEM's public annotations, checks their pinned hash and builds the optional anatomy sidecar locally:

```sh
npm run brain:fetch
```

`--url <url>` or `FLY_BRAIN_URL` selects another download. The release host is only a source for the packed dataset, not an upstream model.

Or build it yourself: export the neuron and connection tables from Codex (`neurons.csv` and `connections_princeton.csv`; either may be gzipped, whatever the file name says) and pack them:

```sh
npm run brain:pack -- --neurons neurons.csv --connections connections_princeton.csv
```

That writes `packages/brain/data/connectome.bin` (gitignored; `--out` puts it elsewhere) in a couple of seconds: 166,700 neurons, 6,242,118 connected pairs, 89,860,280 synapses, 40 MB (21 MB gzipped). The output depends only on the data, so packing the same export twice gives the same bytes. Malformed rows and connections to unknown neurons stop the packer with the line number.

## File format

`src/format.ts` reads and writes it, with no Node APIs so it also runs in a Web Worker. Little-endian throughout:

| Bytes | |
|---|---|
| 4 | `CBUG` |
| 4 | version, u32 (currently 1) |
| 4 | header length, u32 |
| n | header, UTF-8 JSON: counts, source, each section's offset (from the start of the sections), length and element type, and the string tables |
| | zero padding to a multiple of 8 |
| | the sections, each 8-byte aligned |

Neurons are numbered in ascending root ID order. The sections:

- `rootId` u32[N]
- `ptr` u32[N+1], `post` u32[E], `count` u16[E]: outgoing connections in CSR form. Neuron i's targets are `post[ptr[i]..ptr[i+1]]`, ascending, each with `count` synapses summed over neuropils (clamped to 65535).
- `superClass`, `class`, `subClass`, `nt` (predicted transmitter), `side` (soma side), `nerve` u8[N] and `type` (primary cell type) u16[N]: indices into the header's sorted string tables. Blank is `""`, always code 0.
- `ntConfidence` u8[N]: predicted transmitter confidence, 0 to 100 (0 when blank).

`loadConnectome(buffer)` validates everything and returns typed-array views into the buffer, with `find({ type: "DNp01" })`, `find({ superClass: /^visual/, side: "left" })`, `filter(i => ...)` and `indexOf(rootId)` for picking neurons.

## Anatomy sidecar

This data is for display. Nothing in the simulation, `REGIONS`, region rates,
native brain or game loading consumes it yet.

### Source and getting it

`npm run brain:fetch` leaves both `connectome.bin` and `anatomy.bin` in
`packages/brain/data/` (gitignored). With `--out <path>`, anatomy is written beside
that connectome. It downloads the existing packed wiring unchanged, then the
[public FlyEM annotation Feather](https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/body-annotations-male-cns-v1.0-minconf-0.5.feather),
listed on the [official download page](https://male-cns.janelia.org/download/).
No new binary needs hosting. The annotation download is 14,483,314 bytes,
211,577 bodies, version `v1.0-minconf-0.5`, SHA-256
`2177e246113e4cfbf1e7772ec37c6da1955ff22e8063d0b1f833101f99a9a3b2`.
The packer refuses changed/incomplete bytes before decoding them. An unreachable
source or a changed annotation hash fails the fetch command, explicitly reports
that anatomy was not written, and gives the retry command and manual route.
The already written connectome stays usable; anatomy is optional for the game.
If it fails after writing the connectome, anatomy may still be absent or old;
the loader refuses an old sidecar paired with different wiring.

Manual route (Node only; `npm install` installs the packer's Arrow/LZ4 dev dependencies):

```sh
curl -fL https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/body-annotations-male-cns-v1.0-minconf-0.5.feather -o packages/brain/data/annotations.feather
node packages/brain/scripts/anatomy.ts --annotations packages/brain/data/annotations.feather
# Optional: --connectome <connectome.bin> --out <anatomy.bin>
node packages/brain/scripts/anatomy-report.ts
```

This route also checks the pinned annotation hash. Repacking against a locally
built connectome binds anatomy to those exact wiring bytes; all its root IDs
must exist in the annotations. All 166,700 IDs in the shipped wiring are present.
The packer joins by `bodyId`, rejects duplicates and missing IDs, validates each
row and sorts the string tables, so input row order cannot affect output.
The source, its version, hash and URL, and attribution "FlyEM male CNS connectome,
Janelia Research Campus (CC-BY 4.0)" travel in the header.

### Format and loading

`src/anatomy.ts` is browser-safe, exported from `@fly/brain`; Arrow, LZ4 and Node
code stay in `src/pack-anatomy.ts` and the scripts. Little-endian:
`FANA` (4 bytes), version u32 (1), JSON byte length u32, UTF-8 JSON header,
zero padding to 8 bytes, then these sections, each 8-byte aligned:

| Section | Type | Meaning |
|---|---|---|
| position | u16[3N] | Interleaved dataset x/y/z, linearly quantised over header `bounds` |
| positionKind | u8[N] | 0 absent (coordinates zero), 1 actual `somaLocation`, 2 `tosomaLocation` fallback |
| neuromere | u8[N] | `somaNeuromere`, index into sorted string table |
| entryNerve | u8[N] | Entry nerve, particularly for sensory axons whose somata are outside the CNS |
| rootSide | u8[N] | Side of the axon root: L/R/M normalised to left/right/midline; `unknown` preserved |

Blank categorical data is `""`, code 0. These supplement the connectome's columns;
root side is **not** soma side, and entry nerve is **not** a soma position. Retaining
the fibre fallback costs just the flag already needed for absent positions and
places 976 extra cells without calling their fibre points cell bodies. No column
hex coordinates are duplicated (`eye-columns.ts` already serves the eyes), no
inferred positions for missing somata, and no neuropil/synapse data are added.
Entry nerves/root sides are retained wherever present, even for the few
non-sensory cells, without changing the packed wiring's nerve or side.

For each axis, `p = min + code / 65535 * (max - min)` µm. Bounds are measured from
all matched somata and fallback points, before quantisation, in the unwarped
male CNS EM frame: x 19.744–749.344, y 38.064–551.968, z 81.232–1076.472 µm.
Maximum rounding error is 0.00557/0.00393/0.00760 µm respectively, at most 7.6 nm.
Degenerate axes encode as zero and decode to the bound; an all-absent file has
zero bounds. The sidecar is **1,668,256 bytes** (936,365 bytes gzip at Node's default),
SHA-256 `acd8f7a3d3ec2c631b762098cb6ff186b35cb8ee9803a3fb885e5697b643bbf9`
for wiring hash `51c97031b39f93c04a683f16683d88f15d291f1e1062694fc0a215e23c3b895c`.

```ts
const anatomy = await loadAnatomy(anatomyBuffer, connectomeBuffer);
const p = anatomy.position(i);         // µm in dataset frame, or null
const kind = anatomy.positionKind[i];  // distinguish soma from fibre fallback
const segment = anatomy.segment(i);   // "T1", "A3", "CG", ... or ""
const unit = p && anatomy.unitBox(p);  // [0,1]^3 in dataset axes
const oriented = p && anatomicalPosition(p); // left/dorsal/anterior µm
```

The loader hashes the **actual connectome buffer**, refuses a mismatched pair
with a recovery message, validates the wiring, then exposes typed-array views
into the anatomy buffer. It validates magic/version, UTF-8/JSON, provenance,
frame, bounds, exact section layout/lengths, padding, sorted tables, category
codes and flags. `position`, `unitBox` and `anatomicalPosition` accept an optional
output tuple to reuse; retain it for allocation-free per-frame work. `unitBox`
normalises each axis independently (so it changes aspect ratio), maps degenerate
axes to zero, and doesn't clamp points outside the recorded bounds. Use a single
physical scale with `anatomicalPosition` when preserving relative sizes matters.

### Coverage, verified against the source

Soma: **139,662 (83.78%)**. Fibre only: **976**; total positioned **140,638 (84.37%)**.
There are 995 `tosomaLocation` annotations, but 19 overlap a soma and prefer it.
Segments: **21,799**; entry nerves: **11,806**; root sides: **17,906** (includes 414
`unknown` entries, which do not establish left/right). Coverage by the connectome's
super class (the report script regenerates this table):

| Super class | Neurons | Soma | Fibre only | Segment | Entry nerve | Root side |
|---|---:|---:|---:|---:|---:|---:|
| ENS | 50 | 1 | 0 | 0 | 0 | 0 |
| ascending_neuron | 1846 | 1812 | 27 | 1846 | 0 | 0 |
| cb_efferent | 4 | 4 | 0 | 4 | 0 | 0 |
| cb_endocrine | 72 | 68 | 0 | 2 | 0 | 0 |
| cb_intrinsic | 32164 | 31997 | 77 | 5082 | 0 | 0 |
| cb_motor | 107 | 103 | 0 | 20 | 0 | 0 |
| cb_sensory | 4868 | 0 | 0 | 0 | 4859 | 4868 |
| cb_sensory_tbc | 14 | 0 | 0 | 0 | 8 | 7 |
| descending_neuron | 1314 | 1308 | 0 | 755 | 0 | 0 |
| descending_neuron_tbc | 2 | 0 | 0 | 0 | 0 | 0 |
| efferent_ascending | 8 | 8 | 0 | 8 | 0 | 0 |
| efferent_descending | 4 | 4 | 0 | 0 | 0 | 0 |
| ol_intrinsic | 89403 | 81055 | 630 | 25 | 0 | 3 |
| ol_sensory | 6098 | 28 | 0 | 0 | 0 | 6091 |
| sensory_ascending | 537 | 0 | 0 | 0 | 536 | 536 |
| sensory_ascending_tbc | 2 | 0 | 0 | 0 | 1 | 1 |
| sensory_descending | 12 | 0 | 0 | 2 | 12 | 12 |
| visual_centrifugal | 563 | 563 | 0 | 32 | 0 | 0 |
| visual_projection | 9201 | 9162 | 17 | 46 | 0 | 0 |
| visual_projection_tbc | 2 | 2 | 0 | 0 | 0 | 0 |
| vnc_efferent | 94 | 90 | 1 | 93 | 1 | 1 |
| vnc_endocrine | 22 | 22 | 0 | 22 | 3 | 4 |
| vnc_intrinsic | 13161 | 12729 | 223 | 13152 | 8 | 2 |
| vnc_motor | 708 | 703 | 1 | 707 | 0 | 0 |
| vnc_sensory | 6370 | 2 | 0 | 0 | 6355 | 6357 |
| vnc_sensory_tbc | 36 | 0 | 0 | 0 | 23 | 24 |
| vnc_tbc | 38 | 1 | 0 | 3 | 0 | 0 |

This verifies and refines PR #11's research: the 6,098 photoreceptors include 28
positions (6,070 missing); 4,868 head sensory neurons have none; the 6,370 cord
sensory neurons include 2 positions, with none among the 537 sensory ascending
neurons. So "sensory neurons are missing" has exceptions. Of L1–L5, **7,436** lack
either kind of position (L1 1,475; L2 1,538; L3 1,517; L4 1,485; L5 1,421).
For `vnc_sensory`, entry nerve covers 6,355/6,370, root side 6,357/6,370 (6,356
left/right, one unknown); for `sensory_ascending`, both cover 536/537.
The source also confirms 23,720 neurons with both optic-column hex coordinates;
they are deliberately left out. The position union reaches z=134,559 voxels
(1,076.472 µm), correcting PR #11's upper bound of 134,531. Nerve names
include ProLN/MesoLN/MetaLN (legs), ADMN/PDMN (wing), DMetaN (haltere) and AbN*
(abdominal); these identify CNS entry, not locations on the legs or abdomen.

The annotation schema has no per-neuron neuropil counts. Independently reading
the public `body-stats` Feather schema also finds none (pre/post/downstream/
synweight and labels). Reading the schema and object metadata of
`v1.0/database/neuprint-inputs/Neuprint_Neurons.feather` confirms `roiInfo:string`
and **4,648,794,426 bytes**; that export was not downloaded in full. Per-neuron
neuropil counts remain out of scope, not inferred from soma segment.

### Coordinate frame and seating in the fly

The table's locations are **8 nm voxels** in male CNS v1.0 EM space, converted to
µm before quantisation. From side annotations, larger dataset x is the fly's
left. Smaller y is dorsal, smaller z anterior. The [male CNS paper, EM Volume
Alignment](https://pmc.ncbi.nlm.nih.gov/articles/PMC12636603/) describes approximately
axis-aligned brain/VNC volumes and the neck stitching. Our orientation is a
proper rotation (two sign flips) plus translation, with no rescaling or warp:

```
left    =  0.008 * voxelX - 400
 dorsal =  300 - 0.008 * voxelY
anterior = -0.008 * voxelZ
```

`anatomicalPosition` takes **µm**, so omits the 0.008 factor. The 400/300 µm
reference is a convenient origin, not a measured midline plane or a ground
height; the specimen is asymmetric. The fly contract uses exactly these signs:
+x left, +y dorsal/up, +z anterior/forward, feet on y=0, one body length.
Ground translation and the physical length scale belong to a later display.

Tissue extents from the public
[major-compartment meshes](https://storage.googleapis.com/flyem-male-cns/rois/malecns-major-compartments-v2/segment_properties/info)
(convert nm to µm, then use the transform above):

| Tissue mesh | Left x (µm) | Dorsal y (µm) | Anterior z (µm) |
|---|---:|---:|---:|
| CentralBrain.ngmesh | -238.0…221.4 | -130.6…263.1 | -415.2…-63.5 |
| Optic(L).ngmesh | 88.5…351.1 | -109.6…210.3 | -349.2…-123.5 |
| Optic(R).ngmesh | -382.1…-107.7 | -133.2…199.6 | -355.8…-157.9 |
| CV.ngmesh | -44.3…65.8 | -147.5…-4.0 | -481.8…-348.7 |
| VNC.ngmesh | -162.9…152.8 | -277.8…-7.3 | -1077.2…-481.8 |

`node packages/brain/scripts/anatomy-mesh-bounds.ts` reproduces this table, fetching
about 25 MB once and printing the source mesh SHA-256s. These are tissue shells;
they differ from soma envelopes, and contain no per-neuron neuropil assignments.
Neck CV is about 110 × 143 × 133 µm, descending from the back/ventral brain to
the anterior cord. The VNC is about 316 × 270 × 595 µm; the central brain is
459 × 394 × 352 µm, and the left/right optic lobes 263/274 × 320/333 × 226/198 µm.
The full brain including both lobes spans about 733 µm laterally. Both remain in
a common physical scale; do not normalise brain and cord separately to unit cubes.

For the **somata/fibre points** the report gives these envelopes by annotations,
including every recorded neuromere (no points for `unknown`):

| Soma envelope | Positioned | Left x (µm) | Dorsal y (µm) | Anterior z (µm) |
|---|---:|---:|---:|---:|
| Central brain (cb_intrinsic) | 32074 | -240.1…210.3 | -94.9…261.9 | -348.9…-81.2 |
| Brain incl. optic lobes (head-resident super classes) | 125014 | -380.3…349.3 | -128.2…261.9 | -353.3…-81.2 |
| Optic lobe left (ol_intrinsic) | 40692 | -0.6…349.3 | -106.7…216.6 | -346.6…-106.4 |
| Optic lobe right (ol_intrinsic) | 40993 | -380.3…-12.7 | -128.2…201.3 | -353.3…-120.0 |
| Neck-projecting classes (somata, NOT neck tissue) | 3147 | -167.0…147.6 | -251.2…240.5 | -1072.7…-96.6 |
| Cord (vnc_* and ascending_neuron) | 15611 | -133.7…127.2 | -252.0…23.8 | -1076.5…-194.4 |
| A1 | 912 | -60.7…82.3 | -187.8…-28.1 | -1053.6…-799.5 |
| A10 | 36 | -24.2…33.4 | -134.1…-21.0 | -1075.6…-941.5 |
| A2 | 264 | -52.2…76.5 | -138.3…-21.5 | -1034.4…-894.9 |
| A3 | 237 | -56.2…76.3 | -141.8…-19.8 | -1055.8…-931.3 |
| A4 | 212 | -55.5…72.3 | -140.7…-19.2 | -1050.2…-967.9 |
| A5 | 179 | -53.2…68.3 | -144.6…-19.4 | -1053.8…-982.6 |
| A6 | 164 | -52.2…61.9 | -150.2…-17.7 | -1070.4…-983.5 |
| A7 | 115 | -46.6…58.9 | -145.8…-18.4 | -1069.7…-941.5 |
| A8 | 187 | -43.7…55.6 | -144.9…-17.8 | -1076.5…-1018.1 |
| A9 | 135 | -43.9…42.1 | -146.0…-16.3 | -1076.2…-1029.5 |
| CG | 2392 | -228.1…200.5 | -10.0…247.6 | -312.5…-95.5 |
| DC | 566 | -154.3…121.1 | 12.8…164.6 | -296.2…-86.2 |
| GNG | 89 | -135.6…117.4 | -92.8…-1.2 | -288.3…-120.5 |
| LB | 1305 | -135.9…126.2 | -95.8…47.3 | -348.9…-201.5 |
| MD | 372 | -136.3…122.6 | -61.9…3.8 | -197.9…-126.4 |
| MX | 498 | -115.6…95.3 | -93.4…-8.0 | -238.0…-141.0 |
| T1 | 4198 | -133.7…127.2 | -237.9…-54.8 | -696.1…-414.8 |
| T2 | 5016 | -116.1…124.5 | -252.0…-39.0 | -949.3…-544.4 |
| T3 | 3957 | -104.5…103.3 | -250.9…23.8 | -1054.1…-194.4 |
| TC | 729 | -159.6…136.6 | -48.8…59.6 | -245.3…-113.7 |

These are min/max soma envelopes, **not** segment tissue boundaries. Segment
somata overlap; T3 even has an annotated outlier in the head. Segment labels
should not be re-inferred by slicing z. Mean z of cord interneuron T1/T2/T3 is
approximately -615/-758/-966 µm: their leg segments progress posteriorly. The
abdominal neuromeres form the fused ganglion near the cord's back, not a string
of ganglia extending through the fly's abdomen.

The data is a dissected, aligned specimen: the authors rotated the brain back
18° to align its axes; brain and cord were imaged separately, and their neck
cut faces still differed by about 25° before a local nonrigid stitch. Those
angles describe acquisition/alignment, **not** a known inverse transform into
our live model. A display must fit brain and cord as separate rigid groups,
rotate/translate about the neck attachment and bridge the neck for illustration;
it cannot claim a measured live neck pose. No such fitting is baked into this file.

For a concrete scale check, assuming a 2.5 mm body gives 0.0004 model units/µm:
brain width 0.293 units, cord length 0.238, neck length 0.053. The current model's
head centre is (0, 0.335, 0.392), radii (0.155, 0.13, 0.095); thorax centre
(0, 0.335, 0.135), radii (0.15, 0.155, 0.2), and neck pivot (0, 0.335, 0.33)
(`packages/fly/src/anatomy.ts`). These suggest a reasonable common scale but do
not determine registration. One illustrative starting fit centres the brain
around dataset (390, 230, 235) µm at the model head centre; centre the cord near
(400, 443, 780) µm at (0, 0.27, 0.135), ventral within the thorax. Preserve the
same 0.0004 scale, then fit rotations about +x and attachment offsets against
the head/cord envelopes. At that scale the specimen's brain-to-cord offset is
about (0.004, -0.085, -0.218) model units, whereas those proposed model centres
differ by (0, -0.065, -0.257): one global translation alone cannot make both
centres coincide. This is an illustrative seating recipe, not anatomical ground
truth, and should be checked against the visible body before use.

### Cord segment view, not applied to the catalog

`cordSegments(connectome, anatomy)` returns disjoint groups of `vnc_intrinsic`
neurons with the exact segment string (blank for unknown), side (left/right/
midline/blank), and `Uint32Array` indices; `.neurons.length` is the count. It
uses the connectome's soma side, normalising `center` to `midline`, **not** the
axon root side. It includes all 13,161 interneurons exactly once, and no
`vnc_tbc` or sensory/motor neurons. Fine segment counts:

| Interneuron segment | Left | Right | Midline | No side |
|---|---:|---:|---:|---:|
| Unknown | 2 | 0 | 0 | 7 |
| A1 | 375 | 374 | 8 | 0 |
| A10 | 1 | 1 | 0 | 0 |
| A2 | 88 | 88 | 4 | 0 |
| A3 | 89 | 87 | 4 | 0 |
| A4 | 73 | 73 | 4 | 0 |
| A5 | 60 | 60 | 3 | 0 |
| A6 | 62 | 63 | 2 | 0 |
| A7 | 43 | 44 | 0 | 0 |
| A8 | 74 | 78 | 0 | 0 |
| A9 | 51 | 53 | 0 | 0 |
| T1 | 1652 | 1643 | 85 | 0 |
| T2 | 2197 | 2205 | 90 | 1 |
| T3 | 1707 | 1679 | 31 | 0 |


13,152 have a segment: T1 3,380; T2 4,493; T3 3,417; A1 757; A2–A10 1,105.
The nine unknowns stay unknown (2 left, 7 no soma side). One more neuron has a
T2 segment but no side. No fallback guesses a side or segment from position.

A later catalog change could replace `cord-interneurons-left/right` with
T1/T2/T3/abdominal × left/right, abdomen aggregating A1–A10. Counts would be
1,652/1,643; 2,197/2,205; 1,707/1,679; 916/921. Keep two unknown-segment left
cells in an explicit cord-interneurons-unknown group. Keep `cord-midline` as
its current 277 cells (231 midline, 8 without side, 38 `vnc_tbc`); 63 regions
would become 70. The catalog descriptions, native partition and rate names,
native/TS parity tests and region `fullHz` measurements would need updating
together, after the display lands. This PR does none of that.

### Serving and future bundling

Vite serves `/brain/anatomy.bin` in dev and preview and copies it beside
`brain/connectome.bin` in production; no fetch or consumer is added to the game.
The connectome URL and browser caching/loading code are unchanged. A later tvOS
change would need to copy the matching sidecar into its app resources, expose
its bytes to the display and use the same hash validation (or an equivalently
validated native reader); updating this web Vite plugin does not bundle it into
the Apple TV app. The native simulation itself needs no anatomy.

## Neuron model

`src/sim.ts` steps leaky integrate-and-fire neurons in the style of Shiu et al. (2024, "A Drosophila computational brain model reveals sensorimotor processing", Nature 634). Each neuron has a membrane potential v, a synaptic drive g and an adaptation a, all in mV above rest:

- `dv/dt = (g + bias - a - v) / tauMem`, `dg/dt = -g / tauSyn`, `da/dt = -a / tauAdapt`
- spike when v reaches the threshold; v resets to 0 and holds for the refractory period, a grows by the adaptation increment, and with `resetDrive` g is cleared to 0 too
- a spike adds `count × gain[pre] × postScale[post]` to each target's g after the synaptic delay

Engine defaults: dt 0.5 ms, tauMem 20 ms, tauSyn 5 ms, threshold 7 mV, refractory 2.2 ms, delay 1.8 ms, no drive reset, no adaptation. `gain` is per presynaptic neuron and signed (`gainByTransmitter` builds one from the predicted transmitter); 0 mutes a neuron's output. The brain runs it at the operating point below.

Only neurons with state cost anything. A neuron joins the active set when a spike reaches it or an input fires it, and leaves once v, g and a have decayed below `epsilon` and it is not refractory; that check runs every 16 steps. The rest cut is the only difference from stepping every neuron, and the tests hold the engine to a dense reference bit for bit, with and without the reset and adaptation. Inputs are named groups driven as independent Poisson trains (sampled per spike, not per neuron per step), either all at one rate (`addInput`, `setRate`) or each neuron at a rate of its own (`addRatedInput`, `setRates`, which the eyes use: candidates are drawn at the fastest neuron's rate and each kept with its own rate over that, so the cost is per candidate, about neurons × fastest rate × dt). Each input draws from its own stream, seeded by the order inputs were added, so adding one leaves the others' spikes as they were. An output gain (`addOutputGain`, `setOutputGain`) scales all of a group's outgoing weights by one factor, rewriting those edges' weights from their values at 1, so at 1 they are what they were to the bit; hunger uses it (Hunger). Readouts are named groups whose spikes are counted; a partition (`setPartition`) counts every spike by the part its neuron is in, for one increment a spike whichever neuron fires (the regions use it). Runs are deterministic for a seed, and the dense reference holds both kinds of input to the same spikes bit for bit.

On an M5 Pro (`node packages/brain/scripts/bench.ts`, engine defaults), wall time per simulated second:

| Regime | Active neurons | Wall time |
|---|---|---|
| No input | 0 | ~0 s |
| Looming (LPLC2 and LC4 at 100 Hz), ±0.07 mV per synapse | ~25,000 (about 1,000 firing) | ~0.10 s |
| Same at ±0.275, modulators excitatory: runaway | ~119,000 (18,000 firing) | ~0.77 s |

The time goes almost all into updating the active set, about 2 ns a neuron a step.

### What was checked against Shiu et al.

The paper's methods were not readable here, but its code is public ([philshiu/Drosophila_brain_model](https://github.com/philshiu/Drosophila_brain_model), `model.py`). Its parameters match ours: rest and reset -52 mV, threshold -45 mV (7 mV above rest), membrane time constant 20 ms, synaptic time constant 5 ms, refractory period 2.2 ms, delay 1.8 ms and w_syn 0.275 mV per synapse, the one free parameter. Three details differ from what this engine did by default:

- its reset is `v = v_rst; g = 0`: a spike clears the synaptic drive. That is `resetDrive` here, and it matters: without it, leftover drive refires strongly driven neurons and the network runs away.
- its equations are frozen during the refractory period ("unless refractory"), so g neither decays nor is lost then; here g keeps decaying.
- its Poisson inputs add 250 × w_syn (68.75 mV) to v, so each input event fires the neuron, and driven neurons have no refractory period; here inputs fire the neuron directly and it keeps its refractory period.

The signs come from a precomputed column in its data, not from code we could read. A review (the State of Brain Emulation Report, 2025) describes them as acetylcholine excitatory, GABA and glutamate inhibitory, and dopamine, octopamine and serotonin excitatory. We have not confirmed that from the paper itself. Their model was the FlyWire connectome of a female brain; this is the whole male CNS, ventral nerve cord included.

## The operating point

`src/params.ts`. The starting point is "synapse count × sign" at Shiu et al.'s settings, which on this connectome is epileptic: activity anywhere spreads into saturated firing that never stops. Each departure below removed a specific runaway that `scripts/probe.ts --after` exposed, and none lowers the global weight, which stays at the paper's 0.275 mV per synapse.

| Departure from count × sign | Neurons or connections | Why |
|---|---|---|
| Kenyon cells (`KC*`) are cholinergic | 4,064 predicted dopaminergic | They are cholinergic (Barnstedt et al. 2016); as dopamine they would either excite the whole mushroom body or, muted, silence its output. |
| Photoreceptors with no prediction are histaminergic, inhibitory | 4,045 | All photoreceptors are histaminergic; histamine is treated as inhibitory (it opens chloride channels in their targets). |
| Sensory neurons outside the eye with no prediction are cholinergic | 2,127, most head bristle neurons among them | Fly mechanosensory, gustatory and olfactory neurons are cholinergic; without this most of the head's touch neurons would be mute. |
| Lateral antennal lobe local neurons predicted cholinergic are GABAergic | 75 (`lLN1_bc`, `lLN2T`, `lLN2X` and others) | The large majority of antennal lobe LNs are GABAergic (Chou et al. 2010). As predicted, these neurons are wired nearly all-to-all with ~200 synapses a pair, and any olfactory input, even spontaneous firing at 10 Hz, locked the antennal lobe at ~370 Hz for good. The least certain fix: we could not confirm these types' transmitter. |
| Dopamine, serotonin and octopamine are muted | 951 after the fixes | Their effects are slow and modulatory, not fast synapses. Shiu et al. reportedly made them excitatory. |
| No predicted transmitter: muted | 10,152, mostly motor neurons (674 of 708 in the VNC) and optic lobe neurons | Nothing to go on. Motor neurons are read, not relied on for their outputs. |
| Synaptic saturation: a connection of n synapses counts as 75 × (1 − e^(−n/75)) | all pairs: 10 → 9, 50 → 36, 100 → 55, 200 → 70, never above 75; 82% of all synapses kept | One presynaptic spike can't drive its target arbitrarily far (a real synapse's current falls as the membrane nears its reversal potential). Without it, pairs like the two DNg33 neurons, which excite each other through 1,496 synapses, ping-pong forever. |
| Spike-frequency adaptation, 0.1 mV a spike, decaying over 1 s | every neuron | Recurrent excitatory clusters still sustained themselves, notably one in the gnathal ganglia (GNG019, GNG334, GNG065 with GNG479/GNG099 inhibition, driving pharyngeal motor neurons MN10/MN11) that kept pumping after any taste. Real neurons adapt, and slow currents are what end such bursts. Weak and slow, it barely touches brief responses. |
| dt 1 ms instead of 0.1 ms | | Less than half the cost of 0.5 ms with much the same responses; the refractory period and delay round to 2 ms at either. |
| Graded columnar relays: synapses of the optic lobe's columnar neurons count 2.3 times | 69,336 neurons of 61 types (see Seeing) | These are graded, non-spiking cells whose synapses release continuously. At one spike per synapse, a columnar relay passes on almost nothing: one spike of L2 onto Tm1 moves Tm1 by 2.6 mV against a 7 mV threshold, so each stage needs its input above 100 Hz and the eyes' signal died in the medulla. 2.3 is where one spike of the main relay (L2 to Tm1 and Tm2) brings its target to threshold. No columnar neuron fires with the eyes shut, so without `light` this changes nothing. |
| Johnston's organ, completeness | 174 neurons: the right antenna's zone C and E neurons (22 and 110), the left's zone F (42) | The two antennae were not traced equally completely (Johnston's organ, completeness, below). Each zone's less complete side counts its synapses as many times over as the other side has more (right C ×7.87, right E ×2.49, left F ×1.20), so the two sides deliver the same drive at the same rate. Derived from the wiring, not fitted, and applied to the gain after saturation: that brings each zone's saturated total within 3% of the other side's, where adding the missing synapses to each connection before saturating falls up to 35% short. Before this, `bump` balanced the two antennae the other way, slowing the left to 30.7 Hz, which left neither side driving anything: fewer synapse-spikes a second don't add up to threshold. That balancing is gone. |
| Left/right input balancing | the visual background (see Spontaneous behaviour) | The two eyes' visual projection neurons were not reconstructed equally well (the right's have 19% more output synapses). At full strength each eye's group delivers the same synapse-spikes per second: the side with more synapses is driven slower. |

The engine's `epsilon` is 0.01 mV here (against a 7 mV threshold).

### Johnston's organ, completeness

Johnston's organ's neurons are grouped by the zone of the antennal mechanosensory and motor centre their axons end in (Kamikouchi et al. 2006, 2009; F, Hampel et al. 2020), and the dataset's types are named for them. A real fly's two antennae each have about 480 (Kamikouchi et al. 2006). Here, zone by zone (`similarity` is the cosine similarity of the two sides' output synapses counted by partner type, ipsilateral and contralateral apart; `left halves` is the same between two random halves of the left side's neurons, 5–95% of 300 splits):

| Zone | Neurons, left / right | Output synapses a neuron | Partners a neuron | Input synapses a neuron | Similarity | Left halves | Factor |
|---|---|---|---|---|---|---|---|
| C | 46 / 22 | 331 / 88 | 27.9 / 9.6 | 68 / 12 | 0.75 | 0.73–0.92 | right ×7.87 |
| E | 157 / 110 | 548 / 315 | 43.9 / 27.8 | 102 / 39 | 0.95 | 0.89–0.97 | right ×2.49 |
| F | 42 / 36 | 160 / 224 | 15.9 / 20.5 | 15 / 27 | 0.78 | 0.83–0.94 | left ×1.20 |

Why this is the reconstruction and not the fly:

- Each zone's two sides reach the same partners in the same proportions. E's two sides are as alike as two halves of the left are; C's are within the left's own spread, at its low end; F's a little below it. Between different zones the similarity is at most 0.39.
- The sparser side's neurons are traced less far, not fewer of a kind that is wired differently: each right C neuron has a quarter of the left's output synapses, a third of its partners and a sixth of its inputs, and each right E neuron 40–65% of the left's. One of C's types, CA2, has 9 neurons on the left and none on the right.
- The right antenna has 130 Johnston's organ neurons that could not be typed (`JO-unclear`, `JO-A-unclear`, `JO-B-unclear`) with 517 output synapses among them, 4 each: fragments of axons. The left has 9.
- Zones A and B, the sound-sensing ones, are mostly missing on the right altogether (26 and 31 times fewer output synapses than the left's).

So each zone's less complete side has its gain scaled by the ratio of the other side's output synapses to its own: its neurons stand for the zone as a whole, the missing cells included, as the balancing they replace did the other way. Per zone rather than for Johnston's organ as a whole (3.26 overall), because the zones differ: one factor would turn the right's F to 2.9 times the left's while leaving its C at less than half. A and B are left as they are: their right halves are fragments of 18 synapses a neuron, with partners that match less well (0.53, 0.63), and nothing drives them but a few of them in `wind`. Zone D has no right half.

Zone C's is the largest factor and the least certain, with 22 truncated neurons standing for 46. The result doesn't rest on it: under a push on the right antenna, `groom` is 0.40–0.44 with it (seeds 1–3), 0.35–0.43 with C capped at the per-neuron ratio (×3.77) and 0.37–0.42 with C uncorrected. Zone E carries it.

With these, from rest, any sense or pair of senses or everything at once, held at full strength for 2 s, is followed within 1 s by activity inside the resting band (`report.ts` section b, 37 of 37). With the eyes open, so is every stimulus of the vision battery, alone and with every other sense at full strength (section e, 50 of 50), counting from when the lamina falls quiet: going back to the steady scene can itself be a change the eyes signal, for 10 ms after most stimuli, 1.4 s after the flicker, 5 to 7 s after the gratings and 17 s after the brightening, whose dim scene afterwards is a dimming L3 keeps answering. Once quiet, nothing is left over: 1 s after the grating stops, the network fires 32,000 spikes a second against 30,000 in the control without it.

## Senses

`src/io.ts`. Each sense drives Poisson firing in its neurons at its intensity times the maximum rate. Left and right are the fly's own.

| Sense | Neurons | Count | Max rate |
|---|---|---|---|
| `loomLeft`, `loomRight` | Looming detectors LPLC2 and LC4 of that eye | 165 left, 146 right | 100 Hz |
| `touch` | Head mechanosensory bristle neurons (`BM*`, cb_sensory) | 932 | 50 Hz |
| | Body and leg mechanosensory bristle neurons (vnc_sensory, subclass mechanosensory_bristle) | 2,206 | 10 Hz |
| `bumpLeft`, `bumpRight` | Johnston's organ neurons of zones C and E (`JO-C*`, `JO-E*`) of that antenna, the ones that answer a sustained push or pull (Kamikouchi et al. 2009; Yorozu et al. 2009; Hampel et al. 2020) | 203 left, 132 right | 100 Hz |
| `wind` | Wind- and gravity-sensitive Johnston's organ neurons (subclass wind_gravity) of both antennae | 475 | 100 Hz |
| `sweet` | Head taste neurons dorsal_tpGRN, LB3d, PhG9, LB3c, LB2a, LB4a, LB3b, PhG1c, PhG3 | 88 | 100 Hz |
| `grounded` | Campaniform sensilla (load sensors) of the legs (`SNpp53`), firing tonically while it stands | 13 | 20 Hz |
| `light` | L1, L2 and L3 of every column of each eye, through the input stage (see The eyes) | 2,599 left, 2,660 right | 200 Hz at full darkening |
| `maleTaste` | The front legs' taste neurons for a male's pheromones: LgLG1a (ppk23 M cells) and LgAG1 (Gr32a/Gr33a), see Courtship | 34 + 10 | 50 Hz |
| `wingbeat` | Campaniform sensilla (strain sensors) of the wings and halteres: every other campaniform sensillum | 413 | 100 Hz |

`bump` leaves out Johnston's organ's other zones: A and B answer sound and vibration, and F, though its neurons drive antennal grooming too, answers neither a push nor vibration (what it senses is unknown; Hampel et al. 2020). Driven alone at 100 Hz, F does nothing to any readout. The right antenna's C and E count for what the left's do (Operating point).

Sides: the looming detectors, Johnston's organ and head bristle neurons all have a side. Most VNC sensory neurons don't (5,297 of 6,370 are blank, and the `nerve` column is blank for every sensory neuron), so the body senses, touch, grounded and wingbeat, are whole-body and ignore side. Touch's two groups have different rates because there are more than twice as many body bristle neurons, and touching the fly's body excites only some of them.

Nothing in the data says which taste neurons sense sugar. `sweet`'s were chosen by what they do in the model: starting from none of the head's taste neuron types (cb_sensory, class gustatory), the type that raised the proboscis motor neuron MN9's rate most when driven at 100 Hz for 500 ms together with those already chosen was added, until no type added 1 Hz. Driven alone, no type raises MN9 by more than 8 Hz; together the nine reach 48 Hz. `node packages/brain/scripts/probe.ts --superClass cb_sensory --class gustatory --each type --target MN9 --greedy` repeats it. Some of them may well be bitter or water neurons in the real fly.

`maleTaste` is the one sense picked by root ID as well as type: the packed wiring doesn't say which leg a sensory neuron comes from, so the front legs' LgLG1a and LgAG1 are listed in `io.ts` (`FORELEG_MALE_TASTE`), from FlyEM's annotations (entry nerve ProLN), and `scripts/song.ts` checks the list against them. Its input is added after the eyes', so every other input draws the same random stream as before it existed (the fingerprint test holds it). 50 Hz is a round number of the order of what contact chemoreceptors fire for their ligand; at 100 Hz the answer is the same (Courtship).

**The campaniform sensilla**, strain sensors in the cuticle, are of three places, which FlyEM's annotations tell apart by the nerve each enters the cord by (the packed wiring doesn't carry it; `scripts/wingbeat.ts` checks the split against the anatomy file). Of the 426 annotated as campaniform sensilla, 218 come in by the anterior dorsal mesothoracic nerve, the wing's (Lesser, Moussa & Tuthill 2025 reconstructed it: about 36 proximal and 17 distal campaniform sensilla a wing, and the tegula's), 195 by the dorsal metathoracic nerve, the haltere's, and 12 by the leg nerves, four by each; one more has no nerve recorded. The 13 are one type, `SNpp53`, and no other type enters by a leg nerve. Only the legs' bear the body's weight, so `grounded` drives the 13. The legs' other proprioceptors aren't sorted by organ in the data (180 of the leg nerves' proprioceptive neurons have none named), and the chordotonal organs and hair plates aren't load sensors (What it does and doesn't reproduce).

Until this was found, `grounded` drove all 426: the wings' and halteres' sensors fired tonically while the fly stood. They were where the resting activity of the flight motor neurons (8.9 Hz) and of the proprioceptors (8.7 Hz) came from (Regions), and they were why leaving the ground took drive away from the flight motor neurons, which was taken for the connectome working against the tarsal reflex. The legs' 13 at 20 Hz do next to nothing: at rest, standing or in the air, the fly walks, opens its wings and fires the same (`scripts/wingbeat.ts` (a), 60 s, seeds 1 to 3: walking 66%, 47% and 14% of the time either way, `wings` 0.038, 0.024 and 0.005 on average, 34,000, 25,000 and 10,000 spikes a second; with all 426 driven as they were, 62%, 41% and 8%, `wings` 0.059, 0.049 and 0.038, and 47,000, 39,000 and 24,000: the wings' and halteres' sensors held the wings a little open and kept the network busier, and walked the fly a little less).

The wings' and halteres' sensors are `wingbeat`. Every stroke strains them and they fire with it, phase-locked, in flight: the wing's set the timing of the steering motor neuron b1 (Fayyazuddin & Dickinson 1999), and the haltere's fire with every stroke too (Dhawan, Huang & Dickerson 2025, bioRxiv). The body sends how hard its own wings beat, so this is reafference through real sensory neurons: in the air, the drive it flies with; on its feet only as far as the pose opens them, so 0 with the wings folded, and 0 from the step it lands in (root README, The fly's senses). In flight each fires a spike a stroke, about 200 a second, locked to the stroke; a Poisson input carries only a rate, at random. Under the refractory period, 250 Hz of it fires these neurons 200 times a second, 200 Hz 167 times, 100 Hz 91 times. 100 Hz is the round rate the model drives its other hard-driven sensory neurons at (the looming detectors, Johnston's organ, sweet taste), and anywhere from 100 to 250 Hz the loop it closes with the body dies away the same (What it does and doesn't reproduce). Its input, like `maleTaste`'s, is added after the eyes'.

`wingbeat` at full strength drives the flight power motor neurons to `wings` 0.30 to 0.32 on average over 3 s in the air (peaks 0.42 to 0.45), 0.15 to 0.16 at half (seeds 1 to 3), and nothing else much; 2 s after it stops, `wings` is back where it rests (`scripts/wingbeat.ts` (b)). At 150 Hz that would be 0.42 to 0.46, at 200 Hz 0.57 to 0.58, at 250 Hz 0.68 to 0.69.

## The eyes

`src/eyes.ts` and `src/eye-columns.ts`. Each eye has a facet for every column of its optic lobe: 892 on the right, 880 on the left. `brain.eyes` gives each facet's viewing direction (`EyeMap`, in the order of the `light` arrays) and, for scripts, `buildEyes(connectome)` gives each facet's L1, L2 and L3 as neuron indices.

### The columns and their cells

The columns, their hex coordinates, their L1 and their type (pale, yellow, edge, dorsal rim area, unclear) come from the male CNS paper's optic column table (`optic-column-type-assignments-v1.0.xlsx`, [flyconnectome/2025malecns](https://github.com/flyconnectome/2025malecns), CC-BY 4.0, from the FlyEM male CNS dataset). Every right column has an L1; 8 left columns have none. Body IDs there are root IDs here, and every L1 resolves to an L1 of the right side.

The table has no L2 or L3, so `scripts/eyes.ts` assigns them from the connectome: each L2 (or L3) goes to the column of the L1 whose synaptic partners it shares most, by the cosine similarity of their input and output synapse counts partner by partner. A column's L1, L2 and L3 sit in the same cartridge and medulla column and share most of their partners there, so this needs nothing but the wiring. A cell is left out when its second most similar L1 is more than 0.6 times as similar as the first, and when two cells claim one column the more similar wins and the other is left out.

Checked against the Reiser lab's published assignment of the right optic lobe (`ME_assigned_columns.csv` in [male-drosophila-visual-system-connectome-code](https://github.com/reiserlab/male-drosophila-visual-system-connectome-code); GPL-3.0, so used only to check, and nothing from it is in this repository): L2 is assigned in 883 of 893 cells and 882 of those agree (99.9%; the one that doesn't is put one column over), L3 in 885 of 892 and all 885 agree. On the left, where there is nothing published to check against, the same method assigns 862 of 886 L2s and 865 of 880 L3s. Columns whose cell is missing or ambiguous have none of that type. To regenerate (`--check` is optional):

```sh
node packages/brain/scripts/eyes.ts --columns optic-column-type-assignments-v1.0.xlsx --check ME_assigned_columns.csv
```

### Why the lamina is the way in

The photoreceptors are too incompletely reconstructed to carry the input. There are 1,112 R1-R6 on the left and 2,265 on the right, where a whole eye has about 5,000, and only 296 of the left's 884 L1s (33%) and 503 of the right's 892 (56%) receive any synapse from one. The lamina monopolar cells are complete: 880 to 893 of each of L1, L2 and L3 a side. So the eyes enter one synapse in, at L1, L2 and L3, and the photoreceptors and their synapses onto the lamina are a formula (Seeing, below).

### Orientation

The hex axes were checked against the anatomy, not taken from the published picture (`column_coord.png` in the Reiser lab repository: hex1 is q, hex2 is p, the centre is [18, 19], v = p + q is vertical, h = q − p horizontal). From the public skeletons of all 1,764 L1s with a column, each L1's two ends were found (the longest path through its skeleton); its lamina end is the one among the photoreceptor terminals (nearest to the nodes of 453 right and 556 left R1-R6 skeletons) and the other is its medulla terminal. 854 right and 698 left L1s could be oriented that way; the rest were ambiguous and left out. The dataset's own axes were read from neurons whose anatomy is unambiguous: an antennal lobe projection neuron runs from the antennal lobe to the calyx toward +z and −y, so +z is posterior and −y dorsal, and the giant fibers and the left photoreceptors put the fly's left at +x. Fitting each end's position linearly to h and v, per side:

| | per +1 of h | per +1 of v |
|---|---|---|
| right lamina | x +0.81, y +0.03, z −0.58 (toward the midline, anterior) | y −1.00 (dorsal) |
| left lamina | x −0.75, y +0.13, z −0.64 (toward the midline, anterior) | y −1.00 (dorsal) |
| right medulla | x −0.66, y +0.19, z +0.72 (lateral, posterior) | x −0.26, y −0.97 (dorsal) |
| left medulla | x +0.73, y +0.15, z +0.67 (lateral, posterior) | x +0.11, y −0.99 (dorsal) |

So in both eyes v grows dorsally: the dorsal rim area columns are its top end (hex1 + hex2 from 46 to 71, against 7 to 72 for all columns), and the lamina and medulla agree. h grows toward the front of the lamina and toward the back of the medulla, which is the reversal of the anterior-posterior axis at the first optic chiasm, so the two ends were told apart correctly. The lamina lies under the retina without crossing, so h grows toward the frontal visual field. The left lobe's coordinates are the mirror image of the right's: the same [hex1, hex2] in each eye looks in mirror-image directions. How sure: dorsal is certain (the dorsal rim, and every column moves the same way); front is very likely (it rests on telling the lamina end from the medulla end, which the photoreceptor terminals and the chiasm both confirm, and on +z being posterior in this dataset, which the antennal lobe and calyx confirm). Rows of columns change position smoothly and monotonically in both lamina and medulla, with no fold.

### Viewing directions

No per-column table of measured optical axes is published for these optic lobes ([Zhao et al. 2025](https://www.nature.com/articles/s41586-025-09276-5) measured a different fly's eye by micro-CT), so the directions are idealised (`EYE_GEOMETRY` in `src/eyes.ts`). The columns sit on a regular hexagonal lattice, 5 degrees between neighbours (Drosophila's interommatidial angle is about 4.5 to 5 degrees), hex1 and hex2 being two of its axes 120 degrees apart as in the published picture, centred on [18, 19]. The lattice is wrapped onto the sphere around the centre column's direction, keeping distance and bearing from it (an azimuthal equidistant map), with the centre at 68 degrees from straight ahead and on the horizon. That puts the frontmost facets 8.5 degrees past the midline (binocular overlap about 17 degrees; Zhao et al. measured under 20), the rearmost 152 degrees back (a blind zone behind of 56 degrees; they measured about 50), and the eyes from 75 degrees below the horizon to 85 above. The dorsal rim looks 60 degrees up on average. Neighbours are 5 degrees apart near the centre and closer toward the edges, which the map squeezes (3.3 at the least, 4.3 the median); no two facets of an eye look within 3 degrees of each other. A facet takes in a cone of half-angle 5/√3 = 2.9 degrees (`acceptance`), the radius of the hexagon it covers, so the cones just cover the field; the measured acceptance angle is about 5 degrees across. What is idealised: the real lattice is irregular, its spacing varies across the eye, and the equator of the real eye is not exactly the horizon.

### Seeing

`src/vision.ts`. With `light` given, each eye's luminances drive its lamina, and everything after that is the connectome. With it left out the eyes are shut: no input, and the brain is almost always spike for spike what it was before it had eyes. Not always: the graded columnar synapses apply whether or not there is light, and a columnar cell can be made to fire without it by the hand-wired looming input, which reaches a few of them from behind. At rest and under each sense alone at full strength (2 s each, seeds 1 to 3) every tick has the same spikes as with `graded` at 1. With every sense at full strength at once the runs part within the first second (0.01% more spikes over 2 s, and the mean commands differ by up to 0.05, the size of the difference between two seeds), and certain sequences do it too: after rest, flight and a loom on the left, a TmY17 of the right eye fires once under a loom on the right. A test checks a fingerprint of 5 s of spikes under several senses against the commit before; it covers the common cases, not that one.

**The input stage** stands in for the photoreceptors and their synapses onto the lamina (`RETINA`), per facet:

- It adapts to the ambient level and answers to contrast (Weber's law): a change is measured against the facet's recent mean luminance, as a fraction of it plus a floor of 0.05 so that black doesn't divide by zero. The same fractional change gives the same response in a bright scene and a dim one.
- Darkening excites, brightening doesn't: the photoreceptors' histamine hyperpolarises the lamina monopolar cells to light, so they depolarise to darkening.
- L1 and L2 compare the light with its mean over the last 200 ms, so they answer a change and then adapt (transient); L3 compares it with its mean over 2 s, which is also the ambient level all three are normalised by (sustained). L1 and L2 are transient and L3 sustained in the fly (Silies et al. 2013; Ketkar et al. 2020); the time constants are round numbers of the right order, not fitted.
- The contrast becomes a Poisson rate: 200 Hz at full darkening (contrast 1), proportionally less for less. 200 Hz is a scale, not a measurement: these cells are graded and don't spike. It uses most of the range a model neuron has (its 2 ms refractory period caps it near 330 Hz), so a 10% darkening gives 20 Hz.
- No tonic rate: in a scene the eye has adapted to, every rate is 0, and the stage then only checks each tick whether the light has changed. A steady scene costs nothing.

The floor stands for the light at which photoreceptors stop coding contrast, but the game's luminances are the screen's: its dusk renders at 0.15 and its night under 0.1. So the game adapts its picture to the light before it gets here (scaled up toward a mean of 0.5 by up to 2 times; root README, The eyes), as photoreceptors adapt their gain, and the stage sees a dim scene's contrasts much as a bright one's.

Left out: L1's sustained component and L2's slight rectification; neural superposition (six photoreceptors of six neighbouring ommatidia that look the same way feed one cartridge, which here is just one facet feeding one column); colour, polarisation and the dorsal rim's own photoreceptors; and the graded potentials themselves.

**The engine** drives the lamina with an input that gives each neuron a rate of its own (Neuron model). The eyes' inputs are added after every other input, so their random streams leave everything else as it was.

**What reaches what.** `node packages/brain/scripts/vision.ts` runs a battery of stimuli (`src/stimuli.ts`) through each eye or both: dark discs looming at 10, 40 and 160 ms (half-size over speed) toward either eye, the front and above, the same disc receding, whole-field dimming and brightening, a dark 10-degree bar and an 8-degree dot crossing at 100 degrees per second in four directions, square-wave gratings (30 degrees, 2 Hz) drifting four ways in the right eye and rotating around both eyes, a 4 Hz whole-field flicker, and a steady checkerboard. Each is run with the same seed against a control that holds the steady scene, and the table gives the difference in mean rate over the stimulus, in Hz, for the eye it is aimed at. Seed 1:

| Stimulus | L2 | L3 | Tm4 | Tm1 | Mi1 | T4 | T5 (a, b, c, d) | LC4 | LPLC2 | HS | VS | H2 | giant fiber | escape peak (control) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| loom, right eye, 40 ms | 21 | 34 | 15 | 3.0 | 0.1 | 0 | 0.2, 0.2, 0.5, 0.2 | 11 | 2.1 | 3.9 | 0.3 | 6.2 | 38 | 0.76 (0.10) |
| loom, right eye, 10 ms | 51 | 76 | 35 | 7.4 | 0.1 | 0 | 0.3, 0.3, 1.1, 0.6 | 27 | 4.5 | 10 | 1.0 | 2.3 | 88 | 0.78 |
| loom, right eye, 160 ms | 7.3 | 16 | 4.8 | 1.1 | 0.2 | 0 | 0.1, 0.1, 0.2, 0.1 | 3.7 | 0.9 | 1.0 | 0.3 | 2.3 | 13 | 0.56 |
| loom, left eye, 40 ms | 21 | 34 | 11 | 3.1 | 0.2 | 0 | 0.1, 0.1, 0.2, 0.2 | 4.1 | 0.3 | 3.0 | 0.8 | 2.7 | 20 | 0.45 |
| receding disc, right eye | 1.5 | 2.1 | 1.2 | 0.3 | 0.1 | 0 | 0.1, 0.1, 0.2, 0.1 | 2.5 | 0.8 | 5.1 | 0.4 | 5.9 | 13 | 0.29 |
| dimming, whole field | 29 | 123 | 13 | 3.6 | 3.1 | 0 | 0, 0, 0.1, 0.1 | 4.7 | 1.0 | 1.8 | 0.6 | 1.0 | 17 | 0.64 |
| brightening, whole field | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.10 |
| bar, right eye, front to back | 7.6 | 9.4 | 5.7 | 1.9 | 0 | 0 | 0.4, 0.3, 0.6, 0.4 | 7.9 | 1.1 | 19 | 1.6 | 6.5 | 38 | 0.41 |
| bar, right eye, back to front | 7.5 | 9.2 | 5.7 | 1.9 | 0 | 0 | 0.3, 0.3, 0.6, 0.4 | 8.2 | 0.8 | 8.8 | 1.0 | 15 | 35 | 0.38 |
| dot, right eye, front to back | 0.3 | 0.4 | 0.3 | 0.1 | 0 | 0 | 0.1 each | 1.0 | 0.1 | 1.8 | 0.1 | 1.8 | 1.2 | 0.12 |
| grating, right eye, front to back | 54 | 66 | 36 | 11 | 0.1 | 0 | 0.7, 0.3, 1.1, 0.6 | 20 | 3.2 | 42 | 2.5 | 0.5 | 92 | 0.53 |
| grating, right eye, back to front | 54 | 66 | 36 | 11 | 0.1 | 0 | 0.4, 0.5, 1.1, 0.7 | 20 | 2.9 | 9.3 | 2.0 | 18 | 88 | 0.48 |
| grating, right eye, upward | 54 | 66 | 37 | 11 | 0.1 | 0 | 0.5, 0.4, 2.0, 0.8 | 23 | 3.3 | 19 | 0.6 | 5.5 | 98 | 0.51 |
| grating, right eye, downward | 54 | 66 | 37 | 11 | 0.1 | 0 | 0.5, 0.4, 1.5, 1.1 | 22 | 3.0 | 14 | 7.1 | 8.5 | 97 | 0.48 |
| flicker, 4 Hz, whole field | 51 | 56 | 30 | 8.2 | 0.1 | 0 | 0.1, 0.1, 0.4, 0.2 | 17 | 1.0 | 5.1 | 1.3 | 1.0 | 66 | 0.78 |
| steady checkerboard, after 3 s | 0 | 28 | 0 | 0 | 1.0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.8 | 0.14 (0.15) |

Read across, stage by stage:

- **Lamina to medulla.** Darkening reaches the OFF pathway: L2 drives Tm1, Tm2 and Tm4, L3 drives Tm9 and Mi9. Tm4 follows best (it gets 113 L2 synapses and few inhibitory ones); Tm1 and Tm2 reach a fifth of L2's rate, held down by the medulla's inhibitory amacrine cells (Pm2, Dm, Mi13).
- **The ON pathway is silent.** L1 inhibits Mi1 and Tm3 (glutamate through GluClα), as in the fly, and in the fly brightening releases them. Here they are silent at rest, and a silent model neuron can't be released from inhibition; brightening does nothing anywhere. With no Mi1 or Tm3, T4 never fires, and motion is seen only through T5 (OFF edges).
- **T5 and the lobula plate.** T5 responds weakly (about 1 Hz on average), but each subtype prefers the direction it does in the fly: T5a front to back (0.7 against 0.4 Hz), T5b back to front (0.5 against 0.3), T5c up (2.0 against 1.5), T5d down (1.1 against 0.8). The lobula plate tangential cells, which pool many T5s, make it plain: HS prefers front-to-back motion (42 against 9.3 Hz; a direction selectivity index of 0.64), H2 back to front (18 against 0.5), VS downward (7.1 against 0.6), as they do in the fly. Seeds 2 and 3 give the same preferences.
- **Looming.** LC4 and LPLC2 respond to looming, and the giant fiber (DNp01) and the other looming-sensitive descending neurons (DNp02, DNp04, DNp11) follow. A disc looming at the right eye passes the body's take-off threshold (escape 0.4, where the giant fiber counts as having fired: `packages/body/src/behavior.ts`) at 10 and 40 ms (0.76 to 0.84 over seeds 1 to 3) and above the horizon (0.81 to 0.83); slowly (160 ms) it reaches 0.53 to 0.67; receding, 0.29 to 0.33. Small dots don't reach the lobula at all (escape 0.11 to 0.15, as at rest).
- **Not selective enough.** Anything that darkens much of the field drives LC4 too: whole-field dimming reaches escape 0.64 to 0.75 (flies do jump when the lights go off, so this is not wrong in itself), a 4 Hz flicker 0.76 to 0.78, a high-contrast grating covering one eye 0.38 to 0.53 and a wide dark bar 0.27 to 0.52, at or past the body's threshold. Scenes in the game don't come near that: with the eyes open at midday, walking and resting, escape peaked at 0.34 in 5 minutes. LC4 here answers dark area, not expansion: T4 and T5, which give LPLC2 its preference for expansion, are too weak to shape it, and LC4 takes most of its drive from T2, TmY3, Tm4 and Tm2, columnar cells of the OFF side that answer any darkening.
- **Left and right differ.** The same loom at the left eye drives the left LC4 a third as hard as the right one is driven, and LPLC2 a seventh, and reaches escape 0.30 to 0.52; at the front, 0.41 to 0.61. The eye map is mirror-symmetric and both eyes' lamina are driven alike, so the difference is in the wiring beyond: the left optic lobe has fewer synapses in this dataset. Its intrinsic neurons make 12.8 million against the right's 16.0 million, and along the looming pathway each step is thinner (L2 to Tm4, 74 synapses per cell against 113; Tm4 to LC4, 172 against 246; T2 to LC4, 255 against 372), which compounds from stage to stage. With both eyes dimmed alike, L2 fires the same on both sides (28 Hz) and Tm4 already differs (11 against 16 Hz). That is most likely the left lobe being less completely reconstructed rather than a real difference between the fly's eyes.
- **Steering.** A rotation turns the fly with it, weakly: seen from above, a clockwise rotation (front to back in the right eye) gives turn +0.01, +0.03, +0.17 (seeds 1 to 3) against −0.03, −0.04, +0.06 anticlockwise, the direction of the optomotor response in each. While `grounded` drove the wings' and halteres' sensors too (Senses) it was +0.11, +0.10, +0.19 against −0.05, −0.08, +0.08: their tonic drive raised the steering neurons' rates under the grating (seed 1, clockwise: the right DNa02 at 5.4 Hz with it, 2.5 without). In the game, `packages/body` turns continuously at a yaw rate proportional to `turn`. In one eye, any grating turns the fly toward that eye, front to back most.
- **Walking.** Dimming makes it walk (walk 0.19 to 0.30 against 0.03 to 0.08), and gratings stop it (0.00 to 0.04 against 0.04 to 0.17).
- **A steady scene** drives nothing once adapted to: 3 s after a checkerboard appears only L3's sustained response remains (and Mi9, Mi1 from it), and nothing beyond the medulla.

Not reached at all: the small-object detectors (LC11, LC10, LC17), the ON pathway and T4, and anything that depends on them.

**What was changed to get this far, and what was tried and left out** (each measured with the battery, seed 1):

- **Graded columnar relays, kept** (The operating point). At 1 (count × sign alone) the signal dies in the medulla: Tm4 reaches 14 Hz for a grating, Tm1 7, nothing beyond fires, and no stimulus moves escape (0.10 to 0.15, as at rest). The factor is derived, not fitted: 2.3 is where one spike of L2 brings Tm1 or Tm2 from rest to threshold (7 mV / (0.177 × 0.275 mV × 61.5 saturated synapses); 0.177 is the membrane's peak response to a unit step of drive at these time constants). Sensitivity: at 2, a loom at the right eye reaches escape 0.58 and HS barely responds (4.0 against 0.8 Hz); at 3, looms reach escape 0.80 to 1.00 but so do dimming, flicker and rotating gratings (1.00), one-eye gratings reach 0.76 to 0.81 and bars 0.50 to 0.64, and HS's direction preference shrinks (187 against 148 Hz). Between, 2.3 is where looming and motion are most selective, which is luck as far as the derivation goes.
- **Which neurons count as columnar relays** matters as much. The same factor on all 89,403 optic lobe intrinsic neurons does little (at 3: LC4 reaches 2.6 Hz, escape 0.18 for the fastest loom, T4 silent and T5 at 0.1 Hz): the multicolumnar amacrine cells (Dm, Pm) gain as much as the relays, fire at 100 to 330 Hz under a grating, and inhibit everything. They are each one point neuron here that sums dozens of columns which in the fly are electrically separate, so they are driven hard enough already; leaving them out is the reason for the class. The class is the columnar classes of Fischbach and Dittrich (1989) by name (L, C, T, Tm, TmY, Y, Mi), limited to types with at least 100 cells a side. Without that limit Mi18 (36 a side, GABAergic, pooling about 25 columns onto the amacrine cells) is included, and it is the one columnar type that fires with the eyes shut, so including it changed the brain without `light` (from 0.3 s in).
- **Tonic lamina activity, rejected.** With the lamina firing at 30 Hz in a steady scene (so that brightening could lower it), brightening does lower everything, but Mi1, Tm3 and T4 stay silent: releasing them needs them to be depolarised at rest, which the model has no basis for without per-type tuning. And a steady scene then drives LC4 to 4 Hz and the giant fiber to 16 Hz (escape 0.24 at rest), with 13 times the spikes (352,000 a second against 27,000).
- **The lamina's scale.** At 100 Hz for full darkening instead of 200, looms reach escape 0.38 to 0.48 and the motion pathway falls almost silent (HS at 1 Hz or less for gratings).

**The made-up visual background stays on while the eyes are open.** It is not from the picture: it stands for internal state (arousal) and for the fly's spontaneous activity, and it is what makes the fly walk in bouts and turn now and then. A fly in a steady scene still walks, and the eyes here signal only change, so without the background the fly would stand still in a steady scene. Its per-eye "scene" was a stand-in for what the fly sees and now overlaps with real vision; it is kept because removing it would take away spontaneous turning, which vision doesn't supply in a steady scene. Everything in the table above is measured against it (stimulus minus control, same seed).

**`stats.rates`** gains, per eye, `vision.lamina`, `vision.medulla` (Mi1, Tm3, Mi4, Mi9, Tm1, Tm2, Tm4, Tm9), `vision.T4/T5`, `vision.lobula` (the LC, LPLC, LLPC and LPC types but the looming detectors), `vision.looming` (LPLC2, LC4) and `vision.tangential` (HS, VS), each as `vision.<stage> left` or `right`, in that order, smoothed over 100 ms. They are for display and feed no command. The lamina's is the driven cells' own rate, the looming detectors are also what `loomLeft` and `loomRight` drive, and the lobula's and tangential cells' rates include the background.

## Commands

Each command is read from a group's mean firing rate, smoothed exponentially, divided by the rate at which the command reaches 1 and clamped. `stats.rates` reports the smoothed rates by group name.

| Command | Neurons | Count | Smoothing | 1 at |
|---|---|---|---|---|
| `walk` | DNg100 (BDN2, forward walking) | 2 | 150 ms | 40 Hz |
| `turn` | DNa02, right minus left (each turns the fly toward its own side) | 1 + 1 | 150 ms | ±40 Hz |
| `back` | MDN (moonwalker, backward walking) | 4 | 150 ms | 40 Hz |
| `escape` | DNp01 (the giant fiber) | 2 | 40 ms | 200 Hz |
| `wings` | Indirect flight power muscle motor neurons DLM1-4, DLMn/a, DVM1a-c, DVMn/2a, DVMn/3a | 24 | 100 ms | 120 Hz |
| `groom` | Head-grooming descending neurons DNg12_a, _b, _c | 26 | 150 ms | 60 Hz |
| `feed` | MN9 (proboscis extension motor neuron) | 2 | 150 ms | 40 Hz |
| `sing` | pIP10 (the courtship song command descending neurons) | 2 | 150 ms | 40 Hz |

No neuron is both driven and read (`wire()` refuses a connectome where one would be, and the tests check it), and nothing outside the network produces a command: each comes from spikes that travelled through it.

## Spontaneous behaviour

With no input the network is silent. Two things keep it going at rest, and neither touches a neuron that is read, though the first barely counts:

- **The legs' load sensors** fire tonically while it stands (`grounded`): 13 neurons at 20 Hz, which do next to nothing on their own (Senses).
- **A visual background.** A fly at rest still sees a world. Every visual projection neuron except the looming detectors (nothing is looming) fires at a low rate, up to 6 Hz (5 Hz for the right eye, balanced: its neurons have 19% more output synapses). Each eye's rate is set by `src/state.ts`, a stand-in for internal state the connectome doesn't contain: a slowly wandering arousal shared by both eyes (time constant 10 s) and a slowly wandering scene for each eye (4 s), combined through a logistic into a level from 0 to 1. These are made-up processes, not neurons, and they act only by setting those background rates. The background stays on when the eyes are open (see Seeing for why). Hunger adds a term of its own, a stand-in for starvation's restlessness (Hunger); at hunger 1, or left out, it is 0, and everything below is measured there.

The behaviour then comes out of the network. The visual projection neurons drive the forward-walking DNg100 (LC9, LC12, LPC1 and LLPC types among them), so walking rises and falls with arousal, in bouts. Each eye's background drives only that side's DNa02, through the LC10 types, so the fly turns toward the busier eye; driven alone at matched strength, the left eye gives DNa02 21 Hz and the right 16.5 Hz. That central asymmetry, which the balancing doesn't touch, makes spontaneous turns lean toward the fly's left. Any other sense stops walking: it drives GNG inhibitory neurons onto DNg100.

Over 10 minutes at rest (seed 1, through the diagnostic observer; `report.ts` section c): walking forwards 49% of the time in 93 bouts (3.1 s on average), never backwards, 67 diagnostic turn events toward the fly's left and 36 toward its right, no escapes; escape peaked at 0.25. Seeds 2 and 3 walk 46% and 53% of the time in 100 and 127 bouts, and the three turn toward the left 1.9 to 3.6 times as often as toward the right. No spontaneous grooming or feeding. While `grounded` drove the wings' and halteres' sensors too (Senses), seed 1 walked 43% of the time in 104 bouts and the others 41–47%: those sensors held the wings a little open and the network busier, and the fly walked a little less.

`src/observer.ts` keeps these diagnostics reproducible without running the body or world. It smooths walking, backing and steering commands, applies fixed walking, backing and escape thresholds (escape the body's, 0.4), and counts left/right turn events using a leaky integral (threshold 0.5, leak 0.5/s). Those turn counts measure sustained steering commands, not the game's actual turns: `packages/body` steers continuously. The observer is used only by the brain tests and report, not by the game. The live body's behaviour and the remote's tools are described in the root README.

## Courtship

This connectome is a male's, and every fly it meets in the game, at a table with others, is a male too.

**The song circuit.** A courting male sings by vibrating one extended wing. P1, a cluster of male-specific neurons in the brain, decides to court; it drives pIP10, a pair of descending neurons whose activation alone makes a male sing, and pIP10 drives the song's pattern generator in the thoracic cord, dPR1, the TN1 cells and vPR6 among it, and the wing motor neurons (Clyne & Miesenböck 2008; von Philipsborn et al. 2011; Shirangi et al. 2016; Lillvis et al. 2024). In the male CNS P1 is the pC1 types `pC1_1a` to `pC1_19` (148 neurons; `pC1x` apart); pIP10 is its own type (one a side). The wiring is there: pIP10's largest inputs include `pC1_14a`, `pC1_5b`, `pC1_7a`/`b` and `pC1_19`, and its largest outputs in the cord are dPR1 (1,112 synapses), the TN1a types and vPR9.

**What is read.** `sing` is pIP10's rate, as `walk` is DNg100's: pIP10 is the narrowest point between the decision and the song, and activating it alone gives song (von Philipsborn et al. 2011). It says only that the fly sings, not which song: pulse or sine song is shaped in the cord (dPR1 and vPR6 for pulses, TN1a for sine; von Philipsborn et al. 2011, Shirangi et al. 2016), and is not read. 40 Hz for 1 is the round number the other descending commands use, not a measurement.

**The sense.** A male taps another fly with his front legs and tastes her cuticle. Each pheromone-sensing taste bristle on the legs has two ppk23 neurons: the M cell answers male pheromones (7-tricosene, cVA) and the F cell (ppk25 too) female ones (Thistle et al. 2012; Lu et al. 2012; Toda et al. 2012; Kallman et al. 2015). Gr32a bitter neurons answer 7-tricosene as well, and both keep males from courting males (Miyamoto & Amrein 2008; Wang et al. 2011); the forelegs' Gr32a neurons reach the male-specific mAL neurons and set which wing a courting male extends (Koganezawa et al. 2010). Which types those are in this dataset is Tastekin et al.'s (2025) proposal, from the male CNS's own taste connectome: LgLG1a is fru+ ppk23+ ppk25- (the M cell's identity), LgLG1b ppk23+ ppk25+ (the F cell's), LgLG5 and LgLG8 F-cell candidates of the male-only foreleg bristles, and LgAG1 the Gr33a (with Gr32a) bitter neurons, which they propose inhibit male-male courtship through AN05B023 to PPN1 (AN05B102a). `maleTaste` drives the front legs' LgLG1a and LgAG1: a male's cuticle. That is a proposal resting on predicted transmitters and projections, not a measurement of these cells.

**What the network does** (`node packages/brain/scripts/song.ts`, mean over 3 s from rest, seeds 1 to 3; the sing command's peak):

| | pIP10 | P1 | PPN1 | AN05B023 | mAL | dPR1 | TN1a | vPR9 | sing peak |
|---|---|---|---|---|---|---|---|---|---|
| rest | 0 | 0 | 0 | 0 | 0 | 0.33 | 0 | 0 | 0 |
| `maleTaste` 1 (50 Hz) | 0.06 | 0 | 0 | 34 | 0.06 | 0.22 | 0 | 0 | 0.08 |
| the same neurons at 100 Hz | 0 | 0 | 0.11 | 62 | 0.73 | 0 | 0 | 0 | 0 |
| a fly seen 3 mm ahead, swaying | 1.1 | 0 | 0 | 0 | 0.01 | 0.33 | 0 | 0.01 | 0.21 |
| a fly seen 5 mm ahead | 0 | 0 | 0 | 0 | 0.01 | 0.28 | 0 | 0.01 | 0 |
| *not a sense:* the front legs' LgLG1b at 50 Hz | 0 | 0 | 1.9 | 0.68 | 0 | 0.22 | 0 | 0 | 0 |
| *not a sense:* the front legs' LgLG5, LgLG8 at 50 Hz | 0 | 0 | 0 | 0 | 0.92 | 0 | 0 | 0 | 0 |
| *not a sense:* LC10a of both eyes at 30 Hz | 12 | 0.45 | 0 | 0 | 0.21 | 12 | 1.7 | 6.2 | 0.69 |
| *not a sense:* P1 at 30 Hz | 64 | 31 | 0 | 0 | 2.5 | 56 | 9.9 | 36 | 1.00 |

- **A male's taste doesn't make it court.** It drives AN05B023 hard, the relay Tastekin et al. propose for male-male inhibition, and reaches neither P1 nor pIP10, at 50 Hz or 100. As in the fly, a male rarely courts another male; here, never. It does make the fly shuffle a little (walk 0.08, back 0.10 on average over a second, `report.ts` (a)), short of walking or backing away.
- **Seeing a male doesn't either.** The fly seen through the eyes (other players' flies are drawn into the eyes' layer) moves LC10, the courtship-following visual neurons (Ribeiro et al. 2018; Sten et al. 2021), by less than 0.1 Hz over the 1.1 Hz the made-up visual background gives them (Seeing: the small-object detectors aren't reached). Close and swaying, it gives pIP10 a spike or two, through something other than P1, which stays silent: over 10 s and five seeds the sing command peaks at 0.17 to 0.25 for a fly 1.5 to 3 mm away, against 0.08 to 0.19 for one standing still.
- **The song pathway itself works.** Driving P1 drives pIP10 to 64 Hz, and the song circuit in the cord with it (dPR1 56 Hz, TN1a 10 Hz, vPR9 36 Hz); `sing` reaches 1. LC10a driven far above anything vision gives it reaches pIP10 too (sing 0.69 at 30 Hz).
- **Not even a female would be courted.** The female-pheromone neurons (the F-cell candidates LgLG1b, LgLG5, LgLG8) reach PPN1 weakly and P1 not at all. In the fly the forelegs' pheromone signals reach P1 along excitatory ascending relays (vAB3, PPN1) and, in parallel, through the inhibitory mAL neurons, which M cells drive too (Clowney et al. 2015; Kallman et al. 2015); here, as wired and at this operating point, the inhibition wins or the excitation dies on the way. So the honest answer is no song, and not because the model knows the other fly is a male.

**Alone, it never sings.** Over 10 minutes at rest (eyes shut, and eyes open on a steady scene, which is spike for spike the same) pIP10 is silent but for single spikes: sing peaks at 0.08 (seed 1) and stays at 0 (seeds 2 and 3); while `grounded` drove the wings' sensors too (Senses), at 0.16 (seeds 1 and 2) and 0.08 (seed 3), with a mean rate of 0.001 to 0.004 Hz. The body sings past 0.4 (`packages/body/src/behavior.ts`), five times that peak and 1.6 times the closest a seen fly comes.

Stand-ins and what is left out: the body decides which wing (toward the nearest other fly, else the side it last sang on; a male extends the wing nearer the female), which is not read from the brain; the song is shown, not heard. Neuropeptides and the dopamine that gates P1 in the fly (not modelled: dopamine is muted, Operating point) are left out, and so is the internal state that makes a male court more after a time without mating.

Sources: Clyne & Miesenböck 2008, "Sex-specific control and tuning of the pattern generator for courtship song in Drosophila", Cell 133; von Philipsborn et al. 2011, "Neuronal control of Drosophila courtship song", Neuron 69; Shirangi et al. 2016, "Doublesex regulates the connectivity of a neural circuit controlling Drosophila male courtship song", Dev Cell 37; Lillvis et al. 2024, "Nested neural circuits generate distinct acoustic signals during Drosophila courtship", Curr Biol 34; Miyamoto & Amrein 2008, "Suppression of male courtship by a Drosophila pheromone receptor", Nat Neurosci 11; Wang et al. 2011, "Hierarchical chemosensory regulation of male-male social interactions in Drosophila", Nat Neurosci 14; Koganezawa et al. 2010, "The shaping of male courtship posture by lateralized gustatory inputs to male-specific interneurons", Curr Biol 20; Thistle et al. 2012, "Contact chemoreceptors mediate male-male repulsion and male-female attraction during Drosophila courtship", Cell 149; Lu et al. 2012, "ppk23-dependent chemosensory functions contribute to courtship behavior in Drosophila melanogaster", PLoS Genet 8; Toda et al. 2012, "The Drosophila female aphrodisiac pheromone activates ppk23+ sensory neurons to elicit male courtship behavior", Cell Rep 1; Clowney et al. 2015, "Multimodal chemosensory circuits controlling male courtship in Drosophila", Neuron 87; Kallman et al. 2015, "Excitation and inhibition onto central courtship neurons biases Drosophila mate choice", eLife 4; Ribeiro et al. 2018, "Visual projection neurons mediating directed courtship in Drosophila", Cell 174; Sten et al. 2021, "Sexual arousal gates visual processing during Drosophila courtship", Nature 595; Tastekin et al. 2025, "From sensory detection to motor action: the comprehensive Drosophila taste-feeding connectome", bioRxiv 10.1101/2025.08.25.671814.

## Hunger

`hunger` (`BrainSenses`, 0 just fed to 1 starved for a day) is internal state the body keeps account of (`packages/body/src/hunger.ts`; the root README says how it rises and falls), not a sense. Left out, or anything not a number, it is 1, and the brain is spike for spike what it was before it had a hunger: a hungry fly's. That is where the model already was. Its sweet neurons were chosen for making the proboscis extend (Senses), which is what starved flies do in the extension assays that found these pathways, and the fly ate whenever it tasted sugar.

It acts in two places, each a stand-in for something the connectome lacks, and nowhere else.

**On the sweet taste neurons' output** (`io.ts`, `HUNGER`). Starvation does not make sugar-sensing taste neurons fire faster: their spiking to sucrose is the same in fed and starved flies. It raises the calcium that enters their terminals for each spike, and so what they release, through dopamine acting on their DopEcR receptors (Inagaki et al. 2012, Cell 148: 583, Figure 6 and S5). The dopamine comes from TH-VUM, a neuron in the subesophageal zone that fires at about 1 Hz just after a meal and 25 Hz after 24 hours without food; silencing it lowers the probability of extending the proboscis to sucrose, exciting it raises it (Marella et al. 2012, Neuron 73: 941). Dopamine's output is muted in this model (The operating point) and neuropeptides aren't in the connectome at all, so the brain scales the sweet neurons' outgoing synapses directly: each of their spikes reaches its targets with `sweetOutputGain(hunger)` times its usual weight (the engine's `addOutputGain` and `setOutputGain`, which touch only those 2,591 connections and leave their firing as it was). The gain is 1/1.4 just fed and 1 starved, linear between (a round assumption). The 1.4 is the measured effect of dopamine on those terminals: a bath of it raised the calcium sucrose brings in 1.3 to 1.4 fold (ibid., Figure 6G), taken here as release one for one. Release rises more steeply than calcium at most synapses, so if anything that understates it.

**On the made-up arousal** (`state.ts`). Starved flies walk more: about 60% more than fed ones in a day's starvation (Yu et al. 2016, eLife 5: e15693, Figure 1d; Lee & Park 2004, Genetics 167: 311; Yang et al. 2015, PNAS 112: 5219), through the adipokinetic hormone acting on octopaminergic neurons, none of which the model has. Hunger adds `hunger.weight × (hunger − 1)` to the logistic that sets the visual background's level (Spontaneous behaviour): 0 at hunger 1, lower as the fly is fed. Its weight, 0.8, is the one number here fitted to a measurement, so that a just-fed fly walks 1/1.6 as much as a starved one at rest. It was fitted while `grounded` drove the wings' and halteres' sensors too (Senses); since, a just-fed fly walks 1/1.46 to 1/1.49 as much (the table below).

Everything after that is the network. `node packages/brain/scripts/hunger.ts` measures it (about five minutes). Sugar held for 3 s after 2 s of rest, MN9's mean rate and `feed`'s, over seeds 1 to 3:

| Sugar | Hunger 0 (just fed) | Hunger 0.5 | Hunger 1 (starved, as before) |
|---|---|---|---|
| 0.25 | 0.1 Hz, feed 0.00 | 0.7 Hz, feed 0.02 | 1.4 Hz, feed 0.03 |
| 0.4 | 2.2 Hz, feed 0.05 | 3.8 Hz, feed 0.10 | 6.3 Hz, feed 0.16 |
| 0.6 | 6.1 Hz, feed 0.15 | 9.6 Hz, feed 0.24 | 13.4 Hz, feed 0.34 |
| 0.8 | 11.3 Hz, feed 0.28 | 15.1 Hz, feed 0.38 | 19.5 Hz, feed 0.49 |
| 1 | 15.8 Hz, feed 0.39 | 20.9 Hz, feed 0.52 | 25.2 Hz, feed 0.62 |

As a proboscis extension test: of 20 flies (seeds 1 to 20), how many the body starts feeding within 1 s of the sugar touching (`Behavior`, feed past 0.15):

| Sugar | Hunger 0 | Hunger 0.5 | Hunger 1 |
|---|---|---|---|
| 0.25 | 0/20 | 0/20 | 1/20 |
| 0.4 | 3/20 | 17/20 | 20/20 |
| 0.6 | 20/20 | 20/20 | 20/20 |
| 1 | 20/20 | 20/20 | 20/20 |

Starvation moves a fly's whole dose-response toward weaker sugar (Inagaki et al. 2012, Figure 4A); here a meal moves it back. The fed fly needs stronger sugar to extend, and still takes strong sugar, as fed flies do, less eagerly.

Does a fed fly stop sooner? A meal on one dropped lump of sugar, eaten as the game eats it (at `EAT_RATE` times `feed`, tasting weaker as less is left), until the fly stops of its own accord for a second, seeds 1 to 3, hunger held or falling as it eats (`@fly/body`'s `Hunger`, where the lump is a full meal):

| Hunger at the start | Held: feeding, eaten | Falling as it eats: feeding, eaten |
|---|---|---|
| 0 | 8.0, 8.8, 8.0 s; 86, 88, 87% | 8.7, 9.3, 8.1 s; 86, 87, 87% |
| 0.5 | 7.4, 6.8, 7.1 s; 90, 89, 91% | 8.2, 8.7, 7.5 s; 86, 89, 87% |
| 1 | 6.2, 6.2, 5.6 s; 91, 91, 90% | 6.3, 6.6, 6.7 s; 85, 85, 88% |

A little: a fed fly feeds more slowly, so its meal takes longer, and it gives up while more is left (12 to 14% of the lump against 9 to 10%, hunger held), because the taste of what is left falls below what its weaker sweet neurons pass on sooner. A real fly's meal ends mostly from inside, which this one doesn't have (below).

At rest (`report.ts --hunger <h>`, section c, 10 minutes, seeds 1 to 3; these tables measured again when `grounded` was narrowed to the legs' load sensors, Senses):

| Hunger | Walking forwards | Bouts |
|---|---|---|
| 0 (just fed) | 33.4%, 30.8%, 35.7% | 91, 98, 105 |
| 0.5 | 40.4%, 38.0%, 43.4% | 91, 108, 115 |
| 1 (starved, as before) | 48.6%, 45.9%, 52.9% | 93, 100, 127 |

Cost: a tick resets the sweet neurons' output gain whenever hunger has changed, which in the game is every frame: 2,591 weights rewritten, 3 to 11 µs a time in the TypeScript on an M5 Pro (`hunger.ts` section d), under 1% of a 16 ms tick's 2 ms at rest; the C++ does the same writes. The hunger term in the arousal is one multiply-add per chunk. Left out, hunger costs nothing: the gain stays at 1 and is never reset.

What it leaves out:

- **Meals ending from inside.** A real fly stops a meal as its crop and gut fill: stretch receptors on the foregut and crop, through the recurrent nerve, raise its taste threshold within minutes of a meal (Edgecomb, Murdock & Smith 1987, J Exp Biol 127: 79), Piezo-expressing neurons on the crop and gut cut feeding when they are stretched (Min et al. 2021, eLife 10: e63049), and GABAergic interneurons of the subesophageal zone restrain feeding in fed flies (Pool et al. 2014, Neuron 83: 164). None of that is driven here. The connectome's enteric sensory neurons (ENS1 to ENS5, 26 cells) are the likeliest candidates for the stretch receptors, but nothing says which they are, and driven at 20 or 50 Hz they change MN9's response to sugar by under 2% (`probe.ts`), so they would carry nothing if they were. Here a meal ends only when the food runs low, sooner the more sated the fly.
- **Bitter and water.** Starvation also dulls bitter taste (Inagaki et al. 2014, Neuron 84: 806), and thirst is its own state (Jourjine et al. 2016, Cell 166: 855). The model has no bitter or water sense.
- **Hunger's other pathways.** sNPF on the olfactory neurons (Root et al. 2011, Cell 145: 133), allatostatin A (Hentze et al. 2015, Sci Rep 5: 11680) and the rest. With no sense of smell and no neuropeptides, the gain above stands for all of starvation's effect on taste.

## What it does and doesn't reproduce

From the response matrix (`report.ts` section a):

- **Looming → escape.** LPLC2 and LC4 drive the giant fiber to 190–230 Hz and the flight power motor neurons to ~100 Hz: a take-off. The game's fallback looming pulse at full strength passes escape 0.5 in 32 ms and falls below 0.3 within 40 ms of fading; at half strength it still passes 0.5, in 32 ms too (seeds 1–3). Other looming-sensitive descending neurons (DNp02, DNp04, DNp11) respond too. Escape stays below 0.3 at rest and under every other sense.
- **Sweet → feed.** The chosen taste neurons drive MN9 to 30–34 Hz (feed 0.74–0.81, seeds 1–3). They were chosen for this (see Senses), so it is a demonstration that the pathway carries through the network, not evidence of which neurons are sweet. Held on, feed settles at 0.48–0.50 (seeds 1–3, seconds 2 to 10), and at 0.32–0.33 with touch at 0.4 and 0.16 with full touch. Walking stops too: over 20 s of sugar `walk` averaged 0.001–0.010. The taste neurons were chosen for MN9 alone, not for that.
- **A push on an antenna → groom.** Either antenna's zone C and E neurons at full strength drive the head-grooming DNg12 neurons to 26–28 Hz from the left and 23–25 Hz from the right (groom 0.43–0.47 and 0.39–0.41, seeds 1–3), with walking stopped and the wings a little open (0.12–0.21): in flies JO-C/E activation drives antennal grooming, with some wing flapping (Hampel et al. 2015, 2020). Both together, 0.52. Before the right antenna's completeness fix (Operating point) it was 0.00–0.06 from the left and 0 from the right. The game sends it when an antenna presses into something, and the body shows grooming within 130–160 ms. What is read is head grooming, of which antennal grooming is part: DNg12 is the descending neuron type for head grooming, and the descending neurons Hampel et al. (2015) found for antennal grooming itself, aDN1 and aDN2 (DNg62 and DNge078 in this dataset's annotations), fire too, at 35–95 and 52–62 Hz, but are not read.
- **Wind → groom.** Wind-sensitive Johnston's organ neurons drive DNg12 to 31–33 Hz (groom 0.52–0.55, seeds 1–3; 0.49–0.50 before the completeness fix) and open the wings a little (0.24–0.27; 0.29–0.32 while `grounded` drove the wings' sensors too, Senses).
- **Touch → back.** Full touch drives MDN to 27–28 Hz (back 0.69–0.70, seeds 1–3), mostly through the head bristles: touched, it backs away. Touch at the resting feather's level (0.4) does very little.
- **Spontaneous walking and steering** as above.
- **Hunger** (Hunger): a fed fly needs stronger sugar before MN9 extends its proboscis and feeds less eagerly, because its sweet neurons pass on less, as dopamine makes them do in the fly; and it walks less at rest, through a labelled stand-in for the hormones that make a starved fly restless.
- **Its own wingbeat → the flight motor neurons.** The wings' and halteres' strain sensors at full strength drive the flight power motor neurons to 36–42 Hz (`wings` 0.30–0.35, seeds 1–3), and little else: a weak loop through the body's own wings (Not reproduced, below).
- **Seeing** (The eyes): a dark disc looming at the right eye fires the giant fiber through the optic lobe, from the lamina on; the lobula plate's tangential cells prefer the directions they do in the fly; a rotation turns the fly with it, weakly.
- **P1 → pIP10 → song** (Courtship): driving P1 drives pIP10 and the cord's song circuit, and `sing` reaches 1. A male's taste on the front legs drives the male-male inhibition relay AN05B023, not P1: the fly doesn't court other males.

Not reproduced:

- **A push on an antenna → backing away.** Touching a real fly's antenna drives MDN and walks it backward (Dahlhoff et al. 2025, bioRxiv 10.1101/2025.07.22.666129), and Johnston's organ's zone F drives backing (Hampel et al. 2020). Here no Johnston's organ neuron synapses onto MDN, and the routes through one other neuron are thin (pIP1 makes 15 and 18 synapses onto MDN and takes 3–5% of its input from zones C, E and F); a push brings MDN to a few Hz (back 0.01–0.13). The fly's body (`packages/body/src/motion.ts`) keeps it from walking off an edge and turns it away after pressing against a wall for 2 s; the brain doesn't.
- **Touch → grooming of the body, wings or legs.** The body bristles mostly drive unnamed GNG descending neurons (DNge104, DNge122) and wing and haltere steering motor neurons, none of them a readout, and there is nothing honest to read: DNp29 stays silent under touch, and grooming of the thorax by the hind legs is commanded inside the ventral nerve cord, by the MGT neurons (Yoshikawa, Tang & Simpson 2024, Curr Biol 34:2066), not by a descending neuron.
- **The legs' proprioceptors**, other than the load sensors (`grounded`), aren't driven. The chordotonal organs and hair plates encode each joint's angle and movement through the step (Mamiya, Gurung & Tuthill 2018, Neuron 100:636), which a flat rate wouldn't stand for. Only 13 of the legs' sensors are annotated as campaniform sensilla (Senses); a fly's legs have many more, which this dataset doesn't name.
- **Losing ground contact → flight.** Real flies start flying when their legs lose contact and keep flying until their feet touch something (the tarsal reflex; Fraenkel 1932). Here nothing says the feet are free but the legs' 13 load sensors falling silent, which changes nothing measurable (Senses). The wings' own sensors (`wingbeat`) close a loop through the flight motor neurons, but a weak one: beating at full power they bring `wings` to 0.30 to 0.32, short of the 0.6 that holds the body up, so at every strength the brain answers with less than it is given. Flying on its own drive alone, as the body would without a stand-in, from a take-off's 0.62, its `wings` is down to 0 to 0.02 within half a second and wanders under 0.1 after, as at rest (`scripts/wingbeat.ts` (c), seeds 1 to 3); at 150, 200 and 250 Hz it is down within one to two seconds (at 250 Hz full strength drives `wings` to 0.69, but 0.62 to only 0.43). A loom seen through the eyes, though it fires the giant fiber, takes `wings` to 0.3 to 0.5 at its peak (the Swoop tool's ball at midday), short of 0.6 too: on the model alone an escape seen through the eyes is a jump, not a flight. The hand-wired pulse drives them to 0.8 to 0.9. The body stands in for the reflex (`packages/body/src/behavior.ts`, `TARSAL_ONSET`, and the root README's Flight): off its feet, it keeps a floor under the wings' drive, outside the brain, until it lands. The brain's `wings` command is unchanged by it, and no neuron is driven but the wings' own sensors, which feel the strokes the floor makes as they would any others: in a flight from a swoop they raise the brain's own `wings` from 0.07–0.14 to 0.19–0.23 on average, never as high as the floor (Flight in the root README).
- **A meal ending from inside**: crop and gut stretch, and the feeding restraint of fed flies, aren't driven (Hunger). A fed fly stops eating only when the food runs low, a little sooner than a hungry one.
- **DNp09 (forward walking toward objects) and DNa01** barely fire at rest and aren't read.
- **Seeing, in part**: brightening and everything that needs the ON pathway (T4); small objects; looming as distinct from any large darkening (dimming, flicker and high-contrast gratings take the fly near or past take-off); and the left eye's looming pathway is weaker than the right's. See Seeing.
- **Courtship at all**: no sense reaches P1, a female's pheromones (were there a female) included, and the eyes don't reach LC10. So the fly never sings in the game; that is the model's answer, with the song shown when it comes (Courtship).
- **Symmetry**: mirrored looms give the same escape, and a scene on either side steers toward that side, but the left-hand steering pathway is ~25% stronger, so spontaneous turns lean left. That is not the reconstruction: the two DNa02 receive 22,875 and 23,025 synapses, the central brain's neurons have as many on each side (left/right 0.92 in, 0.95 out), and the left eye's visual projection neurons have fewer output synapses than the right's (0.84), which would lean the other way. And the head's bristles reach grooming from one side only: the left's front-of-head `BM` neurons at 50 Hz drive DNg12 to 10–14 Hz, the right's to 0, with as many synapses (22,871 and 22,543); all the head's bristles of a side, 8–13 Hz against 0.2. The difference is downstream, not in the bristles.

## Regions

`src/regions.ts`. For display, the brain reports how fast each part of the nervous system fires: every neuron is in exactly one of 63 regions that a drawing of the fly can place in its body, and each region's mean firing rate over all its neurons, smoothed over 100 ms as the vision stages are (`REGION_TAU`), is `stats.rates["region.<id>"]`, after the nine readouts and before the vision stages. They are display only, like the vision stages: they read every neuron, the driven ones included, and no command reads them (`decode` reads the readouts by name). They change nothing in the simulation: the fingerprint test and the native comparisons give the same spikes as before they existed.

`REGIONS` is the catalog, in the order of the rates: each region's `id`, a short `name` (without the side), a `description` of what it is and which neurons are in it, its `place` in the body in words for whoever draws it, its `side` (`left` or `right` by soma side, `midline`, or `both` sides together), its `neurons` here and its `fullHz` (below). Left and right regions come in pairs, left first, alike but for their side.

### How neurons are placed

The wiring file has no positions and no neuropil per neuron (the separate anatomy sidecar below now carries positions and segments), so each neuron is placed by its annotations: super class, class, sub class, cell type and soma side. Where a type's name says which neuropil it belongs to, that decides; where nothing places a neuron, it goes to its part of the body's catch-all rather than to a guess. A neuron of a left/right region whose soma is on the midline or has no side goes to the catch-all too. `regionOf(connectome)` gives each neuron's region; `scripts/regions.ts` prints what each region holds (below).

- **Eyes and optic lobes**, each side. The photoreceptors (`ol_sensory`) are the retina; the visual projection and visual centrifugal neurons are regions of their own. The optic lobe's 89,403 intrinsic neurons go by type, after the naming of Fischbach and Dittrich (1989) and the male optic lobe's inventory (Nern et al. 2025):
  - **lamina**: its own cell types as Tuthill et al. (2013) list them, less the photoreceptors: L1-L5, the amacrine Lai, T1, the centrifugal C2 and C3 and the wide-field Lawf1 and Lawf2 (C2, C3 and the Lawfs take their input in the medulla and feed it back), and the lamina tangential Lat cells: 15,025.
  - **medulla**: the types named for it (Mi, Dm, Pm, Cm, the accessory medulla's aMe, MeVPMe, ME_unclear) and l-LNv, and the columnar types whose dendrites are in it and whose axons cross to the lobula or lobula plate: Tm, TmY, MeLo, T2, T2a and T3 (vision.ts's medulla stage is Tm1-Tm9 and Mi cells): 56,469.
  - **lobula**: Li, the lobula tangential LT cells, LC14 (joining the two lobulas), LO_unclear: 1,669.
  - **lobula plate**: LPi, Tlp, H1, LOP_unclear, and T4 and T5, whose dendrites are in the medulla and the lobula but whose axons make the lobula plate's four layers, and which are its input (vision.ts's T4/T5 stage): 14,726.
  - **optic lobe, other**: what spans neuropils with no single home or is unclear across them, or untyped: the Y cells (1,367), LOLP1, CT1, Am1, dCal1, MeVPLp2, MeVPOL1, Pm7_Li28 (one type of both a Pm and an Li), the *_unclear types of two neuropils, 46 untyped cells, and the two visual projection neurons to be confirmed: 1,516.
- **Head sensory neurons** (`cb_sensory`): olfactory, hygrosensory and thermosensory ones are one region for both antennae and palps (2,730, 414 of them with no side recorded); Johnston's organ (`JO-*`) by side; the head's bristles (`BM*`) one region; the mouthparts' taste (class gustatory) and touch (TPMN, aPhM) one region, on the midline; the rest (unknown modality, untyped, to be confirmed) the head's catch-all.
- **Central brain** (`cb_intrinsic`): by class first, Kenyon cells, MBONs and DANs (with APL, DPM, MB-C) to the mushroom body, the antennal lobe's ALPN, ALLN, ALIN and ALON to the antennal lobe, CX (with the FB and FS types) to the central complex, one midline region since its neuropils straddle the midline, and the subesophageal projection neurons (SEZPN) to the subesophageal zone. The 23,542 with no class by the neuropil their type is named for (the hemibrain's and FlyWire's convention: the neuropil with most of the type's synapses), grouped as Ito et al. (2014) group the neuropils, with some of their groups merged: SMP, SLP, SIP, aSP the superior protocerebrum; LH* the lateral horn; AVLP, PVLP, PLP, WED, AOTU, TuTu, VLP the ventrolateral protocerebrum; the inferior (CL, ICL, SCL, IB, ATL, CRE, aIPg), ventromedial (VES, PS, IPS, SPS, GOR, EPA) and lateral complex (LAL, TuBu) neuropils one region; the GNG and the periesophageal neuropils (AMMC, SAD, FLA, PRW, CAN) the subesophageal zone. The rest is *central brain, other* (6,644): 5,244 of the CB types, named only by number, 859 untyped, types named for something other than a neuropil (pC1, mAL, the clock neurons, the octopaminergic VUM and other modulatory neurons), and the 84 with their cell bodies on the midline.
- **Head motor neurons** (`cb_motor`, 107, mostly the proboscis's and pharynx's) and the **neuroendocrine and enteric** neurons (`cb_endocrine`, `ENS`, `cb_efferent`): one region each.
- **The neck**: descending neurons (with the 12 `sensory_descending`) and ascending neurons, by side.
- **Ventral nerve cord motor neurons** by sub class: front, middle and hind leg (`fl`, `ml`, `hl`) by side; wings, halteres and the unassigned ones leaving through the dorsal nerves (`wm`, `hm`, `xm`) one region; neck (`nm`); abdomen (`ad`).
- **Body sensory neurons** (`vnc_sensory`, `sensory_ascending`) by sub class, where it names a place: legs (`leg`, `leg_bristle`); wings, halteres and thorax (`wing`, `wing_bristle`, `haltere`, `notum`, `neck`); abdomen. Where it names only the organ: proprioceptors (`campaniform_sensilla`, `chordotonal_organ`, `hair_plate`) and body bristles (`mechanosensory_bristle`, `taste_bristle`). Most have no side recorded, so these are both sides together.
- **Ventral nerve cord interneurons** (`vnc_intrinsic`) by side; those with their soma on the midline, and the cord neurons to be confirmed (`vnc_tbc`), on the midline. The wiring file doesn't say which neuromere an interneuron is in (the separate anatomy sidecar now does, as `somaNeuromere`, for all but 9 of them; the catalog does not consume it), so each side is one region along the whole cord. Efferent and neuroendocrine neurons of the cord (`vnc_efferent`, `vnc_endocrine`, `efferent_ascending`, `efferent_descending`) one region.
- **Unplaced**: what nothing above places, 75 here: descending and ascending neurons with their soma on the midline or no side, and sensory neurons whose class or organ is to be confirmed.

What each region holds, by what put them there (super class, class or sub class where the rule reads it, and the type's prefix, its letters before the first digit), largest first (`node packages/brain/scripts/regions.ts`):

| Region | Neurons | What put them there (neurons) |
|---|---|---|
| `retina-left` | 2,349 | ol_sensory · visual · R 2,345; ol_sensory · HBeyelet 4 |
| `retina-right` | 3,749 | ol_sensory · visual · R 3,746; ol_sensory · HBeyelet 3 |
| `lamina-left` | 7,474 | ol_intrinsic · L 4,418; ol_intrinsic · C 1,758; ol_intrinsic · T 885; ol_intrinsic · Lawf 372; ol_intrinsic · Lai 36; ol_intrinsic · Lat 5 |
| `lamina-right` | 7,551 | ol_intrinsic · L 4,466; ol_intrinsic · C 1,766; ol_intrinsic · T 892; ol_intrinsic · Lawf 372; ol_intrinsic · Lai 50; ol_intrinsic · Lat 5 |
| `medulla-left` | 28,185 | ol_intrinsic · Tm 9,942; ol_intrinsic · Mi 4,780; ol_intrinsic · Dm 4,090; ol_intrinsic · TmY 3,836; ol_intrinsic · T 2,705; ol_intrinsic · Cm 1,558; 12 more groups 1,274 |
| `medulla-right` | 28,284 | ol_intrinsic · Tm 9,919; ol_intrinsic · Mi 4,809; ol_intrinsic · Dm 4,085; ol_intrinsic · TmY 3,860; ol_intrinsic · T 2,737; ol_intrinsic · Cm 1,594; 13 more groups 1,280 |
| `lobula-left` | 827 | ol_intrinsic · Li 767; ol_intrinsic · ol_bilateral · LC 43; ol_intrinsic · LO_unclear 11; ol_intrinsic · Li_unclear 3; ol_intrinsic · LT 2; ol_intrinsic · ol_bilateral · LT 1 |
| `lobula-right` | 842 | ol_intrinsic · Li 791; ol_intrinsic · ol_bilateral · LC 45; ol_intrinsic · LO_unclear 3; ol_intrinsic · LT 2; ol_intrinsic · ol_bilateral · LT 1 |
| `lobula-plate-left` | 7,365 | ol_intrinsic · T 6,790; ol_intrinsic · LPi 376; ol_intrinsic · Tlp 192; ol_intrinsic · LPi_unclear 4; ol_intrinsic · LOP_unclear 2; ol_intrinsic · ol_bilateral · H 1 |
| `lobula-plate-right` | 7,361 | ol_intrinsic · T 6,795; ol_intrinsic · LPi 375; ol_intrinsic · Tlp 188; ol_intrinsic · LOP_unclear 2; ol_intrinsic · ol_bilateral · H 1 |
| `optic-other-left` | 758 | ol_intrinsic · Y 677; ol_intrinsic · LOLP 37; ol_intrinsic · untyped 24; ol_intrinsic · ME_LO_unclear 4; ol_intrinsic · LOP_ME_unclear 4; ol_intrinsic · LO_ME_unclear 2; 10 more groups 10 |
| `optic-other-right` | 758 | ol_intrinsic · Y 690; ol_intrinsic · LOLP 32; ol_intrinsic · untyped 22; ol_intrinsic · LA_ME_unclear 3; ol_intrinsic · LpMe_unclear 2; ol_intrinsic · Am 1; 8 more groups 8 |
| `visual-projection-left` | 4,589 | visual_projection · LC 2,068; visual_projection · MeTu 501; visual_projection · MeVP 395; visual_projection · LLPC 378; visual_projection · LoVP 336; visual_projection · TmY 243; 28 more groups 668 |
| `visual-projection-right` | 4,612 | visual_projection · LC 2,096; visual_projection · MeTu 508; visual_projection · MeVP 415; visual_projection · LLPC 382; visual_projection · LoVP 328; visual_projection · TmY 234; 29 more groups 649 |
| `visual-centrifugal-left` | 283 | visual_centrifugal · LPT 103; visual_centrifugal · LoVC 57; visual_centrifugal · MeVC 28; visual_centrifugal · aMe 24; visual_centrifugal · LT 16; visual_centrifugal · OCC 12; 14 more groups 43 |
| `visual-centrifugal-right` | 280 | visual_centrifugal · LPT 106; visual_centrifugal · LoVC 51; visual_centrifugal · MeVC 28; visual_centrifugal · aMe 21; visual_centrifugal · LT 17; visual_centrifugal · OCC 12; 15 more groups 45 |
| `antenna-smell` | 2,730 | cb_sensory · olfactory · ORN_VA 541; cb_sensory · olfactory · ORN_VM 447; cb_sensory · olfactory · ORN_DA 354; cb_sensory · olfactory · ORN_DL 329; cb_sensory · olfactory · ORN_DM 316; cb_sensory · olfactory · ORN_VL 225; 8 more groups 518 |
| `johnston-left` | 348 | cb_sensory · mechanosensory · JO-EV 101; cb_sensory · mechanosensory · JO-B 57; cb_sensory · mechanosensory · JO-ED 56; cb_sensory · mechanosensory · JO-FV 36; cb_sensory · mechanosensory · JO-A 18; cb_sensory · mechanosensory · JO-CA 17; 8 more groups 63 |
| `johnston-right` | 324 | cb_sensory · mechanosensory · JO-unclear 95; cb_sensory · mechanosensory · JO-EV 75; cb_sensory · mechanosensory · JO-ED 35; cb_sensory · mechanosensory · JO-FV 34; cb_sensory · mechanosensory · JO-A-unclear 24; cb_sensory · mechanosensory · JO-B 18; 6 more groups 43 |
| `head-bristles` | 932 | cb_sensory · mechanosensory · BM_InOm 745; cb_sensory · mechanosensory · BM 69; cb_sensory · mechanosensory · BM_Taste 40; cb_sensory · mechanosensory · BM_vOcci_vPoOr 26; cb_sensory · mechanosensory · BM_Vib 22; cb_sensory · mechanosensory · BM_MaPa 15; 2 more groups 15 |
| `mouthparts` | 374 | cb_sensory · gustatory · LB 165; cb_sensory · mechanosensory · TPMN 60; cb_sensory · gustatory · claw_tpGRN 50; cb_sensory · gustatory · PhG 48; cb_sensory · mechanosensory · aPhM 39; cb_sensory · gustatory · dorsal_tpGRN 10; 1 more groups 2 |
| `head-sensory-other` | 174 | cb_sensory · unknown_sensory · untyped 48; cb_sensory · mechanosensory · untyped 28; cb_sensory · unknown_sensory · ENS 26; cb_sensory · unknown_sensory · GNG 24; cb_sensory · untyped 20; cb_sensory_tbc · untyped 14; 4 more groups 14 |
| `antennal-lobe-left` | 572 | cb_intrinsic · ALLN · lLN 82; cb_intrinsic · ALLN · v 61; cb_intrinsic · ALPN · M_vPNml 55; cb_intrinsic · ALPN · M_lvPNm 41; cb_intrinsic · ALLN · CB 38; cb_intrinsic · ALPN · VP 33; 38 more groups 262 |
| `antennal-lobe-right` | 570 | cb_intrinsic · ALLN · lLN 79; cb_intrinsic · ALLN · v 57; cb_intrinsic · ALPN · M_vPNml 56; cb_intrinsic · ALPN · M_lvPNm 42; cb_intrinsic · ALLN · CB 38; cb_intrinsic · ALPN · VP 33; 37 more groups 265 |
| `mushroom-body-left` | 2,241 | cb_intrinsic · Kenyon_Cell · KCg-m 689; cb_intrinsic · Kenyon_Cell · KCab-m 310; cb_intrinsic · Kenyon_Cell · KCab-c 277; cb_intrinsic · Kenyon_Cell · KCab-s 234; cb_intrinsic · Kenyon_Cell · KCapbp-ap 230; cb_intrinsic · DAN · PAM 158; 11 more groups 343 |
| `mushroom-body-right` | 2,269 | cb_intrinsic · Kenyon_Cell · KCg-m 653; cb_intrinsic · Kenyon_Cell · KCab-s 423; cb_intrinsic · Kenyon_Cell · KCapbp-ap 260; cb_intrinsic · Kenyon_Cell · KCab-m 226; cb_intrinsic · Kenyon_Cell · KCab-c 211; cb_intrinsic · DAN · PAM 158; 10 more groups 338 |
| `central-complex` | 2,979 | cb_intrinsic · CX · FB 575; cb_intrinsic · CX · FS 306; cb_intrinsic · CX · ER 282; cb_intrinsic · CX · FC 277; cb_intrinsic · CX · PFNp_b 136; cb_intrinsic · CX · vDeltaA_a 70; 62 more groups 1,333 |
| `superior-protocerebrum-left` | 1,969 | cb_intrinsic · SMP 1,038; cb_intrinsic · SLP 670; cb_intrinsic · SIP 236; cb_intrinsic · aSP 22; cb_intrinsic · aSP-g 1; cb_intrinsic · SMPp&v 1; 1 more groups 1 |
| `superior-protocerebrum-right` | 1,961 | cb_intrinsic · SMP 1,038; cb_intrinsic · SLP 663; cb_intrinsic · SIP 237; cb_intrinsic · aSP 20; cb_intrinsic · aSP-g 1; cb_intrinsic · SMP_unclear 1; 1 more groups 1 |
| `lateral-horn-left` | 1,016 | cb_intrinsic · LHAV 409; cb_intrinsic · LHPV 366; cb_intrinsic · LHAD 109; cb_intrinsic · LHPD 82; cb_intrinsic · LH 27; cb_intrinsic · LHCENT 22; 1 more groups 1 |
| `lateral-horn-right` | 1,010 | cb_intrinsic · LHAV 407; cb_intrinsic · LHPV 364; cb_intrinsic · LHAD 107; cb_intrinsic · LHPD 83; cb_intrinsic · LH 26; cb_intrinsic · LHCENT 22; 1 more groups 1 |
| `ventrolateral-protocerebrum-left` | 2,336 | cb_intrinsic · AVLP 1,058; cb_intrinsic · WED 368; cb_intrinsic · PLP 359; cb_intrinsic · PVLP 316; cb_intrinsic · AOTU 153; cb_intrinsic · WEDPN 77; 4 more groups 5 |
| `ventrolateral-protocerebrum-right` | 2,345 | cb_intrinsic · AVLP 1,060; cb_intrinsic · WED 370; cb_intrinsic · PLP 357; cb_intrinsic · PVLP 320; cb_intrinsic · AOTU 156; cb_intrinsic · WEDPN 76; 5 more groups 6 |
| `inferior-ventromedial-left` | 1,919 | cb_intrinsic · CL 500; cb_intrinsic · PS 465; cb_intrinsic · LAL 333; cb_intrinsic · CRE 182; cb_intrinsic · VES 147; cb_intrinsic · IB 105; 7 more groups 187 |
| `inferior-ventromedial-right` | 1,933 | cb_intrinsic · CL 509; cb_intrinsic · PS 475; cb_intrinsic · LAL 332; cb_intrinsic · CRE 179; cb_intrinsic · VES 143; cb_intrinsic · IB 104; 7 more groups 191 |
| `subesophageal-left` | 1,193 | cb_intrinsic · GNG 768; cb_intrinsic · SAD 147; cb_intrinsic · PRW 134; cb_intrinsic · AMMC 100; cb_intrinsic · FLA 28; cb_intrinsic · SEZPN · Z_lvPNm 4; 4 more groups 12 |
| `subesophageal-right` | 1,207 | cb_intrinsic · GNG 779; cb_intrinsic · SAD 146; cb_intrinsic · PRW 132; cb_intrinsic · AMMC 102; cb_intrinsic · FLA 31; cb_intrinsic · SEZPN · Z_lvPNm 5; 4 more groups 12 |
| `central-brain-other` | 6,644 | cb_intrinsic · CB 5,244; cb_intrinsic · untyped 859; cb_intrinsic · pC 156; cb_intrinsic · mAL_m 98; cb_intrinsic · mAL 43; cb_intrinsic · GNG 36; 40 more groups 208 |
| `head-motor` | 107 | cb_motor · MN 48; cb_motor · GNG 27; cb_motor · MNx 13; cb_motor · CvN 8; cb_motor · CEM 6; cb_motor · PS 4; 1 more groups 1 |
| `brain-endocrine` | 126 | ENS · untyped 50; cb_endocrine · IPC 16; cb_endocrine · DNES 16; cb_endocrine · PI 8; cb_endocrine · untyped 7; cb_endocrine · ITP 7; 5 more groups 22 |
| `descending-left` | 662 | descending_neuron · DNg 215; descending_neuron · DNge 211; descending_neuron · DNp 81; descending_neuron · DNpe 79; descending_neuron · DNa 16; descending_neuron · DNb 12; 14 more groups 48 |
| `descending-right` | 654 | descending_neuron · DNge 212; descending_neuron · DNg 210; descending_neuron · DNp 81; descending_neuron · DNpe 77; descending_neuron · DNa 16; descending_neuron · DNb 12; 14 more groups 46 |
| `ascending-left` | 930 | ascending_neuron · AN 811; ascending_neuron · ANXXX 103; ascending_neuron · IN 10; ascending_neuron · vMS 2; ascending_neuron · untyped 2; ascending_neuron · dMS 1; 1 more groups 1 |
| `ascending-right` | 907 | ascending_neuron · AN 790; ascending_neuron · ANXXX 106; ascending_neuron · IN 5; ascending_neuron · untyped 3; ascending_neuron · vMS 2; ascending_neuron · dMS 1 |
| `front-leg-motor-left` | 68 | vnc_motor · fl · accessory_tibia_flexor 10; vnc_motor · fl · ltm 8; vnc_motor · fl · trochanter_flexor 8; vnc_motor · fl · tibia_flexor 5; vnc_motor · fl · Ta/depressor 5; vnc_motor · fl · tergopleural_pleural_promotor 4; 11 more groups 28 |
| `front-leg-motor-right` | 67 | vnc_motor · fl · accessory_tibia_flexor 9; vnc_motor · fl · trochanter_flexor 7; vnc_motor · fl · ltm 7; vnc_motor · fl · Fe/reductor 6; vnc_motor · fl · tibia_flexor 5; vnc_motor · fl · tergopleural_pleural_promotor 4; 12 more groups 29 |
| `middle-leg-motor-left` | 58 | vnc_motor · ml · MNml 12; vnc_motor · ml · trochanter_flexor 7; vnc_motor · ml · ltm 6; vnc_motor · ml · accessory_tibia_flexor 6; vnc_motor · ml · tibia_flexor 5; vnc_motor · ml · Sternal/posterior/rotator 4; 9 more groups 18 |
| `middle-leg-motor-right` | 58 | vnc_motor · ml · MNml 12; vnc_motor · ml · trochanter_flexor 7; vnc_motor · ml · ltm 6; vnc_motor · ml · accessory_tibia_flexor 6; vnc_motor · ml · tibia_flexor 5; vnc_motor · ml · Sternal/posterior/rotator 4; 9 more groups 18 |
| `hind-leg-motor-left` | 66 | vnc_motor · hl · MNhl 11; vnc_motor · hl · tibia_flexor 9; vnc_motor · hl · accessory_trochanter_flexor 8; vnc_motor · hl · ltm 8; vnc_motor · hl · accessory_tibia_flexor 8; vnc_motor · hl · Sternal/posterior/rotator 4; 10 more groups 18 |
| `hind-leg-motor-right` | 64 | vnc_motor · hl · MNhl 10; vnc_motor · hl · accessory_tibia_flexor 8; vnc_motor · hl · tibia_flexor 8; vnc_motor · hl · ltm 7; vnc_motor · hl · trochanter_flexor 5; vnc_motor · hl · accessory_trochanter_flexor 4; 10 more groups 22 |
| `flight-motor` | 89 | vnc_motor · wm · hg 8; vnc_motor · wm · DLM 8; vnc_motor · wm · DVMn/ 8; vnc_motor · wm · DVM 6; vnc_motor · hm · MNhm 6; vnc_motor · wm · b 6; 14 more groups 47 |
| `neck-motor` | 24 | vnc_motor · nm · MNnm 18; vnc_motor · nm · ADNM 4; vnc_motor · nm · FNM 2 |
| `abdomen-motor` | 214 | vnc_motor · ad · MNad 214 |
| `leg-sensory` | 1,640 | vnc_sensory · leg_bristle · LgLG 667; vnc_sensory · leg · untyped 381; vnc_sensory · leg · SNta 135; vnc_sensory · leg · SNxx 99; vnc_sensory · leg · SNxxxx 95; vnc_sensory · leg · SNppxx 80; 10 more groups 183 |
| `thorax-sensory` | 868 | vnc_sensory · wing_bristle · WG 385; vnc_sensory · notum · SNta 214; sensory_ascending · haltere · SApp 148; vnc_sensory · haltere · SNpp 51; vnc_sensory · wing · SNxx 26; vnc_sensory · wing · SNpp 19; 9 more groups 25 |
| `abdomen-sensory` | 1,143 | vnc_sensory · abdomen · SNxx 670; vnc_sensory · abdomen · untyped 358; vnc_sensory · abdomen · SNpp 65; vnc_sensory · abdomen · SNch 35; sensory_ascending · abdomen · SAxx 12; sensory_ascending · abdomen · untyped 3 |
| `proprioceptors` | 964 | vnc_sensory · chordotonal_organ · SNpp 396; sensory_ascending · campaniform_sensilla · SApp 251; vnc_sensory · campaniform_sensilla · SNpp 152; vnc_sensory · hair_plate · SNpp 112; vnc_sensory · campaniform_sensilla · SApp 23; sensory_ascending · chordotonal_organ · SApp 22; 3 more groups 8 |
| `bristles` | 2,276 | vnc_sensory · mechanosensory_bristle · SNta 2,204; vnc_sensory · taste_bristle · SNch 68; vnc_sensory · mechanosensory_bristle · SNxx 2; vnc_sensory · taste_bristle · LgLG 2 |
| `cord-interneurons-left` | 6,474 | vnc_intrinsic · IN 5,785; vnc_intrinsic · INXXX 502; vnc_intrinsic · untyped 92; vnc_intrinsic · TN 18; vnc_intrinsic · vMS 17; vnc_intrinsic · GFC 16; 7 more groups 44 |
| `cord-interneurons-right` | 6,448 | vnc_intrinsic · IN 5,761; vnc_intrinsic · INXXX 507; vnc_intrinsic · untyped 92; vnc_intrinsic · GFC 18; vnc_intrinsic · vMS 17; vnc_intrinsic · TN 17; 7 more groups 36 |
| `cord-midline` | 277 | vnc_intrinsic · IN 219; vnc_tbc · untyped 38; vnc_intrinsic · untyped 10; vnc_intrinsic · vPR 9; vnc_intrinsic · INXXX 1 |
| `cord-efferent` | 128 | vnc_efferent · EN 51; vnc_efferent · ENXXX 23; vnc_efferent · untyped 16; vnc_endocrine · LK 12; efferent_ascending · EA 6; efferent_descending · DNg 4; 7 more groups 16 |
| `unplaced` | 75 | vnc_sensory_tbc · untyped 36; vnc_sensory · untyped 14; ascending_neuron · AN 7; descending_neuron · DNge 6; ascending_neuron · ANXXX 2; descending_neuron · DNpe 2; 6 more groups 8 |

### How fast each fires, and fullHz

A display shows a region at `rate / fullHz`, clamped to 1. `fullHz` is measured (`scripts/regions.ts`, seed 1): each region's rate at rest, its mean over a minute after 2 s of rest, and its peak, the highest its smoothed rate reaches under any stimulus report.ts runs: each sense alone at full strength for 1 s, every sense at once, the game's fallback looming pulse in the left eye, and every stimulus of the vision battery with the eyes open, each from a fresh brain. `fullHz` is the peak, but at least four times the rate at rest, so that rest is at most a quarter of full (a faint glow where a region is busy at rest), and at least 5 Hz, so that a region where only a few of its neurons ever fire never looks busy; a left/right pair shares the larger of its two, so that the display shows where one side fires more than the other; rounded up to two significant figures.

| Region | Neurons | Rest (Hz) | Peak (Hz) | Under | fullHz |
|---|---|---|---|---|---|
| `retina-left` | 2,349 | 0 | 0.03 | grating, anticlockwise | 5 |
| `retina-right` | 3,749 | 0 | 0.02 | grating right, upward | 5 |
| `lamina-left` | 7,474 | 0 | 38.9 | loom left | 41 |
| `lamina-right` | 7,551 | 0 | 40.3 | loom right fast | 41 |
| `medulla-left` | 28,185 | 0 | 11.8 | loom left | 15 |
| `medulla-right` | 28,284 | 0 | 14.5 | loom right fast | 15 |
| `lobula-left` | 827 | 0.02 | 9.82 | loom left | 16 |
| `lobula-right` | 842 | 0.03 | 15.8 | loom right fast | 16 |
| `lobula-plate-left` | 7,365 | 0 | 0.31 | grating, anticlockwise | 5 |
| `lobula-plate-right` | 7,361 | 0 | 0.69 | grating right, upward | 5 |
| `optic-other-left` | 758 | 0.02 | 0.79 | grating, anticlockwise | 5 |
| `optic-other-right` | 758 | 0.06 | 1.00 | grating, clockwise | 5 |
| `visual-projection-left` | 4,589 | 1.94 | 6.36 | everything at once | 12 |
| `visual-projection-right` | 4,612 | 2.90 | 3.64 | everything at once | 12 |
| `visual-centrifugal-left` | 283 | 1.28 | 10.5 | everything at once | 11 |
| `visual-centrifugal-right` | 280 | 1.71 | 10.8 | everything at once | 11 |
| `antenna-smell` | 2,730 | 0 | 0 | - | 5 |
| `johnston-left` | 348 | 0 | 101.7 | everything at once | 110 |
| `johnston-right` | 324 | 0 | 98.5 | everything at once | 110 |
| `head-bristles` | 932 | 0 | 48.0 | everything at once | 48 |
| `mouthparts` | 374 | 0 | 21.5 | sweet | 22 |
| `head-sensory-other` | 174 | 0 | 1.06 | sweet | 5 |
| `antennal-lobe-left` | 572 | 0 | 0.89 | everything at once | 5 |
| `antennal-lobe-right` | 570 | 0 | 1.09 | everything at once | 5 |
| `mushroom-body-left` | 2,241 | 0 | 0.21 | everything at once | 5 |
| `mushroom-body-right` | 2,269 | 0 | 0.21 | everything at once | 5 |
| `central-complex` | 2,979 | 0 | 1.21 | everything at once | 5 |
| `superior-protocerebrum-left` | 1,969 | 0 | 0.90 | everything at once | 5 |
| `superior-protocerebrum-right` | 1,961 | 0.01 | 1.05 | everything at once | 5 |
| `lateral-horn-left` | 1,016 | 0 | 0.73 | everything at once | 5 |
| `lateral-horn-right` | 1,010 | 0 | 0.85 | everything at once | 5 |
| `ventrolateral-protocerebrum-left` | 2,336 | 0.98 | 7.81 | everything at once | 8 |
| `ventrolateral-protocerebrum-right` | 2,345 | 1.80 | 7.97 | everything at once | 8 |
| `inferior-ventromedial-left` | 1,919 | 0.12 | 4.39 | everything at once | 5 |
| `inferior-ventromedial-right` | 1,933 | 0.19 | 4.79 | everything at once | 5 |
| `subesophageal-left` | 1,193 | 0.06 | 20.0 | everything at once | 22 |
| `subesophageal-right` | 1,207 | 0.12 | 21.5 | everything at once | 22 |
| `central-brain-other` | 6,644 | 0.10 | 4.02 | everything at once | 5 |
| `head-motor` | 107 | 0.49 | 37.4 | everything at once | 38 |
| `brain-endocrine` | 126 | 0 | 0.67 | wingbeat | 5 |
| `descending-left` | 662 | 0.41 | 18.0 | everything at once | 18 |
| `descending-right` | 654 | 0.60 | 18.0 | everything at once | 18 |
| `ascending-left` | 930 | 0.08 | 9.49 | everything at once | 9.5 |
| `ascending-right` | 907 | 0.07 | 8.95 | everything at once | 9.5 |
| `front-leg-motor-left` | 68 | 0.14 | 10.7 | wind | 11 |
| `front-leg-motor-right` | 67 | 0.11 | 10.2 | wind | 11 |
| `middle-leg-motor-left` | 58 | 0.33 | 9.05 | loomRight | 9.1 |
| `middle-leg-motor-right` | 58 | 0.32 | 7.64 | everything at once | 9.1 |
| `hind-leg-motor-left` | 66 | 0.46 | 12.2 | wingbeat | 13 |
| `hind-leg-motor-right` | 64 | 0.45 | 10.2 | wingbeat | 13 |
| `flight-motor` | 89 | 2.69 | 75.6 | everything at once | 76 |
| `neck-motor` | 24 | 0.49 | 28.3 | wingbeat | 29 |
| `abdomen-motor` | 214 | 0.11 | 28.5 | everything at once | 29 |
| `leg-sensory` | 1,640 | 0 | 1.57 | everything at once | 5 |
| `thorax-sensory` | 868 | 0 | 0.02 | wingbeat | 5 |
| `abdomen-sensory` | 1,143 | 0 | 0 | - | 5 |
| `proprioceptors` | 964 | 0.27 | 39.8 | wingbeat | 40 |
| `bristles` | 2,276 | 0 | 9.77 | touch | 9.8 |
| `cord-interneurons-left` | 6,474 | 0.08 | 6.89 | everything at once | 6.9 |
| `cord-interneurons-right` | 6,448 | 0.07 | 6.41 | everything at once | 6.9 |
| `cord-midline` | 277 | 0.02 | 32.5 | everything at once | 33 |
| `cord-efferent` | 128 | 0.03 | 9.75 | everything at once | 9.8 |
| `unplaced` | 75 | 0.01 | 11.6 | everything at once | 12 |

What it shows:

- **At rest** the busy regions are the ones the made-up visual background drives: the visual projection neurons, at 2-3 Hz, wandering with it, the ventrolateral protocerebrum they end in, at 1-2 Hz, and the visual centrifugal neurons. On the display's scale they show at 12 to 24% of full. The wing and haltere motor neurons fire at 2.7 Hz (4% of full), the head and neck motor neurons at 0.5 Hz, and the proprioceptors at 0.3 Hz: the legs' 13 load sensors that `grounded` drives at 20 Hz, among 964. Until `grounded` was narrowed to those 13 it drove the wings' and halteres' sensors too (Senses), and at rest the flight motor neurons fired at 8.9 Hz, the proprioceptors at 8.7 and the neck motor neurons at 5.4. The descending and ascending neurons, the cord's interneurons and the leg motor neurons, at 0.1 to 0.6 Hz, show at 1 to 4%.
- **Never fire**: the retina, smell, and the wings', halteres', thorax's and abdomen's sensory neurons other than the proprioceptors; the legs' fire only with every sense at once, and then at 1.6 Hz. No sense drives them: the light enters one synapse in, at the lamina (The eyes), the model has no sense of smell, and among the body's sensory neurons only the bristles and the proprioceptors are driven. What reaches them in the wiring doesn't fire them either. The photoreceptors' input is 96% inhibitory (Dm9 and the other photoreceptors' histamine; the retina's peak, 0.03 Hz under a grating, is a handful of them); the others get synapses onto their axon terminals, more of them inhibitory than excitatory, and the excitatory ones mostly from other sensory neurons like themselves, which nothing drives. They stay dark, as they should.
- **Barely fire**, under 2 Hz at their peak, and stay faint: the mushroom body (0.21 Hz), lateral horn and superior protocerebrum (0.7 to 1.1 Hz), antennal lobe (0.9 to 1.1) and central complex (1.2, with every sense at once), the lobula plate (0.7: T4 never fires because the ON pathway is silent, and T5 fires at about 1 Hz, Seeing), the optic lobe's other cells, the neuroendocrine neurons and the head's other sensory neurons. With no smell nothing reaches the olfactory centres, and the other senses reach the higher centres of the brain only weakly in this model.
- **Fire, but drive nothing**: every motor region (their output is muted: no predicted transmitter, Operating point), and the dopaminergic neurons in the mushroom body region (their output is muted as modulatory). Their rates are their own; what they would do downstream isn't modelled.

### Cost

What the readout adds: one increment a spike, whichever neuron fires (23,000 a second at rest, 970,000 under the grating across both eyes), and every 10 ms chunk 63 smoothings; a byte a neuron for the partition; and, when the brain is built, classifying every neuron, 12 to 20 ms of string checks here and a few ms natively (in the native bench's runs the TypeScript brain built in 149 to 163 ms after against 155 to 159 before, the native one in 51 to 52 ms against 46 to 49). Measured on an M5 Pro against the commit before, runs alternating between the two, it is within the runs' own spread everywhere:

| Wall time per simulated second | Before | After |
|---|---|---|
| report.ts (d), at rest (three runs each) | 0.127-0.145 s | 0.128-0.131 s |
| report.ts (d), the feather resting on the fly | 0.151-0.166 s | 0.150-0.164 s |
| report.ts (d), touch and wind while airborne | 0.174-0.209 s | 0.177-0.186 s |
| report.ts (d), everything at once | 0.225-0.264 s | 0.226-0.242 s |
| the native bench's TypeScript, at rest (two runs each) | 0.148-0.154 s | 0.122-0.125 s |
| the native bench's TypeScript, the grating across both eyes | 0.506-0.518 s | 0.439-0.499 s |
| the native bench's native brain, at rest | 0.073 s | 0.069-0.070 s |
| the native bench's native brain, the grating across both eyes | 0.217-0.251 s | 0.226-0.254 s |
| scripts/bench.ts, the bare engine (no partition), looming at ±0.07 mV | 0.106-0.107 s | 0.107-0.118 s |

Where after is faster, that is the same noise (the machine was in use, and runs of the same code differ by up to 20%). The spikes and active neurons are the same in every run, before and after, and a whole report.ts, before and after, prints the same in every line but the wall times.

### Reading them

`REGIONS[r]` and `REGION_RATE_NAMES[r]` (`"region." + id`) are in the same order. A display that reads them every frame should not look them up by name: a `BrainDriver` (`packages/contracts`) has `regionRates`, a `Float32Array` in the order of `REGIONS`, filled in place from each new state (0 for a region the brain doesn't report):

```ts
import { REGIONS } from "@fly/brain";

const rates = driver.regionRates; // keep the reference: it is filled in place
for (let r = 0; r < REGIONS.length; r++) glow[r] = Math.min(1, rates[r] / REGIONS[r].fullHz);
```

`fullHz` is a linear scale; a display that wants faint rest to show more can put a curve on `rate / fullHz` (a square root lifts 4% to 20%).

The game's X-ray and nervous-system panel are such a display (`apps/web/src/nerves/`; the top-level README, Its nervous system, says how a rate is drawn and where each region is).

## Cost

On an M5 Pro, one thread (`report.ts` section d), wall time per simulated second: 0.09 s at rest (`node packages/brain-native/scripts/bench.ts`, measured again when `grounded` was narrowed: about 23,000 spikes a second and 40,000 active neurons, against 49,000 and 58,000 while it drove the wings' and halteres' sensors too; the figures after it are from before), 0.14 s with the feather resting on the fly (touch 0.4), 0.13 s with a full looming pulse every second, 0.16 s with touch and wind while airborne (touch 1, wind 0.5: just over the 0.15 s aimed for), 0.21 s with every sense at full strength at once. Building the brain takes about 0.3 s. Almost all of it is the sweep over active neurons: at rest about 40,000 of them, nearly all genuinely depolarised by the background. The regions' readout costs nothing that can be measured (Regions).

With the eyes open (`report.ts` section e): a steady scene costs what shut eyes do (0.122 to 0.125 s against 0.123 in interleaved runs: the input stage only checks whether the light has changed), a disc looming at one eye over and over 0.21 to 0.23 s, a 4 Hz whole-field flicker 0.33 to 0.38 s, and the worst case of the battery, a high-contrast grating drifting across both eyes, 0.39 to 0.42 s (three runs), under the 0.5 s aimed for. The eyes' input itself is cheap (one random draw per candidate spike, and nothing at all once adapted); what costs is the optic lobe answering, with the active set growing to about 120,000 neurons. Real screens move less of the field at lower contrast than that grating. If it ever needs cutting, halving the lamina's scale (`RETINA.maxRate` 100) halves the spikes the rotating grating causes (529,000 a second against 1,016,000), at the price of most of the motion pathway (Seeing).

## Tools

`node packages/brain/scripts/probe.ts --type LPLC2,LC4 --side left` drives any group (by `--type`, `--superClass`, `--class`, `--subClass`, `--side`, `--nt`: comma-separated values or a `/regex/`) at `--rate` Hz for `--ms` and lists what responds, by super class and type, at the operating point. `--only <regex>` limits the list to some super classes, `--after <ms>` keeps running with the drive off to show what keeps going (driven neurons included), and `--set excitatory=0.2`, `--set saturation=0` and so on try another operating point. `--each type --target MN9` ranks each type in the selection by what it does to a target, and `--greedy` builds a set as `sweet`'s was built. The comment at the top of the file lists every option.

`node packages/brain/scripts/wingbeat.ts` checks which campaniform sensilla are the legs' against FlyEM's nerves, and measures `grounded` and `wingbeat`: rest standing and in the air, `wingbeat` held, and the loop it closes with the body, with and without the body's floor (Senses; What it does and doesn't reproduce). `--rate` tries another rate for `wingbeat`.

`node packages/brain/scripts/report.ts` measures everything above on the real connectome: (a) the response matrix, each sense alone at full strength and rest, with each command's mean, peak and latency to peak, and the looming pulse; (b) the seizure checks, every sense, pair and all at once; (c) 10 minutes of resting behaviour (`--minutes` to change it); (d) wall time per simulated second at rest, under typical stimulation and with everything at once; (e) for the eyes, recovery after every stimulus of the vision battery, alone and with every other sense at full strength, and wall time with the eyes open. It takes about three minutes. `--seed` changes the seed.

`node packages/brain/scripts/hunger.ts` measures what hunger does (Hunger): sugar at each strength at three hungers, a proboscis extension test over `--seeds` flies, a meal on a lump of sugar, and the cost of the gain. `report.ts --hunger <0..1>` runs the whole report at that hunger.

`node packages/brain/scripts/vision.ts` runs the vision battery and prints, for each stimulus against its control, the change in mean rate of each stage's cell types (lamina, medulla, T4 and the T5 subtypes, lobula columnar types, lobula plate tangential cells, descending neurons) and the commands (Seeing). `--only <regex>` picks stimuli, `--set graded=3` and the like change the operating point, `--retina maxRate=100` and the like the input stage, `--seed` the seed. About 20 s.

`node packages/brain/scripts/song.ts` measures what reaches pIP10 (Courtship): a male's taste, a fly seen, and, to compare, the female-pheromone neurons, LC10a and P1 driven directly; with the anatomy file it checks `FORELEG_MALE_TASTE` too. About a minute.

`node packages/brain/scripts/regions.ts` prints the two tables of Regions: what each region holds, and its rate at rest and its peak under every stimulus report.ts runs, with its `fullHz`, and says whether every `fullHz` is still what the rule gives. About half a minute; `--seed` changes the seed.

`node packages/brain/scripts/eyes.ts --columns <xlsx>` regenerates `src/eye-columns.ts` (The eyes).

`node packages/brain/scripts/bench.ts` times the bare engine.

## Tests

`node --test 'packages/brain/src/*.test.ts'` from the repository root (or `npm test` for all packages). Without the real data: the format, the packer, the engine against a dense reference, and the runtime on a small synthetic connectome (`src/test-helpers.ts`): decoding, the sense-to-rate mapping, left/right balancing, a male's taste picked by root ID (a mid leg's LgLG1a left out), the legs' campaniform sensilla for `grounded` and every other for `wingbeat`, Johnston's organ's completeness fix (on each zone's less complete side only, by the ratio of synapses), that no neuron is both driven and read, `createBrain` end to end and its errors, determinism, hunger (left out, 1 and NaN the same brain spike for spike; 0 passes on less sugar and quietens the background; the engine's output gain scaling only its group and exact at 1), and a four-column eye on it (shut, the brain is spike for spike the one without eyes; open, darkness reaches the lamina, the looming detectors and the giant fiber). Also without the data: the regions' catalog (unique ids, every field filled in, pairs alike but for their side), their rules on examples of every kind of neuron and every catch-all, and on the synthetic brain that every region is reported after the readouts, an empty one at 0, and that no command reads them; the engine's partition (every spike counted by its neuron's part, the run unchanged); the column table, the viewing directions (unit vectors, none alike, mirrored, the frontal overlap, the dorsal rim looking up), and the input stage (adaptation, contrast, transient and sustained cells, steady scenes costing nothing, skipping steps exactly). With `data/connectome.bin` (skipped without it), `src/behaviour.test.ts` checks the requirements: the real groups and their disjointness, no seizure after each sense and all at once, loom → escape timing, escape below 0.3 otherwise, mirrored looms and steering, touch → back, wind and a push on either antenna → groom, sweet → feed, a fed fly ignoring sugar a starved one feeds on, loom → wings, P1 → sing and no sense, a male's taste among them, near singing, the wings' own sensors driving the flight motor neurons short of holding the fly up and the loop they close with the body dying away, three minutes of resting behaviour (walking 20–70% of the time in at least 15 bouts, turns both ways, no escapes, sing under 0.25; 10 minutes is in `report.ts`); `src/cost.budget.ts`, which `npm test` runs on its own after the rest, construction time and cost in M5 Pro CPU time, 1.7 to 1.8 times what they take (`scripts/cpuBudget.ts`); `src/eyes.test.ts` that every column's cells are the right type and side; `src/regions.test.ts` the partition (every neuron in one region, as many in each as the catalog says, none empty), that the senses' and the readouts' neurons are in the regions the catalog says, and that the region rates respond where they should (at rest the descending neurons stay under 1.5 Hz; the looming pulse raises them more than threefold and the wing and haltere motor neurons with them; a disc looming at the left eye drives the left lamina, medulla and lobula more than twice as hard as the right ones; sweet drives the mouthparts, the head motor neurons and the subesophageal zone); and `src/seeing.test.ts` the eyes: shut, the same spikes as the commit before the eyes (a fingerprint); a loom at the right eye passing escape 0.5 and dots and a receding disc not; a steady scene sending the lamina nothing; HS preferring front-to-back and H2 back-to-front motion and a rotation turning the fly with it; and no seizure after a loom, a grating or a flicker, alone and with every other sense. It takes about a minute and a half.
