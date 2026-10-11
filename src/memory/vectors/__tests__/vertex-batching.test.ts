import { afterEach, describe, expect, it, vi } from 'vitest';
import { VertexAIEmbeddings } from '../embeddings.js';
import { vertexChunks } from '../vertex-chunks.js';

/** A fetch that answers each predict request with one vector per instance. */
function predictFetch() {
  const bodies: Array<{ instances: Array<{ content: string; task_type?: string }> }> = [];
  const fetch = vi.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as (typeof bodies)[number];
    bodies.push(body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        predictions: body.instances.map((_, i) => ({ embeddings: { values: [i, 1] } })),
      }),
    };
  });
  return { fetch, bodies };
}

const provider = (model: string) =>
  new VertexAIEmbeddings({ projectId: 'p', accessToken: 't', model });

describe('VertexAIEmbeddings.embedBatch', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends text-embedding texts 100 to a request, with the task type, in order', async () => {
    const f = predictFetch();
    vi.stubGlobal('fetch', f.fetch);
    const texts = Array.from({ length: 150 }, (_, i) => `fact ${i}`);
    const out = await provider('text-embedding-005').embedBatch(texts, 'RETRIEVAL_DOCUMENT');
    expect(f.bodies.map((b) => b.instances.length)).toEqual([100, 50]);
    expect(f.bodies[0].instances[0]).toEqual({ content: 'fact 0', task_type: 'RETRIEVAL_DOCUMENT' });
    expect(out).toHaveLength(150);
    expect(out[100]).toEqual([0, 1]); // first of the second request
  });

  it('keeps gemini-embedding at one text per request and sends no task type unless asked', async () => {
    const f = predictFetch();
    vi.stubGlobal('fetch', f.fetch);
    await provider('gemini-embedding-001').embedBatch(['a', 'b']);
    expect(f.bodies).toEqual([{ instances: [{ content: 'a' }] }, { instances: [{ content: 'b' }] }].map(
      (b) => ({ ...b, parameters: { autoTruncate: true } })
    ));
  });

  it('fails instead of misaligning when the reply has the wrong number of vectors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ predictions: [{ embeddings: { values: [1] } }] }),
      }))
    );
    await expect(provider('text-embedding-005').embedBatch(['a', 'b'])).rejects.toThrow(/1 embeddings for 2/);
  });
});

describe('vertexChunks', () => {
  it('also splits on size, so long texts stay under the request token limit', () => {
    const long = 'x'.repeat(30_000);
    expect(vertexChunks([long, long, 'short'], 'text-embedding-005').map((c) => c.length)).toEqual([1, 2]);
  });
});
