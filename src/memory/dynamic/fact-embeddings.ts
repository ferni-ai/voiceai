/**
 * Facts written with their retrieval vectors (RECALL_VECTOR_INDEX=on), so a
 * call's recall uses the stored vector instead of embedding every fact at
 * call start, and can find an older fact by meaning (recall/stored-fact-vectors.ts).
 *
 * One embedding request per batch of facts. A fact whose vector can't be made
 * is written as it is, without one: it is never dropped, and recall embeds it
 * at call start as before.
 *
 * @module memory/dynamic/fact-embeddings
 */

import { FieldValue } from '@google-cloud/firestore';
import { withTimeout } from '../../utils/async.js';
import { errorFields } from '../../utils/error-class.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  defaultEmbedder,
  defaultEmbeddingModel,
  type RetrievalEmbedder,
} from '../recall/semantic-recall.js';
import {
  EMBEDDING_TASK,
  FACT_VECTOR_DIMENSION,
  recallVectorIndexEnabled,
  storedFactText,
} from '../recall/stored-fact-vectors.js';

const log = createLogger({ module: 'FactEmbeddings' });

/** Long enough for a batch; the facts are written without vectors past it. */
const EMBED_TIMEOUT_MS = 10_000;

export interface FactEmbeddingDeps {
  /** RECALL_VECTOR_INDEX=on; read from the environment when not given. */
  enabled?: boolean;
  embed?: RetrievalEmbedder;
  model?: () => Promise<string>;
}

/** The fact documents, each with its vector when the flag is on and embedding works. */
export async function withFactEmbeddings(
  facts: Array<Record<string, unknown>>,
  deps: FactEmbeddingDeps = {}
): Promise<Array<Record<string, unknown>>> {
  if (!(deps.enabled ?? recallVectorIndexEnabled()) || facts.length === 0) return facts;
  try {
    const embed = deps.embed ?? defaultEmbedder;
    const [vectors, model] = await withTimeout(
      Promise.all([
        embed(facts.map(storedFactText), 'document'),
        (deps.model ?? defaultEmbeddingModel)(),
      ]),
      EMBED_TIMEOUT_MS,
      'Fact embeddings'
    );
    return facts.map((f, i) =>
      vectors[i]?.length === FACT_VECTOR_DIMENSION
        ? {
            ...f,
            embedding: FieldValue.vector(vectors[i]),
            embeddingModel: model,
            embeddingTask: EMBEDDING_TASK,
          }
        : f
    );
  } catch (error) {
    log.warn({ ...errorFields(error), facts: facts.length }, 'Facts written without vectors');
    return facts;
  }
}
