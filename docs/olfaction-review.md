# Olfaction study review log

Reviewers received only the rubric, neutral evidence paths and primary-source
references. Each was a fresh, independent, read-only review. Scores assess the
research artifact, not whether the brain produces a desired result.

## Round 1

Key: `set-K7` is the seed-1 evidence snapshot. There was one set to score;
there is no forced ranking in this baseline round.

| Reviewer | Input identity | Biology | Reproducibility | Inference | Scope/honesty | Mean |
|---|---:|---:|---:|---:|---:|---:|
| R1 | 10 | 8 | 7 | 8 | 9 | 8.40 |
| R2 | 9 | 8 | 7 | 7 | 9 | 8.00 |
| R3 | 10 | 8 | 7 | 8 | 9 | 8.40 |
| Mean | 9.67 | 8.00 | 7.00 | 7.67 | 9.00 | **8.27** |

All three independently regenerated the annotation/wiring audit and reductions
from recorded measurements; none reran the stimulation battery. All supported
input identification and stopping short of steering/prototype work. Their
highest-value findings were incomplete seed replication, omitted numerical
recovery failures (16/25 in seed 1), and a DM5 causal figure locator that should
include Figure 5. R2 also identified the absence of an operational valence
endpoint and the female/starved context of the vinegar behaviour evidence.
R2/R3 found seed-1 KC rounding of 0.824803 to 0.83; correct rounding is 0.82.

Changes: completed the prescribed seeds without changing any simulation/input
settings; retained all 78 trials and every rate; added across-seed means/ranges
and explicit protocol-completion validation; made recovery failure the result;
corrected figure references and sex/state context; documented the missing
valence endpoint and a specific recovery-control follow-up. The three-seed
DM1 KC mean is 0.827395 Hz and legitimately rounds to 0.83.

Not attempted: retuning a weight, selecting ORNs by commands, relaxing the
recovery threshold, or proceeding to steering/plumes despite the failed gate.
Suggested spontaneous-variability controls are a future experiment, with a
fresh protocol; they cannot retroactively turn the failed tolerance into a pass.

## Round 2

Key, concealed during review: `set-P4` is the complete three-seed study;
`set-T9` is a copy of `set-K7`, the seed-1 baseline. Each scored review is fresh;
a separate fresh reviewer examines relative regressions only.

| Reviewer | Set | Input identity | Biology | Reproducibility | Inference | Scope/honesty | Mean |
|---|---|---:|---:|---:|---:|---:|---:|
| R1 | P4 | 10 | 9 | 9 | 9 | 10 | 9.40 |
| R1 | T9 | 10 | 8 | 7 | 7 | 9 | 8.20 |
| R2 | P4 | 9 | 8 | 9 | 6 | 8 | 8.00 |
| R2 | T9 | 9 | 9 | 5 | 5 | 5 | 6.60 |
| R3 | P4 | 10 | 9 | 9 | 9 | 10 | 9.40 |
| R3 | T9 | 10 | 8 | 7 | 6 | 9 | 8.00 |
| R4 | P4 | 10 | 9 | 9 | 9 | 10 | 9.40 |
| R4 | T9 | 10 | 8 | 7 | 6 | 8 | 7.80 |
| R5 | P4 | 10 | 9 | 9 | 9 | 10 | 9.40 |
| R5 | T9 | 10 | 8 | 7 | 6 | 8 | 7.80 |
| Mean | P4 | 9.80 | 8.80 | 9.00 | 8.40 | 9.60 | **9.12** |
| Mean | T9 | 9.80 | 8.20 | 6.60 | 6.00 | 7.80 | **7.68** |

The initial three scores averaged 8.93 for P4 and 7.60 for T9. All ranked P4
first. R2 correctly reproduced the numbers but interchanged the report prose
between the two sets, describing P4's report as seed-1-only and T9's as complete.
The actual frozen files have P4's complete report and T9's preliminary report.
Their SHA-256s are respectively
`143f2965072e06ab09525a8bd1730a6f9048d08bcf8ee41f9b64a27ae20de0f9` and
`53ff5771af34a86d0cb55cdd219d0ab3b58fa79628684383200a6ed02dce8e4c`.
Those evidence files were not changed between reviews.

To handle this assignment noise, two additional independent blind reviews
score the same frozen sets. Their briefs add only a request to identify the
report hash and quote the recorded-response opening; they receive no earlier
scores, findings, version key or preferred conclusion. R2's original scores
are retained unchanged in the five-reviewer mean, not reassigned or excluded.
Both additional reviews confirm the report hashes and recorded-response text,
and both rank P4 first. All five scored reviewers rank P4 above T9. Keep P4;
the stopping score of 9 is reached without changing the model or acceptance
criteria. There were no lost rounds or model changes to revert.

The regression-only review finds no verified P4-specific regression. It
independently confirms the same audit and reduction results and identifies
T9's missing replication, omitted recovery failures and weaker sex/state
qualification. The scored reviews reproduce the wiring and reductions too;
they do not rerun stimulation. Remaining substantive limits are the missing
valence endpoint, an uncalibrated recovery comparator, and sparse activity
hidden by population averages. These stay explicit limitations, not claims of
successful behaviour.

Minor citation locators are corrected after review: Stensmyr's later feeding/
oviposition experiments require Figures 5–6. Runtime parameters and all 78
recorded trials stay unchanged.
The Suh reference is kept at Figure 3, without a panel-level claim that several
reviewers could not independently access. The protocol's initial commit is
`14115ede12bfc1a0649048a395b904a96b245a0d`; reviewers audited the frozen
evidence and do not independently certify when the simulations were run.
