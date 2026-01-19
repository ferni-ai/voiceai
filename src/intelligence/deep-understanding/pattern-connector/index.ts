/**
 * Pattern Connector Module
 *
 * Connect dots humans miss. Track topic co-occurrence, emotional patterns,
 * and generate insights.
 *
 * @module @ferni/intelligence/deep-understanding/pattern-connector
 */

export type {
  TopicCoOccurrence,
  EmotionalPattern,
  PatternInsight,
  IPatternConnector,
} from './types.js';

export { PatternConnectorToken } from './types.js';

export {
  PatternConnector,
  getPatternConnector,
  createPatternConnector,
  resetPatternConnector,
  clearUserData,
} from './engine.js';
