/**
 * Static File Serving
 *
 * Serves frontend files with gzip compression and caching.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'StaticFiles' });

/**
 * MIME type mapping
 */
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf',
};

/**
 * Get MIME type for file extension
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

/**
 * Serve static files from apps/web/dist directory
 * With gzip compression for supported content types
 */
export function serveStaticFile(
  filePath: string,
  res: ServerResponse,
  req?: IncomingMessage
): void {
  const fullPath = path.join(process.cwd(), 'apps/web', 'dist', filePath);

  // Security: prevent directory traversal
  const resolvedPath = path.resolve(fullPath);
  const frontendDir = path.resolve(process.cwd(), 'apps/web', 'dist');
  if (!resolvedPath.startsWith(frontendDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(fullPath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const mimeType = getMimeType(filePath);

    // Cache strategy:
    // - Assets (in /assets/): Immutable, cache for 1 year
    // - Others (HTML, root files): Revalidate immediately
    const isAsset = filePath.includes('/assets/');
    const cacheControl = isAsset
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=0, must-revalidate';

    // Check if client accepts gzip and content is compressible
    const acceptEncoding = req?.headers?.['accept-encoding'] || '';
    const shouldCompress =
      typeof acceptEncoding === 'string' &&
      acceptEncoding.includes('gzip') &&
      (mimeType.startsWith('text/') ||
        mimeType === 'application/javascript' ||
        mimeType === 'application/json' ||
        mimeType === 'image/svg+xml');

    const headers: Record<string, string | number> = {
      'Content-Type': mimeType,
      'Cache-Control': cacheControl,
      Vary: 'Accept-Encoding',
    };

    if (shouldCompress) {
      headers['Content-Encoding'] = 'gzip';
      res.writeHead(200, headers);

      const stream = fs.createReadStream(fullPath);
      const gzip = zlib.createGzip({ level: 6 }); // Balance speed vs compression
      stream.pipe(gzip).pipe(res);

      stream.on('error', (error) => {
        log.error({ error: (error as Error).message, filePath }, 'Stream error');
        if (!res.headersSent) {
          res.writeHead(500);
          res.end('Internal Server Error');
        }
      });
    } else {
      // No compression - send raw with Content-Length
      headers['Content-Length'] = stats.size;
      res.writeHead(200, headers);

      const stream = fs.createReadStream(fullPath);
      stream.pipe(res);

      stream.on('error', (error) => {
        log.error({ error: (error as Error).message, filePath }, 'Stream error');
        if (!res.headersSent) {
          res.writeHead(500);
          res.end('Internal Server Error');
        }
      });
    }
  });
}

/**
 * Handle static file routes (SPA routing)
 */
export function handleStaticRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): boolean {
  // Serve index.html for root
  if (pathname === '/' || pathname === '') {
    serveStaticFile('index.html', res, req);
    return true;
  }

  // Serve admin page (same SPA, JS handles routing)
  if (pathname === '/admin') {
    serveStaticFile('index.html', res, req);
    return true;
  }

  // Serve garden payment result pages (SPA handles routing)
  if (pathname === '/garden/success' || pathname === '/garden/cancel') {
    serveStaticFile('index.html', res, req);
    return true;
  }

  // Serve developer portal
  if (pathname === '/developers' || pathname === '/dev') {
    const devPortalPath = path.join(process.cwd(), 'docs', 'developer-portal.html');
    if (fs.existsSync(devPortalPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(fs.readFileSync(devPortalPath, 'utf-8'));
      return true;
    }
  }

  // Serve Plaid Link page
  if (pathname === '/link-account') {
    serveStaticFile('plaid-link.html', res, req);
    return true;
  }

  // Serve other static files
  serveStaticFile(pathname, res, req);
  return true;
}
