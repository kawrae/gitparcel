import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { maxBundleBytes } from '../public/limits.js';

function limit(name, maximum) {
  const setting = 'GITPARCEL_ASSET_' + name;
  if (process.env[setting] === undefined) return maximum;
  const value = Number(process.env[setting]);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
    throw new RangeError(setting + ' must be an integer between 1 and ' + maximum);
  return value;
}

const maxBytes = limit('MAX_BYTES', maxBundleBytes);
const timeoutMs = limit('TIMEOUT_MS', 10 * 60_000);
const maxActive = limit('CONCURRENCY', 6);
const requestsPerHour = limit('REQUESTS_PER_HOUR', 60);
const hourMs = 60 * 60_000;
const starts = [];
let active = 0;

export async function serveAsset(req, res, owner, repo, id) {
  if (req.headers['sec-fetch-site'] === 'cross-site') {
    res.writeHead(403).end();
    return;
  }
  const now = Date.now();
  while (starts.length && starts[0] <= now - hourMs) starts.shift();
  if (starts.length >= requestsPerHour || active >= maxActive) {
    const retry =
      starts.length >= requestsPerHour ? Math.ceil((starts[0] + hourMs - now) / 1000) : 1;
    res.writeHead(429, { 'Retry-After': retry, 'Cache-Control': 'no-store' }).end();
    return;
  }
  starts.push(now);
  active++;
  const controller = new AbortController();
  const onClose = () => controller.abort();
  res.once('close', onClose);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const upstream =
      'https://api.github.com/repos/' + owner + '/' + repo + '/releases/assets/' + id + '?binary=1';
    const response = await fetch(upstream, {
      headers: { Accept: 'application/octet-stream', 'User-Agent': 'GitParcel' },
      signal: controller.signal,
    });
    if (!response.ok) {
      res.writeHead(response.status).end();
      return;
    }
    if (Number(response.headers.get('content-length')) > maxBytes) {
      res.writeHead(413).end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      'Content-Disposition': 'attachment',
    });
    if (!response.body) {
      res.end();
      return;
    }
    let bytes = 0;
    const byteLimit = new Transform({
      transform(chunk, encoding, callback) {
        bytes += chunk.byteLength;
        if (bytes > maxBytes) callback(new Error('Release asset exceeds the transfer limit'));
        else callback(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(response.body), byteLimit, res, { signal: controller.signal });
  } catch {
    if (!res.destroyed && !res.headersSent) res.writeHead(timedOut ? 504 : 502).end();
    else res.destroy();
  } finally {
    clearTimeout(timer);
    res.off('close', onClose);
    controller.abort();
    active--;
  }
}
