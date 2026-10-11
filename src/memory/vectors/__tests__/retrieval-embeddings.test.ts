import { afterEach, describe, expect, it, vi } from 'vitest';
import { setEmbeddingProvider, VertexAIEmbeddings } from '../embeddings.js';
import { embedForRetrieval } from '../retrieval-embeddings.js';

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

describe('embedForRetrieval', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks Vertex for query and document embeddings', async () => {
    const f = predictFetch();
    vi.stubGlobal('fetch', f.fetch);
    setEmbeddingProvider(provider('text-embedding-005'));
    await embedForRetrieval(['how is the pup'], 'query');
    await embedForRetrieval(['Biscuit breed: golden retriever'], 'document');
    expect(f.bodies.map((b) => b.instances[0].task_type)).toEqual(['RETRIEVAL_QUERY', 'RETRIEVAL_DOCUMENT']);
  });
});
