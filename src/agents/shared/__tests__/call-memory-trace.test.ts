import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as Array<{ msg: string; data: Record<string, unknown> }>);
vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    info: (data: Record<string, unknown>, msg: string) => logged.push({ msg, data }),
    warn: (data: Record<string, unknown>, msg: string) => logged.push({ msg, data }),
  }),
}));

import { type HeapProfilerSession, traceCallMemory } from '../call-memory-trace.js';

const MB = 1048576;

/** A fake inspector session whose live profile holds `liveMb` in one frame of ours. */
function world(opts: { hang?: string; disconnectThrows?: boolean } = {}) {
  const calls: string[] = [];
  let clock = 0;
  let rssMb = 500;
  const session: HeapProfilerSession = {
    connect: () => calls.push('connect'),
    disconnect: () => {
      calls.push('disconnect');
      if (opts.disconnectThrows) throw new Error('session already closed');
    },
    post: (method, _params, cb) => {
      calls.push(method);
      if (method === opts.hang) return; // never calls back
      const profile = {
        head: {
          callFrame: { functionName: '(root)', url: '', lineNumber: 0 },
          selfSize: 0,
          children: [
            {
              callFrame: {
                functionName: 'keepFrames',
                url: 'file:///app/dist/speech/a.js',
                lineNumber: 9,
              },
              selfSize: (rssMb - 500) * MB,
            },
          ],
        },
      };
      cb(null, method === 'HeapProfiler.getSamplingProfile' ? { profile } : {});
    },
  };
  const deps = {
    memoryUsage: () =>
      ({
        rss: rssMb * MB,
        heapUsed: (rssMb - 200) * MB,
        heapTotal: rssMb * MB,
        external: 10 * MB,
        arrayBuffers: 5 * MB,
      }) as NodeJS.MemoryUsage,
    openSession: async () => session,
    now: () => clock,
  };
  const advance = async (ms: number, growMbPerMin = 20) => {
    for (let t = 0; t < ms; t += 60_000) {
      clock += 60_000;
      rssMb += growMbPerMin;
      await vi.advanceTimersByTimeAsync(60_000);
    }
  };
  return { calls, deps, advance };
}

describe('traceCallMemory', () => {
  beforeEach(() => {
    logged.length = 0;
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('is off unless CALL_MEMORY_TRACE is on: no session, no lines', async () => {
    const w = world();
    const finish = traceCallMemory('J0', {}, w.deps);
    await w.advance(10 * 60_000);
    await finish();
    expect(w.calls).toEqual([]);
    expect(logged).toEqual([]);
  });

  it('logs memory each minute, a heap sample every 5 minutes, and one after cleanup', async () => {
    const w = world();
    const finish = traceCallMemory('J1', { CALL_MEMORY_TRACE: 'on' }, w.deps);
    await w.advance(10 * 60_000);
    await finish();

    const memory = logged.filter((l) => l.msg === 'CALL_MEMORY');
    expect(memory).toHaveLength(12); // start, 10 minutes, finish
    expect(memory[0].data).toMatchObject({ jobId: 'J1', minute: 0, rssMb: 500 });
    expect(memory[10].data).toMatchObject({ minute: 10, rssMb: 700, heapUsedMb: 500 });

    const samples = logged.filter((l) => l.msg === 'HEAP_SAMPLE');
    expect(samples.map((s) => [s.data.minute, s.data.phase])).toEqual([
      [5, 'call'],
      [10, 'call'],
      [10, 'after-cleanup'],
    ]);
    expect(samples[2].data.ownerTop).toEqual([{ name: 'keepFrames speech/a.js:10', mb: 200 }]);
    expect(w.calls[0]).toBe('connect');
    expect(w.calls.slice(-2)).toEqual(['HeapProfiler.stopSampling', 'disconnect']);
  });

  it('stops its timers at finish, and a second finish does nothing', async () => {
    const w = world();
    const finish = traceCallMemory('J2', { CALL_MEMORY_TRACE: 'on' }, w.deps);
    await finish();
    const after = logged.length;
    await w.advance(10 * 60_000);
    await finish();
    expect(logged.length).toBe(after);
    // The profiler is free again for the next call.
    const next = traceCallMemory('J3', { CALL_MEMORY_TRACE: 'on' }, w.deps);
    await next();
    expect(logged.some((l) => l.data.jobId === 'J3' && l.msg === 'HEAP_SAMPLE')).toBe(true);
  });

  it('a heap profiler call that never answers times out, so finish still resolves', async () => {
    const w = world({ hang: 'HeapProfiler.getSamplingProfile' });
    const finish = traceCallMemory('J4', { CALL_MEMORY_TRACE: 'on' }, w.deps);
    let done = false;
    const finished = finish().then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(4_000);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1_500);
    await finished;
    expect(logged.some((l) => l.msg === 'CALL_MEMORY_TRACE: heap sample failed')).toBe(true);
    expect(w.calls.slice(-2)).toEqual(['HeapProfiler.stopSampling', 'disconnect']);
    // The per-process lock is released: the next call traces again.
    const next = traceCallMemory('J5', { CALL_MEMORY_TRACE: 'on' }, world().deps);
    await next();
    expect(logged.some((l) => l.data.jobId === 'J5' && l.msg === 'HEAP_SAMPLE')).toBe(true);
  });

  it('a disconnect that throws still resolves finish and frees the profiler', async () => {
    const w = world({ disconnectThrows: true });
    await expect(traceCallMemory('J6', { CALL_MEMORY_TRACE: 'on' }, w.deps)()).resolves.toBe(
      undefined
    );
    const next = traceCallMemory('J7', { CALL_MEMORY_TRACE: 'on' }, world().deps);
    await next();
    expect(logged.some((l) => l.data.jobId === 'J7' && l.msg === 'HEAP_SAMPLE')).toBe(true);
  });
});
