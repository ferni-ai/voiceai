/**
 * A provider's refusal of an embedding request. The response body is left out
 * on purpose: it can echo the text that was embedded (a caller's fact), and an
 * error's message ends up in logs. The status is kept, as a number, for ops.
 *
 * @module utils/embedding-api-error
 */
export class EmbeddingApiError extends Error {
  constructor(
    provider: string,
    readonly status: number
  ) {
    super(`${provider} API error: ${status}`);
    this.name = 'EmbeddingApiError';
  }
}

/** No embedding client: Vertex has no GOOGLE_CLOUD_PROJECT (or, off Vertex, no key). */
export class EmbeddingUnavailableError extends Error {
  constructor() {
    super('Embedding client unavailable');
    this.name = 'EmbeddingUnavailableError';
  }
}
