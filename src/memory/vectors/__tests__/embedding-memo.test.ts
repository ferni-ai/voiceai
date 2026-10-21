/**
 * Prod 2026-10-21: a turn cost ~35-50 Vertex embedding requests and Vertex
 * answered some with shared-capacity 429s. The same text is now embedded once
 * per process, and 429 retries are jittered so refused callers spread out.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VertexAIEmbeddings } from '../embeddings.js';
import { EmbeddingMemo } from '../embedding-memo.js';

type Body = { instances: Array<{ content: string; task_type?: string }> };

/** A predict endpoint: one vector per instance, [length of its text, 1]. */
function predictFetch(statuses: number[] = []) {
  const bodies: Body[] = [];
  const fetch = vi.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as Body;
    bodies.push(body);
    const status = statuses.shift() ?? 200;
    if (status !== 200) return { ok: false, status, text: async () => 'Resource exhausted' };
    return {
      ok: true,
      status,
      json: async () => ({
        predictions: body.instances.map((i) => ({ embeddings: { values: [i.content.length, 1] } })),
      }),
    };
  });
  vi.stubGlobal('fetch', fetch);
  return { fetch, bodies };
}

const vertex = () =>
  new VertexAIEmbeddings({ projectId: 'p', accessToken: 't', model: 'text-embedding-005' });

describe('VertexAIEmbeddings memo', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('embeds the same text once, and a caller mutating its copy does not poison the next', async () => {
    const f = predictFetch();
    const provider = vertex();
    const first = await provider.embed('how is Biscuit doing');
    first[0] = 999;
    expect(await provider.embed('how is Biscuit doing')).toEqual([20, 1]);
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });

  it('shares one request between concurrent callers of the same text', async () => {
    const f = predictFetch();
    const provider = vertex();
    const [a, b] = await Promise.all([provider.embed('same turn'), provider.embed('same turn')]);
    expect(a).toEqual(b);
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });

  it('keys by task type: a query and a document of the same text are two vectors', async () => {
    const f = predictFetch();
    const provider = vertex();
    await provider.embedBatch(['walked Biscuit'], 'RETRIEVAL_QUERY');
    await provider.embedBatch(['walked Biscuit'], 'RETRIEVAL_DOCUMENT');
    expect(f.bodies.map((b) => b.instances[0].task_type)).toEqual([
      'RETRIEVAL_QUERY',
      'RETRIEVAL_DOCUMENT',
    ]);
  });

  it('sends only the texts it has not seen, and keeps the batch order', async () => {
    const f = predictFetch();
    const provider = vertex();
    await provider.embedBatch(['aa', 'bbb']);
    const out = await provider.embedBatch(['bbb', 'c', 'aa', 'c']);
    expect(f.bodies[1].instances.map((i) => i.content)).toEqual(['c']);
    expect(out).toEqual([
      [3, 1],
      [1, 1],
      [2, 1],
      [1, 1],
    ]);
  });

  it('does not remember failures: the next call asks again', async () => {
    const f = predictFetch([500]);
    const provider = vertex();
    await expect(provider.embed('flaky')).rejects.toThrow(/500/);
    await expect(provider.embed('flaky')).resolves.toEqual([5, 1]);
    expect(f.fetch).toHaveBeenCalledTimes(2);
  });

  it('evicts the least recently used vector past its bound', async () => {
    const memo = new EmbeddingMemo(2);
    const fetchMissing = vi.fn(async (texts: string[]) => texts.map((t) => [t.length]));
    await memo.embed('m', undefined, ['a', 'bb'], fetchMissing);
    await memo.embed('m', undefined, ['a'], fetchMissing); // a is now the newest
    await memo.embed('m', undefined, ['ccc'], fetchMissing); // evicts bb
    await memo.embed('m', undefined, ['a', 'bb'], fetchMissing);
    expect(fetchMissing.mock.calls.map((c) => c[0])).toEqual([['a', 'bb'], ['ccc'], ['bb']]);
    expect(memo.size).toBe(2);
  });
});

describe('VertexAIEmbeddings 429 backoff', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('waits a jittered half-to-full step before retrying a 429, then succeeds', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const f = predictFetch([429]);
    const pending = vertex().embed('quota');
    await vi.advanceTimersByTimeAsync(199);
    expect(f.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual([5, 1]);
    expect(f.fetch).toHaveBeenCalledTimes(2);
  });

  it('gives up after three retries, at most 2.8 s of waiting', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const f = predictFetch([429, 429, 429, 429]);
    const settled = expect(vertex().embed('quota')).rejects.toThrow(/429/);
    await vi.advanceTimersByTimeAsync(2800);
    await settled;
    expect(f.fetch).toHaveBeenCalledTimes(4);
  });

  it('does not retry other errors', async () => {
    const f = predictFetch([503]);
    await expect(vertex().embed('down')).rejects.toThrow(/503/);
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });
});
