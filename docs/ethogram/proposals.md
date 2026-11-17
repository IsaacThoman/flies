# Findings requiring follow-up

## Open edges become antennal contact

The one-hour disc run spent 84.38% of recorded time displaying head grooming,
94.59% of grounded time in the outer half of the disc, and only 4.91% translating.
This is an environmental diagnostic, not a published grooming comparison.

`SenseTracker.#pressing` (`packages/body/src/senses.ts`) returns `body.onFeet`
when an antenna tip lies outside `world.onTable`. Empty space beyond the floor
therefore supplies full contact to that antenna. This drives Johnston's-organ
C/E input, which the existing brain README documents as causing head grooming
and suppressing walking. An empty boundary does not physically deflect an
antenna. The code path is established; its quantitative contribution to this
run has **not** been isolated with a controlled intervention or contact tally.
The elevated grooming occupancy alone does not prove that this is its sole cause.

Proposal for the body/collision owner: distinguish an actual object touching the
antenna from absent floor under its tip. Keep existing physical-wall and other-fly
contact, and leave grounded/load input to its owner. Validate an antenna extending
past an open ledge with no object, a real wall at the same position, and an airborne
antenna inside a solid. Then compare paired seeds through the real brain and body,
reporting both contacts and behaviour; do not replace the contact with an edge-turn
command. No production change is made here because boundary/collision work is
owned by another experiment.

## Steering calibration

No threshold-qualified ground saccades occurred in the hour. The documented
command-to-yaw cap is 3 rad/s (about 172 deg/s), below the 200 deg/s detection
threshold used by Geurten et al. The absence is not a zero-duration saccade.
Raising a gain to cross that threshold would fit the scorecard.

The independent bilateral DNa02 recordings linked in the README offer a possible
rate-to-motion calibration. Extract a slope, its variation across flies and its
temporal filter before changing the body mapping. Preserve a held-out kinematic
reference; plotting limits are not calibration data.

## Assay coverage

Individual feeding contacts/bursts, body-part dust and posterior grooming, and
visual looming trials are missing. Continuous intake cannot be counted as repeated
sips, head grooming cannot establish a whole-body hierarchy, and injecting the
loom-detector input cannot validate a projected visual escape. Hunger and the eyes'
ON pathway remain with their existing owners. More unconditioned simulation hours
cannot repair these measurement gaps.
