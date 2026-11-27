/**
 * The UI server serves the SPA's index.html at /avatar-lab, where app.ts boots
 * the avatar lab instead of the app.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { handleStaticRoutes } from '../static.js';

const INDEX_HTML = '<!doctype html><title>ferni</title>';
let root = '';

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'static-avatar-lab-'));
  const dist = join(root, 'apps/web/dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, 'index.html'), INDEX_HTML);
  vi.spyOn(process, 'cwd').mockReturnValue(root);
});

afterAll(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

/** Routes `path` and resolves with the status code and body once the response ends. */
function get(path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve) => {
    let status = 0;
    let body = '';
    const res = Object.assign(new PassThrough(), {
      headersSent: false,
      setHeader: () => undefined,
      getHeader: () => undefined,
      writeHead(code: number) {
        status = code;
        return res;
      },
    });
    res.on('data', (chunk: Buffer) => (body += chunk.toString()));
    res.on('finish', () => resolve({ status, body }));
    handleStaticRoutes({ headers: {} } as IncomingMessage, res as unknown as ServerResponse, path);
  });
}

describe('GET /avatar-lab', () => {
  it('serves the app shell, index.html, with 200', async () => {
    expect(await get('/avatar-lab')).toEqual({ status: 200, body: INDEX_HTML });
  });
});
