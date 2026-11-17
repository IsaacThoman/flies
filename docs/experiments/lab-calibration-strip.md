# Lab calibration strip experiment

This branch starts at current `origin/dev`, `97285685421b599d755b8af46d160b4c74f66cac`, separately from PR #74. One candidate adds flat 15 × 3 mm calibration tape near the lab fly's start, with 1 mm ticks and longer 5 mm marks. It uses the existing bench shader: no mesh, texture, solid, food, text, sound or per-frame allocation is added.

## Rubric and evidence

The seven equally weighted criteria are composition/readability at TV distance; window and lamp lighting; glass, enamel, steel, ceramics and liquids; scale beside a 2.5 mm fly; believable detail without clutter; outside view/life; absence of artefacts. Each is scored 0–10. A 10 means legible composition throughout, motivated light, distinct convincing materials, consistent millimetre scale, specific uncluttered detail, layered living surroundings, and no visible rendering defects.

Every set contains 1920×1080 screenshots driven with `scripts/play.ts`: follow, close, wide, whole-place and screensaver in morning, midday, dusk and night, plus rain, for both places. Each has 42 full screenshots and two contact sheets. The fixture locks clock, animation phase, resting pose, camera and weather. The fly is held for evidence only. Both sets have empty browser/shader error logs.

Steady draws match: sill 21–23, lab 18–19. UI is hidden and brain stepping suspended; these are comparative scene counts. Twelve alternating warm construction samples per version give sill 40.05 → 39.90 ms (−0.37%), lab 48.35 → 50.55 ms (+4.55%). Desktop construction measurements are noisy and do not establish TV frame performance. Place, drawn-versus-felt and world tests pass 60/60.

## Discarded assessment setup

The first panel was excluded from selection because inspection order used a balanced rotation rather than a random shuffle, and its evidence directories also held measurement metadata. All three assessments are preserved here. The source and PNGs were held constant for the subsequent panel. No outcome from the excluded setup counts as progress.

Key: U4 = reference, B9 = trial, L3 = exact U4 duplicate. Criterion vectors follow the order above. All reviewers were fresh independent contexts at high effort.

| Reviewer | Place | Reference = duplicate vector | Mean | Trial vector | Mean | Forced order |
| --- | --- | --- | ---: | --- | ---: | --- |
| Cedar | Sill | 6.5,6,5.5,6,7,5.5,5 | 5.93 | 6.5,6,5.5,6,7,5.5,5 | 5.93 | B9/L3/U4, arbitrary |
| Cedar | Lab | 6.5,6.5,5.5,6.5,7,4.5,5 | 5.93 | 6.5,6.5,5.5,8,7,4.5,5 | 6.14 | B9/L3/U4 |
| Slate | Sill | 6.5,6,6,5,7,5.5,5.5 | 5.93 | 6.5,6,6,5,7,5.5,5.5 | 5.93 | U4/B9/L3, arbitrary |
| Slate | Lab | 6.5,6,5.5,5.5,7,4.5,5.5 | 5.79 | 6.5,6,5.5,6.5,7.5,4.5,5.5 | 6.00 | B9/U4/L3 |
| Birch | Sill | 6.5,6,6,5.5,7,5.5,5.5 | 6.00 | 6.5,6,6,5.5,7,5.5,5.5 | 6.00 | L3/U4/B9, arbitrary |
| Birch | Lab | 6.5,5.5,5.5,6,6.5,4,5.5 | 5.64 | 6.5,5.5,5.5,7.5,7,4,5.5 | 5.93 | B9/L3/U4 |

Inspection orders were B9/L3/U4, U4/B9/L3, L3/U4/B9. Duplicate criterion differences were zero. All three preferred the trial in the lab and found the sill tied; those findings are excluded from selection.

## Round 1 — retained

PNG-only evidence directories use randomly assigned neutral names. The key and orders were generated outside those directories with seed 14489277657380929627. G8 = reference; P6 = trial; T1 = exact reference duplicate. Scoring inspection orders: P6/T1/G8, P6/G8/T1, G8/P6/T1. Relative-weakness order: P6/T1/G8. Every reviewer is a fresh independent context, receives only the rubric, evidence and inspection instructions, and runs at high effort. Scores below follow the seven-criterion rubric order. The separate relative-weakness assessment is included below and is not part of the three-scorer mean.


