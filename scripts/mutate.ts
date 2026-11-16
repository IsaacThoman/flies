// Runs deliberate faults in a disposable checkout: a killed process never
// leaves the developer's sources mutated. No test or production dependency.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { campaigns } from "./mutation-cases.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const option = (flag: string) => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
const selected = campaigns.filter((c) => !option("--module") || c.file.includes(option("--module")!));
if (!selected.length) throw new Error("No matching module");
const sandbox = mkdtempSync(path.join(tmpdir(), "flies-mutations-"));
const results: { module: string; id: string; status: string; detail?: string }[] = [];
const run = (tests: string[]) => spawnSync(process.execPath, ["--test", "--test-reporter=tap", ...tests], {
  cwd: sandbox, encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024,
});
try {
  const files = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" });
  if (files.status !== 0) throw new Error(files.stderr);
  for (const file of new Set(files.stdout.split("\0").filter(Boolean))) {
    if (!existsSync(path.join(root, file))) continue;
    const dest = path.join(sandbox, file);
    mkdirSync(path.dirname(dest), { recursive: true });
    cpSync(path.join(root, file), dest);
  }
  mkdirSync(path.join(sandbox, "node_modules", "@fly"), { recursive: true });
  for (const entry of readdirSync(path.join(root, "node_modules"))) {
    if (entry !== "@fly") symlinkSync(path.join(root, "node_modules", entry), path.join(sandbox, "node_modules", entry));
  }
  for (const entry of readdirSync(path.join(root, "node_modules", "@fly"))) {
    symlinkSync(path.join(sandbox, "packages", entry), path.join(sandbox, "node_modules", "@fly", entry));
  }
  for (const campaign of selected) {
    const file = path.join(sandbox, campaign.file);
    const original = readFileSync(file, "utf8");
    const baseline = run(campaign.tests);
    if (baseline.status !== 0) throw new Error(`Clean tests fail for ${campaign.file}:\n${baseline.stdout}\n${baseline.stderr}`);
    for (const [id, from, to] of campaign.faults) {
      if (option("--fault") && id !== option("--fault")) continue;
      if (original.split(from).length !== 2) throw new Error(`Fault must match exactly once: ${campaign.file}: ${id}`);
      try {
        writeFileSync(file, original.replace(from, to));
        const test = run(campaign.tests);
        const output = test.stdout + test.stderr;
        // Syntax/import failures and timeouts are infrastructure errors, never kills.
        const assertion = /ERR_ASSERTION|failureType: 'testCodeFailure'/.test(output) && !/SyntaxError|ERR_MODULE_NOT_FOUND/.test(output);
        const status = test.error || test.signal ? "error" : test.status === 0 ? "survived" : assertion ? "killed" : "error";
        results.push({ module: campaign.file, id, status, ...(status === "error" ? { detail: output.slice(-4000) } : {}) });
        console.log(`${status.padEnd(8)} ${campaign.file}: ${id}`);
      } finally {
        writeFileSync(file, original);
      }
    }
  }
  if (option("--out")) writeFileSync(path.resolve(option("--out")!), JSON.stringify({ results }, null, 2) + "\n");
  const count = (status: string) => results.filter((r) => r.status === status).length;
  console.log(`${count("killed")} killed, ${count("survived")} survived, ${count("error")} errors`);
  if (count("error")) process.exitCode = 1;
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
