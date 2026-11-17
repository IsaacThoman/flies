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
interaction/layout pass. Order: V2/Q7, V2/Q7, Q7/V2; regression review Q7/V2.

| Reviewer | Set | Intent | Reach | Visibility | Conventions | Response | Resize | Other | Mean |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F3 | Q7 | 7 | 8 | 6 | 7 | 8 | 7 | 8 | 7.29 |
| F3 | V2 | 9 | 8 | 9 | 9 | 10 | 9 | 8 | 8.86 |
| J6 | Q7 | 7 | 8 | 6.5 | 7 | 8 | 8 | 8.5 | 7.57 |
| J6 | V2 | 9 | 8.5 | 9 | 9 | 9.5 | 9 | 8.5 | 8.93 |
| W8 | Q7 | 6.5 | 8 | 6 | 7 | 9 | 8 | 8 | 7.50 |
| W8 | V2 | 9 | 8.5 | 8.5 | 9 | 10 | 9 | 8.5 | 8.93 |

Mean: **8.90**, versus **7.45** for Q7 in this comparison. All three rank
V2 first. Accepted. The regression reviewer found that a framebuffer-edge
clamp could offset the loupe crosshair from contact; the following pass corrects
the sample coordinates. The common remaining ergonomic finding is tablet reach.

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
held-tool onset, and camera response are measured separately. 56 focused tests
pass, including synchronous focus cancellation and safe lens placement.

## Reach and edge-alignment pass

Key: set-R6 is this pass; set-V2 is the preceding precision/focus pass.
Orders: R6/V2, V2/R6, R6/V2; regression review V2/R6.

| Reviewer | Set | Intent | Reach | Visibility | Conventions | Response | Resize | Other | Mean |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M2 | V2 | 8 | 7 | 7.5 | 8.5 | 9 | 8.5 | 8 | 8.07 |
| M2 | R6 | 9 | 9 | 8.5 | 8.5 | 9 | 8.5 | 8 | 8.64 |
| P7 | V2 | 9 | 7.5 | 8 | 9 | 10 | 9 | 8 | 8.64 |
| P7 | R6 | 9.5 | 9 | 9 | 9 | 10 | 9 | 8.5 | 9.14 |
| T4 | V2 | 8 | 7.5 | 7.5 | 9 | 10 | 8.5 | 8 | 8.36 |
| T4 | R6 | 9 | 9 | 9 | 9 | 10 | 9 | 8.5 | 9.07 |

Mean: **8.95**, versus **8.36** for V2 in this comparison. All three rank
R6 first. Accepted. The regression reviewer confirms the edge alignment and
field-identity gains, and notes a grip-dependent tradeoff: tablet controls
near the edges require more reach from a central grip. Kept for two-handed
edge use, with OS-edge behavior explicitly left for a device to verify.

A scorer found that coalesced pointer batches could hide an out-and-back drag.
The next pass preserves the farthest excursion while forwarding only the last
sample to the game. This pass also rebases onto `b6bd5548` from dev: camera, sleep,
food-contact, whole-place views, menu target identity and text-entry changes
come from their owners and are not attributed to the touch experiment.

The keyboard callback preserves the stable target captured at primary down,
using the shared `sameTarget` helper introduced on dev. Tablet tool groups
move toward their lower corners, and Menu moves near the shelf on tablets and
landscape phones. The lens samples the actual contact at its center even when
its source patch is clamped at framebuffer edges. 57 focused tests pass.

Eight rendered sessions retain one drop per intended tap, no rotation-release
drops, no page/GL errors and one-frame measured response. The view's zoom is
unchanged by two-finger translation apart from numerical rounding.

Validation on the rebased code: lint, typecheck, pointer e2e, web e2e and tables
e2e pass. Remote play e2e passes the input/tool cases but stops at the existing
nervous-system/X-ray region-glow assertion documented in the shared rules
(#63). The full ordinary suite before rebase passed 735 tests (731 passed,
4 skipped). Its separate TypeScript-brain cost budget failed at 0.592 CPU s/s
against 0.5; the budget rerun after rebase failed at 0.570. No brain or budget
code was changed. The iPad shell also passed all 17 tests (231 s); its simulator was shut down and deleted. A final full run follows the coalesced-input pass.

## Coalesced-input pass

Key: set-C9 is this pass; set-R6 is the preceding reach/edge pass.
Order: R6/C9, R6/C9, C9/R6; regression review R6/C9.

