/**
 * A routing correction reaches the learned retriever with the caller's query. Its logs give
 * the length, never the words (Seth, 2026-11-12: logs keep lengths only), anywhere but on
 * dev's Firestore database (the dev agent and PR previews), which keeps the words.
 *
 * The dev-or-not decision is the real one (config/firestore-database.ts), driven by
 * FIRESTORE_DATABASE set per case: a name that is neither prod's nor dev's is not dev.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as unknown[][]);
const SENTINEL = 'remind me to water the ferns on thursday morning';

vi.mock('../../../../utils/safe-logger.js', () => {
  const capture = (...args: unknown[]) => void logged.push(args);
  const logger = { debug: capture, info: capture, warn: capture, error: capture };
  return { createLogger: () => logger, getLogger: () => logger };
});
vi.mock('../../embedding-providers.js', () => ({
  getEmbedding: async () => [0.1, 0.2],
  cosineSimilarity: () => 1,
}));

import { LearnedRetriever } from '../learned-retriever.js';

beforeEach(() => {
  logged.length = 0;
});
afterEach(() => vi.unstubAllEnvs());

describe('LearnedRetriever.addCorrection log', () => {
  it.each([
    ['unset', undefined],
    ["prod's name", '(default)'],
    ['a single space', ' '],
    ["dev's name with a newline after it", 'ferni-dev\n'],
    ["prod's name in another case", '(Default)'],
    ["dev's name in another case", 'Ferni-Dev'],
    ["dev's name misspelt", 'ferni-dve'],
    ["a longer name that starts with dev's", 'ferni-dev-2'],
  ])('logs the query length, not the query, on %s', async (_name, database) => {
    vi.stubEnv('FIRESTORE_DATABASE', database);
    await new LearnedRetriever().addCorrection(SENTINEL, 'set_reminder', 'play_music');

    expect(JSON.stringify(logged)).not.toContain(SENTINEL.slice(0, 12));
    expect(logged).toContainEqual([
      expect.objectContaining({ queryLength: SENTINEL.length, actualTool: 'play_music' }),
      'Processing correction',
    ]);
  });

  it('keeps the query on dev, so the check above can fail', async () => {
    vi.stubEnv('FIRESTORE_DATABASE', 'ferni-dev');
    await new LearnedRetriever().addCorrection(SENTINEL, 'set_reminder', 'play_music');

    expect(logged).toContainEqual([
      expect.objectContaining({ query: SENTINEL, queryLength: SENTINEL.length }),
      'Processing correction',
    ]);
  });
});
