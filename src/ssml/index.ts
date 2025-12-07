/**
 * SSML Module Index
 * 
 * Re-exports all SSML functionality for backwards compatibility.
 * The main ssml-tagger.ts file imports from this module.
 */

// Types
export * from './types.js';

// Constants
export * from './constants.js';

// Tag helpers
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
} from './tags.js';

// Detection
export {
  detectEmotion,
  detectPacing,
  detectVolume,
  detectVocalCues,
} from './detection.js';

// Core functionality
export {
  tagTextWithSsmlPersonaAware,
  tagTextWithSsmlPersonaAware as tagTextWithSsml, // Alias for backwards compatibility
  stripSsmlTags,
  hasSsmlTags,
  sanitizeSsml,
} from './core.js';
