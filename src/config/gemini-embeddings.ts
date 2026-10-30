/**
 * Embeddings through the shared Gemini client (Vertex on the agent).
 *
 * The semantic router and the embedding matcher called the Gemini API's
 * embedContent with GOOGLE_API_KEY. That key was invalid in prod, so both
 * failed quietly, and the unpaid Gemini API tier may not be sent user text.
 * gemini-embedding-001 exists on Vertex with the same 3072 dimensions, so
 * callers keep their model and their vectors stay the same size.
 *
 * @module config/gemini-embeddings
 */

import { EmbeddingApiError, EmbeddingUnavailableError } from '../utils/embedding-api-error.js';
import { errorStatus } from '../utils/error-class.js';
import { getGeminiClient } from './gemini-config.js';

interface EmbedClient {
  models: {
    embedContent(req: {
      model: string;
      contents: string[];
      config?: { abortSignal?: AbortSignal };
    }): Promise<{ embeddings?: Array<{ values?: number[] }> }>;
  };
}

/** Inputs per request. Vertex accepted 250 gemini-embedding-001 inputs in one call (2026-10-30). */
const BATCH_SIZE = 100;

/**
 * One vector per text, in order. `timeoutMs` bounds each request. Throws EmbeddingUnavailableError when there is
 * no client, and EmbeddingApiError (status only, 0 when none) when Vertex
 * refuses or answers with fewer or empty vectors.
 */
export async function embedTexts(
  model: string,
  texts: string[],
  timeoutMs?: number
): Promise<number[][]> {
  const client = (await getGeminiClient()) as EmbedClient | null;
  if (!client) throw new EmbeddingUnavailableError();
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    let response: Awaited<ReturnType<EmbedClient['models']['embedContent']>>;
    try {
      // eslint-disable-next-line no-await-in-loop -- batches go in order, one request at a time
      response = await client.models.embedContent({
        model,
        contents: batch,
        config: timeoutMs ? { abortSignal: AbortSignal.timeout(timeoutMs) } : undefined,
      });
    } catch (error) {
      throw new EmbeddingApiError('Vertex AI', errorStatus(error) ?? 0);
    }
    const vectors = (response.embeddings ?? []).map((e) => e.values ?? []);
    if (vectors.length !== batch.length || vectors.some((v) => v.length === 0)) {
      throw new EmbeddingApiError('Vertex AI', 0);
    }
    out.push(...vectors);
  }
  return out;
}
