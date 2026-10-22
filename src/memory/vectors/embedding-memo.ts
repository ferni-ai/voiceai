/**
 * Fewer, gentler Vertex embedding requests (VertexAIEmbeddings.embedBatch).
 *
 * Prod 2026-10-21: a conversational turn cost ~35-50 text-embedding-005
 * Predict requests (project-wide request count / turns, 09Z and 11Z), much of
 * it the same turn text embedded by several modules, and Vertex answered some
 * with shared-capacity 429s ("Resource exhausted") at 81-336 requests a minute,
 * far under the 1,500/min quota (no quota-exceeded events).
 *
 * - EmbeddingMemo: per-process LRU keyed by model + task type + text hash, with
 *   in-flight dedupe, so the same text costs one request per process.
 * - postWithBackoff: on 429 only, retry with full-jitter exponential backoff, so
 *   callers that were refused together do not retry together.
 *
 * @module memory/vectors/embedding-memo
 */

import { createHash } from 'crypto';

/** Vectors kept per provider. A 768-float vector is ~6 KB, so ~6 MB at most. */
export const EMBEDDING_MEMO_MAX = 1000;

/** Cap of each 429 retry's wait; the wait is uniform in [cap/2, cap]. Worst case 2.8 s. */
export const VERTEX_429_BACKOFF_MS = [400, 800, 1600] as const;

export class EmbeddingMemo {
  private readonly done = new Map<string, number[]>();
  private readonly pending = new Map<string, Promise<number[]>>();

  constructor(private readonly max = EMBEDDING_MEMO_MAX) {}

  static key(model: string, taskType: string | undefined, text: string): string {
    return `${model}|${taskType ?? ''}|${createHash('sha256').update(text).digest('hex')}`;
  }

  get size(): number {
    return this.done.size;
  }

  /**
   * The vectors of `texts`, in order. Texts neither stored nor in flight go to
   * `fetchMissing` once each; failures are not stored, so the next call retries.
   */
  async embed(
    model: string,
    taskType: string | undefined,
    texts: string[],
    fetchMissing: (texts: string[]) => Promise<number[][]>
  ): Promise<number[][]> {
    const keys = texts.map((text) => EmbeddingMemo.key(model, taskType, text));
    const missing = new Map<string, string>();
    keys.forEach((key, i) => {
      if (!this.done.has(key) && !this.pending.has(key)) missing.set(key, texts[i]);
    });
    if (missing.size > 0) {
      const fetched = fetchMissing([...missing.values()]);
      [...missing.keys()].forEach((key, j) => {
        const one = fetched.then((vectors) => {
          this.remember(key, vectors[j]);
          return vectors[j];
        });
        const forget = () => this.pending.delete(key);
        one.then(forget, forget);
        this.pending.set(key, one);
      });
    }
    const vectors = await Promise.all(keys.map(async (key) => this.lookup(key)));
    return vectors.map((vector) => [...vector]);
  }

  private async lookup(key: string): Promise<number[]> {
    const stored = this.done.get(key);
    if (stored) {
      this.remember(key, stored); // most recently used
      return stored;
    }
    return this.pending.get(key) as Promise<number[]>;
  }

  private remember(key: string, vector: number[]): void {
    this.done.delete(key);
    this.done.set(key, vector);
    while (this.done.size > this.max) {
      const oldest = this.done.keys().next().value as string;
      this.done.delete(oldest);
    }
  }
}

/** POST, retrying only 429s, each after a jittered wait (see VERTEX_429_BACKOFF_MS). */
export async function postWithBackoff(url: string, init: RequestInit): Promise<Response> {
  let response = await fetch(url, init);
  for (const cap of VERTEX_429_BACKOFF_MS) {
    if (response.status !== 429) return response;
    const wait = cap / 2 + Math.random() * (cap / 2);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, wait);
    });
    response = await fetch(url, init);
  }
  return response;
}
