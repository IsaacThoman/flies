// How hot the device is, from a host that can say (the Apple TV's): the
// game holds its frame rate and pixels to what the device can sustain.

/** `ProcessInfo.thermalState`, in order. */
export const THERMAL = { nominal: 0, fair: 1, serious: 2, critical: 3 } as const;

/** `globalThis.__native.thermalState()` on a host that knows: one of THERMAL. */
export type NativeThermal = () => number;
