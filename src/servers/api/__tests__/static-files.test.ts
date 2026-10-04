/**
 * The UI server serves apps/web/dist but not its dot-files: dist/.vite/manifest.json
 * (written for the bundle ratchet) lists every source module, and Firebase
 * hosting already skips dot paths.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { serveStaticFile } from '../static.js';

let root = '';

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'static-files-'));
  const dist = join(root, 'apps/web/dist');
  mkdirSync(join(dist, 'assets'), { recursive: true });
  mkdirSync(join(dist, '.vite'));
  writeFileSync(join(dist, 'assets/app.js'), 'console.log(1)');
  writeFileSync(join(dist, '.vite/manifest.json'), '{}');
  writeFileSync(join(dist, '.env'), 'SECRET=1');
  vi.spyOn(process, 'cwd').mockReturnValue(root);
});

afterAll(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

/** Serves `path` and resolves with the status code once the response ends. */
function get(path: string): Promise<number> {
  return new Promise((resolve) => {
    let status = 0;
    const res = Object.assign(new PassThrough(), {
      headersSent: false,
      writeHead(code: number) {
        status = code;
        return res;
      },
    });
    res.resume();
    res.on('finish', () => resolve(status));
    serveStaticFile(path, res as unknown as ServerResponse);
  });
}

describe('serveStaticFile', () => {
  it('serves ordinary files', async () => {
    expect(await get('/assets/app.js')).toBe(200);
  });

  it('does not serve files in dot-directories, though they exist', async () => {
    expect(await get('/.vite/manifest.json')).toBe(404);
    expect(await get('/assets/../.vite/manifest.json')).toBe(404);
  });

  it('does not serve dot-files', async () => {
    expect(await get('/.env')).toBe(404);
  });
});
