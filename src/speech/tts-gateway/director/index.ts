/**
 * Speech Director (spec: docs/superpowers/specs/2026-10-03-human-speech-director-design.md).
 *
 * Stage 1 of the human-speech pipeline: decides, before Cartesia, how a reply
 * is phrased, paused, normalized, and which one emotion and speed it gets.
 * Gated by SPEECH_DIRECTOR=off|shadow|live (default off).
 *
 * @module speech/tts-gateway/director
 */

export { directSpeech, type DirectSpeechOptions, type PlanSummary } from './reply-director.js';
export { leverModes, speechDirectorMode } from './gate.js';
export { directorSessions, DirectorSessions } from './session-state.js';
export { STABLE_EMOTIONS } from './emotion.js';
export type {
  DirectorMode,
  Lever,
  PauseKind,
  RustEvent,
  RustEventAnchor,
  SpeechPlan,
  SpeechSegment,
  TurnContext,
} from './types.js';
