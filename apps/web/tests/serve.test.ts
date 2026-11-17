import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";

async function site(t: TestContext, relative = false, base = "/") {
  const dir = mkdtempSync(path.join(tmpdir(), "flies-serve-"));
  const root = path.join(dir, "site");
  mkdirSync(root);
  mkdirSync(path.join(dir, "site-secret"));
  writeFileSync(path.join(dir, "site-secret", "secret"), "secret");
  writeFileSync(path.join(root, "index.html"), "0123456789");
  writeFileSync(path.join(root, "empty"), "");
  const child = fork(path.join(import.meta.dirname, "fixtures/serve-site.ts"), [relative ? path.relative(process.cwd(), root) : root, base], { stdio: ["ignore", "pipe", "pipe", "ipc"] });
  let diagnostics = "";
  child.stderr!.on("data", (chunk) => { diagnostics += chunk; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGKILL");
      await exited;
    }
    rmSync(dir, { recursive: true, force: true });
  });
  const [url] = await once(child, "message");
  const request = (file = "/", range?: string, method = "GET") => new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const req = http.request(new URL(String(url)), { path: file, method, headers: range ? { Range: range } : {} }, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body }));
      res.on("error", reject);
    });
    req.on("error", (error) => reject(new Error(`${error.message}\n${diagnostics}`)));
    req.end();
  });
  return { request };
}

test("relative --dir serves the requested folder", async (t) => {
  const { request } = await site(t, true);
  assert.equal((await request()).body, "0123456789");
});

for (const file of ["/%GG", "/%E0%A4%A", "http://["]) {
  test(`a malformed URL ${file} is rejected without killing the server`, async (t) => {
    const { request } = await site(t);
    assert.equal((await request(file)).status, 400);
    assert.equal((await request()).status, 200);
  });
}

test("oversized suffix ranges return the whole file and keep serving", async (t) => {
  const { request } = await site(t);
  for (const range of ["bytes=-100", `bytes=-${"9".repeat(400)}`]) {
    const response = await request("/", range);
    assert.equal(response.status, 206);
    assert.equal(response.body, "0123456789");
    assert.equal(response.headers["content-range"], "bytes 0-9/10");
    assert.equal((await request()).status, 200);
  }
});

test("ranges, empty files and encoded traversal stay within the served folder", async (t) => {
  const { request } = await site(t);
  assert.equal((await request("/..%2fsite-secret/secret")).status, 404);
  assert.equal((await request("/", "bytes=2-4")).body, "234");
  assert.equal((await request("/", "bytes=-2")).body, "89");
  assert.equal((await request("/", "bytes=8-100")).body, "89");
  for (const range of ["bytes=10-", "bytes=4-2", "bytes=-0"]) assert.equal((await request("/", range)).status, 416);
  assert.equal((await request("/", "bytes=-")).status, 200);
  assert.equal((await request("/", "bytes=1-2", "HEAD")).body, "");
  assert.equal((await request("/empty")).status, 200);
  assert.equal((await request("/empty", "bytes=-2")).status, 416);
});


test("an encoded base path is removed before decoding the file path", async (t) => {
  const { request } = await site(t, false, "/my%20site/");
  assert.equal((await request("/my%20site/")).body, "0123456789");
  assert.equal((await request("/my%20site/index.html")).body, "0123456789");
  assert.equal((await request("/my%20site/%GG")).status, 400);
});
