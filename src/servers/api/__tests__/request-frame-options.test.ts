/**
 * The UI server's request handler (index.ts handleRequest) sets the security
 * headers with setRequestSecurityHeaders(req, res), which hands the request's
 * URL on so /avatar-lab may be framed by the same origin and every other page
 * is not. index.ts itself starts the whole server on import, so this runs the
 * same call, with the same arguments, behind a real HTTP server and real requests.
 */
import { readFileSync } from 'node:fs';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setRequestSecurityHeaders } from '../../shared/security-headers.js';

let server: Server;
let origin = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    setRequestSecurityHeaders(req, res); // as index.ts handleRequest does
    res.end();
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

/** A real GET of `path`, sent with `host` as the Host header; resolves with X-Frame-Options. */
function frameOptions(path: string, host?: string): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const req = request(origin + path, { headers: host ? { host } : {} }, (res) => {
      res.resume();
      resolve(res.headers['x-frame-options'] as string | undefined);
    });
    req.on('error', reject);
    req.end();
  });
}

describe('X-Frame-Options on real requests', () => {
  it('lets the same origin frame /avatar-lab', async () => {
    expect(await frameOptions('/avatar-lab')).toBe('SAMEORIGIN');
    expect(await frameOptions('/avatar-lab?theme=zen')).toBe('SAMEORIGIN');
  });

  it('lets the same origin frame /avatar-lab on the app host (a reserved subdomain)', async () => {
    expect(await frameOptions('/avatar-lab', 'app.ferni.ai')).toBe('SAMEORIGIN');
  });

  it("forbids framing /avatar-lab on a custom site's subdomain, which serves /sites/<x>/", async () => {
    expect(await frameOptions('/avatar-lab', 'x.ferni.ai')).toBe('DENY');
  });

  it('forbids framing every other page', async () => {
    expect(await frameOptions('/')).toBe('DENY');
    expect(await frameOptions('/admin')).toBe('DENY');
    expect(await frameOptions('/avatar-lab-x')).toBe('DENY');
  });
});

describe('index.ts handleRequest', () => {
  it('sets the headers with the request, through setRequestSecurityHeaders(req, res)', () => {
    const source = readFileSync(join(__dirname, '..', 'index.ts'), 'utf8');
    const handler = source.slice(source.indexOf('async function handleRequest('));
    const firstStatements = handler.slice(0, handler.indexOf('setCorsHeaders('));
    expect(firstStatements).toContain('setRequestSecurityHeaders(req, res);');
    expect(source).not.toMatch(/\bsetSecurityHeaders\(/);
  });
});
