import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';

function visible(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, match => match.replace(/[^\n]/g, ' '));
}

function prose(text: string): string {
  let fence = '';
  return text.split('\n').map(line => {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker && (!fence || (marker[0] === fence[0] && marker.length >= fence.length))) {
      fence = fence ? '' : marker;
      return '';
    }
    return fence ? '' : line;
  }).join('\n');
}

export function anchors(text: string): Set<string> {
  const found = new Set<string>();
  const counts = new Map<string, number>();
  const body = prose(visible(text));
  for (const match of body.matchAll(/(?:^|\n) {0,3}#{1,6}\s+(.+)|(?:^|\n)([^\n]+)\n {0,3}(?:=+|-+)\s*(?=\n|$)/g)) {
    const title = (match[1] ?? match[2]).replace(/\s+#+\s*$/, '')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&(?:lt|gt|quot);/g, '')
      .toLowerCase().replace(/[^\p{L}\p{M}\p{N}_\-\s]/gu, '').replace(/\s/g, '-');
    const n = counts.get(title) ?? 0;
    let slug = n ? `${title}-${n}` : title;
    let next = n;
    while (found.has(slug)) slug = `${title}-${++next}`;
    counts.set(title, next + 1);
    found.add(slug);
  }
  for (const match of body.matchAll(/\b(?:id|name)\s*=\s*["']([^"']+)["']/g)) found.add(match[1]);
  return found;
}

export function checkDocs(root: string, files: string[]): string[] {
  const errors: string[] = [];
  const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts ?? {};
  const sourceFiles = files.map(file => file.replaceAll('\\', '/'));
  const mdAnchors = new Map<string, Set<string>>();
  // Ignored build output must not make a stale source reference pass locally.
  const has = (path: string) => sourceFiles.some(file => file === path || file.startsWith(`${path.replace(/\/$/, '')}/`));
  for (const doc of sourceFiles.filter(file => file.endsWith('.md'))) {
    const raw = readFileSync(join(root, doc), 'utf8');
    const shown = visible(raw);
    const body = prose(shown);
    const links = body.replace(/(`+)([\s\S]*?)\1/g, match => match.replace(/[^\n]/g, ' '));
    const report = (at: number, message: string) => {
      const line = body.slice(0, at).split('\n').length;
      errors.push(`${doc}:${line}: ${message}`);
    };
    const checkLink = (url: string, at: number) => {
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url)) return;
      let decoded: string;
      try { decoded = decodeURIComponent(url); } catch { report(at, `invalid URL ${url}`); return; }
      const [pathQuery, fragment] = decoded.split('#');
      const path = pathQuery.split('?')[0];
      let target = path ? resolve(root, path.startsWith('/') ? `.${path}` : join(dirname(doc), path)) : resolve(root, doc);
      if (relative(root, target).startsWith('..') || !existsSync(target)) {
        report(at, `missing link target ${url}`); return;
      }
      if (!fragment) return;
      if (statSync(target).isDirectory()) {
        target = join(target, 'README.md');
        if (!existsSync(target)) { report(at, `cannot verify directory anchor ${url}`); return; }
      }
      if (/\.md$/i.test(target)) {
        if (!mdAnchors.has(target)) mdAnchors.set(target, anchors(readFileSync(target, 'utf8')));
        if (!mdAnchors.get(target)!.has(fragment)) report(at, `missing anchor ${url}`);
      } else if (/^L\d+(?:-L\d+)?$/.test(fragment)) {
        const lines = fragment.split('-').map(line => Number(line.slice(1)));
        const count = readFileSync(target, 'utf8').split('\n').length;
        if (lines.some(line => line < 1 || line > count) || lines[0] > lines.at(-1)!) report(at, `missing line ${url}`);
      } else report(at, `cannot verify anchor ${url}`);
    };
    const definitions = new Map<string, string>();
    const key = (label: string) => label.trim().replace(/\s+/g, ' ').toLowerCase();
    for (const match of links.matchAll(/^ {0,3}\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))/gm)) {
      definitions.set(key(match[1]), match[2] ?? match[3]);
      checkLink(match[2] ?? match[3], match.index);
    }
    // Balanced parentheses occur in real file names and heading fragments.
    for (const match of links.matchAll(/!?\[[^\]\n]*\]\(/g)) {
      const start = match.index + match[0].length;
      let end = start, depth = 1;
      for (; end < body.length && depth; end++) {
        if (body[end] === '\\') { end++; continue; }
        if (body[end] === '(') depth++;
        if (body[end] === ')') depth--;
      }
      if (depth) { report(match.index, 'unclosed Markdown link'); continue; }
      const destination = body.slice(start, end - 1).trim();
      const url = destination.startsWith('<') ? destination.slice(1, destination.indexOf('>')) : destination.split(/\s+["']/)[0];
      checkLink(url.replace(/\\([()])/g, '$1'), match.index);
    }
    for (const match of links.matchAll(/!?\[([^\]\n]+)\](?:\[([^\]\n]*)\])?(?!\(|:)/g)) {
      const label = key(match[2] || match[1]);
      if (definitions.has(label)) checkLink(definitions.get(label)!, match.index);
      else if (match[2] !== undefined) report(match.index, `undefined link reference ${label}`);
    }
    for (const match of links.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)) checkLink(match[1], match.index);
    const generated = [...raw.matchAll(/<!-- docs-check: (?:generated|external) (.+?) -->/g)].map(match => match[1]);
    for (const match of body.matchAll(/(?<!`)(`+)([^`\n]+)\1(?!`)/g)) {
      const token = match[2];
      if (/\s|[<>{}*|=():?]/.test(token) || token.startsWith('/') || token.startsWith('--')) continue;
      if (!/^(?:\.?\.?\/|apps\/|packages\/|scripts\/|docs\/|assets\/|\.github\/)/.test(token)
          && !/^[\w./-]+\.(?:md|ts|js|mjs|json|mm|cpp|hpp|h|swift|yml|yaml|sh|wasm|bin|html|webmanifest|png|csv|txt|gz|xcprivacy)$/.test(token)) continue;
      const clean = token.replace(/#.*$/, '').replace(/\/$/, '');
      if (generated.includes(token)) continue;
      if (has(clean) || has(normalize(join(dirname(doc), clean)))) continue;
      if (!clean.includes('/') && sourceFiles.some(file => file.endsWith(`/${clean}`))) continue;
      report(match.index, `missing file reference ${token}`);
    }
    for (const match of shown.matchAll(/(?<![\w./-])(?:apps|packages|scripts|docs|assets|\.github)\/[\w./-]+\.(?:md|ts|js|mjs|json|mm|cpp|hpp|h|swift|yml|yaml|sh|wasm|bin)\b/g)) {
      const path = match[0];
      if (!has(path) && !has(normalize(join(dirname(doc), path))) && !generated.includes(path)) {
        const line = raw.slice(0, match.index).split('\n').length;
        const message = `${doc}:${line}: missing file reference ${path}`;
        if (!errors.includes(message)) errors.push(message);
      }
    }
    for (const match of shown.matchAll(/\bnpm\s+run\s+(?:(?:--silent|-s)\s+)?([\w:-]+)/g)) {
      if (!(match[1] in scripts)) {
        const line = raw.slice(0, match.index).split('\n').length;
        errors.push(`${doc}:${line}: unknown npm script ${match[1]}`);
      }
    }
  }
  return errors;
}

export function repositoryDocs(root: string): string[] {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
    .trim().split('\n').filter(Boolean);
}
