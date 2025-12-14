/**
 * Jack Bogle Character-Specific SSML Functions
 *
 * @deprecated This module is deprecated. Import from the persona bundle instead:
 *
 * ```typescript
 * import {
 *   applyPeterJohnSpeechTraits,
 *   addCatchphraseEmphasis,
 *   // ... etc
 * } from '../../personas/bundles/peter-john/speech-traits.js';
 * ```
 *
 * This file re-exports from the canonical persona bundle for backwards compatibility.
 */

// Re-export everything from the persona bundle
export {
  PETER_JOHN_SPEECH_CONFIG,
  addActiveListeningSounds,
  addCatchphraseEmphasis,
  addHistoricalYearGravity,
  addHumbleDeflection,
  addLaughterThroughout,
  addNameWarmth,
  addQuotationVoiceShift,
  addSelfCorrections,
  addStorytellingMode,
  addTricolonCadence,
  addWisdomCadence,
  addWordFindingPauses,
  applyPeterJohnSpeechTraits,
} from '../../personas/bundles/peter-john/speech-traits.js';
