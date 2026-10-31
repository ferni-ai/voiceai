/**
 * WORKER_RECYCLE (worker-recycle.ts): past the RSS threshold the worker takes no
 * new calls and exits only once none is running or waiting for its assignment.
 * The second half drives the real livekit-connection.ts over a fake socket: a
 * drained worker reports full, rejects availability, and stays full across a
 * reconnect.
 */
import { EventEmitter } from 'node:events';
import { ServerMessage, WorkerMessage, WorkerStatus } from '@livekit/protocol';
import { describe, expect, it, vi } from 'vitest';

const sockets = vi.hoisted(() => [] as Array<{ sent: Uint8Array[] }>);
vi.mock('ws', async () => {
  const { EventEmitter: Emitter } = await import('node:events');
  class FakeWebSocket extends Emitter {
    static OPEN = 1;
    readyState = 1;
    sent: Uint8Array[] = [];
    constructor() {
      super();
      sockets.push(this);
    }
    send(data: Uint8Array): void {
      this.sent.push(data);
    }
    ping(): void {}
    close(): void {}
    terminate(): void {}
  }
  return { WebSocket: FakeWebSocket };
});

import * as conn from '../livekit-connection.js';
import {
  createWorkerRecycle,
  DEFAULT_RECYCLE_RSS_MB,
  recycleMaxCalls,
  recycleRssMb,
  startWorkerRecycle,
  type WorkerRecycleDeps,
} from '../worker-recycle.js';

const MB = 1024 * 1024;

function world(over: Partial<WorkerRecycleDeps> = {}) {
  const state = { rssMb: 1500, active: 0, pending: 0, jobsRun: 3 };
  const drain = vi.fn();
  const exit = vi.fn();
  const log = vi.fn();
  const recycle = createWorkerRecycle({
    rssBytes: () => state.rssMb * MB,
    activeJobs: () => state.active,
    pendingJobs: () => state.pending,
    jobsRun: () => state.jobsRun,
    drain,
    exit,
    log,
    thresholdMb: 1024,
    ...over,
  });
  return { state, drain, exit, log, recycle };
}

describe('recycleRssMb', () => {
  it('defaults to 1 GB and reads WORKER_RECYCLE_RSS_MB, ignoring nonsense', () => {
    expect(recycleRssMb({})).toBe(DEFAULT_RECYCLE_RSS_MB);
    expect(DEFAULT_RECYCLE_RSS_MB).toBe(1024);
    expect(recycleRssMb({ WORKER_RECYCLE_RSS_MB: '2048' })).toBe(2048);
    expect(recycleRssMb({ WORKER_RECYCLE_RSS_MB: 'big' })).toBe(DEFAULT_RECYCLE_RSS_MB);
    expect(recycleRssMb({ WORKER_RECYCLE_RSS_MB: '0' })).toBe(DEFAULT_RECYCLE_RSS_MB);
  });
});

describe('recycleMaxCalls', () => {
  it('is off (0) unless WORKER_RECYCLE_MAX_CALLS is a positive whole number', () => {
    expect(recycleMaxCalls({})).toBe(0);
    expect(recycleMaxCalls({ WORKER_RECYCLE_MAX_CALLS: '50' })).toBe(50);
    expect(recycleMaxCalls({ WORKER_RECYCLE_MAX_CALLS: '-3' })).toBe(0);
    expect(recycleMaxCalls({ WORKER_RECYCLE_MAX_CALLS: '2.5' })).toBe(0);
  });
});

describe('createWorkerRecycle', () => {
  it('with maxCalls, recycles a small worker after that many calls, between calls only', () => {
    const w = world({ maxCalls: 5 });
    w.state.rssMb = 400;
    w.state.jobsRun = 4;
    expect(w.recycle.check()).toBeNull();
    w.state.jobsRun = 5;
    w.state.active = 1; // the fifth call is still running
    expect(w.recycle.check()).toBe('drain');
    expect(w.recycle.check()).toBeNull();
    expect(w.exit).not.toHaveBeenCalled();
    w.state.active = 0;
    expect(w.recycle.check()).toBe('exit');
  });

  it('without maxCalls, call count alone never recycles', () => {
    const w = world();
    w.state.rssMb = 400;
    w.state.jobsRun = 10_000;
    expect(w.recycle.check()).toBeNull();
  });

  it('does nothing under the threshold', () => {
    const w = world();
    w.state.rssMb = 900;
    expect(w.recycle.check()).toBeNull();
    expect(w.drain).not.toHaveBeenCalled();
  });

  it('never recycles a worker that has not run a call (a low threshold cannot loop)', () => {
    const w = world();
    w.state.jobsRun = 0;
    expect(w.recycle.check()).toBeNull();
    expect(w.recycle.check()).toBeNull();
    expect(w.drain).not.toHaveBeenCalled();
    expect(w.exit).not.toHaveBeenCalled();
  });

  it('drains during a call and exits only after the call, and any pending one, end', () => {
    const w = world();
    w.state.active = 1;
    expect(w.recycle.check()).toBe('drain');
    expect(w.drain).toHaveBeenCalledTimes(1);
    expect(w.log).toHaveBeenLastCalledWith('WORKER_RECYCLE', {
      rssMb: 1500,
      activeJobs: 1,
      thresholdMb: 1024,
      action: 'drain',
    });
    for (let i = 0; i < 100; i++) expect(w.recycle.check()).toBeNull(); // a long call
    w.state.active = 0;
    w.state.pending = 1; // accepted before the drain: its assignment is on the way
    expect(w.recycle.check()).toBeNull();
    expect(w.exit).not.toHaveBeenCalled();
    w.state.pending = 0;
    w.state.rssMb = 800; // memory may fall after the call: it still goes
    expect(w.recycle.check()).toBe('exit');
    expect(w.exit).toHaveBeenCalledTimes(1);
    expect(w.log).toHaveBeenLastCalledWith('WORKER_RECYCLE', {
      rssMb: 800,
      activeJobs: 0,
      thresholdMb: 1024,
      action: 'exit',
    });
    expect(w.recycle.check()).toBeNull();
    expect(w.exit).toHaveBeenCalledTimes(1);
    expect(w.drain).toHaveBeenCalledTimes(1);
  });

  it('an idle worker reports full for one check before it exits', () => {
    const w = world();
    expect(w.recycle.check()).toBe('drain');
    expect(w.exit).not.toHaveBeenCalled();
    expect(w.recycle.check()).toBe('exit');
  });
});

