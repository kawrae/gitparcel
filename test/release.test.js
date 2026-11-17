import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadFile } from '../public/github.js';

test('falls back to the local public-asset endpoint when GitHub blocks a browser read', async t => {
  const file = { kind: 'release', id: 'cli/cli/releases/assets/123', repo: 'cli/cli', assetId: 123,
    size: 3, name: 'example', url: 'https://api.github.com/repos/cli/cli/releases/assets/123?download=1',
    browserUrl: 'https://github.com/cli/cli/releases/download/sample/example' };
  t.mock.method(globalThis, 'fetch', async url => {
    if (url === '/api/assets/cli/cli/123') return new Response(new Uint8Array([1, 2, 3]));
    throw new TypeError('Failed to fetch');
  });
  const data = await downloadFile(file, new AbortController().signal, () => {});
  assert.deepEqual([...data], [1, 2, 3]);
});
