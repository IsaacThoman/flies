/**
 * These parameters belong to the frame loop, with no future automation to keep.
 * Rebase at the current value so the TV's per-sample mixer never has to replay
 * the entire session's targets. Cancelling at `now` would retain that history.
 */
export function followParam(param: AudioParam, target: number, now: number, smoothing: number) {
  const current = param.value;
  param.cancelScheduledValues(0);
  param.setValueAtTime(current, now);
  param.setTargetAtTime(target, now, smoothing);
}
