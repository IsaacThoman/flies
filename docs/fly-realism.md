# Fly realism experiment

Scores are absolute, 0–10. A 10 means:

| Criterion | Evidence required for 10 |
| --- | --- |
| Anatomy | Recognisable male D. melanogaster at ~2.5 mm: proportions, red compound eyes, ocelli, plumose aristae, thoracic bristles, banding and dark male tip, sex-comb teeth, wing veins/sheens, halteres. |
| Gait | Measured footfall duty factors, phase offsets, swing/stance times and step lengths agree with published kinematics across speed; tripod at speed, tetrapod/wave-like support at low speed; believable turns and reverse steps. |
| Grooming | Leg rubbing, eye and antennal sweeps, hind-leg abdomen/wing cleaning with plausible contacts and supporting feet. |
| Feeding | Rostrum, haustellum and paired labella unfold, contact the food and retract convincingly. |
| Flight / landing | Readable stroke envelope, folded trailing legs in flight, extension for landing and load acceptance; clearly documented approximations. |
| Transitions | Continuous joint positions and orientations between all poses, song side changes and gait changes; no pops or foot sliding. |
| Chunky readability | Anatomical silhouette and each action stay distinct at 640×480, including a fly only 60–100 pixels long. |
| Cost | Same or fewer draw calls and per-frame JS CPU cost than the reference, no per-frame object allocations. |

