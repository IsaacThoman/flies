import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.join(import.meta.dirname, "../../..");

test("CI rebuilds and compares both committed WebAssembly modules and their manifest without skipping", () => {
  const workflow = readFileSync(path.join(root, ".github/workflows/wasm-repro.yml"), "utf8");
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /runs-on: macos-/);
  assert.match(workflow, /actions\/cache@v4/);
  assert.match(workflow, /path: packages\/brain-native\/build\/wasi-sdk-\*/);
  assert.match(workflow, /hashFiles\('packages\/brain-native\/wasm.sh'\)/);
  assert.match(workflow, /run: packages\/brain-native\/wasm.sh --check/);
  assert.doesNotMatch(workflow, /continue-on-error|cache-hit|WASI_SDK_PATH/);
  const build = readFileSync(path.join(root, "packages/brain-native/wasm.sh"), "utf8");
  assert.match(build, /for file in fly-brain.wasm fly-brain-harness.wasm build.json/);
  assert.match(build, /cmp -s .*exit 1/);
});

test("WASM rebuilds only follow native build inputs on both PRs and pushes", () => {
  const workflow = readFileSync(path.join(root, ".github/workflows/wasm-repro.yml"), "utf8");
  const triggers = workflow.slice(workflow.indexOf("on:\n") + 4, workflow.indexOf("\npermissions:"));
  const events = triggers.split(/^ {2}(?=pull_request:|push:)/m).filter(Boolean);
  assert.equal(events.length, 2);
  for (const event of events) {
    const paths = [...event.matchAll(/^ {6}- '([^']+)'$/gm)].map((m) => m[1]);
    assert.deepEqual(paths, ["packages/brain-native/**", ".github/workflows/wasm-repro.yml"]);
    for (const file of ["packages/brain-native/src/brain.cpp", "packages/brain-native/include/fly_brain.h", "packages/brain-native/wasm.sh", "packages/brain-native/wasm/build.json", ".github/workflows/wasm-repro.yml"]) {
      assert.ok(paths.some((glob) => path.matchesGlob(file, glob)), `${file} triggers ${event.split(":")[0]}`);
    }
    for (const file of ["docs/web.md", "apps/web/src/main.ts", "scripts/play.ts", "package-lock.json"]) {
      assert.ok(!paths.some((glob) => path.matchesGlob(file, glob)), `${file} spends no macOS minutes`);
    }
  }
  assert.match(triggers, /branches: \[dev, main\]/);
});

test("draft PRs skip WASM rebuilds and marking them ready triggers a build", () => {
  const workflow = readFileSync(path.join(root, ".github/workflows/wasm-repro.yml"), "utf8");
  assert.match(workflow, /pull_request:\n {4}types: \[opened, synchronize, reopened, ready_for_review\]/);
  assert.match(workflow, /jobs:\n {2}rebuild:\n {4}if: github.event_name != 'pull_request' \|\| !github.event.pull_request.draft\n/);
});
