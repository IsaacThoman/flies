import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { bundledPackageNames, checkGenerated, embeddedNotices, notices, noticeText, privacyHtml, requireNotices, runtimeDependencies } from "../../../scripts/notices.ts";
import { noticeWrap } from "../src/ui/screens/about.ts";

const root = path.resolve(import.meta.dirname, "../../..");
test("all declared shipping dependencies have current generated notices and full original grants", () => {
  checkGenerated();
  requireNotices(runtimeDependencies());
  const text = noticeText();
  for (const name of ["three", "ws"]) assert.ok(text.includes(readFileSync(path.join(root, `node_modules/${name}/LICENSE`), "utf8").trim()), name);
  for (const phrase of ["Copyright (C) 1993 by Sun", "Neither the name of Google", "Modified for flies", "creativecommons.org/licenses/by/4.0/", "210–219", "LLVM Exceptions", "Rich Felker"]) assert.ok(text.includes(phrase), phrase);
  assert.ok(notices().every((s) => s.heading && s.body));
});

test("missing direct, transitive and bundled-development dependency notices fail closed", () => {
  assert.deepEqual([...bundledPackageNames(["/node_modules/three/node_modules/unknown/index.js", "/node_modules/@scope/pkg/file.js"])], ["unknown", "@scope/pkg"]);
  for (const name of ["constructor", "valueOf", "toString", "__proto__"]) assert.throws(() => requireNotices([name]), /no notice/);
  assert.throws(() => requireNotices(["unreviewed-addon"]), /no notice: unreviewed-addon/);
  const dir = mkdtempSync(path.join(tmpdir(), "flies-notices-"));
  try {
    const put = (file: string, value: unknown) => { mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); writeFileSync(path.join(dir, file), JSON.stringify(value)); };
    put("package.json", { dependencies: { three: "1" } });
    put("apps/server/package.json", {});
    put("node_modules/three/package.json", { dependencies: { hidden: "1" } });
    put("node_modules/hidden/package.json", {});
    assert.deepEqual(runtimeDependencies(dir), ["hidden", "three"]);
    assert.throws(() => requireNotices(runtimeDependencies(dir)), /no notice: hidden/);
    put("apps/server/package.json", { dependencies: { "@fly/support": "*" } });
    put("packages/support/package.json", { name: "@fly/support", dependencies: { more: "1" } });
    put("node_modules/more/package.json", {});
    assert.deepEqual(runtimeDependencies(dir), ["hidden", "more", "three"]);
    put("node_modules/more/package.json", { optionalDependencies: { optional: "1" } });
    assert.deepEqual(runtimeDependencies(dir), ["hidden", "more", "three"]);
    put("node_modules/optional/package.json", {});
    assert.deepEqual(runtimeDependencies(dir), ["hidden", "more", "optional", "three"]);
    put("node_modules/three/node_modules/hidden/package.json", {});
    assert.throws(() => runtimeDependencies(dir), /Nested shipped dependency/);
    assert.throws(() => requireNotices(["playwright"]), /no notice: playwright/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("static policy escapes personal placeholders, has no external resources and follows its source", () => {
  const html = privacyHtml();
  assert.match(html, /&lt;contact email&gt;/);
  assert.match(html, /one hour/);
  assert.match(html, /10 MB/);
  assert.doesNotMatch(html, /<script|<iframe|<img|<link|@import/);
});

test("notice URLs stay inside a narrow reading column without losing characters", () => {
  const g = { font: "", measureText: (s: string) => ({ width: s.length * 8 }) } as CanvasRenderingContext2D;
  const url = "https://raw.githubusercontent.com/WebAssembly/wasi-libc/2e6fb9d8ee0cdf9e431fbcabe8af3115de000a13/LICENSE";
  const lines = noticeWrap(g, url, 240, 15);
  assert.ok(lines.every((l) => l.length * 8 <= 240));
  assert.equal(lines.join(""), url);
});

test("store copy fits Apple's field limits", () => {
  const doc = readFileSync(path.join(root, "docs/store-listing.md"), "utf8");
  for (const [field, limit] of [["Name", 30], ["Subtitle", 30], ["Promotional text", 170], ["Description", 4000], ["Keywords", 100], ["What's new", 4000]] as const) {
    const value = doc.split(`## ${field}\n\n`)[1]?.split("\n\n## ")[0].trim();
    assert.ok(value && value.length <= limit, `${field}: ${value?.length}/${limit}`);
  }
});

test("the static host serves /privacy and the notice with their own content types", async () => {
  const { serveSite } = await import("../../../scripts/serve.ts");
  const dir = mkdtempSync(path.join(tmpdir(), "flies-policy-"));
  mkdirSync(path.join(dir, "privacy"));
  writeFileSync(path.join(dir, "privacy/index.html"), privacyHtml());
  writeFileSync(path.join(dir, "THIRD_PARTY_NOTICES"), noticeText());
  const site = await serveSite({ dir });
  try {
    const policy = await fetch(new URL("privacy", site.url));
    assert.match(policy.headers.get("content-type")!, /text\/html/);
    assert.equal(await policy.text(), privacyHtml());
    const notice = await fetch(new URL("THIRD_PARTY_NOTICES", site.url));
    assert.match(notice.headers.get("content-type")!, /text\/plain/);
    assert.equal(await notice.text(), noticeText());
  } finally { await site.close(); rmSync(dir, { recursive: true, force: true }); }
});


test("a policy-only or notice-only release changes the offline cache version", async () => {
  const { offlineVersion } = await import("../../../scripts/webBuild.ts");
  const files = ["./", "privacy/index.html", "THIRD_PARTY_NOTICES"];
  const documents = { "index.html": "game", "privacy/index.html": "policy one", THIRD_PARTY_NOTICES: "notices one" };
  const first = offlineVersion(files, documents);
  assert.equal(first, offlineVersion(files, { ...documents }));
  assert.notEqual(first, offlineVersion(files, { ...documents, "privacy/index.html": "policy two" }));
  assert.notEqual(first, offlineVersion(files, { ...documents, THIRD_PARTY_NOTICES: "notices two" }));
});


test("embedded ports require notices and an audit when their package or source changes", () => {
  assert.ok(embeddedNotices().some((s) => /Earcut/.test(s.heading) && /ISC License/.test(s.body) && /2024, Mapbox/.test(s.body)));
  const dir = mkdtempSync(path.join(tmpdir(), "flies-embedded-"));
  try {
    mkdirSync(path.join(dir, "node_modules/pkg"), { recursive: true });
    writeFileSync(path.join(dir, "node_modules/pkg/package.json"), JSON.stringify({ version: "1" }));
    writeFileSync(path.join(dir, "node_modules/pkg/copied.js"), "copied code");
    writeFileSync(path.join(dir, "NOTICE"), "permission notice");
    const entry = { heading: "copied library", package: "pkg", version: "1", sources: [{ path: "copied.js", sha256: createHash("sha256").update("copied code").digest("hex") }], notices: [{ file: "NOTICE", url: "https://example.org/licence" }] };
    assert.match(embeddedNotices(dir, [entry])[0].body, /permission notice/);
    assert.throws(() => embeddedNotices(dir, [{ ...entry, notices: [] }]), /no notice/);
    assert.throws(() => embeddedNotices(dir, [{ ...entry, version: "2" }]), /licence audit/);
    writeFileSync(path.join(dir, "node_modules/pkg/copied.js"), "changed code");
    assert.throws(() => embeddedNotices(dir, [entry]), /Embedded code changed/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
