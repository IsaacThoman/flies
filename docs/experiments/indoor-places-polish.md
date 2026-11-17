# Indoor places visual experiment

Evidence uses 1920×1080 screenshots driven with `scripts/play.ts`. Each place has follow, close, wide, whole-place and screensaver views in morning, midday, dusk and night, plus rain. The fly is held at its starting position for reproducible visual comparisons; this is an evidence fixture, not game behavior. Screenshots stay on `pr-assets-indoor-places-polish`.

## Rubric

Each criterion is scored from 0 to 10 separately for each place. A 10 means:

| Criterion | A 10 |
| --- | --- |
| Composition/readability | Clear silhouettes, a legible fly and balanced focal hierarchy at TV distance in every view. |
| Lighting | Convincing window direction and soft occlusion through the day, with motivated warm lamp light at night and readable shadow detail. |
| Materials | Distinct glass, enamel, steel, ceramics and liquids with coherent highlights, roughness and depth. |
| Scale | Familiar objects and millimetre detail consistently convey a 2.5 mm fly. |
| Detail | Specific signs of use and small natural variation enrich the scene without visual clutter. |
| Outside/life | A convincing, layered outside view with weather, time-of-day atmosphere and restrained life. |
| Artefacts | No clipping, floating objects, aliasing patterns, transparency errors or mismatched physical surfaces. |

## Review procedure

Fresh independent reviewers receive only the rubric, neutral evidence directories and inspection instructions. Candidate order is randomized. Absolute per-criterion scores and a forced ranking determine retention. A duplicate evidence set periodically checks scoring noise. Code changes and version keys are recorded here once a review is complete.

## Score log

Baseline: R4 = origin/dev at experiment start. Scores below follow rubric column order: composition, lighting, materials, scale, detail, outside, artefacts.

| Review | Windowsill scores | Mean | Lab scores | Mean |
| --- | --- | ---: | --- | ---: |
| B1 | 6.5, 6.5, 6, 6.5, 7.5, 6.5, 5 | 6.36 | 6.5, 6, 5.5, 7, 7.5, 4.5, 5 | 6.00 |
| B2 | 6, 7, 6.5, 6, 7.5, 6, 6 | 6.43 | 6.5, 6.5, 6, 7, 7, 4.5, 6.5 | 6.29 |
| B3 | 6, 6, 6.5, 6, 7.5, 6.5, 6 | 6.36 | 6.5, 7, 6.5, 7, 8, 5.5, 6.5 | 6.71 |
| **Mean** | | **6.38** | | **6.33** |

The most consistent findings were oversized surface wear, night silhouette loss, weak glass/liquid separation and shallow exterior scenery. Camera/fly-shadow findings remain outside this experiment's scope.

Candidate 1 (`2b52613`, N6) refines paint and pottery detail, bottle Fresnel reflections, twilight fill, filtered lab window shadows, finish contrast, foliage and distant birds. C2 is an exact R4 duplicate. The three scoring reviewers receive orders C2/N6/R4, N6/R4/C2 and R4/C2/N6, plus an independent relative-weakness review of N6/R4. All use fresh contexts. Selection pending.

N6: windowsill 48.1 ms and lab 51.2 ms construction in this run; steady draw counts exactly match R4. Shader/browser errors: none. The timing difference is treated as shared-machine noise, not a speedup claim.

## Reproducibility and measurement limits

The retained fixture uses the fly's world-defined start; eye offsets for follow, close, wide and screensaver are (-9, 2.4, 6), (-5.6, 1.6, 2.8), (-12, 6, 28), and (-9.5, 2.2, 5.5) mm, aimed 0.8 mm above its feet. Their vertical fields of view are 30°, 30°, 34°, and 28°. Whole-sill eye/target are (30,130,680)/(0,140,-70), 44°; whole-bench (190,250,710)/(0,95,-45), 42°. UI is hidden. Time-dependent scene animation uses the same 30-second phase. The normal stage update applies each settled palette and weather.

Initial L8 evidence is excluded: its fixture bypassed stage light application, had unsettled HUD fades and unpinned camera scouting. Three independent assessments scored it, but those numbers do not measure the product consistently and are not used to select changes. The fixture was corrected and baseline evidence recaptured as R4, with fresh independent reviewers. No game-camera code was changed.

R4 build measurements: windowsill 65.3 ms, lab 56.0 ms. Steady screenshot draw counts: windowsill 21–23, lab 18–19. UI and fly-eye passes are excluded in this visual fixture; these counts are for comparisons within the experiment. Construction timings on the shared desktop are noisy and do not establish Apple TV frame performance.

### Round 1 — retained

Key: R4 and C2 = baseline (identical PNGs); N6 = first candidate. Vectors use the rubric order above.

