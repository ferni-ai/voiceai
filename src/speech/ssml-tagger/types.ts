/**
 * SSML Tagger Type Definitions
 *
 * @deprecated This file is deprecated. Import from '../../ssml/types.js' instead.
 *
 * This file re-exports from the canonical source for backwards compatibility.
 * All new code should import directly from '../../ssml/types.js'.
 */

// Re-export types from the canonical source
export type {
  CartesiaEmotion,
  DetectedPacing,
  DetectedVocalCues,
  DetectedVolume,
  PronunciationEntry,
  TaggingContext,
} from '../../ssml/types.js';

export {
  ALL_CARTESIA_EMOTIONS,
  CARTESIA_EMOTIONS,
  CARTESIA_SUPPORTED_EMOTIONS,
} from '../../ssml/types.js';
