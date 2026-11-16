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

Baseline evidence and independent scoring pending.

## Reproducibility and measurement limits

The retained fixture uses the fly's world-defined start; eye offsets for follow, close, wide and screensaver are (-9, 2.4, 6), (-5.6, 1.6, 2.8), (-12, 6, 28), and (-9.5, 2.2, 5.5) mm, aimed 0.8 mm above its feet. Their vertical fields of view are 30°, 30°, 34°, and 28°. Whole-sill eye/target are (30,130,680)/(0,140,-70), 44°; whole-bench (190,250,710)/(0,95,-45), 42°. UI is hidden. Time-dependent scene animation uses the same 30-second phase. The normal stage update applies each settled palette and weather.

Initial L8 evidence is excluded: its fixture bypassed stage light application, had unsettled HUD fades and unpinned camera scouting. Three independent assessments scored it, but those numbers do not measure the product consistently and are not used to select changes. The fixture was corrected and baseline evidence recaptured as R4, with fresh independent reviewers. No game-camera code was changed.

R4 build measurements: windowsill 65.3 ms, lab 56.0 ms. Steady screenshot draw counts: windowsill 21–23, lab 18–19. UI and fly-eye passes are excluded in this visual fixture; these counts are for comparisons within the experiment. Construction timings on the shared desktop are noisy and do not establish Apple TV frame performance.
