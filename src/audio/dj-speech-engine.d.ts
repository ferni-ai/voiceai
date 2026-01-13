/**
 * DJ Speech Engine - What to Say
 *
 * This module contains ALL speech/phrase generation for the DJ system:
 * - Intro phrases when track starts
 * - Outro phrases when track ends
 * - Mid-song interjections
 * - Transition phrases
 * - LLM-powered contextual commentary
 *
 * All functions are focused on CONTENT generation - they don't decide
 * WHEN to speak (that's the Decision Engine's job).
 *
 * @module audio/dj-speech-engine
 */
import type { MusicTrack } from './music-player.js';
/**
 * Context for generating track-related speech
 */
export interface TrackSpeechContext {
    track: MusicTrack;
    personaId: string;
    /** Optional fact about the artist for contextual commentary */
    artistFact?: string;
    /** Whether user has heard this track before */
    isRepeat?: boolean;
    /** User's apparent mood */
    userMood?: string;
}
/**
 * Moment types for interjections
 */
export type InterjectionMoment = 'track_start' | 'mid_song' | 'track_end' | 'buildup' | 'drop' | 'appreciation' | 'check_in' | 'user_liked' | 'user_skipped';
/**
 * Generate an outro phrase when track is ending
 */
export declare function getOutroPhrase(context: TrackSpeechContext): string;
/**
 * Generate a transition phrase when changing tracks
 */
export declare function getTransitionPhrase(personaId: string): string;
/**
 * Generate a drop phrase when track starts
 */
export declare function getDropPhrase(context: TrackSpeechContext): string;
/**
 * Generate a mid-song moment phrase
 */
export declare function getMomentPhrase(momentType: 'buildup' | 'drop' | 'appreciation', personaId: string): string;
/**
 * Generate a check-in phrase for long tracks
 */
export declare function getCheckInPhrase(personaId: string): string;
/**
 * Generate a music stopped phrase
 */
export declare function getMusicStoppedPhrase(personaId: string, wasPaused?: boolean): string;
/**
 * Generate an LLM-powered interjection
 * Returns cached result if available, generates in background if not
 */
export declare function generateLLMInterjection(context: TrackSpeechContext, moment: InterjectionMoment): Promise<string | null>;
/**
 * Pre-warm the LLM cache for a track
 * Call this when a track starts to have interjections ready
 */
export declare function prewarmInterjectionCache(context: TrackSpeechContext): Promise<void>;
/**
 * Clear the LLM interjection cache
 */
export declare function clearInterjectionCache(): void;
/**
 * Get an interjection (LLM-powered with template fallback)
 */
export declare function getInterjection(context: TrackSpeechContext, moment: InterjectionMoment): Promise<string>;
//# sourceMappingURL=dj-speech-engine.d.ts.map