| Review | Place | R4 = C2 scores | Mean | N6 scores | Mean | Forced order |
| --- | --- | --- | ---: | --- | ---: | --- |
| R1 | Sill | 7,6,6.5,7.5,7.5,6,6.5 | 6.71 | 7,6.5,7,8,7.5,6.5,7.5 | 7.14 | N6 > C2 > R4 |
| R1 | Lab | 7,6.5,6.5,8,8,5,7 | 6.86 | 7,6.5,7,8,8,6.5,7 | 7.14 | N6 > C2 > R4 |
| R2 | Sill | 7,7,7,6.5,7.5,7,6.5 | 6.93 | 7,7.5,7.5,7.5,8,7,7.5 | 7.43 | N6 > R4 > C2 |
| R2 | Lab | 7,7,7,8,8,5.5,7 | 7.07 | 7,7.5,7.5,8,8,6,7.5 | 7.36 | N6 > R4 > C2 |
| R3 | Sill | 7.5,7,7,6.5,8,7,7 | 7.14 | 7.5,7.5,7.5,7.5,8,7,7.5 | 7.50 | N6 > R4 > C2 |
| R3 | Lab | 7,6.5,6.5,7,7.5,4.5,7.5 | 6.64 | 7,6.5,7,7,7.5,7,7.5 | 7.07 | N6 > R4 > C2 |
| **Panel** | **Sill** | | **6.93** | | **7.36** | **3/3 N6** |
| **Panel** | **Lab** | | **6.86** | | **7.19** | **3/3 N6** |

R4/C2 ordering is arbitrary: reviewers recognized identical evidence and gave every criterion identical scores (decoy noise = 0). The independent relative-weakness reviewer also ranked N6 first for both places. Retained all scene changes. Remaining problems: dotted grazing-angle paint highlights, daytime lab glare, a weakly glowing lamp interior, glass/liquid bands and simplified foliage. Fly poses varied with the brain snapshot and were excluded from rankings. Panel-to-panel absolute score drift is not counted as progress; only paired scores/rankings select candidates.

Round 2 hypothesis: quieter paint relief, less opaque lab glass and weaker enamel glints, less dominant exterior night windows, and eight small nearby grains per place for scale. No solids or food changed; the grains are flat decoration under half a millimetre.

### Round 2 — retained, narrow result

Key: N6 = incumbent; H9 = second candidate. Orders H9/N6, N6/H9, H9/N6; relative-weakness reviewer N6/H9.

| Review | Place | N6 scores | Mean | H9 scores | Mean | Forced preference |
| --- | --- | --- | ---: | --- | ---: | --- |
| R1 | Sill | 7.5,7,7,6.5,7.5,7,6.5 | 7.00 | 7.5,7,7,7.5,8,7,7 | 7.29 | H9 |
| R1 | Lab | 7.5,7.5,6.5,6.5,7,5.5,7 | 6.79 | 7,7.5,6.5,7.5,7.5,5.5,7 | 6.93 | H9 |
| R2 | Sill | 7.5,7.5,7,7,8,7,7.5 | 7.36 | 7,7.5,7,7.5,7.5,7,6.5 | 7.14 | N6 |
| R2 | Lab | 7.5,6.5,6.5,7,7.5,5.5,7 | 6.79 | 7,6.5,6.5,7.5,7,5.5,6 | 6.57 | N6 |
| R3 | Sill | 7.5,7.5,7.5,7,7.5,7.5,7.5 | 7.43 | 7.5,7.5,8,8,8,7.5,8 | 7.79 | H9 |
| R3 | Lab | 7.5,8,7.5,7,7.5,6.5,7.5 | 7.36 | 7.5,8,7.5,8,8,6.5,7.5 | 7.57 | H9 |
| **Panel** | **Sill** | | **7.26** | | **7.40** | **2/3 H9** |
| **Panel** | **Lab** | | **6.98** | | **7.02** | **2/3 H9** |

The relative-weakness reviewer preferred H9's scale cues on the sill but preferred N6 in the lab, citing waxy-looking food and broad oval shadows. Retained on the scoring panel's paired means and majority ranking, with that dissent recorded for the next iteration. This is a small result, particularly in the lab, not a decisive gain.

The isolated H9 build sweep measured 71.5 / 83.7 ms, so construction was checked by alternating original and candidate builds in the same browser, 12 warm samples each. Median original/candidate: sill 40.6 / 40.1 ms; lab 48.05 / 48.0 ms. Both satisfy the 20% limit. Original decoration was restored during each original measurement. Every screenshot's draw count remains unchanged; browser/shader errors are empty.

## Validation

