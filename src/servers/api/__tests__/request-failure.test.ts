/**
 * respondOnRejection / onBodyEnd: async request work nobody awaits still answers.
 *
 * Node ignores the promise an async 'end' listener or request callback returns,
 * so before these helpers a rejection there left the client waiting forever and
 * the rejection unhandled. Driven over a real socket.
 */

import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { onBodyEnd, respondOnRejection } from '../request-failure.js';

let server: http.Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve) => {
    if (server) server.close(() => resolve());
    else resolve();
  });
  server = undefined;
});

/** Serves `handle`, POSTs once, and reports what the client saw plus every settle() call. */
async function post(
  handle: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    settle: (v: boolean) => void
  ) => void
): Promise<{ status: number; body: string; settled: boolean[] }> {
  const settled: boolean[] = [];
  server = http.createServer((req, res) => {
    handle(req, res, (v) => settled.push(v));
    req.resume(); // the routes read the body with on('data'); 'end' only fires once it's consumed
  });
  await new Promise<void>((resolve) => {
    server?.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  const res = await fetch(`http://127.0.0.1:${port}/`, {
    method: 'POST',
    body: '{}',
    signal: AbortSignal.timeout(2000),
  });
  return { status: res.status, body: await res.text(), settled };
}

describe('onBodyEnd', () => {
  it('answers 500 and settles when the handler rejects before responding', async () => {
    const result = await post((req, res, settle) => {
      onBodyEnd(req, res, settle, async () => {
        throw new Error('boom');
      });
    });

    expect(result.status).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ error: 'Internal server error' });
    expect(result.settled).toEqual([true]);
  });

  it('ends a half-sent response instead of hanging when the handler rejects after writeHead', async () => {
    const result = await post((req, res, settle) => {
      onBodyEnd(req, res, settle, async () => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.write('partial');
        throw new Error('boom after headers');
      });
    });

    expect(result.status).toBe(200);
    expect(result.body).toBe('partial');
    expect(result.settled).toEqual([true]);
  });

  it('leaves a handler that succeeds alone', async () => {
    const result = await post((req, res, settle) => {
      onBodyEnd(req, res, settle, async () => {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      });
    });

    expect(result.status).toBe(201);
    expect(result.body).toBe('{"ok":true}');
    expect(result.settled).toEqual([]);
  });
});

describe('respondOnRejection', () => {
  it('answers 500 for a request callback whose async work rejects', async () => {
    const result = await post((_req, res) => {
      respondOnRejection(res, Promise.reject(new Error('handler threw')));
    });

    expect(result.status).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ error: 'Internal server error' });
  });
});
