/**
 * Meaningful Silence System
 *
 * When the user pauses, don't just say "Still there?"
 * Make those quiet moments feel like genuine human connection.
 *
 * The silence becomes an opportunity to:
 * - Reference something meaningful they shared
 * - Offer a relevant memory or story snippet
 * - Ask a thoughtful follow-up question
 * - Share a tiny, human micro-story
 * - Offer to play some music while they think
 * - Use gentle humor (for appropriate personas)
 * - Acknowledge the time of day
 * - Simply sit with them in comfortable quiet
 *
 * This transforms awkward silence into relationship building.
 */
import type { PersonaConfig } from './types.js';
import { type GeneratedQuestion, type QuestionContext } from '../intelligence/dynamic-questions.js';
import { type SilenceResponses } from '../services/persona-content-loader.js';
/** Clear recency tracking for session */
export declare function clearSilenceRecency(sessionId: string): void;
/**
 * Load silence responses for a persona with caching
 * Falls back to hardcoded content if loading fails
 */
declare function getSilenceContent(personaId: string): Promise<SilenceResponses | null>;
export interface SilenceContext {
    /** How many seconds of silence */
    silenceDurationSeconds: number;
    /** Turn count in the conversation */
    turnCount: number;
    /** Topics discussed this session */
    topicsDiscussed: string[];
    /** Last thing the user said (to reference back) */
    lastUserMessage?: string;
    /** Last thing the agent said */
    lastAgentMessage?: string;
    /** Emotional tone of recent conversation */
    recentEmotionalTone?: 'heavy' | 'light' | 'neutral';
    /** User's name if known */
    userName?: string;
    /** Were we in the middle of something? */
    wasDiscussingTopic?: string;
    /** Key moments or details the user shared */
    memorableMoments?: string[];
    /** Current hour (0-23) for time-aware responses */
    currentHour?: number;
    /** Is it a weekend? */
    isWeekend?: boolean;
    /** How many silence responses have we already given? */
    silenceResponseCount?: number;
    /** 🎮 Is a game currently active? If so, silence means "thinking" not "disengaged" */
    isGameActive?: boolean;
    /** 🎮 What game type is active? */
    activeGameType?: string;
    /** Session ID for usage tracking (avoids repetition) */
    sessionId?: string;
    /** 🎵 Is music currently playing? */
    isMusicPlaying?: boolean;
}
export type SilenceResponseType = 'comfortable_presence' | 'memory_callback' | 'story_offering' | 'micro_story' | 'thoughtful_question' | 'music_offering' | 'music_conversation' | 'game_suggestion' | 'gentle_observation' | 'gentle_humor' | 'time_aware' | 'topic_specific' | 'warm_check_in';
export interface SilenceResponse {
    type: SilenceResponseType;
    text: string;
    /** Whether this response invites a reply or just offers presence */
    invitesReply: boolean;
}
/**
 * Generate a meaningful response to silence
 *
 * Instead of generic "still there?" this creates genuine moments of connection
 */
export declare function getMeaningfulSilenceResponse(persona: PersonaConfig, context: SilenceContext): SilenceResponse;
/**
 * Convert SilenceContext to QuestionContext for dynamic question generation
 */
declare function silenceContextToQuestionContext(context: SilenceContext, persona: PersonaConfig, sessionId: string): QuestionContext;
/**
 * Get a thoughtful question using COACHING-LEVEL generation
 *
 * This is the "Better than Human" approach:
 * 1. Memory-grounded (references past conversations)
 * 2. Pattern-surfacing (notices recurring themes)
 * 3. Mirror (reflects their words back meaningfully)
 * 4. Anticipatory (senses what they need before they ask)
 *
 * Falls back to standard dynamic questions if coaching fails
 */
declare function getDynamicThoughtfulQuestion(context: SilenceContext, persona: PersonaConfig, sessionId: string, options?: {
    memories?: Array<{
        topic: string;
        daysAgo: number;
        summary: string;
    }>;
    lastTranscript?: string;
    voiceSignals?: {
        pauseBeforeSpeaking?: boolean;
        voiceDropped?: boolean;
        shortAnswers?: boolean;
        changedSubject?: boolean;
    };
}): Promise<{
    text: string;
    intent?: string;
    coachingType?: string;
}>;
/**
 * Get a micro-story using dynamic content if available
 */
export declare function getMicroStoryAsync(persona: PersonaConfig): Promise<string | null>;
/**
 * Get a thoughtful question using dynamic content if available
 */
export declare function getThoughtfulQuestionAsync(persona: PersonaConfig, topics: string[]): Promise<string>;
/**
 * Get a music offering using dynamic content if available
 */
export declare function getMusicOfferingAsync(persona: PersonaConfig): Promise<string>;
/**
 * Get time-aware response using dynamic content if available
 *
 * HUMANIZATION FIX: Removed weekend injection entirely.
 * Let the LLM handle weekend context naturally instead of injecting static phrases.
 */
export declare function getTimeAwareResponseAsync(persona: PersonaConfig, hour: number, _isWeekend: boolean): Promise<string | null>;
/**
 * Track silence and provide progressive, meaningful responses
 *
 * Call this periodically during silence to get the right response
 * for the current duration
 */
