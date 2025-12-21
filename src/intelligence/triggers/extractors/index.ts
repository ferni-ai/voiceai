/**
 * Profile Extractors
 *
 * Phase 2: Personal Memory Integration
 *
 * These extractors analyze conversation text to build user trigger profiles.
 *
 * @module Extractors
 */

export {
  extractSignificantDates,
  hasDateMentions,
  extractYear,
  type DateExtractionOptions,
  type DateExtractionResult,
} from './significant-date-extractor.js';

export {
  extractRelationships,
  hasRelationshipMentions,
  type RelationshipExtractionOptions,
  type RelationshipExtractionResult,
} from './relationship-extractor.js';

export {
  extractCommunicationPatterns,
  hasDistressSignals,
  hasDeflectionSignals,
  getDominantPattern,
  type CommunicationPatternExtractionOptions,
  type CommunicationPatternExtractionResult,
} from './communication-pattern-extractor.js';
