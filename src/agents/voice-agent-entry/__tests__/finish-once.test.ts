/**
 * A call's closing work (the on-behalf report to the requester, then releasing
 * the call's context) must finish even when the entrypoint doesn't:
 * @livekit/agents gives the entrypoint 15 s after the room closes, then runs
 * its shutdown callbacks (awaited, no timeout) and exits the process.
 * callEndFor runs each step once, from whichever comes first, and the shutdown
 * callbacks wait for it. Its `end()` never throws, so no exit path can lose the
 * release to a failed report.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as Array<{ fields: unknown; message: string }>);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  return {
    ...real,
    createLogger: (options: { module: string }) => {
      const logger = real.createLogger(options);
      if (options.module !== 'call-end') return logger;
      return {
        ...logger,
        error: (fields: unknown, message: string) => void logged.push({ fields, message }),
      };
    },
  };
});

const { callEndFor } = await import('../call-end.js');

const CALL = { metadata: {}, callType: undefined, sessionId: 's-finish-once', startTime: 0 };

function fakeJob() {
  const callbacks: Array<() => Promise<void>> = [];
  return {
    ctx: {
      addShutdownCallback: (cb: () => Promise<void>) => void callbacks.push(cb),
      job: { metadata: '{}' },
    },
    /** What the job does on exit: run every shutdown callback, in parallel. */
    shutdown: () => Promise.all(callbacks.map((cb) => cb())),
    callbacks,
  };
}

beforeEach(() => {
  logged.length = 0;
});

describe('callEndFor', () => {
  it('runs from the shutdown callbacks when the entrypoint never got there', async () => {
    const job = fakeJob();
    const finish = vi.fn(async () => undefined);
    const release = vi.fn(async () => undefined);
    callEndFor(job.ctx, CALL, { finish, release });
    expect(job.callbacks).toHaveLength(2); // the report, and the release that waits for it
    await job.shutdown();
    expect(finish).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('runs once, and the shutdown callbacks wait for the run the entrypoint started', async () => {
    const job = fakeJob();
    let unblock: () => void = () => undefined;
    let done = false;
    const finish = vi.fn(
      () =>
        new Promise<void>((r) => {
          unblock = () => {
            done = true;
            r();
          };
        })
    );
    const release = vi.fn(async () => undefined);
    const end = callEndFor(job.ctx, CALL, { finish, release }).end;
    const ended = end(); // the entrypoint's exit path starts it
    const exited = job.shutdown().then(() => done);
    unblock();
    expect(await exited).toBe(true);
    await ended;
    await end();
    expect(finish).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('a failed report still releases, and end() logs the error class only', async () => {
    const job = fakeJob();
    const release = vi.fn(async () => undefined);
    const end = callEndFor(job.ctx, CALL, {
      finish: async () => {
        throw new TypeError('report failed for Wren Okafor');
      },
      release,
    }).end;

    await expect(end()).resolves.toBeUndefined();

    expect(release).toHaveBeenCalledTimes(1);
    expect(logged).toEqual([{ fields: { errorClass: 'TypeError' }, message: expect.any(String) }]);
    expect(JSON.stringify(logged)).not.toContain('Wren');
  });

  it('a failed release never throws out of end()', async () => {
    const job = fakeJob();
    const end = callEndFor(job.ctx, CALL, {
      finish: async () => undefined,
      release: async () => {
        throw new RangeError('store gone');
      },
    }).end;

    await expect(end()).resolves.toBeUndefined();

    expect(logged).toEqual([{ fields: { errorClass: 'RangeError' }, message: expect.any(String) }]);
    expect(JSON.stringify(logged)).not.toContain('store gone');
  });
});
