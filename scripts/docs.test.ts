import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anchors, checkDocs, repositoryDocs } from './docs.ts';

test('repository documentation links, file references and npm scripts', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  assert.deepEqual(checkDocs(root, repositoryDocs(root)), []);
});

test('documentation checks reject rot and accept valid local references', () => {
  const root = mkdtempSync(join(tmpdir(), 'flies-docs-'));
  const files = new Map([
    ['package.json', JSON.stringify({ scripts: { dev: 'vite', 'brain:fetch': 'fetch' } })],
    ['scripts/real.ts', 'line one\nline two\n'],
    ['docs/other file.md', '# A heading\n# A heading\n<a id="named"></a>\n'],
    ['docs/README.md', '# Directory\n'],
    ['README.md', `# Start\n[good](docs/other%20file.md#a-heading-1)\n[ref][target]\n\n[target]: docs/other%20file.md#named\n[code](scripts/real.ts#L2)\n\`scripts/real.ts\`\n\`package.json\`\nnpm run dev\n\`npm run brain:fetch\`\n<!-- docs-check: generated scripts/output.ts -->\n\`scripts/output.ts\`\n\n\`\`\`sh\n# Not a heading\n[not a link](missing.md)\n\`\`\`\n`],
  ]);
  try {
    for (const [file, contents] of files) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), contents);
    }
    assert.deepEqual(checkDocs(root, [...files.keys()]), []);
    writeFileSync(join(root, 'README.md'), '[directory](docs/#directory)\n<!--\n[unused](gone.md)\nnpm run unused\n-->\n``scripts/real.ts``\n');
    assert.deepEqual(checkDocs(root, [...files.keys()]), []);
    writeFileSync(join(root, 'README.md'), `[bad](missing.md)\n[bad](docs/other%20file.md#missing)\n[bad][absent]\n[bad](scripts/real.ts#L90)\n\`scripts/gone.ts\`\n\`absent.json\`\n\`\`\`sh\nnpm run removed\n\`\`\`\n`);
    const errors = checkDocs(root, [...files.keys()]);
    for (const needle of ['missing link target', 'missing anchor', 'undefined link reference', 'missing line', 'scripts/gone.ts', 'absent.json', 'unknown npm script removed']) {
      assert.ok(errors.some(error => error.includes(needle)), `${needle}: ${errors.join('\n')}`);
    }
    writeFileSync(join(root, 'README.md'), '[directory](docs/#absent)\n[zero](scripts/real.ts#L0)\n[reversed](scripts/real.ts#L2-L1)\n``src/absent.ts``\n```sh\nnode ./scripts/absent.ts\n```\n');
    const more = checkDocs(root, [...files.keys()]);
    for (const needle of ['docs/#absent', '#L0', '#L2-L1', 'src/absent.ts', 'scripts/absent.ts']) {
      assert.ok(more.some(error => error.includes(needle)), `${needle}: ${more.join('\n')}`);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('heading anchors follow punctuation, Unicode, repetition and fenced code', () => {
  assert.deepEqual([...anchors("# Fly's eyes\n# Fly's eyes\n# 日本語\nTitle\n=====\n~~~md\n# hidden\n~~~\n<!--\n# Also hidden\n-->\n")], ['flys-eyes', 'flys-eyes-1', '日本語', 'title']);
});

test('parsed Markdown and command checks reject independent review counterexamples', () => {
  const root = mkdtempSync(join(tmpdir(), 'flies-docs-syntax-'));
  const files = new Map([
    ['package.json', JSON.stringify({ scripts: { dev: 'vite' } })],
    ['packages/local/package.json', JSON.stringify({ name: '@fly/local', scripts: { local: 'node index.ts' } })],
    ['scripts/a file.ts', 'export {};\n'],
    ['elsewhere/context.ts', 'export {};\n'],
    ['README.md', ''],
  ]);
  try {
    for (const [file, contents] of files) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), contents);
    }
    const cases: [string, string | null][] = [
      ['npm run toString', 'unknown npm script toString'],
      ['npm run missing.script', 'unknown npm script missing.script'],
      ['npm --silent run gone', 'unknown npm script gone'],
      ['`npm run\ngone`', 'unknown npm script gone'],
      ['npm run-script gone', 'unknown npm script gone'],
      ['npm --prefix packages/local run gone', 'unknown npm script gone'],
      ['npm run --prefix packages/local gone', 'unknown npm script gone'],
      ['npm --prefix packages/local run local', null],
      ['npm --workspace @fly/local run local', null],
      ['npm --workspace @fly/local run gone', 'unknown npm script gone'],
      ['`scripts/a file.ts#L2`', 'missing line scripts/a file.ts#L2'],
      ['npm --silent run dev', null],
      ['```sh\nnode ./gone.ts\n```', 'missing file reference ./gone.ts'],
      ['```sh\nnode "./gone file.ts"\n```', 'missing file reference ./gone file.ts'],
      ['`scripts/gone file.ts`', 'missing file reference scripts/gone file.ts'],
      ['`missing.svg`', 'missing file reference missing.svg'],
      ['`missing.py`', 'missing file reference missing.py'],
      ['`context.ts`', 'missing file reference context.ts'],
      ['<!-- docs-check: base elsewhere -->\n`context.ts`', null],
      ['`scripts/a file.ts`\n```sh\nnode "scripts/a file.ts"\n```', null],
      ['`id="pretend"`\n[anchor](#pretend)', 'missing anchor #pretend'],
      ['[**nested label**](absent.md)', 'missing link target absent.md'],
      ['[phantom line](scripts/a%20file.ts#L2)', 'missing line scripts/a%20file.ts#L2'],
      ['# A &copy; B\n[entity](#a--b)', null],
      ['> # Quoted heading\n\n[quote](#quoted-heading)', null],
      ['    [literal code](absent.md)\n', null],
      ['<a id = "real"></a>\n[anchor](#real)', null],
    ];
    for (const [content, expected] of cases) {
      writeFileSync(join(root, 'README.md'), content);
      const errors = checkDocs(root, [...files.keys()]);
      if (expected) assert.ok(errors.some(error => error.includes(expected)), `${content}: ${errors.join('\n')}`);
      else assert.deepEqual(errors, [], content);
    }
    mkdirSync(join(root, 'node_modules/example'), { recursive: true });
    writeFileSync(join(root, 'node_modules/example/source.ts'), 'export {};');
    writeFileSync(join(root, 'README.md'), '`node_modules/example/source.ts`');
    assert.deepEqual(checkDocs(root, [...files.keys()]), []);
    writeFileSync(join(root, 'README.md'), '`node_modules/example/missing.ts`');
    assert.ok(checkDocs(root, [...files.keys()]).some(error => error.includes('missing.ts')));
    writeFileSync(join(root, 'ignored.ts'), 'exists only as local output');
    writeFileSync(join(root, 'README.md'), '[output](ignored.ts)');
    assert.ok(checkDocs(root, [...files.keys()]).some(error => error.includes('missing link target ignored.ts')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
