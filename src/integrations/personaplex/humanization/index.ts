/**
 * PersonaPlex Humanization Layer
 *
 * Translates Ferni's SSML/prosody guidance to text-based instructions.
 */

export {
  translateSSMLToText,
  getTimeBasedVoiceGuidance,
  translateProsody,
  translateEmotionalExpression,
  translateBackchanneling,
  translateListeningSignals,
  translateBreathing,
  translateAnticipation,
  translateNaturalSpeech,
  generateTimingGuidance,
  type SSMLTranslationInput,
  type SSMLTranslationOutput,
} from './ssml-to-text.js';
