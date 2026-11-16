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
    ['README.md', `# Start\n[good](docs/other%20file.md#a-heading-1)\n[ref][target]\n[target]: docs/other%20file.md#named\n[code](scripts/real.ts#L2)\n\`scripts/real.ts\`\n\`package.json\`\nnpm run dev\n\`npm run brain:fetch\`\n<!-- docs-check: generated scripts/output.ts -->\n\`scripts/output.ts\`\n\n\`\`\`sh\n# Not a heading\n[not a link](missing.md)\n\`\`\`\n`],
  ]);
  try {
    for (const [file, contents] of files) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), contents);
    }
    assert.deepEqual(checkDocs(root, [...files.keys()]), []);
    writeFileSync(join(root, 'README.md'), `[bad](missing.md)\n[bad](docs/other%20file.md#missing)\n[bad][absent]\n[bad](scripts/real.ts#L90)\n\`scripts/gone.ts\`\n\`absent.json\`\n\`\`\`sh\nnpm run removed\n\`\`\`\n`);
    const errors = checkDocs(root, [...files.keys()]);
    for (const needle of ['missing link target', 'missing anchor', 'undefined link reference', 'missing line', 'scripts/gone.ts', 'absent.json', 'unknown npm script removed']) {
      assert.ok(errors.some(error => error.includes(needle)), `${needle}: ${errors.join('\n')}`);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('heading anchors follow punctuation, Unicode, repetition and fenced code', () => {
  assert.deepEqual([...anchors("# Fly's eyes\n# Fly's eyes\n# 日本語\nTitle\n=====\n~~~md\n# hidden\n~~~\n")], ['flys-eyes', 'flys-eyes-1', '日本語', 'title']);
});
