/**
 * patches/@livekit__agents@1.9.3.patch, readWithAbort: the SDK reads the STT's audio input
 * with readStream(stream, signal) for the whole call (voice/audio_recognition.js). It raced
 * every read against one waitForAbort(signal) promise, which kept ~0.5 KB of promise state per
 * read until the signal aborted at the call's end. On ferni-dev
 * (CALL_MEMORY_TRACE, 2026-11-01) a 32-minute call's live heap grew ~85 MB per 5 minutes:
 * Promise, `then`, async-hook state and 16 kHz AudioStream frames, all freed at call end.
 * LK_READSTREAM_ABORT_FIX=on reads with readWithAbort instead; off keeps the SDK's race.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { ReadableStream } from 'node:stream/web';
import { readStream, readWithAbort } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/** A pull source of `count` frames. */
function frames(count: number) {
  let i = 0;
  return new ReadableStream<{ data: Int16Array }>(
    {
      pull(c) {
        if (i++ >= count) return c.close();
        c.enqueue({ data: new Int16Array(160) });
      },
    },
    { highWaterMark: 1 }
  );
}

/** Heap growth (MB) over `count` frames read by readStream in a plain node process. */
function heapGrowthMb(count: number, fix: 'on' | 'off'): number {
  const out = execFileSync(
    process.execPath,
    ['--expose-gc', join(__dirname, 'fixtures', 'read-stream-heap.mjs'), String(count)],
    { encoding: 'utf8', env: { ...process.env, LK_READSTREAM_ABORT_FIX: fix } }
  );
  return (JSON.parse(out.trim().split('\n').pop() ?? '{}') as { grewMb: number }).grewMb;
}

describe('readStream with a live abort signal: 30 minutes of 16 kHz frames', () => {
  it('LK_READSTREAM_ABORT_FIX=on: the heap stays flat', () => {
    expect(heapGrowthMb(180_000, 'on')).toBeLessThan(10);
  }, 60_000);

  it('off (the SDK as shipped): the heap grows with every frame', () => {
    expect(heapGrowthMb(180_000, 'off')).toBeGreaterThan(50); // ~93 MB, freed only on abort
  }, 60_000);
});

describe('readStream with LK_READSTREAM_ABORT_FIX=on reads as before', () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.LK_READSTREAM_ABORT_FIX;
    process.env.LK_READSTREAM_ABORT_FIX = 'on';
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.LK_READSTREAM_ABORT_FIX;
    else process.env.LK_READSTREAM_ABORT_FIX = saved;
  });

  it('yields every frame in order, then ends', async () => {
    let i = 0;
    const source = new ReadableStream<number>({
      pull: (c) => (i < 5 ? c.enqueue(i++) : c.close()),
    });
    const got: number[] = [];
    for await (const n of readStream(source, new AbortController().signal)) got.push(n);
    expect(got).toEqual([0, 1, 2, 3, 4]);
  });

  it('ends when the signal aborts while a read is pending', async () => {
    const ctl = new AbortController();
    const source = new ReadableStream<number>({ pull: () => new Promise(() => {}) });
    const done = (async () => {
      for await (const _n of readStream(source, ctl.signal)) {
        // never reached: the source never produces
      }
      return 'ended';
    })();
    ctl.abort();
    await expect(done).resolves.toBe('ended');
  });

  it('passes a read error through', async () => {
    const source = new ReadableStream<number>({
      pull: (c) => c.error(new Error('stt input failed')),
    });
    await expect(
      (async () => {
        for await (const _n of readStream(source, new AbortController().signal)) {
          // the first read fails
        }
      })()
    ).rejects.toThrow('stt input failed');
  });
});

describe('readWithAbort reads as the race did', () => {
  it('returns each read in order, then done', async () => {
    const reader = frames(3).getReader();
    const signal = new AbortController().signal;
    const got = [await readWithAbort(reader, signal), await readWithAbort(reader, signal)];
    expect(got.map((r) => r?.done)).toEqual([false, false]);
    await readWithAbort(reader, signal);
    expect((await readWithAbort(reader, signal))?.done).toBe(true);
  });

  it('resolves undefined once the signal aborts, even with a read pending', async () => {
    const ctl = new AbortController();
    const reader = new ReadableStream<number>({ pull: () => new Promise(() => {}) }).getReader();
    const pending = readWithAbort(reader, ctl.signal);
    ctl.abort();
    await expect(pending).resolves.toBeUndefined();
    await expect(readWithAbort(reader, ctl.signal)).resolves.toBeUndefined(); // already aborted
  });

  it('passes a read error through', async () => {
    const reader = new ReadableStream<number>({
      pull: (c) => c.error(new Error('stt input failed')),
    }).getReader();
    await expect(readWithAbort(reader, new AbortController().signal)).rejects.toThrow(
      'stt input failed'
    );
  });

  it('removes its abort listener once each read settles', async () => {
    const ctl = new AbortController();
    let listeners = 0;
    const add = ctl.signal.addEventListener.bind(ctl.signal);
    const remove = ctl.signal.removeEventListener.bind(ctl.signal);
    ctl.signal.addEventListener = ((...a: Parameters<typeof add>) => {
      listeners++;
      add(...a);
    }) as typeof add;
    ctl.signal.removeEventListener = ((...a: Parameters<typeof remove>) => {
      listeners--;
      remove(...a);
    }) as typeof remove;
    const reader = frames(100).getReader();
    for (let i = 0; i < 100; i++) await readWithAbort(reader, ctl.signal);
    expect(listeners).toBe(0);
  });
});
