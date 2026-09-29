/**
 * Vocal expression: how Ferni's voice carries feeling on a live call.
 *
 * - vocal-direction: one policy for the emotion and pace of a reply
 * - voice-fit: strip what the active TTS engine cannot render
 * - laughter-reciprocity: laugh with the caller, sparingly
 * - session-expression: the live-call adapter over userData
 *
 * @module speech/expression
 */

export * from './types.js';
export { CALM_EMOTIONS, calmEmotion, directVoice, openingProsody } from './vocal-direction.js';
export { fitToVoice } from './voice-fit.js';
export {
  laughCue,
  LAUGH_ALONG_CUE,
  SMILE_ALONG_CUE,
  type LaughCueInput,
  type LaughCueRecord,
} from './laughter-reciprocity.js';
export { nextReplyCues, readUserLaugh, sessionVocalDirection } from './session-expression.js';