Literature: [Mendes et al. 2013](https://doi.org/10.7554/eLife.00231),
[Wosnitza et al. 2013](https://doi.org/10.1242/jeb.078139),
[DeAngelis et al. 2019](https://doi.org/10.7554/eLife.46409),
[Seeds et al. 2014](https://doi.org/10.7554/eLife.02951).

Measurements and blind review log will be recorded here. Rendered evidence lives
on the PR's orphan assets branch, separate from this branch's history.

## Blind review log

Each comparison uses fresh independent reviewers, given only this rubric and
neutral evidence/source paths. They assign absolute scores and a forced rank.
The key below was withheld from their briefs. Criterion order: anatomy, gait,
grooming, feeding, flight/landing, transitions, chunky readability, cost.

### Baseline (duplicate control)

Key: K7 = M4 = origin/dev `bd88a01`. Identical evidence intentionally appears
under two names. All three reviewers detected identical files and assigned
identical scores; no reviewer differed by more than one point on the control.
Their forced M4 > K7 ranks were explicitly arbitrary ties by supplied order.

| Reviewer | K7 scores | M4 scores | Mean each | Ranking |
| --- | --- | --- | --- | --- |
| 1 | 7,3,4,6,5,4,5,7 | 7,3,4,6,5,4,5,7 | 5.125 | M4 > K7 (tie) |
| 2 | 7,3,4,6,5,4,6,8 | 7,3,4,6,5,4,6,8 | 5.375 | M4 > K7 (tie) |
| 3 | 7,3,4,5,5,4,5,7 | 7,3,4,5,5,4,5,7 | 5.000 | M4 > K7 (tie) |

Mean baseline: **5.167**. All three identified high-speed loss of support,
absent posterior grooming, and discontinuous song-side switching as the worst
problems. They also requested full feeding/landing transitions and small-scale
action evidence. Their full assessments are retained with the local experiment
evidence; this document records all numerical scores and decisions.

### Round 1

Key: D8 = reference (`bd88a01`, expanded evidence); Q2 = first candidate
(`8972514` prior to rebase, equivalent fly changes in `d6f3f0bf`). Evidence
order was Q2, D8 (randomised), with the version key withheld. All four ranked Q2 above D8.

| Reviewer | D8 scores | Q2 scores | D8 mean | Q2 mean | Ranking |
| --- | --- | --- | --- | --- | --- |
| 1 | 7.5,3.5,4,5,5,4.5,6,8.5 | 8,7.5,7,5,7,7.5,6.5,8.5 | 5.500 | 7.125 | Q2 > D8 |
| 2 | 7.5,3,3,4.5,4.5,4,5,8 | 8,6.5,7,4.5,6.5,6,5.5,8 | 4.938 | 6.500 | Q2 > D8 |
| 3 | 8,3.5,3.5,5,5.5,4.5,5.5,8 | 8.5,7.5,7,5,7,7.5,6,8 | 5.438 | 7.063 | Q2 > D8 |
| Tradeoff assessment | 7.5,3.5,3.5,5,4.5,4.5,5.5,8.5 | 8,7.5,7,5,7,7,6,8.5 | 5.313 | 7.000 | Q2 > D8 |

Primary-review mean: **5.292 → 6.896**. Accepted: stance/recovery scaling,
speed-dependent phase spread, less sprawling leg homes, posterior and antennal
grooming, actual sex-comb teeth, song-side handoff and approach leg extension.
No proposal rejected this round. The extra review identified reduced leg
excursion/readability, a pause during song handoff, and weakened landing dip
when legs already extended; it still preferred Q2.

The remaining highest-value problems were loss of recovery at the fastest
30 Hz update rate, feeding contact/sequence evidence, and weak load acceptance.
The honey render revealed an existing visual-puddle height discrepancy with
the physical surface, outside this model/animation experiment's allowed scope.
It is retained as a limitation, not corrected through animation or collisions.
The game-scale output is a 640×480 buffer displayed at 16:9; subsequent evidence
will include its unscaled buffer as well as the displayed view.

### Round 2

Key: R6 = candidate from round 1, rebased on the shared dev updates;
L3 = `be8ab2f6`. Orders: R6,L3 for reviewers 1–3; L3,R6 for the tradeoff
reviewer (independent coin flips). Every reviewer ranked L3 first.

| Reviewer | R6 scores | L3 scores | R6 mean | L3 mean | Ranking |
| --- | --- | --- | --- | --- | --- |
| 1 | 8,4,7,5.5,6,5.5,6,7 | 8,7.5,7,6.5,6.5,7,6,8 | 6.125 | 7.063 | L3 > R6 |
| 2 | 8,4,6.5,6,6.5,5,5,7 | 8,7.5,6.5,7,7,6.5,6,8 | 6.000 | 7.063 | L3 > R6 |
| 3 | 8,4,6.5,5.5,6.5,5.5,5.5,7 | 8,7.5,6.5,7,7,7,5.5,8 | 6.063 | 7.063 | L3 > R6 |
| Tradeoff assessment | 8,4,6.5,6,7,5.5,5.5,7 | 8,8,6.5,7,7,7.5,6,8 | 6.188 | 7.250 | L3 > R6 |

Primary-review mean: **6.063 → 7.063**. Accepted: sub-frame contact-event
integration and timestamps, staged mouthparts, landing load independent of
remaining tuck, and reuse of imperceptible wing-copy frames. Paired interpreter
CPU medians: 163.124 → 143.305 µs (12.1% lower). No model proposal rejected.
The terrain-aware landing query was replaced with the body's remembered support
plane to honour the body-state-only animation constraint. The tradeoff reviewer
correctly identified late/early extension at different terrain heights; it is a
remaining limitation, rather than additional sensing or a physical landing reflex.

All reviewers found remaining weak labellar contact and small-scale wing/action
readability. Two identified an 80 ms ground-motion filter causing foot sliding
through acceleration and changing turns. A targeted transport test measured
0.264 body lengths of drift, motivating the next candidate.

### Round 3 (duplicate control)

Key: F4 = round-2 candidate, A9 = `81343d64`, H8 = byte-identical F4.
Orders: H8,F4,A9; H8,A9,F4; A9,F4,H8; A9,F4,H8. Every reviewer preferred
A9 and scored F4/H8 identically. No duplicate discrepancy exceeded one point;
additional primary reviewers were not required.

| Reviewer | F4 = H8 scores | A9 scores | F4/H8 mean | A9 mean | Ranking |
| --- | --- | --- | --- | --- | --- |
| 1 | 8,7,6.5,4.5,7,6,6.5,7 | 8,8,6.5,8,7,8,6.5,7 | 6.563 | 7.375 | A9 > H8 = F4 |
| 2 | 7.5,7,6.5,4.5,7,6,5.5,8 | 7.5,8,6.5,8,7,8,5.5,8 | 6.500 | 7.313 | A9 > H8 > F4 (tie) |
| 3 | 8,7,6.5,4.5,7.5,6,6,7 | 8,8,6.5,8.5,7.5,8,6,7 | 6.563 | 7.438 | A9 > F4 > H8 (tie) |
| Tradeoff assessment | 8,6.5,7,4.5,7,6,6,7.5 | 8,8,7,8,7,8,6,7.5 | 6.563 | 7.438 | A9 > F4 > H8 (tie) |

Primary-review mean: **6.542 → 7.375**. Accepted: body-travel compensation
without velocity filtering; a deeper feeding crouch; fixed-length two-link
mouthpart reach; horizontal paired pads; and contact diagnostics in the viewer.
No proposal rejected. Maximum world-space planted-claw drift fell from 0.2635
to 5.34e-8 body lengths in the common acceleration/turn profile. Both labellar
undersides stayed 0.000734 body lengths above the plane; stem scale stayed 1.0.
The direct predecessor CPU medians (146.174 vs 148.143 µs) overlapped, so this
round did not establish a further speed gain. The model remains two draws.

Remaining priorities: actual grooming-surface contact, clearer posterior-action
silhouettes, and a wing envelope that survives bright backgrounds at game scale.

### Round 4

Key: B2 = round-3 candidate; N5 = posed-surface grooming candidate.
Orders: B2,N5; B2,N5; N5,B2; B2,N5. All four reviewers ranked N5 first.

| Reviewer | B2 scores | N5 scores | B2 mean | N5 mean | Ranking |
| --- | --- | --- | --- | --- | --- |
| 1 | 8,8,3,7.5,7,7,6,8 | 8,8,8,7.5,7,7.5,6,8 | 6.813 | 7.500 | N5 > B2 |
| 2 | 8,7,3,7,6.5,7.5,5.5,7.5 | 8,7,7.5,7,6.5,7.5,5.5,7.5 | 6.500 | 7.063 | N5 > B2 |
| 3 | 8,7.5,3,8,6.5,7.5,5.5,7.5 | 8,7.5,7.5,8,6.5,7.5,5.5,7.5 | 6.688 | 7.250 | N5 > B2 |
| Tradeoff assessment | 8,7.5,3,7.5,7,7.5,6,8 | 8,7.5,7,7.5,7,7.5,5.5,8 | 6.813 | 7.250 | N5 > B2 |

Primary-review mean: **6.667 → 7.271**. Accepted: eye/antenna targets attached
to the articulated head; posterior targets attached to the breathing, swollen
abdomen and folded wings; a small posture shift toward supporting feet; and
full surface reach for weak grooming commands. Strength still controls vigour.
No proposal rejected. The anatomy geometry and draw counts are unchanged.
Interpreter medians overlap (140.999 vs 139.097 µs/update), establishing no speed
advantage. Contact-stroke samples, including return strokes, reach surfaces in
66–75% of samples at strength 0.2 and 69–75% at strength 1. The predecessor
reaches none at strength 0.2 and only antennae at strength 1.

The tradeoff reviewer reduced chunky readability from 6 to 5.5: surface-hugging
hind legs merge into the body silhouette. Remaining problems include local
tarsal orientation, whole-leg penetration checks, and faint flight wings. The
contact diagnostic measures actual solved claws against posed mesh surfaces
(head/antenna/abdomen) and a bounded wing plane; it does not establish rubbing
area or segment clearance. The Seeds-inspired 12-second sequence remains an
animation stand-in, not a model of dust-driven suppression.
