import type { Campaign } from "./mutation-cases.ts";

// Faults proposed independently of the fixed sample. Report separately so
// adding them cannot change the denominator of the original comparison.
export const challenges: Campaign[] = [
  {
    file: "apps/server/src/lock.ts",
    tests: ["apps/server/tests/table.test.ts", "apps/server/tests/server.test.ts"],
    faults: [["constant-salt", "randomBytes(16)", "Buffer.alloc(16)"]],
  },
  {
    file: "packages/world/src/pantry.ts",
    tests: ["packages/world/tests/world.test.ts"],
    faults: [["double-patch-recovery", "dt / PATCH_RECOVERY", "2 * dt / PATCH_RECOVERY"]],
  },
  {
    file: "apps/server/src/tables.ts",
    tests: ["apps/server/tests/table.test.ts", "apps/server/tests/server.test.ts"],
    faults: [["reverse-room-tie", "a.code.localeCompare(b.code)", "b.code.localeCompare(a.code)"]],
  },
  {
    file: "apps/web/src/scene/weather.ts",
    tests: ["apps/web/tests/weather.test.ts"],
    faults: [["rain-boundary", "w.rain > 0.3", "w.rain >= 0.3"]],
  },
  {
    file: "packages/net/src/protocol.ts",
    tests: ["packages/net/tests/protocol.test.ts"],
    faults: [["repeat-first-bite-amount", "view.getFloat32(8 + i * BITE_BYTES, true)", "view.getFloat32(8, true)"]],
  },
  {
    file: "apps/web/src/quality.ts",
    tests: ["apps/web/tests/quality.test.ts"],
    faults: [["near-real-time-threshold", "BRAIN_BEHIND = 0.95", "BRAIN_BEHIND = 0.94"]],
  },
  {
    file: "apps/web/src/scene/light.ts",
    tests: ["apps/web/tests/light.test.ts", "apps/web/tests/light-cache.test.ts"],
    faults: [["mist-only-invalidation", " || w.mist !== weather.mist", ""]],
  },
];