export declare class SilenceHandler {
    private silenceStartTime;
    private responsesSent;
    private context;
    private persona;
    constructor(persona: PersonaConfig);
    /**
     * Call when silence begins
     */
    startSilence(): void;
    /**
     * Call when user speaks
     */
    endSilence(): void;
    /**
     * Update context with conversation info
     */
    updateContext(updates: Partial<SilenceContext>): void;
    /**
     * Get the next silence response if appropriate
     * Returns null if it's too early or we've already responded at this interval
     */
    getNextResponse(): SilenceResponse | null;
    /**
     * Check if silence is currently active
     */
    isInSilence(): boolean;
    /**
     * Get current silence duration in seconds
     */
    getSilenceDuration(): number;
}
export declare function extractMemorableMoments(message: string): string[];
/**
 * Merge new memorable moments with existing ones
 * Keeps the most recent/relevant
 */
export declare function mergeMemorableMoments(existing: string[], newMoments: string[]): string[];
/**
 * Play ambient music during extended silence
 * Returns true if music started playing
 *
 * Configuration via environment:
 * - AMBIENT_MUSIC_ENABLED: Set to 'false' to disable
 * - AMBIENT_MUSIC_URLS: Comma-separated list of audio URLs
 * - AMBIENT_TRACK_1, AMBIENT_TRACK_2, AMBIENT_TRACK_3: Individual track URLs
 */
export declare function playAmbientMusicDuringSilence(): Promise<boolean>;
/**
 * Stop ambient music (when user starts speaking again)
 */
export declare function stopAmbientMusic(): void;
/**
 * Get a meaningful silence response with full LLM-powered question generation
 *
 * This is the "Better than Human" version that:
 * - Uses LLM to generate truly contextual questions
 * - Grounds questions in persona voice
 * - Tracks question intent (knows WHY it's asking)
 * - Provides follow-up strategies for any response
 *
 * @param persona - The active persona
 * @param context - Silence context
 * @param sessionId - Session ID for deduplication
 * @returns Promise<SilenceResponse> with dynamically generated content
 */
export declare function getMeaningfulSilenceResponseAsync(persona: PersonaConfig, context: SilenceContext, sessionId: string): Promise<SilenceResponse & {
    intent?: string;
}>;
/**
 * LLM instructions for silence responses
 */
export interface LLMSilenceInstructions {
    /** Instructions for generateReply() */
    instructions: string;
    /** Whether to allow interruptions */
    allowInterruptions: boolean;
    /** Fallback text if LLM fails */
    fallback: string;
    /** Type of silence response */
    type: SilenceResponseType;
    /** Whether this invites a reply */
    invitesReply: boolean;
}
/**
 * Build LLM instructions for a contextual silence response
 *
 * Instead of picking from static phrases, let the LLM generate
 * something that feels genuine and responsive to the moment.
 *
 * This is the sync version that uses fallback guidance. For dynamic
 * persona-specific guidance, use buildLLMSilenceInstructionsAsync.
 */
export declare function buildLLMSilenceInstructions(persona: PersonaConfig, context: SilenceContext): LLMSilenceInstructions;
/**
 * Build LLM instructions with dynamic persona-specific content
 *
 * Loads persona-specific guidance templates from bundles for more
 * natural, persona-voiced responses.
 */
export declare function buildLLMSilenceInstructionsAsync(persona: PersonaConfig, context: SilenceContext): Promise<LLMSilenceInstructions>;
/**
 * Get LLM-driven silence response instructions (sync version)
 *
 * Use this with session.generateReply() for natural, contextual responses
 * that feel genuinely responsive to the moment.
 *
 * @example
 * const silenceInstructions = getLLMSilenceInstructions(persona, context);
 * if (silenceInstructions.instructions) {
 *   await session.generateReply({
 *     instructions: silenceInstructions.instructions,
 *     allowInterruptions: silenceInstructions.allowInterruptions
 *   });
 * }
 */
export declare function getLLMSilenceInstructions(persona: PersonaConfig, context: SilenceContext): LLMSilenceInstructions;
/**
 * Get LLM-driven silence response instructions (async version)
 *
 * This version loads persona-specific content from bundles for
 * more natural, persona-voiced responses.
 *
 * @example
 * const silenceInstructions = await getLLMSilenceInstructionsAsync(persona, context);
 * if (silenceInstructions.instructions) {
 *   await session.generateReply({
 *     instructions: silenceInstructions.instructions,
 *     allowInterruptions: silenceInstructions.allowInterruptions
 *   });
 * }
 */
export declare function getLLMSilenceInstructionsAsync(persona: PersonaConfig, context: SilenceContext): Promise<LLMSilenceInstructions>;
/**
 * Preload silence content for a persona (call during initialization)
 * This warms the cache so subsequent calls are fast.
 */
export declare function preloadSilenceContent(personaId: string): Promise<void>;
/**
 * Clear the silence content cache (for testing)
 */
export declare function clearSilenceContentCache(): void;
export { getDynamicThoughtfulQuestion, getSilenceContent, silenceContextToQuestionContext };
export type { GeneratedQuestion, QuestionContext };
export default getMeaningfulSilenceResponse;
//# sourceMappingURL=meaningful-silence.d.ts.map