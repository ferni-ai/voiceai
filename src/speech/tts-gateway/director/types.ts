/**
 * Speech Director types (spec §4.3).
 *
 * The Director decides, before Cartesia, everything Cartesia can express
 * (phrasing, pauses, normalization, one emotion and one speed per reply) and
 * marks what only the Rust audio layer can render (breaths, sighs, PCM
 * pauses) as RustEvents. P1/P2 compute the events; P3 consumes them.
 *
 * @module speech/tts-gateway/director/types
 */

import type { SSMLProsodyConfig } from '../types.js';

/** The gate: off (untouched path), shadow (plan + log only), live (applied). */
export type DirectorMode = 'off' | 'shadow' | 'live';

/**
 * Independently gated levers (spec §4.4: one gate per lever). `nonverbal`
 * (opening breath/sigh) and `laughter` are opt-in: off unless set.
 */
export type Lever =
  | 'phrasing'
  | 'pauses'
  | 'normalize'
  | 'emotion'
  | 'pacing'
  | 'nonverbal'
  | 'laughter';

export type LeverModes = Readonly<Record<Lever, DirectorMode>>;

/** Human pause buckets (spec §4.1), in milliseconds. */
export type PauseKind = 'clause' | 'thought' | 'preReveal';

/**
 * Where a Stage 2 event sits in the segment's audio. Word indices count words
 * in `cartesiaText` (0 = before the first word); `edge` works without
 * Cartesia word timestamps and is what Rust must support first.
 */
export type RustEventAnchor = { atWordIndex: number } | { edge: 'segment-start' | 'segment-end' };

export interface RustEvent {
  type: 'breath' | 'sigh' | 'pause' | 'laughSample';
  anchor: RustEventAnchor;
  /** e.g. { kind, durationMs, render } for pauses; { intensity } for breaths. */
  params: Record<string, number | string>;
}

export interface SpeechSegment {
  /** Exactly what is pushed to Cartesia for this segment, without tags. */
  cartesiaText: string;
  /**
   * Inline controls rendered by providers/cartesia.ts prosodyTags. Only the
   * first segment of a reply carries them (one emotion and speed per reply).
   */
  cartesiaControls?: SSMLProsodyConfig;
  rustEvents: RustEvent[];
}

/**
 * What the Director reads about the turn being answered. The shape of
 * tts-wrapper's session context, so the wrapper can pass it as it is:
 * `turnNumber` keys the Stage 2 plan (speech/reply-audio-plan.ts).
 */
export interface TurnContext {
  turnNumber?: number;
  /** The user's words this reply answers. */
  userRequest?: string;
  userEmotion?: { primary?: string };
}

/** The Director's only output: one per LLM reply. */
export interface SpeechPlan {
  segments: SpeechSegment[];
}
