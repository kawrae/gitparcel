import { cp, mkdtemp, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const work = await mkdtemp(path.join(root, '.gitparcel-build-'));
const next = path.join(work, 'next');
const previous = path.join(work, 'previous');
let hasPrevious = false;
let keepBackup = false;

try {
  await cp(path.join(root, 'public'), next, { recursive: true });
  try {
    await rename(dist, previous);
    hasPrevious = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    await rename(next, dist);
  } catch (error) {
    if (hasPrevious) {
      try {
        await rename(previous, dist);
      } catch (restoreError) {
        keepBackup = true;
        throw new AggregateError([error, restoreError], 'Previous build saved at ' + previous);
      }
    }
    throw error;
  }
} finally {
  if (!keepBackup) await rm(work, { recursive: true, force: true });
}
console.log('GitParcel static build written to dist/');
