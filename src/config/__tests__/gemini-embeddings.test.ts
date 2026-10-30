/**
 * Semantic-router embeddings and the embedding matcher used to call the Gemini
 * API's embedContent with GOOGLE_API_KEY. That key was invalid in prod, and the
 * unpaid tier may not be sent user text. They now embed through the shared
 * client (Vertex on the agent). These tests mock that client and check each
 * path calls it with gemini-embedding-001, sends nothing to
 * generativelanguage.googleapis.com, and turns a failure into a typed error.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  client: null as null | { models: Record<string, ReturnType<typeof vi.fn>> },
}));

vi.mock('../gemini-config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../gemini-config.js')>()),
  getGeminiClient: async () => state.client,
  isGeminiConfigured: () => true,
}));

import { embedTexts } from '../gemini-embeddings.js';
import { GoogleEmbeddingProvider } from '../../tools/semantic-router/embedding-providers.js';

const embedContent = vi.fn();
const fetchSpy = vi.fn();

function vectors(n: number, dim = 3072): { embeddings: Array<{ values: number[] }> } {
  return { embeddings: Array.from({ length: n }, () => ({ values: new Array(dim).fill(0.1) })) };
}

beforeEach(() => {
  embedContent.mockReset();
  fetchSpy.mockReset();
  vi.stubGlobal('fetch', fetchSpy);
  state.client = { models: { embedContent } };
});

afterEach(() => {
  vi.unstubAllGlobals();
  // No path may fall back to the raw Gemini API.
  expect(fetchSpy).not.toHaveBeenCalled();
});

describe('embedTexts', () => {
  it('throws EmbeddingUnavailableError when there is no client', async () => {
    state.client = null;
    await expect(embedTexts('m', ['a'])).rejects.toMatchObject({
      name: 'EmbeddingUnavailableError',
    });
  });

  it('a refusal becomes EmbeddingApiError with the status, not the message', async () => {
    embedContent.mockRejectedValue(Object.assign(new Error('echo: secret words'), { status: 403 }));
    const thrown = await embedTexts('m', ['secret words']).catch((e: Error) => e);
    expect(thrown).toMatchObject({ name: 'EmbeddingApiError', status: 403 });
    expect((thrown as Error).message).not.toContain('secret words');
  });

  it('rejects a short or empty answer instead of returning holes', async () => {
    embedContent.mockResolvedValue(vectors(1));
    await expect(embedTexts('m', ['a', 'b'])).rejects.toMatchObject({
      name: 'EmbeddingApiError',
    });
    embedContent.mockResolvedValue({ embeddings: [{ values: [] }] });
    await expect(embedTexts('m', ['a'])).rejects.toMatchObject({ name: 'EmbeddingApiError' });
  });

  it('sends 100 inputs per request, in order', async () => {
    embedContent.mockImplementation(async ({ contents }: { contents: string[] }) =>
      vectors(contents.length, 2)
    );
    const out = await embedTexts(
      'm',
      Array.from({ length: 250 }, (_, i) => `t${i}`)
    );
    expect(out).toHaveLength(250);
    expect(embedContent.mock.calls.map((c) => c[0].contents.length)).toEqual([100, 100, 50]);
  });
});

describe('semantic-router GoogleEmbeddingProvider', () => {
  it('embed and embedBatch use gemini-embedding-001 on the client, 3072 dims', async () => {
    embedContent.mockImplementation(async ({ contents }: { contents: string[] }) =>
      vectors(contents.length)
    );
    const provider = new GoogleEmbeddingProvider({ useCache: false });
    const one = await provider.embed('set a timer');
    const batch = await provider.embedBatch(['a', 'b']);
    expect(one).toHaveLength(provider.dimensions);
    expect(batch).toHaveLength(2);
    expect(embedContent.mock.calls.map((c) => c[0].model)).toEqual([
      'gemini-embedding-001',
      'gemini-embedding-001',
    ]);
  });

  it('embedBatch only asks for the texts it has not cached', async () => {
    embedContent.mockImplementation(async ({ contents }: { contents: string[] }) =>
      vectors(contents.length)
    );
    const provider = new GoogleEmbeddingProvider();
    await provider.embed('cached phrase for gk1');
    await provider.embedBatch(['cached phrase for gk1', 'fresh phrase for gk1']);
    expect(embedContent.mock.calls[1][0].contents).toEqual(['fresh phrase for gk1']);
  });
});

describe('no raw Gemini API in the moved embedding paths', () => {
  const SRC = join(__dirname, '..', '..');
  it.each([
    'tools/semantic-router/embedding-providers.ts',
    'services/semantic/embedding-matcher.ts',
  ])('%s has no API-key URL or key reader', (file) => {
    const source = readFileSync(join(SRC, file), 'utf8');
    expect(source).not.toContain('generativelanguage.googleapis.com');
    expect(source).not.toMatch(/process\.env\.(GOOGLE_API_KEY|GEMINI_API_KEY)/);
  });
});