describe('startWorkerRecycle', () => {
  const deps = {
    rssBytes: () => 4096 * MB,
    activeJobs: () => 0,
    pendingJobs: () => 0,
    jobsRun: () => 1,
    drain: vi.fn(),
    exit: vi.fn(),
    log: vi.fn(),
  };

  it('is off unless WORKER_RECYCLE is on', () => {
    expect(startWorkerRecycle(deps, {})).toBeNull();
    expect(startWorkerRecycle(deps, { WORKER_RECYCLE: 'off' })).toBeNull();
  });

  it('when on, checks on its interval with the configured threshold', () => {
    vi.useFakeTimers();
    try {
      const stop = startWorkerRecycle(
        deps,
        { WORKER_RECYCLE: 'on', WORKER_RECYCLE_RSS_MB: '8192' },
        1000
      );
      expect(stop).toBeTypeOf('function');
      vi.advanceTimersByTime(5000);
      expect(deps.drain).not.toHaveBeenCalled(); // 4 GB is under 8 GB
      stop?.();
      const stop2 = startWorkerRecycle(deps, { WORKER_RECYCLE: 'on' }, 1000);
      vi.advanceTimersByTime(2000);
      expect(deps.drain).toHaveBeenCalledTimes(1);
      expect(deps.exit).toHaveBeenCalledTimes(1);
      stop2?.();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('livekit-connection drainForRecycle', () => {
  const decode = (b: Uint8Array) => {
    const m = new WorkerMessage();
    m.fromBinary(b);
    return m.message;
  };
  const availability = (jobId: string) =>
    Buffer.from(
      new ServerMessage({
        message: {
          case: 'availability',
          value: { job: { id: jobId, room: { name: 'r' } } as never },
        },
      }).toBinary()
    );
  /** The last message sent with this case, once it has been sent. */
  const lastSent = async (ws: { sent: Uint8Array[] }, kase: string, after: number) =>
    vi.waitFor(() => {
      const m = ws.sent
        .slice(after)
        .map(decode)
        .filter((x) => x.case === kase)
        .pop();
      if (!m) throw new Error(`no ${kase} yet`);
      return m;
    });

  it('reports full, rejects availability, and stays full on a reconnect', async () => {
    conn.initLiveKitConnection(
      {
        url: 'http://localhost:7880',
        apiKey: 'devkey',
        apiSecret: 'devsecret-devsecret-devsecret-00',
        agentName: 't',
      },
      () => undefined
    );
    void conn.connectToLiveKit();
    const ws = await vi.waitFor(() => {
      const s = sockets[0] as unknown as (EventEmitter & { sent: Uint8Array[] }) | undefined;
      if (!s) throw new Error('no socket yet');
      return s;
    });
    ws.emit('open');

    let mark = ws.sent.length;
    ws.emit('message', availability('J1'));
    const before = await lastSent(ws, 'availability', mark);
    expect((before.value as { available: boolean }).available).toBe(true);
    expect(conn.pendingJobCount()).toBe(1); // accepted, assignment not here yet

    conn.drainForRecycle();
    const status = decode(ws.sent[ws.sent.length - 1]);
    expect(status.case).toBe('updateWorker');
    expect((status.value as { status: WorkerStatus }).status).toBe(WorkerStatus.WS_FULL);

    mark = ws.sent.length;
    ws.emit('message', availability('J2'));
    const after = await lastSent(ws, 'availability', mark);
    expect((after.value as { available: boolean }).available).toBe(false);
    expect(conn.pendingJobCount()).toBe(1);

    // A reconnect re-registers: the worker must not say it is available again.
    mark = ws.sent.length;
    ws.emit(
      'message',
      Buffer.from(
        new ServerMessage({
          message: { case: 'register', value: { workerId: 'W' } as never },
        }).toBinary()
      )
    );
    const reg = await lastSent(ws, 'updateWorker', mark);
    expect((reg.value as { status: WorkerStatus }).status).toBe(WorkerStatus.WS_FULL);
    conn.closeConnection();
  });
});
