/**
 * DJ Decision Engine - Pure Functions for DJ Decision Making
 *
 * This module contains ALL decision logic for the DJ system:
 * - When to duck audio
 * - When to speak intro/outro
 * - When to interject mid-song
 * - What moments to schedule
 *
 * All functions are PURE - they take state and return decisions with no side effects.
 * This makes the logic testable and the system predictable.
 *
 * @module audio/dj-decision-engine
 */
import type { MusicTrack } from './music-player.js';
import type { DJControllerState } from './dj-controller.js';
/**
 * Probability constants for DJ moments
 *
 * HUMANIZATION: These are intentionally LOW. When someone asks for music,
 * they usually want to LISTEN to music, not hear constant DJ commentary.
 * Less is more - save the moments for truly special occasions.
 */
export declare const DJ_PROBABILITIES: {
    /** Chance of "wait for it..." buildup moment (8%) */
    readonly BUILDUP: 0.08;
    /** Chance of "drop" reaction after buildup (15%) */
    readonly DROP_AFTER_BUILDUP: 0.15;
    /** Chance of appreciation comment (5%) */
    readonly APPRECIATION: 0.05;
    /** Chance of intro phrase (100% for non-ambient) */
    readonly INTRO: 1;
    /** Chance of outro phrase (100% for non-ambient) */
    readonly OUTRO: 1;
    /** Chance of track start interjection (15%) - from music-humanization */
    readonly TRACK_START_INTERJECTION: 0.15;
};
/**
 * Timing constants for DJ moments (in milliseconds)
 */
export declare const DJ_TIMING: {
    /** Minimum track duration to consider mid-song moments (20s) */
    readonly MIN_DURATION_FOR_MOMENTS: 20000;
    /** Minimum track duration for appreciation (25s) */
    readonly MIN_DURATION_FOR_APPRECIATION: 25000;
    /** Time before track end to start outro (5s) */
    readonly OUTRO_LEAD_TIME: 5000;
    /** Check-in interval for very long tracks (60s) */
    readonly CHECK_IN_INTERVAL: 60000;
    /** How fast to duck when agent speaks (300ms) */
    readonly DUCK_FOR_AGENT: 300;
    /** How fast to duck when user speaks (150ms) */
    readonly DUCK_FOR_USER: 150;
    /** How fast to restore volume (500ms) */
    readonly VOLUME_RESTORE: 500;
    /** Delay before track start interjection (3s) */
    readonly INTRO_INTERJECTION_DELAY: 3000;
};
/**
 * Persona-specific DJ styles affecting decision thresholds
 */
export interface PersonaDJStyle {
    /** Persona identifier */
    personaId: string;
    /** Multiplier for interjection probabilities (0.5 = half as likely) */
    interjectionMultiplier: number;
    /** Multiplier for timing (1.5 = 50% longer delays) */
    timingMultiplier: number;
    /** Whether to do countdown announcements */
    doCountdowns: boolean;
}
/**
 * Default persona styles
 */
export declare const PERSONA_DJ_STYLES: Record<string, PersonaDJStyle>;
/**
 * Decision result for ducking
 */
export interface DuckDecision {
    shouldDuck: boolean;
    reason?: 'agent_speaking' | 'user_speaking' | 'urgent_topic';
    duckLevel?: number;
}
/**
 * Decision result for intro speech
 */
export interface IntroDecision {
    shouldSpeak: boolean;
    delay: number;
    isInterjection: boolean;
}
/**
 * Decision result for outro speech
 */
export interface OutroDecision {
    shouldSpeak: boolean;
    includeTrackInfo: boolean;
}
/**
 * Decision result for mid-song interjection
 */
export interface InterjectionDecision {
    shouldInterject: boolean;
    type?: 'buildup' | 'drop' | 'appreciation' | 'check-in';
    delayMs?: number;
}
/**
 * Scheduled moment definition
 */
export interface ScheduledMoment {
    type: 'buildup' | 'drop' | 'appreciation' | 'check-in' | 'outro';
    triggerTimeMs: number;
    probability: number;
}
/**
 * Context for making decisions
 */
export interface DecisionContext {
    /** Current controller state */
    state: DJControllerState;
    /** Current track (if any) */
    track: MusicTrack | null;
    /** Persona ID for persona-aware decisions */
    personaId: string;
    /** Is user currently vibing (engaged with music)? */
    isVibing?: boolean;
    /** Did user ask a question? */
    userAskedQuestion?: boolean;
    /** Is there an urgent topic? */
    urgentTopic?: boolean;
    /** Time elapsed in track (ms) */
    trackElapsedMs?: number;
}
/**
 * Get persona style, defaulting to Ferni if not found
 */
export declare function getPersonaStyle(personaId: string): PersonaDJStyle;
/**
 * Decide whether to duck audio
 *
 * @param context - Decision context
 * @returns Duck decision
 */
export declare function shouldDuck(context: DecisionContext): DuckDecision;
/**
 * Decide whether to speak an intro when track starts
 *
 * @param context - Decision context
 * @returns Intro decision
 */
export declare function shouldSpeakIntro(context: DecisionContext): IntroDecision;
/**
 * Decide whether to speak an outro when track is ending
 *
 * @param context - Decision context
 * @returns Outro decision
 */
export declare function shouldSpeakOutro(context: DecisionContext): OutroDecision;
/**
 * Decide whether to interject mid-song
 *
 * @param context - Decision context
 * @param momentType - Type of moment to consider
 * @returns Interjection decision
 */
export declare function shouldInterject(context: DecisionContext, momentType: 'buildup' | 'drop' | 'appreciation' | 'check-in'): InterjectionDecision;
/**
 * Calculate what moments to schedule for a track
 *
 * @param track - The track to schedule for
 * @param personaId - Persona for style adjustments
 * @returns Array of moments to schedule
 */
export declare function calculateScheduledMoments(track: MusicTrack, personaId: string): ScheduledMoment[];
/**
 * Decide whether to interrupt music based on user activity
 *
 * @param params - Context about user activity
 * @returns Decision about interrupting
 */
export declare function shouldInterruptMusic(params: {
    isVibing: boolean;
    userStartedTalking: boolean;
    userAskedQuestion: boolean;
    urgentTopic: boolean;
}): {
    shouldInterrupt: boolean;
    action: 'duck' | 'stop' | 'none';
};
/**
 * Check if dead air detection should be active
 *
 * When music is playing, we should NOT trigger dead air responses.
 *
 * @param state - Current DJ controller state
 * @returns True if dead air detection should be active
 */
export declare function isDeadAirDetectionActive(state: DJControllerState): boolean;
/**
 * Calculate duck timing based on who is speaking
 *
 * @param reason - Why we're ducking
 * @returns Timing in ms
 */
export declare function getDuckTiming(reason: 'agent_speaking' | 'user_speaking' | 'external'): {
    duckMs: number;
    restoreMs: number;
};
/**
 * Determine if we should skip thinking music
 *
 * Don't play thinking music if:
 * - Regular music was explicitly stopped recently (user doesn't want music)
 * - Music is already playing
 *
 * @param state - Current DJ state
 * @param thresholdMs - How recently "explicit stop" counts (default 30s)
 * @returns True if thinking music should be skipped
 */
export declare function shouldSkipThinkingMusic(state: DJControllerState, thresholdMs?: number): boolean;
//# sourceMappingURL=dj-decision-engine.d.ts.map