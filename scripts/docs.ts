import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { marked } from 'marked';
import GithubSlugger from 'github-slugger';
import { decodeHTML } from 'entities';

function visible(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, match => match.replace(/[^\n]/g, ' '));
}

export function anchors(text: string): Set<string> {
  const found = new Set<string>();
  const slugger = new GithubSlugger();
  marked.walkTokens(marked.lexer(visible(text)), token => {
    if (token.type === 'heading') {
      const html = marked.parseInline(token.text, { async: false });
      found.add(slugger.slug(decodeHTML(html.replace(/<[^>]*>/g, ''))));
    } else if (token.type === 'html') {
      for (const tag of token.text.matchAll(/<[a-z][^>]*>/gi)) {
        for (const match of tag[0].matchAll(/\b(?:id|name)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)) {
          found.add(decodeHTML(match[1] ?? match[2] ?? match[3]));
        }
      }
    }
  });
  return found;
}

// These are literal path references; expressions, globs and placeholders are not files.
const FILE = /\.(?:md|[cm]?[jt]sx?|json|css|scss|py|c|cc|mm|cpp|hpp|h|swift|yml|yaml|sh|wasm|bin|html|webmanifest|png|svg|jpe?g|webp|avif|ico|woff2?|ttf|otf|csv|txt|gz|zip|plist|xcprivacy)(?:#.*)?$/i;
const PREFIX = /^(?:\.\.?\/|apps\/|packages\/|scripts\/|docs\/|assets\/|src\/|\.github\/)/;
const words = (text: string) => [...text.matchAll(/"([^"\n]*)"|'([^'\n]*)'|([^\s`]+)/g)].map(match => match[1] ?? match[2] ?? match[3]);

export function checkDocs(root: string, files: string[]): string[] {
  const errors = new Set<string>();
  const sourceFiles = files.map(file => file.replaceAll('\\', '/'));
  const paths = new Set(sourceFiles);
  for (const file of sourceFiles) {
    for (let dir = dirname(file); dir !== '.'; dir = dirname(dir)) paths.add(dir);
  }
  const has = (path: string) => paths.has(normalize(path).replace(/\/$/, ''));
  const mdAnchors = new Map<string, Set<string>>();
  const manifests = new Map<string, Record<string, string>>();
  const scriptsAt = (directory: string) => {
    const path = normalize(join(directory, 'package.json'));
    if (!has(path)) return null;
    if (!manifests.has(path)) manifests.set(path, JSON.parse(readFileSync(join(root, path), 'utf8')).scripts ?? {});
    return manifests.get(path)!;
  };
  for (const doc of sourceFiles.filter(file => file.endsWith('.md'))) {
    const raw = readFileSync(join(root, doc), 'utf8');
    const shown = visible(raw);
    const report = (at: number, message: string) => errors.add(`${doc}:${shown.slice(0, Math.max(0, at)).split('\n').length}: ${message}`);
    const generated = new Set([...raw.matchAll(/<!-- docs-check: (?:generated|external) (.+?) -->/g)].map(match => match[1]));
    const checkFile = (token: string, at: number) => {
      if (/^(?:node|npm|git)\s/.test(token) || /\s--/.test(token) || /^\.[^./]+$/.test(token)) return;
      if (/[<>{}*|=():?]/.test(token) || token.startsWith('/') || token.startsWith('--')) return;
      if (!PREFIX.test(token) && !FILE.test(token)) return;
      if (generated.has(token)) return;
      const clean = token.replace(/#.*$/, '').replace(/\/$/, '');
      if (!has(clean) && !has(normalize(join(dirname(doc), clean)))) report(at, `missing file reference ${token}`);
    };
    const checkLink = (url: string, at: number) => {
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url)) return;
      const [beforeHash, ...hash] = url.split('#');
      let path: string, fragment: string;
      try {
        path = decodeURIComponent(beforeHash.split('?')[0]);
        fragment = decodeURIComponent(hash.join('#'));
      } catch { report(at, `invalid URL ${url}`); return; }
      let target = path ? resolve(root, path.startsWith('/') ? `.${path}` : join(dirname(doc), path)) : resolve(root, doc);
      const rel = relative(root, target);
      // A local build artifact must not conceal a broken source link.
      if (rel === '..' || rel.startsWith('../') || !has(rel) || !existsSync(target)) {
        report(at, `missing link target ${url}`); return;
      }
      if (!fragment) return;
      if (statSync(target).isDirectory()) {
        target = join(target, 'README.md');
        if (!has(relative(root, target)) || !existsSync(target)) { report(at, `cannot verify directory anchor ${url}`); return; }
      }
      if (/\.md$/i.test(target)) {
        if (!mdAnchors.has(target)) mdAnchors.set(target, anchors(readFileSync(target, 'utf8')));
        if (!mdAnchors.get(target)!.has(fragment)) report(at, `missing anchor ${url}`);
      } else if (/^L\d+(?:-L\d+)?$/.test(fragment)) {
        const lines = fragment.split('-').map(line => Number(line.slice(1)));
        const content = readFileSync(target, 'utf8');
        const count = content ? content.split('\n').length - Number(content.endsWith('\n')) : 0;
        if (lines.some(line => line < 1 || line > count) || lines[0] > lines.at(-1)!) report(at, `missing line ${url}`);
      } else report(at, `cannot verify anchor ${url}`);
    };
    const checkCommands = (command: string, base = 0) => {
      for (const match of command.matchAll(/\b(node|npm)\s+([^\n`;&|]+)/g)) {
        const args = words(match[2]);
        if (match[1] === 'node') {
          if (args.includes('-e') || args.includes('--eval') || args.includes('-p') || args.includes('--print')) continue;
          for (const arg of args.filter(arg => !arg.startsWith('-'))) {
            if (FILE.test(arg)) { checkFile(arg, base + match.index); break; }
          }
        } else {
          const run = args.findIndex(arg => arg === 'run' || arg === 'run-script');
          if (run < 0 || (run > 0 && !args[0].startsWith('-'))) continue;
          const valued = new Set(['--prefix', '-C', '--workspace', '-w', '--loglevel', '--userconfig', '--cache', '--registry']);
          let name: string | undefined;
          for (let i = run + 1; i < args.length; i++) {
            if (valued.has(args[i])) { i++; continue; }
            if (!args[i].startsWith('-')) { name = args[i]; break; }
          }
          if (!name || !/^[\w:-]+$/.test(name)) continue;
          const prefix = args.findIndex(arg => arg === '--prefix' || arg === '-C' || arg === '--workspace' || arg === '-w');
          const directory = prefix >= 0 ? args[prefix + 1] : args.find(arg => arg.startsWith('--prefix=') || arg.startsWith('--workspace='))?.split('=').slice(1).join('=') ?? '.';
          const scripts = scriptsAt(directory);
          if (!scripts) report(base + match.index, `missing npm package ${directory}/package.json`);
          else if (!Object.hasOwn(scripts, name)) report(base + match.index, `unknown npm script ${name}`);
        }
      }
    };
    checkCommands(shown);
    marked.walkTokens(marked.lexer(shown), token => {
      const at = shown.indexOf(token.raw);
      if (token.type === 'link' || token.type === 'image') checkLink(token.href, at);
      else if (token.type === 'codespan') { checkFile(token.text, at); checkCommands(token.text, at); }
      else if (token.type === 'html') {
        for (const tag of token.text.matchAll(/<[a-z][^>]*>/gi)) {
          for (const match of tag[0].matchAll(/\b(?:href|src)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)) {
            checkLink(decodeHTML(match[1] ?? match[2] ?? match[3]), at);
          }
        }
      } else if (token.type === 'text' && !token.tokens) {
        // Explicit reference syntax with no definition is usually a deleted destination.
        for (const match of token.raw.matchAll(/\[([^\]\n]+)\]\[([^\]\n]*)\]/g)) report(at, `undefined link reference ${match[2] || match[1]}`);
      }
    });
    for (const match of shown.matchAll(/(?<![\w./-])(?:\.\.?\/|apps\/|packages\/|scripts\/|docs\/|assets\/|\.github\/)[\w./-]+\.[\w]+\b/g)) {
      if (!/[<{*-]/.test(shown[match.index + match[0].length] ?? '')) checkFile(match[0], match.index);
    }
  }
  return [...errors];
}

export function repositoryDocs(root: string): string[] {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
    .trim().split('\n').filter(Boolean);
}
