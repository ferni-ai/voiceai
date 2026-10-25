/**
 * A refused embedding request must name what failed, never what was embedded: the
 * response body can echo the text sent (a caller's fact) back. The error keeps
 * the numeric HTTP status and a fixed message; the log line carries its class and
 * status only.
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
    const thrown = (await make()
      .embedBatch([SENTINEL])
      .then(
        () => undefined,
        (e: unknown) => e
      )) as Error & { status?: number };
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown.message).not.toContain(SENTINEL);
    expect(thrown.message).toMatch(/API error: 400$/);
    expect(thrown.status).toBe(400);
    expect(JSON.stringify(logged)).not.toContain(SENTINEL);
    expect(logged.map(([fields]) => fields)).toContainEqual({
      error: 'EmbeddingApiError',
      status: 400,
    });
  });
});
