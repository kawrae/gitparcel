import test from 'node:test';
import assert from 'node:assert/strict';
import { createZip, uniquePath } from '../public/archive.js';
import { parseSource } from '../public/github.js';

test('keeps both files when flat paths collide, including case variants', () => {
  const used = new Set();
  assert.equal(uniquePath('docs/Readme.md', used, true), 'Readme.md');
  assert.equal(uniquePath('src/README.md', used, true), 'README (2).md');
});

test('archive entries cannot traverse parent directories', () => {
  const path = uniquePath('../x/../../unsafe.txt', new Set(), false);
  assert.ok(!path.split('/').includes('..'));
});

test('writes ZIP records with UTF-8 filenames and the correct CRC', async () => {
  const zip = await createZip([{ name: 'café.txt', data: new TextEncoder().encode('123456789') }]);
  const view = new DataView(await zip.arrayBuffer());
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(14, true), 0xcbf43926);
  assert.equal(view.getUint16(6, true), 0x800);
  assert.equal(view.getUint32(view.byteLength - 22, true), 0x06054b50);
});

test('recognizes repository, nested folder and release links', () => {
  assert.equal(parseSource('octocat/Hello-World', 'folder').repo, 'octocat/Hello-World');
  assert.deepEqual(parseSource('https://github.com/org/repo/tree/main/a/b', 'folder').tail, ['main','a','b']);
  assert.equal(parseSource('github.com/org/repo/releases/tag/v1', 'release').tag, 'v1');
  assert.throws(() => parseSource('https://example.com/org/repo', 'folder'));
  assert.throws(() => parseSource('github.com/org/repo/blob/main/file', 'folder'));
});
