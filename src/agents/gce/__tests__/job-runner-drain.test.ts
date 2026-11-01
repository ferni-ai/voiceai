/**
 * #2661: on SIGTERM the worker drained on its own job counter, which stays 0
 * when calls run in the pool's children, so the drain took 0 ms and closing the
 * pool cut every live call off. These run the real job runner with a real
 * forked child (the fake-job-child fixture) in place of gce/job-child.
 */
import type { ChildProcess } from 'node:child_process';

import { Job } from '@livekit/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { JobInfo } from '../job-executor.js';

const forked = vi.hoisted(() => [] as ChildProcess[]);

vi.mock('../../voice-agent-entry/index.js', () => ({ runFullVoiceAgentEntry: vi.fn() }));
vi.mock('node:child_process', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:child_process')>();
  const { fileURLToPath } = await import('node:url');
  const fake = fileURLToPath(new URL('./fixtures/fake-job-child.mjs', import.meta.url));
  return {
    ...real,
    // The call lasts until LiveKit (here, the test) ends it.
    fork: () => {
      const child = real.fork(fake, [], {
        execArgv: [],
        env: { ...process.env, FAKE_JOB_MS: '600000' },
        stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
      });
      forked.push(child);
      return child;
    },
  };
});

const runner = await import('../job-runner.js');

const settles = { timeout: 5000, interval: 20 };
const log = (): void => undefined;
const info = (id: string): JobInfo => ({
  job: new Job({ id, room: { name: `room-${id}` } }),
  url: 'wss://example.invalid',
  token: 'tok',
  acceptArgs: { name: 'voice-agent', identity: 'voice-agent-1', metadata: '' },
});
const alive = (child: ChildProcess): boolean =>
  child.exitCode === null && child.signalCode === null;

/** Starts the pool and one call in a child; resolves once the call is running. */
async function startCall(jobId: string): Promise<{ call: Promise<void>; child: ChildProcess }> {
  runner.startJobRunner(log, 'process');
  const call = runner.runJob(info(jobId), log);
  await vi.waitFor(() => {
    expect(runner.activeJobIds()).toEqual([jobId]);
  }, settles);
  const child = forked[0];
  return { call, child };
}

afterEach(async () => {
  await runner.drainJobRunner(0);
  for (const child of forked.splice(0)) if (alive(child)) child.kill('SIGKILL');
});

describe('drainJobRunner (SIGTERM drain, process mode)', () => {
  it('keeps a call in a child alive until it ends, then closes the pool', async () => {
    const { call, child } = await startCall('AJ_live');
    let finished = false;
    const drain = runner.drainJobRunner(60_000, { pollMs: 10 });
    void drain.then(() => {
      finished = true;
    });

    // Main drained in 0 ms here and closed the pool, killing the child mid-call.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 300);
    });
    expect(finished).toBe(false);
    expect(alive(child)).toBe(true);
    expect(runner.activeJobCount()).toBe(1);

    // The caller hangs up.
    expect(runner.terminateJob('AJ_live', 'caller hung up')).toBe(true);
    const result = await drain;
    await call;
    expect(result.drained).toBe(true);
    expect(result.activeJobs).toBe(0);
    expect(result.waitedMs).toBeGreaterThanOrEqual(300);
    await vi.waitFor(() => {
      expect(forked.filter(alive)).toEqual([]); // the pool closed after the drain
    }, settles);
  });

  it('gives up at the drain timeout and only then ends the call', async () => {
    const { call, child } = await startCall('AJ_stuck');
    const started = Date.now();
    const result = await runner.drainJobRunner(200, { pollMs: 10 });

    expect(result.drained).toBe(false);
    expect(result.activeJobs).toBe(1);
    expect(result.waitedMs).toBeGreaterThanOrEqual(200);
    expect(Date.now() - started).toBeLessThan(5000);
    await call; // the pool closed: the child died with its job
    expect(alive(child)).toBe(false);
  });
});
