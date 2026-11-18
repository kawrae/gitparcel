import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const portArg = process.argv.indexOf('--port');
const port = Number(process.env.PORT || (portArg > 0 && process.argv[portArg + 1]) || 4173);
const types = {
  '.html': 'text/html',
  '.json': 'application/json',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
};
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const asset = /^\/api\/assets\/([a-z\d_-]+)\/([a-z\d_.-]+)\/(\d+)$/i.exec(pathname);
    if (asset && req.method === 'GET' && !['.', '..'].includes(asset[2])) {
      if (req.headers['sec-fetch-site'] === 'cross-site') {
        res.writeHead(403).end();
        return;
      }
      const upstream =
        'https://api.github.com/repos/' +
        asset[1] +
        '/' +
        asset[2] +
        '/releases/assets/' +
        asset[3] +
        '?binary=1';
      const controller = new AbortController();
      res.on('close', () => controller.abort());
      try {
        const response = await fetch(upstream, {
          headers: { Accept: 'application/octet-stream', 'User-Agent': 'GitParcel' },
          signal: controller.signal,
        });
        if (!response.ok) {
          await response.body?.cancel();
          res.writeHead(response.status).end();
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store',
          'Content-Disposition': 'attachment',
        });
        await pipeline(Readable.fromWeb(response.body), res);
      } catch {
        if (!res.headersSent) res.writeHead(502).end();
        else res.destroy();
      }
      return;
    }
    const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!filename.startsWith(root) || !['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(404).end();
      return;
    }
    const body = await readFile(filename);
    res.writeHead(200, {
      'Content-Type':
        (types[path.extname(filename)] || 'application/octet-stream') + '; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log('GitParcel running at http://127.0.0.1:' + server.address().port),
);
