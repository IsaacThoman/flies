import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.join(import.meta.dirname, "../../..");

test("CI rebuilds and compares both committed WebAssembly modules and their manifest without skipping", () => {
  const workflow = readFileSync(path.join(root, ".github/workflows/wasm-repro.yml"), "utf8");
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /runs-on: ubuntu-/);
  assert.match(workflow, /actions\/cache@v4/);
  assert.match(workflow, /path: packages\/brain-native\/build\/wasi-sdk-\*/);
  assert.match(workflow, /hashFiles\('packages\/brain-native\/wasm.sh'\)/);
  assert.match(workflow, /run: packages\/brain-native\/wasm.sh --check/);
  assert.doesNotMatch(workflow, /continue-on-error|cache-hit|WASI_SDK_PATH/);
  const build = readFileSync(path.join(root, "packages/brain-native/wasm.sh"), "utf8");
  assert.match(build, /for file in fly-brain.wasm fly-brain-harness.wasm build.json/);
  assert.match(build, /cmp -s .*exit 1/);
});
