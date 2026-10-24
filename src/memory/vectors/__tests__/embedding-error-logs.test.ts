/**
 * A failed embedding request must log what failed, never what was embedded: the
 * provider's error carries the response body, and that can echo the text sent
 * (a caller's fact) back. Only the error class is logged.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as unknown[][]);

vi.mock('../../../utils/safe-logger.js', () => {
  const capture = (...args: unknown[]) => void logged.push(args);
  const logger = { debug: capture, info: capture, warn: capture, error: capture };
  return { createLogger: () => logger, getLogger: () => logger };
});

import { GoogleEmbeddings, OpenAIEmbeddings, VertexAIEmbeddings } from '../embeddings.js';

const SENTINEL = 'my sister Dolores has stage-three lupus';

/** A provider that refuses with a body that quotes the request's input back. */
function echoingFetch() {
  return vi.fn(async () => ({
    ok: false,
    status: 400,
    text: async () => `{"error":"invalid input: ${SENTINEL} is too long"}`,
  }));
}

const providers: Array<[string, () => { embedBatch(t: string[]): Promise<number[][]> }]> = [
  ['OpenAI', () => new OpenAIEmbeddings({ apiKey: 'k' })],
  ['Google', () => new GoogleEmbeddings({ apiKey: 'k' })],
  ['Vertex', () => new VertexAIEmbeddings({ projectId: 'p', accessToken: 't' })],
];

describe('embedding provider error logs', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    logged.length = 0;
  });

  it.each(providers)('%s logs the error class, not the response body', async (_name, make) => {
    vi.stubGlobal('fetch', echoingFetch());
    await expect(make().embedBatch([SENTINEL])).rejects.toThrow();
    const errors = logged.filter((args) => JSON.stringify(args).includes('"error"'));
    expect(errors).toHaveLength(1);
    expect(JSON.stringify(logged)).not.toContain(SENTINEL);
    expect(errors[0][0]).toEqual({ error: 'Error' });
  });
});
