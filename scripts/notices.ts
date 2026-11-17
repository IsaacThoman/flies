// The registry is deliberately explicit: a dependency added to a shipping bundle needs an audit.
import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import type { Connect, Plugin } from "vite";

const ROOT = path.resolve(import.meta.dirname, "..");
export const NPM_NOTICES: Readonly<Record<string, string>> = { three: "LICENSE", vite: "LICENSE.md", ws: "LICENSE" };
export type Notice = { heading: string; body: string };

export function requireNotices(names: Iterable<string>, registry = NPM_NOTICES) {
  for (const name of names) if (!Object.hasOwn(registry, name) || !registry[name]) throw new Error(`Shipped dependency has no notice: ${name}`);
}

/** Installed production dependencies, including transitive dependencies. Workspaces are our own code. */
export function runtimeDependencies(root = ROOT): string[] {
  const names = new Set<string>();
  const visited = new Set<string>();
  const workspaces = new Map<string, string>();
  for (const group of ["apps", "packages"]) {
    const dir = path.join(root, group);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      const file = path.join(dir, entry, "package.json");
      if (fs.existsSync(file)) {
        const pkg = JSON.parse(fs.readFileSync(file, "utf8")) as { name?: string };
        if (pkg.name) workspaces.set(pkg.name, file);
      }
    }
  }
  const visit = (file: string) => {
    if (visited.has(file)) return;
    visited.add(file);
    const pkg = JSON.parse(fs.readFileSync(file, "utf8")) as {
      dependencies?: Record<string, string>; optionalDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>; peerDependenciesMeta?: Record<string, { optional?: boolean }>;
    };
    const dependencies = { ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies };
    for (const name of Object.keys(dependencies)) {
      const own = workspaces.get(name);
      if (own) { visit(own); continue; }
      const installed = path.join(root, "node_modules", name, "package.json");
      // Nested versions need a deliberate multi-version notice audit rather than the wrong root licence.
      const nested = path.join(path.dirname(file), "node_modules", name, "package.json");
      const optional = Object.hasOwn(pkg.optionalDependencies ?? {}, name) || pkg.peerDependenciesMeta?.[name]?.optional;
      if (optional && !fs.existsSync(installed) && !fs.existsSync(nested)) continue;
      names.add(name);
      if (nested !== installed && fs.existsSync(nested)) throw new Error(`Nested shipped dependency needs a notice audit: ${name}`);
      visit(installed);
    }
  };
  visit(path.join(root, "package.json"));
  visit(path.join(root, "apps/server/package.json"));
  return [...names].sort();
}

export type EmbeddedNotice = {
  heading: string; package: string; version: string;
  sources: { path: string; sha256: string }[];
  notices: { file: string; url: string }[];
};

/** A package's top-level licence cannot substitute for its embedded code's notices. */
export function embeddedNotices(root = ROOT, entries: readonly EmbeddedNotice[] = JSON.parse(fs.readFileSync(path.join(root, "docs/licenses/embedded.json"), "utf8"))): Notice[] {
  return entries.map((entry) => {
    const dir = path.join(root, "node_modules", entry.package);
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as { version: string };
    if (pkg.version !== entry.version) throw new Error(`Embedded code needs a licence audit: ${entry.package} ${pkg.version}`);
    for (const source of entry.sources) {
      const hash = createHash("sha256").update(fs.readFileSync(path.join(dir, source.path))).digest("hex");
      if (hash !== source.sha256) throw new Error(`Embedded code changed: ${entry.heading} (${source.path})`);
    }
    if (!entry.notices.length) throw new Error(`Embedded code has no notice: ${entry.heading}`);
    const body = entry.notices.map(({ file, url }) => {
      const text = fs.readFileSync(path.join(root, file), "utf8").trim();
      if (!text) throw new Error(`Embedded code has an empty notice: ${entry.heading}`);
      return `Source: ${url}\n\n${text}`;
    }).join("\n\n");
    return { heading: entry.heading, body };
  });
}

export function notices(): Notice[] {
  const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8").trim();
  requireNotices(runtimeDependencies());
  const result: Notice[] = JSON.parse(read("docs/licenses/credits.json"));
  for (const name of [...runtimeDependencies(), "vite"]) {
    const pkg = JSON.parse(read(`node_modules/${name}/package.json`)) as { version: string };
    const body = read(`node_modules/${name}/${NPM_NOTICES[name]}`);
    result.push({ heading: `${name} ${pkg.version}`, body: name === "vite" ? body.split("# Licenses of bundled dependencies")[0].trim() : body });
  }
  result.push(...embeddedNotices());
  const fdlibm = read("packages/brain-native/src/fdlibm.cpp");
  result.push({ heading: "fdlibm / V8", body: fdlibm.slice(fdlibm.indexOf("// The following is adapted"), fdlibm.indexOf("\n#include")).replace(/^\/\/ ?/gm, "").trim() });
  const sources: Record<string, string> = JSON.parse(read("docs/licenses/sources.json"));
  for (const [file, url] of Object.entries(sources)) result.push({ heading: file === "cc-by-4.0.txt" ? "CC BY 4.0 — legal terms" : file === "v8.txt" ? "V8 — BSD licence" : `WebAssembly runtime: ${file.replace(/\.txt$/, "")}`, body: `Source: ${url}\n\n${read(`docs/licenses/${file}`)}` });
  return result;
}

