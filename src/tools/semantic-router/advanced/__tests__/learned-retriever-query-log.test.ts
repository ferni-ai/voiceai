/**
 * A routing correction reaches the learned retriever with the caller's query. Outside dev
 * its logs give the length, never the words (Seth, 2026-11-12: logs keep lengths only);
 * dev and PR previews (a non-prod Firestore database) keep the words.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as unknown[][]);
const dev = vi.hoisted(() => ({ on: false }));
const SENTINEL = 'remind me to water the ferns on thursday morning';

vi.mock('../../../../utils/safe-logger.js', () => {
  const capture = (...args: unknown[]) => void logged.push(args);
  const logger = { debug: capture, info: capture, warn: capture, error: capture };
  return { createLogger: () => logger, getLogger: () => logger };
});
vi.mock('../../../../config/environment.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isNonProdDatabase: () => dev.on,
}));
vi.mock('../../embedding-providers.js', () => ({
  getEmbedding: async () => [0.1, 0.2],
  cosineSimilarity: () => 1,
}));

import { LearnedRetriever } from '../learned-retriever.js';

beforeEach(() => {
  logged.length = 0;
  dev.on = false;
});

describe('LearnedRetriever.addCorrection log', () => {
  it('logs the query length, not the query, outside dev', async () => {
    await new LearnedRetriever().addCorrection(SENTINEL, 'set_reminder', 'play_music');

    expect(JSON.stringify(logged)).not.toContain(SENTINEL.slice(0, 12));
    expect(logged).toContainEqual([
      expect.objectContaining({ queryLength: SENTINEL.length, actualTool: 'play_music' }),
      'Processing correction',
    ]);
  });

  it('keeps the query on dev, so the check above can fail', async () => {
    dev.on = true;
    await new LearnedRetriever().addCorrection(SENTINEL, 'set_reminder', 'play_music');

    expect(logged).toContainEqual([
      expect.objectContaining({ query: SENTINEL, queryLength: SENTINEL.length }),
      'Processing correction',
    ]);
  });
});
