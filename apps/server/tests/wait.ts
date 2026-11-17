// Loopback I/O can be delayed by shared-machine load. This only bounds hangs;
// success comes from the expected message or socket event, never elapsed time.
export const WAIT = 30_000;
