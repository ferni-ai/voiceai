/**
 * The speaker-embedding client when the worker misbehaves: replies out of
 * order, answers late, or dies mid-request. Only the thread boundary
 * (node:worker_threads' Worker) is faked, so each case is deterministic.
 * A caller must never get another request's vector, a late (stale) vector, or
 * a "neural" answer after the worker is gone.
 */

import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const workers = vi.hoisted(() => [] as unknown[]);

vi.mock('node:worker_threads', async () => {
  const { EventEmitter: Emitter } = await import('node:events');
  class FakeWorker extends Emitter {
    posted: Array<{ id: number; samples: Float32Array }> = [];
    constructor() {
      super();
      workers.push(this as never);
      void Promise.resolve().then(() =>
        this.emit('message', { type: 'ready', method: 'neural', threadId: 7 })
      );
    }
    postMessage(msg: { id: number; samples: Float32Array }): void {
      this.posted.push(msg);
    }
    unref(): void {}
    async terminate(): Promise<number> {
      this.emit('exit', 1);
      return 1;
    }
  }
  return { Worker: FakeWorker };
});

import { extractSpeakerEmbedding } from '../../voice-memory-enhanced.js';
import {
  embedOffMainThread,
  getSpeakerEmbeddingMethod,
  resetSpeakerEmbeddingWorker,
} from '../speaker-embedding-worker.js';

type Fake = EventEmitter & { posted: Array<{ id: number; samples: Float32Array }> };
const fake = (): Fake => workers[workers.length - 1] as unknown as Fake;
const vec = (v: number): Float32Array => new Float32Array(192).fill(v);
const reply = (id: number, v: number): void => {
  fake().emit('message', { type: 'result', id, vector: vec(v), method: 'neural', threadId: 7 });
};
const audio = (): Float32Array => new Float32Array(16000).fill(0.1);

beforeEach(() => {
  process.env.SPEAKER_MODEL_PATH = join(__dirname, 'fixtures', 'waveform-contract.onnx');
});

afterEach(async () => {
  vi.useRealTimers();
  await resetSpeakerEmbeddingWorker();
  delete process.env.SPEAKER_MODEL_PATH;
  workers.length = 0;
});

it('matches replies to requests by id, whatever order they arrive in', async () => {
  expect(await getSpeakerEmbeddingMethod()).toBe('neural');
  const first = embedOffMainThread(audio());
  const second = embedOffMainThread(audio());
  await vi.waitFor(() => expect(fake().posted).toHaveLength(2));
  const [a, b] = fake().posted;

  reply(b.id, 2); // second answered first
  reply(a.id, 1);

  expect((await first).vector[0]).toBe(1);
  expect((await second).vector[0]).toBe(2);
});

it('drops a reply that arrives after its request timed out', async () => {
  expect(await getSpeakerEmbeddingMethod()).toBe('neural');
  vi.useFakeTimers();
  const late = embedOffMainThread(audio());
  const lateResult = expect(late).rejects.toThrow('timed out');
  await vi.advanceTimersByTimeAsync(10_000);
  await lateResult;

  const next = embedOffMainThread(audio());
  await vi.waitFor(() => expect(fake().posted).toHaveLength(2));
  reply(fake().posted[0].id, 9); // the stale answer finally arrives
  reply(fake().posted[1].id, 3);

  expect((await next).vector[0]).toBe(3);
});

it('when the worker dies mid-request: the request fails, and the method is DSP from then on', async () => {
  expect(await getSpeakerEmbeddingMethod()).toBe('neural');
  const inFlight = embedOffMainThread(audio());
  await vi.waitFor(() => expect(fake().posted).toHaveLength(1));

  fake().emit('exit', 1);

  await expect(inFlight).rejects.toThrow('exited');
  expect(await getSpeakerEmbeddingMethod()).toBe('dsp');
  expect((await extractSpeakerEmbedding(audio()))?.method).toBe('dsp');
  await expect(embedOffMainThread(audio())).rejects.toThrow('no neural speaker model');
  expect(workers).toHaveLength(1); // degraded explicitly, not silently respawned
});
