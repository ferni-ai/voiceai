/**
 * A call's closing work (the on-behalf report to the requester) must finish
 * even when the entrypoint doesn't: @livekit/agents gives the entrypoint 15 s
 * after the room closes, then runs its shutdown callbacks (awaited, no timeout)
 * and exits the process. finishOnce runs the work once, from whichever comes
 * first, and the shutdown callback waits for it.
 */
import { describe, expect, it, vi } from 'vitest';

const { finishOnce } = await import('../metadata-parser.js');

function fakeJob() {
  const callbacks: Array<() => Promise<void>> = [];
  return {
    ctx: { addShutdownCallback: (cb: () => Promise<void>) => void callbacks.push(cb) },
    /** What the job does on exit: await every shutdown callback. */
    shutdown: () => Promise.all(callbacks.map((cb) => cb())),
    callbacks,
  };
}

describe('finishOnce', () => {
  it('runs from the shutdown callbacks when the entrypoint never got there', async () => {
    const job = fakeJob();
    const finish = vi.fn(async () => undefined);
    finishOnce(job.ctx, finish);
    expect(job.callbacks).toHaveLength(1);
    await job.shutdown();
    expect(finish).toHaveBeenCalledTimes(1);
  });

  it('runs once, and the shutdown callback waits for the run the entrypoint started', async () => {
    const job = fakeJob();
    let release: () => void = () => undefined;
    let done = false;
    const finish = vi.fn(
      () =>
        new Promise<void>((r) => {
          release = () => {
            done = true;
            r();
          };
        })
    );
    const run = finishOnce(job.ctx, finish);
    void run(); // the entrypoint's exit path starts it
    const exited = job.shutdown().then(() => done);
    release();
    expect(await exited).toBe(true);
    await run();
    expect(finish).toHaveBeenCalledTimes(1);
  });
});