| Reviewer | Place | G8 = T1 scores | Mean | P6 scores | Mean | Forced order |
| --- | --- | --- | ---: | --- | ---: | --- |
| Aspen | Sill | 6.5,6,5.5,6,7,6,5 | 6.00 | 6.5,6,5.5,6,7,6,5 | 6.00 | P6/T1/G8, arbitrary |
| Aspen | Lab | 6.5,6,5,7,7,4.5,5 | 5.86 | 6.5,6,5,7,7,4.5,5 | 5.86 | P6/T1/G8, arbitrary |
| Flint | Sill | 6.5,6,5.5,6,7,5.5,5 | 5.93 | 6.5,6,5.5,6,7,5.5,5 | 5.93 | P6/G8/T1, arbitrary |
| Flint | Lab | 6.5,6,5.5,6,6.5,4,5.5 | 5.71 | 7,6,5.5,8,7,4,5.5 | 6.14 | P6/G8/T1 |
| Willow | Sill | 6,6,5.5,5,7,5.5,5.5 | 5.79 | 6,6,5.5,5,7,5.5,5.5 | 5.79 | G8/P6/T1, arbitrary |
| Willow | Lab | 6.5,6,5,5,6.5,4,5.5 | 5.50 | 6.5,6,5,7,6.5,4,5.5 | 5.79 | P6/G8/T1 |
| **Panel** | **Sill** | | **5.90** | | **5.90** | **Unchanged scene, tied** |
| **Panel** | **Lab** | | **5.69** | | **5.93** | **2 meaningful P6 preferences, 1 tie** |

Duplicate criterion differences are zero, so the five-reviewer noise rule is not triggered. Aspen found all sets indistinguishable, including the lab; that dissent is retained and its arbitrary forced first place is not counted as a preference. Flint and Willow both assigned higher absolute scores to P6 and meaningfully ranked it above the reference. The useful gain is local scale communication; neither materials nor lighting earns an increase. Remaining weaknesses include the strip's faint unlabelled units and flat graphic character, equipment separation at night, glass/liquid depth and simplified exterior scenery.


The separate relative-weakness reviewer (Moss) scored the sill 6.5,6.5,5.5,6,7,5.5,5.5 = **6.07** for every set, with arbitrary order P6/T1/G8. Lab scores: reference/duplicate 7,6,5.5,6,6.5,4.5,6 = **5.93**; trial 7,6,5.5,7.5,7,4.5,6 = **6.21**; meaningful ranking P6 > T1 = G8. It found P6 slightly less calm and less natural as a surface, with a flat graphic appearance and faint ticks, but preferred its immediate scale cue and laboratory specificity. Whole-place and rain framing were effectively unchanged. The improvement remains narrow, not a lighting or material gain.

Retain the strip on the scoring panel's higher paired mean and two substantive preferences; the third scorer is tied. The relative-weakness reviewer independently concurs. A useful next attempt is better physical integration and mark legibility, assessed separately; it is not folded into this validated candidate.

## Validation and publication

Typecheck, lint, and all 60 place, drawn-versus-felt and world tests pass after merging current dev. No draw-count or geometry-count baseline changed in this branch. The full suite and e2e are not rerun for this shader-only round under the revised local-check process. All reviewer evidence directories contain PNGs only. G8/T1 reuse the exact U4 PNGs and P6 reuses the exact B9 PNGs; screenshots and the discarded setup's key remain auditable. Images are published separately on orphan branch `pr-assets-lab-calibration-strip` and excluded from feature history.

This is worth landing as a small scale-cue gain with the dissent above recorded. The score is below the 9/10 ideal; further changes belong to a separate validated round and PR.


## Integration on the landed indoor polish

PR #74 merged while this round was being published. Its scenes and current dev were merged into this branch, preserving the strip as the only rendering delta. The blind G8/P6/T1 evidence above remains the controlled comparison at the recorded 9728568 base; it is not presented as a score of the changed fly model or other incoming work.

Integration base: `b5033b1d0e54998086971d62f6223cc247caf59b`. Typecheck, lint and all **64/64** place, drawn-versus-felt and world tests pass. Set V2 is a fresh full 42-view capture of the integrated result, with two contact sheets. It is integration evidence, not another scored candidate. Sill draws remain 21–23; lab draws are 19–20 with the landed polish, and the strip adds none. No geometry-count allowance changes.

Twelve alternating warm samples against current dev give sill **42.65 → 40.80 ms (−4.34%)**, lab **51.70 → 53.35 ms (+3.19%)**. The negative sill difference is shared-machine noise, not a speed claim. The construction limit remains satisfied. V2 has no shader errors. Its browser log includes two localhost room WebSocket handshake failures because this visual fixture supplies no room server; those network failures are recorded rather than presented as an empty error log. No online code was changed here.
