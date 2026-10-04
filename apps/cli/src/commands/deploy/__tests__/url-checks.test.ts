/**
 * url-checks against a real local HTTP server (no fetch mocking), so the
 * retry loop sees genuine status codes and genuine connection errors.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { healthCheck, smokeTestFrontend } from '../url-checks.js';

let server: Server | undefined;
let logSpy: MockInstance<typeof console.log>;

/** The warnings healthCheck printed, as plain strings. */
const warnings = (): string[] => logSpy.mock.calls.map((args) => String(args[0]));

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(async () => {
  logSpy.mockRestore();
  await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
  server = undefined;
});

/** Serve the given status codes in order (repeating the last), and return the URL. */
async function serve(statuses: number[]): Promise<{ url: string; hits: () => number }> {
  let hits = 0;
  server = createServer((_req, res) => {
    res.statusCode = statuses[Math.min(hits++, statuses.length - 1)];
    res.end();
  });
  await new Promise<void>((ready) => server!.listen(0, '127.0.0.1', ready));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/health`, hits: () => hits };
}

describe('healthCheck', () => {
  it('is healthy on the first 2xx without retrying', async () => {
    const { url, hits } = await serve([200]);

    const result = await healthCheck(url, { retryDelay: 1 });

    expect(result).toEqual({ healthy: true, statusCode: 200 });
    expect(hits()).toBe(1);
    expect(warnings()).toHaveLength(0);
  });

  it('retries non-2xx responses until one succeeds', async () => {
    const { url, hits } = await serve([503, 503, 204]);

    const result = await healthCheck(url, { retryDelay: 1 });

    expect(result).toEqual({ healthy: true, statusCode: 204 });
    expect(hits()).toBe(3);
    expect(warnings()).toHaveLength(2);
    expect(warnings()[0]).toContain('Health check attempt 1/5: status 503');
  });

  it('gives up after maxRetries failing responses', async () => {
    const { url, hits } = await serve([500]);

    const result = await healthCheck(url, { maxRetries: 3, retryDelay: 1 });

    expect(result).toEqual({ healthy: false, error: 'Failed after 3 attempts' });
    expect(hits()).toBe(3);
    expect(warnings()).toHaveLength(3);
    expect(warnings()[2]).toContain('Health check attempt 3/3: status 500');
  });

  it('retries and reports fetch errors when the connection is refused', async () => {
    const { url } = await serve([200]);
    await new Promise<void>((done) => server!.close(() => done()));
    server = undefined;

    const result = await healthCheck(url, { maxRetries: 2, retryDelay: 1 });

    expect(result).toEqual({ healthy: false, error: 'Failed after 2 attempts' });
    expect(warnings()).toHaveLength(2);
    expect(warnings()[0]).toMatch(/Health check attempt 1\/2: /);
    expect(warnings()[0]).not.toContain('status');
  });
});

describe('smokeTestFrontend', () => {
  let projectRoot: string;

  /** A project root whose smoke script just exits with the given code. */
  function withSmokeScript(exitCode: number): string {
    projectRoot = mkdtempSync(join(tmpdir(), 'url-checks-'));
    mkdirSync(join(projectRoot, 'scripts'));
    writeFileSync(join(projectRoot, 'scripts/smoke-frontend.mjs'), `process.exit(${exitCode});\n`);
    return projectRoot;
  }

  afterEach(() => rmSync(projectRoot, { recursive: true, force: true }));

  it('passes when the smoke script exits 0', () => {
    expect(smokeTestFrontend(withSmokeScript(0), 'http://127.0.0.1:1/')).toBe(true);
  });

  it('fails when the smoke script exits non-zero', () => {
    expect(smokeTestFrontend(withSmokeScript(1), 'http://127.0.0.1:1/')).toBe(false);
  });
});
