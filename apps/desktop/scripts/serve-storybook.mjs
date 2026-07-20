import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { URL } from 'node:url';

const host = '127.0.0.1';
const port = 6006;
const staticRoot = resolve('storybook-static');

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

if (!existsSync(staticRoot)) {
  throw new Error(`Storybook build is missing: ${staticRoot}`);
}

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', `http://${host}`).pathname);
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = resolve(join(staticRoot, normalize(requestedPath).replace(/^[/\\]+/, '')));

  if (!filePath.startsWith(`${staticRoot}${sep}`) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Type': mimeTypes[extname(filePath)] ?? 'application/octet-stream',
  });
  createReadStream(filePath).pipe(response);
}).listen(port, host, () => {
  console.log(`Storybook static server listening on http://${host}:${port}`);
});
