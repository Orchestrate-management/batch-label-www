/**
 * Serves dist/ the way Vercel serves it, so the prerender can be proved before it is
 * deployed rather than after.
 *
 * `vite preview` will not do: it has its own SPA fallback and knows nothing about
 * vercel.json, so it would answer /pricing correctly even if the deployed config would
 * not. This server reads the real vercel.json and routes through
 * scripts/vercel-routing.mjs, which is the same resolver the test suite asserts on.
 *
 *   node scripts/serve-dist.mjs [--port 4180]
 */

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { resolveRequest } from './vercel-routing.mjs';

const ROOT = resolve(process.cwd());
const DIST = join(ROOT, 'dist');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

export function loadVercelConfig(root = ROOT) {
  return JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
}

const fileExists = (relative) => {
  if (relative.includes('..')) return false;
  const full = join(DIST, relative);
  return existsSync(full) && statSync(full).isFile();
};

export function startServer({ port = 0, config = loadVercelConfig() } = {}) {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const result = resolveRequest(pathname, config, fileExists);

    if (result.kind === 'redirect') {
      response.writeHead(result.status, { location: result.location });
      response.end();
      return;
    }

    if (result.kind === 'function') {
      // Serverless functions are not part of dist/. Answering 501 rather than 404 keeps
      // the distinction visible: the route reached /api, which is what we want to prove.
      response.writeHead(501, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(`serverless function: ${result.file}\n`);
      return;
    }

    if (result.kind === 'notFound') {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('404\n');
      return;
    }

    const body = readFileSync(join(DIST, result.file));
    response.writeHead(200, {
      'content-type': TYPES[extname(result.file)] ?? 'application/octet-stream',
      'content-length': body.byteLength,
      'x-served-file': result.file
    });
    response.end(body);
  });

  return new Promise((resolveListening) => {
    server.listen(port, '127.0.0.1', () => {
      resolveListening({ server, port: server.address().port });
    });
  });
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('serve-dist.mjs');
if (invokedDirectly) {
  const portFlag = process.argv.indexOf('--port');
  const port = portFlag === -1 ? 4180 : Number(process.argv[portFlag + 1]);
  if (!existsSync(DIST)) {
    console.error('dist/ does not exist. Run `npm run build` first.');
    process.exit(1);
  }
  const { port: bound } = await startServer({ port });
  console.log(`Serving dist/ through vercel.json on http://127.0.0.1:${bound}`);
}
