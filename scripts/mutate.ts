// Runs deliberate faults in a disposable checkout: a killed process never
// leaves the developer's sources mutated. No test or production dependency.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { campaigns } from "./mutation-cases.ts";
import { challenges } from "./mutation-challenges.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  if (!["--module", "--fault", "--out", "--catalogue"].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith("--")) {
    throw new Error("Usage: node scripts/mutate.ts [--module substring] [--fault id] [--out file] [--catalogue sample|challenges]");
  }
}
const option = (flag: string) => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
const catalogue = option("--catalogue") ?? "sample";
if (!["sample", "challenges"].includes(catalogue)) throw new Error("Unknown catalogue");
const selected = (catalogue === "sample" ? campaigns : challenges).filter((c) => !option("--module") || c.file.includes(option("--module")!));
if (!selected.length || (option("--fault") && !selected.some((c) => c.faults.some(([id]) => id === option("--fault"))))) throw new Error("No matching mutation");
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
for (const c of selected) {
  const source = readFileSync(path.join(root, c.file), "utf8");
  for (const [id, from] of c.faults) {
    if (source.split(from).length !== 2) throw new Error(`Fault must match exactly once: ${c.file}: ${id}`);
  }
}
const sandbox = mkdtempSync(path.join(tmpdir(), "flies-mutations-"));
const results: { module: string; id: string; status: string; exitCode: number | null; detail?: string }[] = [];
const provenance = {
  node: process.version, platform: process.platform, arch: process.arch,
  catalogue, catalogueHash: hash(readFileSync(new URL(catalogue === "sample" ? "./mutation-cases.ts" : "./mutation-challenges.ts", import.meta.url), "utf8")),
  inputs: selected.map((c) => ({ module: c.file, tests: c.tests, hashes: Object.fromEntries([c.file, ...c.tests].map((f) => [f, hash(readFileSync(path.join(root, f), "utf8"))])) })),
};
const run = (tests: string[]) => spawnSync(process.execPath, ["--test", "--test-reporter=tap", ...tests], {
  cwd: sandbox, encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024,
});
try {
  // A filesystem copy also works for archived review evidence without .git.
  const excluded = new Set(["node_modules", ".git", "dist", "build", "data", "www"]);
  for (const name of ["apps", "packages", "scripts", "docs"]) {
    cpSync(path.join(root, name), path.join(sandbox, name), {
      recursive: true, filter: (file) => !excluded.has(path.basename(file)),
    });
  }
  for (const name of readdirSync(root)) {
    if (/\.(json|js|ts)$/.test(name)) cpSync(path.join(root, name), path.join(sandbox, name));
  }
  mkdirSync(path.join(sandbox, "node_modules", "@fly"), { recursive: true });
  for (const entry of readdirSync(path.join(root, "node_modules"))) {
    if (entry !== "@fly") symlinkSync(path.join(root, "node_modules", entry), path.join(sandbox, "node_modules", entry));
  }
  for (const entry of readdirSync(path.join(root, "node_modules", "@fly"))) {
    const relative = path.relative(root, realpathSync(path.join(root, "node_modules", "@fly", entry)));
    symlinkSync(path.join(sandbox, relative), path.join(sandbox, "node_modules", "@fly", entry));
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
        results.push({ module: campaign.file, id, status, exitCode: test.status, ...(status !== "survived" ? { detail: output.slice(-5000) } : {}) });
        console.log(`${status.padEnd(8)} ${campaign.file}: ${id}`);
      } finally {
        writeFileSync(file, original);
      }
    }
  }
  if (option("--out")) writeFileSync(path.resolve(option("--out")!), JSON.stringify({ provenance, results }, null, 2) + "\n");
  const count = (status: string) => results.filter((r) => r.status === status).length;
  console.log(`${count("killed")} killed, ${count("survived")} survived, ${count("error")} errors`);
  if (count("error")) process.exitCode = 1;
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
