/**
 * The worker's shutdown runs to its own exit (exit-worker.ts). On dev, 2026-11-01, a recycled
 * worker ended inside the BQ flush, right after "Batched memory work drained", and never logged
 * "Shutdown complete": Node ends a process once no ref'd handle is left.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

const REPO = join(__dirname, '..', '..', '..', '..');
const LINES = 200;

/**
 * Runs closed-stderr.ts in a plain node process (bash execs into it, so the timeout's SIGKILL
 * reaches node). `closed`: its stderr is a pipe whose reader has already exited. A hung child
 * fails the row on its timeout instead of hanging the suite. No credentials, a temp HOME.
 */
function closedStderrChild(stderr: 'closed' | 'piped') {
  const home = mkdtempSync(join(tmpdir(), 'exit-worker-'));
  const node = `exec "${process.execPath}" --import tsx src/agents/gce/__tests__/fixtures/closed-stderr.ts`;
  try {
    return spawnSync('bash', ['-c', stderr === 'closed' ? `${node} 2> >(exit 0)` : node], {
      cwd: REPO,
      env: {
        PATH: process.env.PATH,
        HOME: home,
        NODE_ENV: 'production',
        CLOSED_STDERR_LINES: String(LINES),
      },
      encoding: 'utf8',
      timeout: 20_000,
      killSignal: 'SIGKILL',
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

describe('exitAfterFlush with the real app logger (#3320)', () => {
  it('exits when the stderr reader has gone away (main hung at 0% CPU in process.exit)', () => {
    const r = closedStderrChild('closed');
    expect(r.error).toBeUndefined(); // no ETIMEDOUT: the child ended on its own
    expect(r.signal).toBeNull();
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('logged\nerror listeners added: 0\n');
  }, 30_000);

  it('with a reader, still writes every line out before the exit', () => {
    const r = closedStderrChild('piped');
    expect(r.error).toBeUndefined();
    expect(r.status).toBe(0);
    expect(r.stderr.split('\n').filter((l) => l.includes('a line nobody reads'))).toHaveLength(
      LINES
    );
  }, 30_000);

  it('waits without an error listener, so a write error other than EPIPE keeps its own path', () => {
    // pino's own listener turns EPIPE off and re-throws the rest; one of ours would swallow them
    expect(closedStderrChild('closed').stdout).toContain('error listeners added: 0\n');
    expect(closedStderrChild('piped').stdout).toContain('error listeners added: 0\n');
  }, 60_000);
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
