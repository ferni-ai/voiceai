/**
 * Sending a share card's SVG.
 *
 * @module api/routes/share-svg-response
 */
import type { ServerResponse } from 'http';

/**
 * Opened directly, an SVG is a document on this origin. The policy keeps it
 * inert: no script, no fetches, sandboxed to an opaque origin, styles only.
 */
export const SVG_RESPONSE_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  'X-Content-Type-Options': 'nosniff',
} as const;

export function sendSVG(res: ServerResponse, svg: string): void {
  res.writeHead(200, {
    ...SVG_RESPONSE_HEADERS,
    'Content-Type': 'image/svg+xml',
    'Cache-Control': 'public, max-age=86400', // 24 hours
  });
  res.end(svg);
}
