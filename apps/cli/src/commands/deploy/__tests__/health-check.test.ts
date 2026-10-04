/**
 * The deploy gates' URL health check, against a real local HTTP server.
 */
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';

import { afterEach, describe, expect, it } from 'vitest';

import { healthCheck } from '../health-check.js';

let server: Server | undefined;
afterEach(() => new Promise<void>((done) => (server ? server.close(() => done()) : done())));

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
  it('is healthy on the first 2xx', async () => {
    const { url, hits } = await serve([200]);
    expect(await healthCheck(url, { retryDelay: 1 })).toEqual({ healthy: true, statusCode: 200 });
    expect(hits()).toBe(1);
  });

  it('retries a failing status and reports each failed attempt', async () => {
    const { url, hits } = await serve([503, 503, 204]);
    const retries: string[] = [];
    const result = await healthCheck(url, { retryDelay: 1, onRetry: (m) => retries.push(m) });
    expect(result).toEqual({ healthy: true, statusCode: 204 });
    expect(hits()).toBe(3);
    expect(retries).toEqual([
      'Health check attempt 1/5: status 503',
      'Health check attempt 2/5: status 503',
    ]);
  });

  it('gives up after maxRetries', async () => {
    const { url, hits } = await serve([500]);
    const retries: string[] = [];
    const result = await healthCheck(url, {
      maxRetries: 3,
      retryDelay: 1,
      onRetry: (m) => retries.push(m),
    });
    expect(result).toEqual({ healthy: false, error: 'Failed after 3 attempts' });
    expect(hits()).toBe(3);
    expect(retries).toHaveLength(3);
  });

  it('treats a connection error as a failed attempt', async () => {
    const { url } = await serve([200]);
    await new Promise<void>((done) => server!.close(() => done()));
    server = undefined;
    const retries: string[] = [];
    const result = await healthCheck(url, {
      maxRetries: 2,
      retryDelay: 1,
      onRetry: (m) => retries.push(m),
    });
    expect(result.healthy).toBe(false);
    expect(retries).toHaveLength(2);
    expect(retries[0]).toMatch(/^Health check attempt 1\/2: /);
  });
});
