import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { serveAsset } from './asset-proxy.js';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const portArg = process.argv.indexOf('--port');
const port = Number(process.env.PORT || (portArg > 0 && process.argv[portArg + 1]) || 4173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const asset = /^\/api\/assets\/([a-z\d_-]+)\/([a-z\d_.-]+)\/(\d+)$/i.exec(pathname);
    if (asset && req.method === 'GET' && !['.', '..'].includes(asset[2])) {
      await serveAsset(req, res, asset[1], asset[2], asset[3]);
      return;
    }
    const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!filename.startsWith(root) || !['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(404).end();
      return;
    }
    const body = await readFile(filename);
    res.writeHead(200, {
      'Content-Type': types[path.extname(filename)] || 'application/octet-stream',
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
