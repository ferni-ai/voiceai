/**
 * Vocal expression: the value objects shared by the policy, the TTS gateway
 * and the per-turn LLM cue.
 *
 * @module speech/expression/types
 */

/** What a TTS engine can actually render. Anything else is removed before synthesis. */
export interface VoiceCapabilities {
  /** Honors an emotion hint (Cartesia generation emotion). */
  readonly emotion: boolean;
  /** Honors speed and volume ratios. */
  readonly pace: boolean;
  /** Renders a [laughter] tag as a laugh instead of reading it aloud. */
  readonly laughter: boolean;
}

export const EXPRESSIVE_VOICE: VoiceCapabilities = { emotion: true, pace: true, laughter: true };
export const PLAIN_VOICE: VoiceCapabilities = { emotion: false, pace: false, laughter: false };

/** How a whole reply should sound. Speed and volume are ratios, 1 = default. */
export interface VocalDirection {
  readonly emotion?: string;
  readonly speed: number;
  readonly volume: number;
}

export const NEUTRAL_DIRECTION: VocalDirection = { speed: 1, volume: 1 };

/** The caller's most recent laugh, as heard in their audio. */
export interface UserLaugh {
  /** Epoch ms when it was heard. */
  readonly at: number;
  readonly confidence: number;
  readonly suggestedResponse: 'join_in' | 'acknowledge' | 'smile' | 'none';
}