export function noticeText(sections = notices()): string {
  return "THIRD-PARTY NOTICES — flies\nGenerated by npm run notices; do not edit.\n\n" + sections.map((s) => `${s.heading}\n${"=".repeat(s.heading.length)}\n\n${s.body}\n`).join("\n");
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** All owner fields are public build inputs; an incomplete configuration publishes no policy. */
export function privacyHtml(env: NodeJS.ProcessEnv = process.env): string | null {
  const fields = ["FLIES_OPERATOR_NAME", "FLIES_CONTACT_EMAIL", "FLIES_SUPPORT_URL", "FLIES_MARKETING_URL"] as const;
  const values = fields.map((field) => env[field]?.trim() ?? "");
  if (values.some((value) => !value)) return null;
  const [operator, email, support, marketing] = values;
  for (let i = 0; i < values.length; i++) {
    if (/[<>]/.test(values[i]) || [...values[i]].some((char) => char.charCodeAt(0) < 32)) throw new Error(`${fields[i]} must be a completed public value, without placeholders`);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("FLIES_CONTACT_EMAIL must be an email address");
  for (const [field, value] of [["FLIES_SUPPORT_URL", support], ["FLIES_MARKETING_URL", marketing]]) {
    let url: URL;
    try { url = new URL(value); } catch { throw new Error(`${field} must be an HTTPS URL`); }
    if (url.protocol !== "https:" || url.username || url.password) throw new Error(`${field} must be an HTTPS URL without credentials`);
  }
  const markdown = fs.readFileSync(path.join(ROOT, "docs/privacy.md"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
  const body = markdown.trim().split(/\n\s*\n/).map((block) => {
    const heading = /^(#{1,3}) (.*)$/.exec(block);
    const inline = (s: string) => escape(s).replace(/\[([^\]]+)\]\((https:\/\/[^)]+)\)/g, '<a href="$2">$1</a>');
    return heading ? `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>` : `<p>${inline(block.replace(/\n/g, " "))}</p>`;
  }).join("\n");
  const published = body.replaceAll("&lt;operator name&gt;", escape(operator)).replaceAll("&lt;contact email&gt;", escape(email));
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Privacy — flies</title><style>body{font:18px/1.6 system-ui,sans-serif;max-width:42rem;margin:3rem auto;padding:0 1.2rem;color:#183b50;background:#fafcfd}h1,h2{line-height:1.2}a{color:#065f9a}</style><main>${published}<p><a href="${escape(support)}">Support</a> · <a href="${escape(marketing)}">Website</a></p></main></html>\n`;
}

export function bundledPackageNames(ids: Iterable<string>): Set<string> {
  const names = new Set<string>();
  for (const id of ids) {
    const matches = [...id.replace(/\\/g, "/").matchAll(/(?:^|\/)node_modules\/(@[^/]+\/[^/]+|[^/.][^/]*)/g)];
    if (matches.length) names.add(matches[matches.length - 1][1]);
  }
  return names;
}

export function shippedDependencyGuard(): Plugin {
  return {
    name: "fly-shipped-dependency-notices",
    generateBundle() { requireNotices(bundledPackageNames(this.getModuleIds())); },
  };
}

/** Also inspect the actual bundle: this catches imports from devDependencies and nested packages. */
export function releasePaperwork(): Plugin {
  const policy = privacyHtml();
  let base = "/";
  const serve = (read: () => string | null): Connect.NextHandleFunction => (req, res, next) => {
    const url = req.url?.split("?")[0];
    const relative = url?.startsWith(base) ? url.slice(base.length) : "";
    if (relative !== "privacy" && !relative.startsWith("privacy/")) return next();
    const html = /^(privacy|privacy\/|privacy\/index\.html)$/.test(relative) ? read() : null;
    if (html === null) { res.writeHead(404).end(); return; }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.end(req.method === "HEAD" ? undefined : html);
  };
  return {
    name: "fly-release-paperwork",
    configResolved(config) { base = config.base.startsWith("/") ? config.base : "/"; },
    configureServer(server) { server.middlewares.use(serve(() => policy)); },
    configurePreviewServer(server) {
      const file = path.resolve(server.config.root, server.config.build.outDir, "privacy/index.html");
      server.middlewares.use(serve(() => fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null));
    },
    buildStart() { checkGenerated(); },
    generateBundle() {
      requireNotices(bundledPackageNames(this.getModuleIds()));
      this.emitFile({ type: "asset", fileName: "THIRD_PARTY_NOTICES", source: noticeText() });
      if (policy !== null) this.emitFile({ type: "asset", fileName: "privacy/index.html", source: policy });
    },
  };
}

export function checkGenerated(write = false, root = ROOT) {
  const sections = notices();
  for (const [file, content] of Object.entries({
    THIRD_PARTY_NOTICES: noticeText(sections),
    "apps/web/src/ui/notices.json": `${JSON.stringify(sections, null, 2)}\n`,
  })) {
    const full = path.join(root, file);
    if (write) fs.writeFileSync(full, content);
    else if (!fs.existsSync(full) || fs.readFileSync(full, "utf8") !== content) throw new Error(`${file} is stale: run npm run notices`);
  }
}

if (import.meta.main) checkGenerated(!process.argv.includes("--check"));
