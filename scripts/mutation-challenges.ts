import type { Campaign } from "./mutation-cases.ts";

// Faults proposed independently of the fixed sample. Report separately so
// adding them cannot change the denominator of the original comparison.
export const challenges: Campaign[] = [
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
