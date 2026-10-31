/**
 * A routing correction carries the user's query. Its debug log gives the length.
 */
import { describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as unknown[][]);
const SENTINEL = 'my sister Dolores has stage-three lupus';

vi.mock('../../../../utils/safe-logger.js', () => {
  const capture = (...args: unknown[]) => void logged.push(args);
  const logger = { debug: capture, info: capture, warn: capture, error: capture };
  return { createLogger: () => logger, getLogger: () => logger };
});
vi.mock('../../embedding-providers.js', () => ({
  getEmbedding: async () => [0.1, 0.2],
  cosineSimilarity: () => 1,
}));
vi.mock('../../persistence/index.js', () => ({ getToolEmbeddingIndex: () => ({}) }));
vi.mock('../../registry.js', () => ({ getToolRegistry: () => ({}) }));
vi.mock('../../advanced/learned-retriever.js', () => ({ getLearnedRetriever: () => ({}) }));

import { OnlineLearningEngine } from '../online-learning-loop.js';

describe('OnlineLearningEngine.addCorrection log', () => {
  it('logs the query length, not the query', async () => {
    const engine = new OnlineLearningEngine({ autoRetrainInterval: 0 });
    await engine.addCorrection({
      query: SENTINEL,
      predictedToolId: 'a',
      actualToolId: 'b',
      confidence: 0.9,
      timestamp: Date.now(),
      source: 'explicit',
    });
    expect(JSON.stringify(logged)).not.toContain(SENTINEL);
    expect(logged).toContainEqual([
      expect.objectContaining({ queryLength: SENTINEL.length }),
      'Added correction for online learning',
    ]);
  });
});
