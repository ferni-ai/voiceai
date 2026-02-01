/**
 * Multi-Intent Module - Phase 4 Semantic Upgrade
 *
 * Semantic understanding for compound user queries.
 * Replaces keyword-based detection with embedding similarity.
 *
 * @module tools/semantic-router/multi-intent
 */

export {
  semanticSplit,
  likelyMultiIntent,
  type IntentSpan,
  type SemanticSplitResult,
} from './semantic-splitter.js';

export {
  rankIntents,
  getPrimaryIntent,
  getSecondaryIntents,
  type RankedIntent,
  type RankingResult,
} from './intent-ranker.js';
