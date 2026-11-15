# brain-native

The fly's brain, `packages/brain`, as portable C++20 for the Apple TV, where JavaScript has no JIT and is far too slow to run it. It is the same simulation, not a lookalike: for the same connectome, seed and senses it fires the same spikes at the same steps and reports the same commands and rates, to the last bit, as the TypeScript does under Node. That is what makes the browser fly and the TV fly one fly, and what makes this port testable at all.

The interface is `include/fly_brain.h`, plain C: build a brain from the bytes of `connectome.bin`, tick it with senses, get commands, stats and the readout rates back. Every failure, bad data included, comes back as a message in the caller's buffer; nothing throws across it and nothing aborts. One brain is used from one thread at a time. The standard library is the only dependency.

`packages/brain/README.md` is the reference for the model itself. Everything here follows it; nothing about the model is decided here.

## Using it in an app

Compile every `.cpp` in `src/` into the app, with `src/` and `include/` on the header path, as C++20. `src/` holds the library and nothing else; the comparison harness and the benchmark are in `tools/`.

- **Optimise with -O2** (or -O3, which measures the same). Xcode's Release default, -Os, is about 20% slower here.
- **No fast math** (Xcode's *Relax IEEE Compliance*); `src/exact.hpp` refuses to compile with it. And no `-ffp-contract=fast`, which overrides the pragmas below. Nothing else about floating point needs setting: the sources set it themselves. `build.sh` deliberately passes no floating-point flags, so the tests show that.
- Exceptions on (the default); they never leave the library.

## How it gets the same answers

The TypeScript keeps neuron state in `Float32Array`s and computes in doubles, every operation rounded once, in a fixed order. C++ does exactly that, given a few things, all of which this code does:

1. **Every expression is the TypeScript's, operation for operation**, loading floats into doubles, computing in double and rounding to float on store, never rearranged. That includes the less obvious ones: `a × decay + step` with `decay` and `step` doubles rather than floats; `decayed × keepDrive + 0`, which turns −0 into 0; comparisons made on the double before it is stored (`next >= threshold`) or on the stored float (the rest cut), as sim.ts makes them.
2. **No fused multiply-adds.** JavaScript never fuses; clang does by default on arm64 (`-ffp-contract=on`), which rounds once where JavaScript rounds twice. `#pragma STDC FP_CONTRACT OFF` in `exact.hpp`, included first by every file, turns that off whatever the build's flags, and `tests/build.test.ts` checks the compiled objects for fused instructions.
3. **V8's own math.** `Math.exp`, `log`, `log1p`, `expm1`, `sin` and `cos` (every transcendental the brain calls: the saturation table, step and chunk decays, smoothing, Poisson probabilities and gaps, Box-Muller, the logistic) are not specified to the bit by JavaScript, and the platform's libm differs from V8's in the last bit often enough to matter. `src/fdlibm.cpp` is V8's port of fdlibm, copied from the V8 that Node 26 ships (14.6, `src/base/ieee754.cc`, BSD-licensed with Sun's fdlibm notice; both kept in the file) with only mechanical changes.
4. **That file, alone, is compiled with contraction on**, because V8 is: Node builds V8 with clang's default, so on arm64 its `Math.sin` and `Math.cos` contain fused multiply-adds, and about one result in fifty differs in the last bit from the same source compiled without. With the pragma, clang fuses the same operations V8's build did; on a machine without fused multiply-adds (x86-64 without `-mfma`) neither fuses. `tests/math.test.ts` holds all six functions to V8's on about 340,000 arguments.
5. **The random streams are integers**: `mulberry32`, the per-input seeds and the internal state's seed are 32-bit arithmetic, exact in C++; a JavaScript seed maps to `seed | 0`. The uniform numbers are exact multiples of 2⁻³². Box-Muller's `2 × Math.PI × v` is `std::numbers::pi`, the same double.
6. **JavaScript's semantics where C++'s differ**: `Math.round` rounds ties up (`js::round`), `Math.max(0, -0)` is +0 (`js::max`, `js::min`), `clamp` reads NaN and infinities as 0, a Poisson gap is a double that may be infinite, and the chunk loop, `advance`'s carry and the readout rate (`count / neurons / ran × 1000`) are computed in the same order.
7. **One shortcut, proven exact**: delivering a spike adds a float weight to a float drive in single precision, where sim.ts adds in double and rounds. For one addition of two floats these are the same, because a double has more than 2 × 24 + 2 bits (double rounding is innocuous; Figueroa, 1995).
8. **What is free to differ, does**: only the membership of the active set and the order of delivery (ascending presynaptic neuron, then target) affect the numbers, not how the set is kept. Here it is a bitmap swept in index order, so nothing is sorted (sim.ts keeps a list and radix-sorts it); the spikes of a step come out ascending and only the few from inputs and biased neurons are merged in. The engine test holds it to sim.ts.
9. **The loader is format.ts's**, check for check in the same order with the same messages, including how JavaScript reads odd headers: `JSON.parse`'s grammar (with surrogate pairs, duplicate keys taking the last, arbitrary nesting without recursion, numbers parsed correctly rounded without the C locale's decimal point), `TextDecoder`'s strict UTF-8 and its dropping of a byte order mark, JavaScript truthiness of a section entry, and template-literal printing of wrong values ("`type is u16,,1.5e+300`"). format.ts reads past the last connection as `undefined` when `ptr` overshoots; this loader stops at the last one, which ends the same way (ptr must then decrease, and that is reported). The bytes are read in place, little-endian on any machine and at any alignment. The one wording that differs: a header that is not JSON at all is "not valid JSON at byte n" here and V8's own message there.

### Where it can't be the same

- **Senses arrive as floats.** `fly_senses` holds single-precision intensities, and the TypeScript takes doubles. An intensity of 0.4 is a different number in each, and so a different firing rate, and the two runs part at once. The comparison feeds both builds the same float values. A host that wants its fly to match a browser's for the same game state should send float-representable intensities (or the header could take doubles; see below).
- **Other JavaScript engines don't agree with Node.** The math functions are implementation-defined in JavaScript. Chrome builds V8 with glibc's `sin` and `cos` (`V8_USE_LIBM_TRIG_FUNCTIONS`) instead of fdlibm's; Safari and JavaScriptCore use the system libm for all of them. So the TypeScript brain in Chrome or Safari is not bit-identical to the TypeScript brain in Node, and nor is this. In practice a last-bit difference in a normal deviate or a rate only changes the run when it moves a Poisson gap across a whole number, which is rare, but over a long enough run it happens and the runs then part. The fix belongs in the TypeScript (see the end of this file).

## How it is tested

`npm test` runs `tests/*.test.ts` with the rest of the repository; `node --test 'packages/brain-native/tests/*.test.ts'` runs just these, in about 25 seconds. They build the library first (`build.sh`, a no-op when nothing changed) and skip, saying why, when there is no compiler; the real-connectome test also skips without `packages/brain/data/connectome.bin`.

Both builds write the same line per tick (`tests/compare.ts` from the TypeScript, `tools/harness.cpp` from the native brain, through the C interface): spikes, active neurons, simulated time, the seven commands and eight rates as doubles and as the C interface's floats, the internal state's three processes, and every 50 ticks a digest of every neuron's v, g and a. Numbers are written as the hex of their bits, so equal lines are bit-identical results. The scripted senses (`scenario()`) run in cycles of about 40 simulated seconds: rest standing and airborne, each sense alone at full strength, ramps and wavering intensities, held and dragged, sweet while touched, looming on both sides, everything at once, a looming pulse every second, random ticks of 0 to 50 ms with random senses, ticks of 0, 0.25 and 0.4 ms, of 7.3, 100 and 1000 ms, out-of-range, infinite and NaN intensities, and invalid ticks, which both must refuse with the same message.

| Test | What must be identical |
|---|---|
| `connectome.test.ts` | On the real connectome: every line of 70+ simulated seconds (about 4,700 ticks and 9 million spikes), seed 1. |
| `synthetic.test.ts` | On the synthetic connectome of `packages/brain/src/test-helpers.ts`: every line of 70+ seconds for seeds 1, 3 and 0xdeadbeef; the refusal and its message for 57 broken or odd files (each header check, each data check, missing groups, a driven readout, and valid oddities that must be accepted: escapes, a byte order mark, duplicate keys, `84.000e0`, 100,000 levels of nesting); the outcome of 400 randomly corrupted files; and the corrupted files and 40 seconds of senses again under AddressSanitizer and UndefinedBehaviorSanitizer. |
| `engine.test.ts` | The engine alone against sim.ts on 40 random networks covering every option, including those the brain doesn't use yet: a per-neuron bias, changed mid-run; a per-target weight scale; drive reset and adaptation on and off; steps of 0.1 to 1 ms; delays and refractory periods of 1 to 50 steps; cleanup every 1, 3 or 16 steps. Every step's spikes and active count, and every neuron's v, g and a at the end. |
| `math.test.ts` | exp, log, log1p, expm1, sin and cos against V8's on the brain's own arguments (the whole saturation table among them), 50,000 random doubles of every magnitude, and the special values. |
| `build.test.ts` | Warning-free under `-Wall -Wextra -Wpedantic -Werror` in both builds; `src/` holds only the library; no fused multiply-add outside fdlibm (arm64). |

A difference shows as the first line that differs, with the tick, what the script was doing and its length. Changing any one rounding in the engine is caught (a test of the tests: adding the input's adaptation step in single precision instead of double fails the engine test on one neuron's adaptation in its last bit, with the spikes still the same, which is why state is compared and not only spikes).

The real-connectome comparison was also run under the sanitizers (about 40 simulated seconds, identical, nothing reported).

## Building

```sh
packages/brain-native/build.sh            # build/release: libflybrain.a, fly-brain-harness, fly-brain-bench
packages/brain-native/build.sh sanitize   # build/sanitize: the same with ASan and UBSan
```

`clang++` from the Xcode command line tools is all it takes (`CXX` picks another compiler). The harness's modes are described at the top of `tools/harness.cpp`.

## Speed and memory

Wall time per simulated second on an Apple M5 Pro, one thread, the real connectome, 16 ms ticks as the game sends them, after a simulated second untimed (`node packages/brain-native/scripts/bench.ts`, which runs both; `-O2`, the release build):

| Regime | Active neurons | Spikes per second | TypeScript (Node 26) | Native | |
|---|---|---|---|---|---|
| At rest, standing | ~58,000 | ~49,000 | 0.11–0.12 s | 0.060–0.066 s | 1.8× |
| Every sense at full strength | ~88,000 | ~434,000 | 0.21–0.22 s | 0.119 s | 1.8× |

The ranges are repeated runs on a machine others were using. Both builds report the same active neurons and spikes in each regime, as they should. Building the brain takes about 30 ms (the TypeScript's, 80 ms).

Memory: the brain takes 57 MB (with what building it uses; the file the host read is another 40 MB and need not be kept). 50 MB of it is the connections, a target and a weight each; per-neuron state, the CSR pointers, the spike ring and the readouts make the rest. The TypeScript brain's process is about 160 MB.

On the Apple TV these are estimates, not measurements: an A15 core is roughly half an M5 Pro's, which puts the brain at about 0.13 s per simulated second at rest and 0.25 s with everything at once, 13 to 25% of a core; an A10X core roughly a third, 0.2 to 0.4 s, still well within real time.

Where the time goes (sampled): at rest three quarters of it is the sweep over active neurons, with everything on about 60%, and a third is delivering spikes. The sweep compiles to about 27 instructions a neuron and runs at about 4 cycles: it is bound by the double-precision arithmetic itself, which is what exactness requires. What was tried:

- **Kept**: the bitmap active set (no sorting; sweeps in index order); state interleaved 16 bytes a neuron; connections stored as interleaved target and weight; muted neurons' spikes skipped; prefetching each spike's connections a few spikes ahead (5% with everything on, 2% at rest, and probably more on the TV's smaller caches).
- **No gain**: a branch-free join on delivery (slower: it chains stores to the same word), the drive in its own array (slower), -O3 (the same as -O2), and a vectorised sweep over a dense layout (in isolation 0.82 against 0.88 ns a neuron: two doubles a vector buys little, and it would cost an indirection on every delivery).

What more speed would cost:

- **Threads.** The sweep and delivery split cleanly by neuron and the result can be kept exact (each neuron's sum stays in delivery order if each thread owns a range of targets), but it means a worker pool next to the renderer and per-step synchronisation about a thousand times a second.
- **Single precision.** Computing in floats would roughly halve the sweep's cost and vectorise four-wide, and end the agreement with the TypeScript: the TypeScript would have to change first, and the browser would pay for it in `Math.fround` calls.
- **4-byte connections** (target and saturated count packed, the weight looked up per presynaptic gain) would save 25 MB and some delivery bandwidth, for a more specialised layout tied to the operating point.

## The eyes

The header has the eyes (`fly_brain_facets`, `fly_brain_eye_directions`, `fly_brain_eye_acceptance` and light per facet in `fly_senses`), and the TypeScript side of vision is not written yet: `FlyBrain.eyes` is null and `light` is ignored. So here there are no facets (0, NULL, 0) and the light pointers are never read, as in runtime.ts.

What is ready for it: `fly::Brain::tick` already takes the light (`fly::Light`, two spans, empty now); and the engine has a graded per-neuron input, `Simulation::set_bias` (sim.ts's `setBias`: a steady drive added to g when integrating v, neurons with a bias stepped by their own loop and never cut), ported and held to sim.ts bit for bit by the engine test, though the brain doesn't call it yet. When vision lands in the TypeScript, the port is: the eye map (facet directions and acceptance, from wherever the TypeScript gets them), the facet-to-neuron wiring in `io.cpp`, whatever turns light into per-neuron drive, called from `Brain::tick` at the same point in the chunk loop as there, the `vision.<stage>` readouts appended to `readouts()` (decode reads only the first eight), and the three eye functions in `fly_brain.cpp`. Two things to watch: `setBias` scans every neuron, so if vision sets biases every 10 ms chunk a sparse variant would be better in both builds; and if the eye map needs data the packed file doesn't have, the format changes in format.ts first and the loader follows.

## When the model changes

The TypeScript is the reference; the model changes there first (and in the desktop pet's copy before that, see `docs/architecture.md`). Then:

1. Port the change into the file of the same name: `params.cpp` for the operating point, `io.cpp` for groups, scales and decoding, `state.cpp`, `sim.cpp`, `brain.cpp` for runtime.ts, `connectome.cpp` for format.ts. Write each expression as the TypeScript writes it, in the same order, doubles from floats. Keep the TypeScript's comments' substance.
2. A new `Math` function: take it from the same `ieee754.cc` into `fdlibm.cpp` and add it to `math.test.ts`. Never `<cmath>`'s, except `sqrt`, `floor`, `trunc` and `fabs`, which are exact everywhere.
3. Run the tests. If a comparison fails, the message names the first tick that differs and what was happening; the engine test narrows it to a step and a neuron. Extend the scenario if the change adds something it doesn't exercise.
4. When Node's V8 moves to a new version, run `math.test.ts`: if V8 changed its math, copy the routines again from that version.

## Found in the TypeScript

Not fixed there (that is for `packages/brain`), and matched here:

- The internal state's normal deviates come from `Math.sin` and `Math.cos` (Box-Muller), which Chrome computes with glibc's routines and Node with fdlibm's, so the same seed is not quite the same fly in Chrome and in Node. Marsaglia's polar method would need only `Math.log` and `Math.sqrt`; `log` is fdlibm's in both, though still not specified by JavaScript.
- Left/right balancing (`io.ts`, `balanceFactor`) counts the raw synapses, while the network uses the saturated counts, so at full strength the two sides deliver the same raw synapse-spikes, not quite the same effective ones as the README says.
- `loadConnectome` reads past the last connection, as `undefined`, when `ptr` overshoots before coming back; harmless, since a later decrease is always reported, but it is a read out of bounds that only JavaScript forgives.