| Reviewer | Set | Intent | Reach | Visibility | Conventions | Response | Resize | Other | Mean |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| U3 | R6 | 8 | 8.5 | 8.5 | 9 | 10 | 9 | 9 | 8.86 |
| U3 | C9 | 9.5 | 8.5 | 8.5 | 9.5 | 10 | 9 | 9 | 9.14 |
| G8 | R6 | 8 | 8.5 | 8.5 | 8 | 10 | 9 | 9 | 8.71 |
| G8 | C9 | 8.5 | 8.5 | 8.5 | 9 | 9 | 9 | 9 | 8.79 |
| A5 | R6 | 7.5 | 8 | 8 | 8 | 10 | 9 | 9 | 8.50 |
| A5 | C9 | 9 | 8 | 8 | 8.5 | 10 | 9 | 9 | 8.79 |

Mean: **8.90**, versus **8.69** for R6 in this comparison. All three prefer
C9. The regression review confirms the coalesced-motion fix and finds no other
comparative regression.

Coverage correction: the initial 844×390 session had an airborne fly and an
offscreen hand; no actual world tap was delivered, so this was not counted as
a missed input. That viewport was repeated with a visible, grounded hand,
using at most twelve half-second game-time retries. The corrected session is
retained separately as set-D4; the original C9 evidence is preserved. The
review scores above remain those given to C9, including its coverage limit. The DOM pointer handler keeps maximum travel across
all coalesced samples but queues only the final drag. Both mouse and touch
out-and-back batches now cancel the tap and synchronous field focus, with a
focused test confirming that no extra drag gestures are allocated. 58 focused
tests pass. No further visual/menu changes in this pass.

## Local validation and limits

The final full run before the latest dev merge passed all 784 ordinary tests
(780 passed, four expected skips). The separate unchanged TypeScript-brain
cost budget failed at 0.609 CPU s/s versus 0.5; earlier observations were 0.592
and 0.570. The remote-play run stopped at the known region-glow assertion.
These results are retained rather than represented as a green full run.

Both iPhone and iPad `ios:check` runs passed all 17 checks, including lifecycle,
same-seat reconnect and invitation handling; their fresh simulators were
removed. Lint, typecheck, pointer, web and tables e2e passed. A merge commit
incorporates current dev, including held-input cleanup, event timestamps,
menu identity and text entry. Local post-merge checks are recorded in the PR.

Touch changes stay out of camera.ts and drag-to-camera behavior. The lens
adds one GPU quad only while a touch-held tool points at the world; the TV
creates no lens and retains its existing overlay behavior. No sound or extra
on-screen instructions were added. Next device work is physical haptic timing,
edge-gesture interaction, keyboard appearance and live Split View transitions.

## Provisional press feedback pass

Key: H8 = merged touch foundation; J3 = press feedback; N6 is an identical
copy of J3. Source snapshots use the same dev input foundation. Orders:
J3/N6/H8, H8/N6/J3, J3/H8/N6; regression review J3/N6/H8.

| Reviewer | Set | Intent | Reach | Visibility | Conventions | Response | Resize | Other | Mean |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D3 | H8 | 9 | 9 | 7 | 9 | 7 | 9 | 9 | 8.43 |
| D3 | J3 = N6 | 9 | 9 | 8 | 9 | 10 | 9 | 9 | 9.00 |
| U8 | H8 | 9 | 8 | 8 | 9 | 7 | 9 | 9 | 8.43 |
| U8 | J3 = N6 | 9 | 8 | 8 | 9 | 10 | 9 | 9 | 8.86 |
| K9 | H8 | 9 | 8 | 7 | 9 | 7 | 9 | 9 | 8.29 |
| K9 | J3 = N6 | 9 | 8 | 8 | 9 | 10 | 9 | 9 | 8.86 |

Mean **8.90** versus **8.38** for H8; all three rank J3/N6 first. Duplicate
scores differ by zero on every criterion. Accepted. The independent regression
review finds no supported regression in J3/N6. It correctly notes that H8's
first strip frame records safe-area layout rather than an in-progress cancelled
shelf press; source confirms the absent preview path, and H8's empty HUD samples
are not a measured zero-frame response.

An earlier comparison was excluded because its source snapshot predated dev's
held-input changes, confounding touch feedback with another owner's fixes.
Its B8/P4/C2 key and scores are retained here for audit, not as an accepted
round: S4 8.14/9.14/9.14; L2 8.29/8.86/8.86; H7 8.29/9.00/9.00. Fresh reviewers
assessed the aligned sets above; none continued an earlier review.

