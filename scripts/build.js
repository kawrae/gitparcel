import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
const dist = new URL('../dist/', import.meta.url);
await mkdir(dist, { recursive: true });
await cp(new URL('../public/', import.meta.url), dist, { recursive: true });
if (process.env.VERCEL_ENV === 'production') {
  const page = new URL('index.html', dist);
  const html = await readFile(page, 'utf8');
  const analytics = '<script defer src="/_vercel/insights/script.js"></script>';
  await writeFile(page, html.replace('</head>', analytics + '\n  </head>'));
}
console.log('GitParcel static build written to dist/');
