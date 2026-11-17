# Touch feel experiment

Scope: browser touch and the iPhone/iPad shell; no sound, changes to the
brain, camera implementation, signing, or menu artwork.

## Rubric

Independent reviewers score each criterion from 0 to 10. A 10 means:

| Criterion | A 10 |
| --- | --- |
| Intent recognition | Deliberate taps act once at the intended point; drags, cancelled touches and multi-touch never trigger stray tools or HUD actions. |
| Comfort and reach | Frequently used controls fit a portrait thumb's lower reach, with distinct targets at least 44 CSS pixels across; tablet layouts remain comfortable. |
| Visibility and safety | Feedback remains visible around a fingertip; controls avoid safe areas, the home indicator, keyboard, and system edges. |
| Platform conventions | Taps commit on release, moving away cancels a button, pinch and two-finger translation compose predictably, and interruptions release tools. |
| Responsiveness | Visible tool/camera response within one rendered frame of the relevant input, without extra waits. |
| Orientation and resize | Turning or resizing, including Split View and keyboards, keeps controls usable and cannot commit an obsolete gesture. |
| Other inputs | Mouse, trackpad, remote, keyboard and gamepad retain their behavior and their checks pass. |

## Evidence and limits

Use `scripts/play.ts`'s real CDP touch driver and the real brain. Test 390×844
and 430×932 phones in both orientations, 820×1180 and 1180×820 tablets,
and 507×820 and 375×820 Split View windows. Supply safe-area insets explicitly
in browser emulation. Annotated strips mark input locations and timing;
geometry and event measurements accompany them. Browser emulation cannot
verify OS edge gestures or actual haptic feel; the simulator cannot play
haptics either. Those require a physical device.

## Rounds

### Baseline

Key: set-M4 = `bd88a01` (unchanged implementation). Reviewers were fresh,
independent contexts and saw only the rubric, rendered strips, measurements,
test results and a neutral source snapshot.

| Reviewer | Intent | Reach | Visibility | Conventions | Response | Resize | Other inputs | Mean |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 4 | 6 | 6 | 4 | 8 | 3 | 9 | 5.71 |
| 2 | 4 | 6 | 5 | 4 | 9 | 3 | 8 | 5.57 |
| 3 | 4 | 6 | 6 | 5 | 9 | 3 | 9 | 6.00 |
| Overall | | | | | | | | **5.76** |

The common findings were stale gestures committing after rotation, release
validation gaps, undersized narrow targets, and landscape HUD interception.
Six of eight scripted hand taps dropped food; seven rotation releases added
food. All measured drop responses took one rendered frame; 39 focused tests
passed.

Rejected finding: the hypothetical play-HUD-under-keyboard geometry does not
represent the room form, because the HUD is hidden while typing. The actual
room form now has a focused-field layout check with portrait, landscape and
Split View keyboard insets. Actual OS keyboard appearance remains unverified.

### Interaction and layout pass

Key: set-Q7 = `5f8e94d`; set-L8 is an identical duplicate of Q7.
Randomized reviewer orders: L8/Q7/M4, M4/Q7/L8, L8/Q7/M4;
the regression review sees L8/M4/Q7. Reviewers see no key or earlier scores.

| Reviewer | Set | Intent | Reach | Visibility | Conventions | Response | Resize | Other | Mean |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S2 | M4 | 3 | 5 | 6 | 4 | 9 | 2 | 8 | 5.29 |
| S2 | Q7 = L8 | 8 | 8 | 7 | 8 | 9 | 8 | 9 | 8.14 |
| D5 | M4 | 4 | 5 | 7 | 4 | 9 | 3 | 9 | 5.86 |
| D5 | Q7 = L8 | 8 | 9 | 8 | 8 | 9 | 9 | 9 | 8.57 |
| H9 | M4 | 3 | 5 | 6 | 4 | 9 | 3 | 8 | 5.43 |
| H9 | Q7 = L8 | 8 | 8 | 7 | 9 | 9 | 9 | 9 | 8.43 |

Mean: **8.38**, versus **5.52** for M4 in this comparison. All three rank
Q7/L8 above M4. Duplicate differences are zero on every criterion; no additional
noise reviewers needed. Accepted.

The regression reviewer identified reduced landscape target width (65 to 44
CSS px) and loss of the narrow shelf's group separation/tool-name context.
The second pass restores some landscape width. Narrow group separation stays
collapsed because distinct targets need the width; the selected icon supplies
tool context where its label only has room for the variant.

Reviewers also found a separate keyboard-focus listener bypassing the
recognizer, and contact hidden beneath fingers. These drive the next pass.

Changes: count release displacement when identifying taps; require an eligible
release on the same HUD target; keep the original pinch pair when an extra
finger lifts; cancel pending gestures on layout/focus changes; ignore surviving
contacts after resize. Narrow shelves use their width for distinct targets,
portrait Menu moves into lower reach, and short landscape screens put the label
beside the shelf. Play hit testing uses the drawn targets, without invisible
padding that steals world taps.

All eight scripted hand taps now drop exactly one food; all eight rotation
releases drop none. Responses remain one rendered frame, with no page errors.
48 focused tests pass. No offset aiming preview has been implemented yet.

| Size (CSS px) | Tap food delta | Rotation food delta | Drop latency (frames) |
| --- | --- | --- | --- |
| 390×844 | 1 | 0 | 1 |
| 844×390 | 1 | 0 | 1 |
| 430×932 | 1 | 0 | 1 |
| 932×430 | 1 | 0 | 1 |
| 820×1180 | 1 | 0 | 1 |
| 1180×820 | 1 | 0 | 1 |
| 507×820 | 1 | 0 | 1 |
| 375×820 | 1 | 0 | 1 |

The small phone's shelf targets grow from 43.125 to 46.25 CSS px; narrow
Split View grows from 41.25 to 44.375 px. Phone label targets are 44 px tall.
The portrait phone's Menu center moves from 755 to 152.75 px above the bottom.

## Validation

Full checks and the iPad simulator check pending. The iPhone shell passed all 17 checks (220 s), at 1.00× brain speed; its fresh simulator was shut down and deleted. Haptic implementation is
unchanged: browser vibration where supported, native feather/take-off feedback
sampled from state every 200 ms. No physical haptic or OS-edge measurements.

## Precision and field-focus pass

Key: set-V2 is the precision/field-focus pass; set-Q7 is the preceding accepted
interaction/layout pass. Scores and randomized order pending.

The keyboard's synchronous focus callback now receives only recognized taps,
including pointer identity, maximum travel and interruption handling. Menu taps
validate their release target. One-shot tools re-aim at release and reject a
release over the HUD. Held tools pause when the finger no longer points at the
world. Landscape targets expand into available room (49.375 and 59.75 CSS px
on the two phones), and top Menu gets edge clearance.

The held-tool lens is a GPU copy of the rendered world, above the finger,
using one extra quad and no second world render. It adds no TV texture or draw
work. A black initial prototype used an incompatible color-space copy; that
prototype was rejected before review. The captured version copies display
pixels without another conversion and completes all eight sessions without GL
errors.

All eight intended taps drop one food; no interrupted rotation release drops
food. Two-finger translation preserves zoom to numerical precision. Drop,
held-tool onset, and camera response are measured separately. 52 focused tests
pass, including synchronous focus cancellation and safe lens placement.
