/**
 * The web server's process guards (#2914): a stray rejection is reported and
 * survived; a thrown error stops new requests, lets in-flight ones finish,
 * then exits 1. Unit tests drive a fake process; the last two run a real Node
 * process (fixtures/guarded-server.ts), with and without the guards.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const reportError = vi.hoisted(() => vi.fn());
const flushErrorReporting = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../../../utils/error-reporting.js', () => ({ reportError, flushErrorReporting }));

import { DRAIN_MS, installProcessGuards } from '../process-guards.js';

function fakes() {
  const proc = new EventEmitter();
  let onClosed: (() => void) | undefined;
  const server = {
    close: vi.fn((cb?: () => void) => {
      onClosed = cb;
    }),
    closeIdleConnections: vi.fn(),
  };
  const exit = vi.fn();
  installProcessGuards({
    server: server as never,
    proc: proc as never,
    exit,
    write: () => undefined,
  });
  return { proc, server, exit, closed: () => onClosed?.() };
}

afterEach(() => {
  vi.useRealTimers();
  reportError.mockClear();
});

describe('installProcessGuards', () => {
  it('a stray rejection is reported, and the server keeps serving', async () => {
    const { proc, server, exit } = fakes();
    proc.emit('unhandledRejection', new Error('background read failed'));
    proc.emit('unhandledRejection', 'not even an Error');
    await Promise.resolve();
    expect(reportError).toHaveBeenCalledTimes(2);
    expect(reportError.mock.calls[1]?.[0]).toBeInstanceOf(Error);
    expect(reportError.mock.calls[0]?.[1]).toEqual({ source: 'unhandled-rejection' });
    expect(server.close).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it('a thrown error stops new requests and exits 1 only once in-flight ones finish', async () => {
    vi.useFakeTimers();
    const { proc, server, exit, closed } = fakes();
    proc.emit('uncaughtException', new Error('broken state'), 'uncaughtException');
    expect(server.close).toHaveBeenCalledTimes(1);
    expect(server.closeIdleConnections).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(DRAIN_MS - 1);
    expect(exit).not.toHaveBeenCalled();
    closed();
    await vi.advanceTimersByTimeAsync(0);
    expect(flushErrorReporting).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    await vi.advanceTimersByTimeAsync(DRAIN_MS);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('a request that never finishes holds the exit no longer than the drain window', async () => {
    vi.useFakeTimers();
    const { proc, server, exit } = fakes();
    proc.emit('uncaughtException', new Error('broken state'), 'uncaughtException');
    proc.emit('uncaughtException', new Error('a second one while draining'), 'uncaughtException');
    expect(server.close).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(DRAIN_MS);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });
});

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const children: ChildProcess[] = [];
afterEach(() => {
  for (const c of children.splice(0)) c.kill('SIGKILL');
});

async function startGuarded(guards: 'on' | 'off') {
  const child = spawn(
    path.join(root, 'node_modules/.bin/tsx'),
    [path.join(here, 'fixtures/guarded-server.ts')],
    { cwd: root, env: { ...process.env, GUARDS: guards, SENTRY_DSN: '' } }
  );
  children.push(child);
  const exited = new Promise<number | null>((resolve) => {
    child.on('exit', (code) => resolve(code));
  });
  const port = await new Promise<number>((resolve, reject) => {
    let out = '';
    child.stdout?.on('data', (d: Buffer) => {
      out += String(d);
      const m = /PORT (\d+)/.exec(out);
      if (m) resolve(Number(m[1]));
    });
    child.on('exit', () => reject(new Error(`fixture exited before listening: ${out}`)));
  });
  const get = async (p: string) =>
    new Promise<string>((resolve, reject) => {
      http
        .get({ host: '127.0.0.1', port, path: p, agent: false }, (res) => {
          let body = '';
          res.on('data', (c: Buffer) => (body += String(c)));
          res.on('end', () => resolve(body));
        })
        .on('error', reject);
    });
  return { get, exited };
}

describe('a real web-server process', () => {
  it('without the guards, one stray rejection kills it (the bug)', async () => {
    const { get, exited } = await startGuarded('off');
    expect(await get('/reject')).toBe('rejected');
    expect(await exited).not.toBe(0);
  }, 20_000);

  it('with the guards, it survives a rejection, then drains an in-flight request before exiting 1 on a throw', async () => {
    const { get, exited } = await startGuarded('on');
    expect(await get('/reject')).toBe('rejected');
    await new Promise((r) => {
      setTimeout(r, 200);
    });
    expect(await get('/')).toBe('ok');

    let exitedAt = 0;
    void exited.then(() => (exitedAt = Date.now()));
    const slow = get('/slow');
    await new Promise((r) => {
      setTimeout(r, 50);
    });
    expect(await get('/throw')).toBe('will-throw');
    expect(await slow).toBe('slow-done');
    const slowDoneAt = Date.now();
    expect(await exited).toBe(1);
    expect(exitedAt).toBeGreaterThanOrEqual(slowDoneAt - 5);
    await expect(get('/')).rejects.toThrow();
  }, 20_000);
});
