/**
 * Batching for Vertex AI embedding requests (VertexAIEmbeddings.embedBatch).
 *
 * @module memory/vectors/vertex-chunks
 */

/**
 * Texts per Vertex predict request. text-embedding-* models take up to 250
 * texts and 20,000 tokens a request; gemini-embedding takes one. One request
 * per text sent 300 requests for one user's facts and hit the per-minute quota.
 */
export function vertexChunks(texts: string[], model: string): string[][] {
  if (!model.startsWith('text-')) return texts.map((t) => [t]);
  const MAX_TEXTS = 100;
  const MAX_CHARS = 40_000; // ~10k tokens, half the request limit
  const chunks: string[][] = [];
  let chunk: string[] = [];
  let chars = 0;
  for (const text of texts) {
    if (chunk.length > 0 && (chunk.length >= MAX_TEXTS || chars + text.length > MAX_CHARS)) {
      chunks.push(chunk);
      chunk = [];
      chars = 0;
    }
    chunk.push(text);
    chars += text.length;
  }
  if (chunk.length > 0) chunks.push(chunk);
  return chunks;
}

/**
 * One request's instances. taskType (e.g. RETRIEVAL_QUERY) tells Vertex which
 * side of a search the text is on; see retrieval-embeddings.ts.
 */
export function vertexInstances(
  texts: string[],
  taskType?: string
): Array<{ content: string; task_type?: string }> {
  return texts.map((content) => (taskType ? { content, task_type: taskType } : { content }));
}

/** The vectors of one reply, in order; fails rather than misalign them with the texts. */
export function vertexVectors(
  data: { predictions?: Array<{ embeddings: { values: number[] } }> },
  expected: number
): number[][] {
  if (data.predictions?.length !== expected) {
    throw new Error(`Vertex AI returned ${data.predictions?.length} embeddings for ${expected} texts`);
  }
  return data.predictions.map((p) => p.embeddings.values);
}
