/**
 * SSML Module
 *
 * Exports SSML processing utilities.
 *
 * @module speech/tts-gateway/ssml
 */

export {
  SSMLProcessor,
  getSSMLProcessor,
  createSSMLProcessor,
  parseSSML,
  stripSSML,
  normalizeForCache,
  containsSSML,
  hasIncompleteSSML,
} from './processor.js';

// Re-export types from main types file
export type { SSMLParseResult, SSMLProsodyConfig } from '../types.js';
