/**
 * server.mjs — the loopback preview server for Tukang Jahit Langit.
 *
 *   node server.mjs            # http://127.0.0.1:8080/
 *   PORT=9000 node server.mjs
 *
 * Serves game/ on 127.0.0.1 only. A path that escapes game/ is refused with 403,
 * anything missing is 404, and / opens index.html.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname ?? process.cwd(), 'game');
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'content-type': type,
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(body);
}

/** The file a request path names inside root, or the status to refuse it with. */
export function resolveRequest(url, root = ROOT) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(url, 'http://127.0.0.1').pathname);
  } catch {
    return { status: 400 };
  }
  if (pathname.includes('\0')) return { status: 400 };
  if (pathname.endsWith('/')) pathname += 'index.html';
  const wanted = normalize(join(root, pathname));
  if (wanted !== root && !wanted.startsWith(root + sep)) return { status: 403 };
  return { path: wanted };
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'method not allowed\n');
    return;
  }
  const found = resolveRequest(req.url || '/');
  if (found.status) {
    send(res, found.status, found.status === 403 ? 'forbidden\n' : 'bad request\n');
    return;
  }
  try {
    const info = await stat(found.path);
    if (!info.isFile()) {
      send(res, 404, 'not found\n');
      return;
    }
    const body = await readFile(found.path);
    const type = TYPES[extname(found.path).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'content-type': type,
      'content-length': String(body.length),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    });
    if (req.method === 'HEAD') res.end();
    else res.end(body);
  } catch {
    send(res, 404, 'not found\n');
  }
});

if (process.env.SKIP_LISTEN !== '1') {
  server.listen(PORT, HOST, () => {
    console.log(`Tukang Jahit Langit on http://${HOST}:${PORT}/ (game/ only, loopback)`);
  });
}

export { server };