- Full `npm test`: main suite 732 passed, 2 skipped, no failures. Serialized budgets: 3 passed, 1 failed. The unchanged brain budget reported 0.545 M5 Pro CPU seconds per simulated second against 0.5; targeted retry reported 0.560. `packages/brain` and `scripts/cpuBudget.ts` have no diff from the base branch. This remains a validation failure, not a scene regression claim or a reason to change unrelated code.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `node apps/web/e2e/play.e2e.ts`: passed, including X-ray, place transfers and weather. Peak 91 calls / 350,949 triangles across the entire test, which also visits unrelated places; the experiment's per-view comparisons remain the scene cost evidence.
- Targeted `apps/web/tests/places.test.ts`: 21 passed on each retained iteration so far.
- All rendered evidence sets have empty browser/shader error logs.

### Round 3 — split selection

Key: H9 = incumbent; P5 = identical H9 decoy; V3 = smaller, fewer nearby grains, a smaller windowsill canopy and brighter lab lamp lining/bulb. Orders P5/V3/H9, V3/H9/P5, H9/P5/V3; relative-weakness review V3/H9. Fresh reviewers use high effort under the updated shared rule.

| Review | Place | H9 = P5 scores | Mean | V3 scores | Mean | Preference |
| --- | --- | --- | ---: | --- | ---: | --- |
| R1 | Sill | 7,7,7.5,8,8,7,6.5 | 7.29 | 7,7,7.5,7.5,7.5,7,6.5 | 7.14 | H9 |
| R1 | Lab | 7,7,6.5,8,7.5,5.5,6 | 6.79 | 7,7.5,6.5,7.5,7.5,5.5,6.5 | 6.86 | V3 |
| R2 | Sill | 7,7,7,7,8,7.5,7 | 7.21 | 7,7,7,6.5,7.5,7.5,7 | 7.07 | H9 |
| R2 | Lab | 7,7.5,6,6.5,7,5.5,6 | 6.50 | 7,7.5,6.5,7,7.5,5.5,7 | 6.86 | V3 |
| R3 | Sill | 7,7,7,6.5,7.5,7,7 | 7.00 | 7.5,7,7,7.5,7.5,6.5,6.5 | 7.07 | V3 |
| R3 | Lab | 7,6.5,6.5,6.5,7.5,5.5,7 | 6.64 | 7.5,6.5,6.5,7.5,7.5,5.5,6.5 | 6.86 | V3 |
| **Panel** | **Sill** | | **7.17** | | **7.10** | **2/3 H9** |
| **Panel** | **Lab** | | **6.64** | | **6.86** | **3/3 V3** |

Reverted the windowsill's entire third candidate: the reduced debris weakened scale, while exposed canopy fragments looked detached. Retained the lab changes: more convincing light-source motivation and fewer waxy foreground mounds. Decoy differences were zero. M7 is the selected combination: H9 windowsill evidence and V3 lab evidence; the places are independent builds. No draw-call increase, no shader/browser errors.

The round-3 relative-weakness reviewer preferred V3 for both places, valuing its smaller fragments and more exposed exterior. The scoring panel's sill preference still determines the selected sill; the dissent is retained here rather than treated as a unanimous result.

### Round 4 — retained

Key: M7 = split incumbent; K8 = quieter sill crazing and area-filtered notebook ruling. Orders M7/K8, K8/M7, M7/K8; relative-weakness review K8/M7.

| Review | Place | M7 scores | Mean | K8 scores | Mean | Preference |
| --- | --- | --- | ---: | --- | ---: | --- |
| R1 | Sill | 7.5,7,7,8,7.5,6.5,7 | 7.21 | 7.5,7,7,8,8,6.5,7.5 | 7.36 | K8 |
| R1 | Lab | 7.5,7.5,7,8,8,5.5,7 | 7.21 | 7.5,7.5,7,8,8,5.5,8 | 7.36 | K8 |
| R2 | Sill | 7,7.5,7,7.5,7.5,7,7 | 7.21 | 7,7.5,7.5,8,8,7,7.5 | 7.50 | K8 |
| R2 | Lab | 7,7,6.5,8,8.5,5.5,7.5 | 7.14 | 7,7,6.5,8,8,5.5,7.5 | 7.07 | M7 |
| R3 | Sill | 7,7,7.5,7,8,7.5,7 | 7.29 | 7,7,7.5,7,8,7.5,7.5 | 7.36 | K8 |
| R3 | Lab | 7,7.5,7,7.5,8,6,6.5 | 7.07 | 7.5,7.5,7,7.5,8,6,7.5 | 7.29 | K8 |
| **Panel** | **Sill** | | **7.24** | | **7.40** | **3/3 K8** |
| **Panel** | **Lab** | | **7.14** | | **7.24** | **2/3 K8** |

Retained both. The dissent preferred stronger ruling as a notebook identity cue; the majority preferred reduced stripe interference. Paired original/candidate construction medians: sill 41.05 / 40.95 ms, lab 48.6 / 48.5 ms; 12 warm samples each. Draw counts unchanged; shader/browser errors empty. Relative-weakness report pending.
