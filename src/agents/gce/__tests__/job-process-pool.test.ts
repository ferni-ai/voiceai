import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { Job } from '@livekit/protocol';
import { afterEach, describe, expect, it } from 'vitest';

import { drainBackground } from '../drain-background.js';
import type { JobInfo } from '../job-executor.js';
import { JobProcessPool } from '../job-process-pool.js';
import { asToChild, asToParent, decodeJob, encodeJob } from '../job-process-protocol.js';

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const FAKE = fileURLToPath(new URL('./fixtures/fake-job-child.mjs', import.meta.url));

const info = (id: string): JobInfo => ({
  job: new Job({ id, room: { name: `room-${id}` } }),
  url: 'wss://example.invalid',
  token: 'tok',
  acceptArgs: { name: 'voice-agent', identity: 'voice-agent-1', metadata: '' },
});

let pools: JobProcessPool[] = [];
afterEach(() => {
  for (const p of pools) p.close();
  pools = [];
});

function makePool(
  opts: { mode?: string; jobMs?: number; idle?: number; readyTimeoutMs?: number } = {}
) {
  const events: Array<[string, string]> = [];
  const spawned: number[] = [];
  const handedTo: number[] = [];
  const pool = new JobProcessPool({
    spawn: () => {
      const proc = fork(FAKE, [], {
        env: {
          ...process.env,
          FAKE_MODE: opts.mode ?? 'ok',
          FAKE_JOB_MS: String(opts.jobMs ?? 50),
        },
        stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
      });
      spawned.push(proc.pid ?? -1);
      return proc;
    },
    idle: opts.idle ?? 1,
    readyTimeoutMs: opts.readyTimeoutMs ?? 5000,
    log: (msg, data) => {
      if (msg === 'Job handed to child process') handedTo.push(data?.pid as number);
    },
    onLifecycle: (jobId, event) => void events.push([jobId, event]),
  });
  pools.push(pool);
  pool.start();
  return { pool, events, spawned, handedTo };
}

describe('job process protocol', () => {
  it('carries the exact Job through the IPC message', () => {
    const msg = encodeJob(info('AJ_1'), 'W_9');
    expect(asToChild(JSON.parse(JSON.stringify(msg)))).not.toBeNull();
    const back = decodeJob(msg);
    expect(back.job.id).toBe('AJ_1');
    expect(back.job.room?.name).toBe('room-AJ_1');
    expect(msg.workerId).toBe('W_9');
    expect(asToParent({ t: 'nope' })).toBeNull();
    expect(asToChild(null)).toBeNull();
  });
});

describe('JobProcessPool', () => {
  it('runs a job in a warmed child, reports its lifecycle, and warms a replacement', async () => {
    const { pool, events, spawned } = makePool();
    await pool.run(info('AJ_a'));
    expect(events).toEqual([
      ['AJ_a', 'started'],
      ['AJ_a', 'completed'],
    ]);
    expect(pool.activeJobIds()).toEqual([]);
    expect(spawned.length).toBe(2); // the first idle child, then its replacement
  });

  it('never gives two jobs assigned at once the same child', async () => {
    const { pool, events, handedTo } = makePool({ jobMs: 150 });
    const both = Promise.all([pool.run(info('AJ_x')), pool.run(info('AJ_y'))]);
    await sleep(400);
    expect(new Set(events.filter(([, e]) => e === 'started').map(([id]) => id))).toEqual(
      new Set(['AJ_x', 'AJ_y'])
    );
    await both;
    expect(handedTo).toHaveLength(2);
    expect(new Set(handedTo).size).toBe(2);
    expect(events.filter(([, e]) => e === 'completed')).toHaveLength(2);
  });

  it('reports a job failed when its child dies mid-call, and keeps a warmed child ready', async () => {
    const { pool, events, spawned } = makePool({ mode: 'crash' });
    await pool.run(info('AJ_c'));
    expect(events).toEqual([
      ['AJ_c', 'started'],
      ['AJ_c', 'failed'],
    ]);
    await sleep(100);
    expect(spawned.length).toBeGreaterThanOrEqual(2);
  });

  it("forwards a LiveKit termination to the job's child", async () => {
    const { pool, events } = makePool({ jobMs: 10_000 });
    const running = pool.run(info('AJ_t'));
    await sleep(200);
    expect(pool.activeJobIds()).toEqual(['AJ_t']);
    expect(pool.shutdown('AJ_t', 'livekit_termination')).toBe(true);
    expect(pool.shutdown('AJ_other', 'x')).toBe(false);
    await running;
    expect(events.at(-1)).toEqual(['AJ_t', 'completed']);
  });

  it("reports load as the children's summed CPU share or the busiest loop", async () => {
    const { pool } = makePool({ idle: 2 });
    await sleep(300);
    // two children at 0.4 CPU each: 0.8 of 4 CPUs is 0.2, below the busiest loop (0.3)
    expect(pool.load(4)).toBeCloseTo(0.3);
    // on 1 CPU the summed share wins (0.8)
    expect(pool.load(1)).toBeCloseTo(0.8);
  });

  it('fails the job when no child warms up in time', async () => {
    const { pool } = makePool({ mode: 'never-ready', readyTimeoutMs: 200 });
    await expect(pool.run(info('AJ_slow'))).rejects.toThrow(/ready in time/);
  });
});

describe('drainBackground', () => {
  it('waits for background work to finish, up to a limit', async () => {
    let checks = 0;
    // pending for the first three checks, then done
    expect(await drainBackground(() => (checks++ < 3 ? 1 : 0), 1000, 5)).toBe(0);
    expect(checks).toBeGreaterThanOrEqual(4);
    expect(await drainBackground(() => 2, 30, 5)).toBe(2);
  });
});
