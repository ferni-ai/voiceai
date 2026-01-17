/**
 * Cartesia SSML Helpers - Re-export Layer
 *
 * This module provides a convenient namespace for Cartesia-specific functionality.
 * All implementation lives in tags.ts and types.ts.
 *
 * Usage:
 * ```typescript
 * import { clampSpeed, emotionTag, CARTESIA_EMOTIONS } from './cartesia.js';
 * ```
 *
 * @see https://docs.cartesia.ai/build-with-cartesia/sonic-3/ssml-tags
 * @module ssml/cartesia
 */

// Re-export tag generation functions from tags.ts
export {
  clampSpeed,
  clampVolume,
  speedTag,
  volumeTag,
  breakTag,
  emotionTag,
  spellTag,
  mapToCartesiaEmotion,
  getContextualEmotion,
  detectEmotionFromKeywords,
} from './tags.js';

// Re-export emotion types and constants from types.ts
export {
  CARTESIA_EMOTIONS,
  CARTESIA_SUPPORTED_EMOTIONS,
  ALL_CARTESIA_EMOTIONS,
  isCartesiaSupportedEmotion,
  type CartesiaEmotion,
} from './types.js';
