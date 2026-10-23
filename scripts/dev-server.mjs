// Local preview server. Serves the site with the same security headers as vercel.json.
// Usage: node scripts/dev-server.mjs [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.argv[2] || process.env.PORT || 5173);
const vercel = JSON.parse(await readFile(join(root, 'vercel.json'), 'utf8'));
const headers = Object.fromEntries((vercel.headers.find((h) => h.source === '/(.*)')?.headers || []).map((h) => [h.key, h.value]));
delete headers['Strict-Transport-Security']; // not meaningful on http://localhost
// other devices on the network reach this over plain http, so don't force https here
headers['Content-Security-Policy'] = headers['Content-Security-Policy'].replace(/;\s*upgrade-insecure-requests/, '');

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.mp4': 'video/mp4', '.txt': 'text/plain',
};
const blocked = [`${sep}supabase${sep}`, `${sep}scripts${sep}`, `${sep}.env`, `${sep}assets${sep}gen${sep}`];

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let path = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!path.startsWith(root) || blocked.some((b) => path.includes(b))) { res.writeHead(404).end('Not found'); return; }
    if ((await stat(path).catch(() => null))?.isDirectory()) path = join(path, 'index.html');
    const body = await readFile(path);
    const base = { ...headers, 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes' };
    // byte ranges, as browsers request for <video>
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m) {
      const start = m[1] ? Number(m[1]) : Math.max(body.length - Number(m[2]), 0);
      const end = m[1] && m[2] ? Math.min(Number(m[2]), body.length - 1) : body.length - 1;
      if (start > end || start >= body.length) { res.writeHead(416, { ...base, 'Content-Range': `bytes */${body.length}` }).end(); return; }
      res.writeHead(206, { ...base, 'Content-Range': `bytes ${start}-${end}/${body.length}`, 'Content-Length': end - start + 1 });
      res.end(body.subarray(start, end + 1));
      return;
    }
    res.writeHead(200, base);
    res.end(body);
  } catch {
    res.writeHead(404, headers).end('Not found');
  }
}).listen(port, '0.0.0.0', () => {
  console.log(`Dunston Precan preview on http://localhost:${port}`);
  for (const list of Object.values(networkInterfaces())) for (const a of list || []) {
    if (a.family === 'IPv4' && !a.internal) console.log(`  same Wi-Fi: http://${a.address}:${port}`);
  }
});
