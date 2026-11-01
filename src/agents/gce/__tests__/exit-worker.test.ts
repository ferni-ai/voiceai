/**
 * The worker's shutdown runs to its own exit (exit-worker.ts). On dev, 2026-11-01, a recycled
 * worker ended inside the BQ flush, right after "Batched memory work drained", and never logged
 * "Shutdown complete": Node ends a process once no ref'd handle is left.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { exitAfterFlush } from '../exit-worker.js';

/** Runs the shutdown tail in a plain node process; returns what it printed. */
function shutdownTail(mode: 'hold' | 'no-hold'): string {
  const r = spawnSync(
    process.execPath,
    ['--import', 'tsx', join(__dirname, 'fixtures', 'shutdown-tail.ts'), mode],
    { encoding: 'utf8', cwd: join(__dirname, '..', '..', '..', '..') }
  );
  return r.stdout;
}

describe('holdEventLoop', () => {
  it('keeps the process alive through an unref’d wait, so the shutdown finishes', () => {
    expect(shutdownTail('hold')).toBe('Batched memory work drained\nShutdown complete\n');
  }, 30_000);

  it('without it the process ends inside the wait (what dev showed)', () => {
    expect(shutdownTail('no-hold')).toBe('Batched memory work drained\n');
  }, 30_000);
});

describe('exitAfterFlush', () => {
  it('flushes the logs, then exits with the code', async () => {
    const order: string[] = [];
    const exit = vi.fn((code: number) => {
      order.push(`exit ${code}`);
      return undefined as never;
    });
    await exitAfterFlush(0, {
      flushLogs: async () => {
        order.push('flush');
      },
      exit,
    });
    expect(order).toEqual(['flush', 'exit 0']);
  });

  it('still exits, and says so, when the flush fails', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exit = vi.fn(() => undefined as never);
    await exitAfterFlush(3, {
      flushLogs: async () => {
        throw new Error('stderr closed');
      },
      exit,
    });
    expect(exit).toHaveBeenCalledWith(3);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('log flush before exit failed'));
    stderr.mockRestore();
  });
});

describe('the worker shutdown uses them', () => {
  // gce-voice-worker.ts starts the worker when imported, so its wiring is pinned in its source.
  const worker = readFileSync(join(__dirname, '..', '..', 'gce-voice-worker.ts'), 'utf8');

  it('holds the event loop as shutdown starts and exits through exitAfterFlush', () => {
    expect(worker).toMatch(/isShuttingDown = true;\n\s*holdEventLoop\(\);/);
    expect(worker).toMatch(/log\('Shutdown complete'[\s\S]*await exitAfterFlush\(0\);\n\};/);
    expect(worker).not.toMatch(/\n\s*process\.exit\(0\);\n\};/);
  });
});