Eligible shelf, label and Menu presses now acknowledge contact before release.
Moving away clears feedback, crossing drag slop disarms it, and cancellation
never commits it. Feedback transitions bypass the ordinary overlay upload cap;
idle shimmer and the TV's remote overlay retain that cap. No camera or drag
mapping changed. The touch helper can cancel a contact without sending a second
release afterwards.

Eight real-brain CDP sessions retain one food drop per intended tap, zero extra
rotation-release drops, no page/GL errors, and one rendered frame for tool,
held-tool, camera and HUD responses. Two-finger translation keeps zoom within
1e-7 relative error. Focused checks pass 68/68, versus 66/66 on the aligned
foundation. Lint and typecheck pass, including after merging newer dev artwork,
default-room and acknowledgement changes. iPhone and iPad shell reruns each
pass all 17 checks (238 and 223 seconds of tests); simulators were removed.
Farm full verification is recorded in the PR when complete.

Remaining findings: shelf feedback is concentrated beneath the fingertip and
the portrait shelf has little room beyond its 44-pixel minimum. The next
experiment previews a pending tool in the existing caption, without adding text
or changing selection until release. Physical haptics, OS edge gestures, actual
keyboard presentation and live Split View remain device-evidence gaps.

## Pending-tool caption pass

Key: S8 = accepted press-feedback foundation; W5 = caption preview. Both were
recorded afresh on the same dev foundation, with the same cancellation driver,
current artwork and safe-area changes during rotation. Orders: W5/S8, W5/S8,
S8/W5; regression review W5/S8. All reviewers are fresh independent contexts
using gpt-6.1-sol with reasoningEffort high.

| Reviewer | Set | Intent | Reach | Visibility | Conventions | Response | Resize | Other | Mean |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B3 | S8 | 9.5 | 8.5 | 8 | 9.5 | 10 | 9 | 9.5 | 9.14 |
| B3 | W5 | 9.5 | 8.5 | 9 | 9.5 | 10 | 9 | 9.5 | 9.29 |
| T8 | S8 | 10 | 8 | 8 | 9 | 10 | 9 | 9 | 9.00 |
| T8 | W5 | 10 | 8 | 9 | 9 | 10 | 9 | 9 | 9.14 |
| M5 | S8 | 9 | 9 | 8 | 9 | 10 | 9 | 9 | 9.00 |
| M5 | W5 | 9 | 9 | 9 | 9 | 10 | 9 | 9 | 9.14 |

Mean **9.19** versus **9.05** for S8. All three rank W5 first; accepted.
The hill climb stops at the requested mean of at least 9. These are fresh
absolute judgments, so adjacent rounds' means are not paired measurements.

A pending shelf press now names its tool in the existing caption above or beside
the finger; release still selects it, and cancellation restores the committed
label. The caption's bounds and all hit targets remain unchanged. The added
layout check covers every tool at all eight sizes and verifies unchanged
selection and hit geometry.

The regression reviewer finds no demonstrated interaction regression. All
three scorers flag a visual ambiguity: a pending Tickle caption temporarily
retains the committed Feed tool's variant chevrons. Kept as a limited tradeoff
for stable controls throughout an active press, with no stray activation in
the evidence. A proposed extra instruction was rejected to keep on-screen text
minimal. A separate preview treatment is future work if device testing finds
this confusing; the narrow shelf and physical-device checks remain higher-value
follow-up measurements.

All sixteen paired sessions retain one intended food drop, no extra rotation
drops, Feed after a cancelled shelf press, and one rendered frame for drop,
held-tool, camera and HUD response. All explicit WebGL probes pass. Each records
one localhost WebSocket handshake error because the standalone capture Vite
server has no /rooms service; both versions recover to local play. Raw errors
are retained, not filtered. Focused checks pass 68/68 and 69/69; pointer e2e,
lint and typecheck pass on the caption candidate.

The complete Apple-silicon npm test run passes: 995 ordinary tests (990 pass,
five skips) and all four CPU budgets. The TypeScript-brain budget now measures
0.449 calibrated M5 Pro CPU s/s against 0.5, with dev's brain/budget work intact.
The farm's shared foundation passes 953 ordinary tests with three skips; its
five Apple-specific exact-name exclusions and CPU-budget exclusion are covered
by the Apple-silicon run. Farm lint, web/tvOS types and build pass. E2e farm
results and post-merge validation are recorded in the PR.
