import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { DEFAULT_CONNECTOME_PATH } from '../packages/brain/src/node.ts';

test('the release probe can scale VUM partners without conflicting with plastic KC outputs', { skip: !existsSync(DEFAULT_CONNECTOME_PATH) }, () => {
  const output = execFileSync(process.execPath, ['packages/brain/scripts/modulation.ts', '--part', 'restless', '--seeds', '1,2,3', '--seconds', '0.032'], { encoding: 'utf8', timeout: 30_000 });
  assert.match(output, /learning off/);
  assert.match(output, /OA-VUMa1 to 8\s+\d+\.\d%, \d+\.\d%, \d+\.\d%/);
});
