// node scripts/checkCompose.ts: compose.yaml stays deployable by Coolify, for
// production and previews side by side (docs/deploy.md#coolify), and the plain
// `docker compose` path keeps its port and image names.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface Service {
  build?: { args?: Record<string, string> };
  image?: string;
  container_name?: string;
  ports?: { target: number; published: string }[];
  expose?: string[];
  environment?: Record<string, string>;
  healthcheck?: { disable?: boolean; test?: string[] };
  volumes?: { type: string; source: string; target: string }[];
}
interface Compose {
  services: Record<string, Service>;
  volumes?: Record<string, { name?: string; external?: boolean }>;
}

// Shell variables beat env files, and COMPOSE_FILE can bypass default discovery.
const variables = ["SERVICE_URL_WEB", "FLY_SITE_URL", "TRUSTED_PROXIES", "CLIENT_IP_HEADERS", "ROOMS_PORT", "ROOMS_HOST", "HTTP_PORT"];
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !variables.includes(key) && !key.startsWith("COMPOSE_")));
const temp = mkdtempSync(join(tmpdir(), "fly-check-compose-"));
function config(coolify: boolean, values: Record<string, string> = {}): Compose {
  const envFile = join(temp, "compose.env");
  writeFileSync(envFile, Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}\n`).join(""));
  // Normalization invents volume names; we must reject only names set in the source.
  return JSON.parse(execFileSync("docker", [
    "compose", "--env-file", envFile, ...(coolify ? ["-f", "compose.yaml"] : []),
    "config", "--format", "json", "--no-normalize",
  ], { env, encoding: "utf8" })) as Compose;
}

try {
  const coolify = config(true);
  for (const [name, service] of Object.entries(coolify.services)) {
    assert.ok(!("ports" in service), `Coolify: ${name} must not publish host ports`);
    assert.ok(!("container_name" in service), `Coolify: ${name} must not set container_name`);
    if (service.build) assert.ok(!("image" in service), `Coolify: built service ${name} must not fix an image tag`);
  }
  assert.ok(coolify.services.web?.expose?.includes("80"), "Coolify: web must expose port 80");
  for (const name of ["web", "rooms"]) {
    const health = coolify.services[name]?.healthcheck;
    assert.ok(health?.test?.length && !health.disable && health.test[0] !== "NONE", `Coolify: ${name} needs an enabled healthcheck`);
  }
  assert.ok(coolify.services.rooms.volumes?.some(v => v.type === "volume" && v.source === "rooms_data" && v.target === "/data"), "Coolify: rooms must mount rooms_data at /data");
  for (const [name, volume] of Object.entries(coolify.volumes ?? {})) {
    assert.ok(!("name" in volume) && !("external" in volume), `Coolify: volume ${name} must not set name or external`);
  }

  const previewUrl = "https://flies-pr-7.example.test";
  for (const siteUrl of ["", "https://flies.example.test/"]) {
    const values: Record<string, string> = { SERVICE_URL_WEB: previewUrl };
    if (siteUrl) values.FLY_SITE_URL = siteUrl;
    const args = config(true, values).services.web.build?.args;
    assert.equal(args?.SERVICE_URL_WEB, previewUrl, "Coolify: SERVICE_URL_WEB build arg must carry the preview URL");
    assert.equal(args?.FLY_SITE_URL, siteUrl, "Coolify: FLY_SITE_URL build arg must be empty unless explicitly set");
  }

  const trusted = "203.0.113.7/32 10.0.0.0/8";
  const runtime = config(true, { TRUSTED_PROXIES: trusted, ROOMS_PORT: "3100" }).services;
  assert.equal(runtime.web.environment?.TRUSTED_PROXIES, trusted, "web must honor TRUSTED_PROXIES from the env file");
  assert.equal(runtime.web.environment?.ROOMS_PORT, "3100", "web must honor ROOMS_PORT from the env file");
  assert.equal(runtime.rooms.environment?.PORT, "3100", "rooms PORT must follow ROOMS_PORT from the env file");
  assert.equal(runtime.rooms.environment?.TRUST_PROXY, "1", "rooms must trust the web proxy");

  for (const port of ["8080", "18080"]) {
    const plain = config(false, port === "8080" ? {} : { HTTP_PORT: port }).services;
    assert.ok(plain.web.ports?.some(p => p.target === 80 && p.published === port), `Plain Compose: web must publish 80 on host ${port}`);
    assert.equal(plain.web.image, "flies-web:local", "Plain Compose: web image must be flies-web:local");
    assert.equal(plain.rooms.image, "flies-rooms:local", "Plain Compose: rooms image must be flies-rooms:local");
    assert.ok(!plain.rooms.ports?.length, "Plain Compose: rooms must not publish host ports");
  }
  console.log("Compose checks passed (Coolify and plain hosting)");
} catch (error) {
  console.error(`Compose check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  rmSync(temp, { recursive: true, force: true });
}
