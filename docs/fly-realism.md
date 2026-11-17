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
