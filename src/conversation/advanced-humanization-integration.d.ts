/**
 * Advanced Humanization Voice Agent Integration
 *
 * > "Better than human" - The 10 capabilities that make it real
 *
 * This module integrates the advanced humanization orchestrator into the
 * voice agent pipeline. It provides:
 *
 * 1. Session lifecycle hooks
 * 2. Turn processing with comprehensive guidance
 * 3. Response modification based on detected signals
 * 4. Persistence for cross-session features
 *
 * @module @ferni/advanced-humanization-integration
 */
import { getAdvancedHumanization, type AdvancedHumanizationContext, type AdvancedHumanizationResult, type SessionStartResult } from './advanced-humanization.js';
export interface AdvancedHumanizationSessionConfig {
    sessionId: string;
    userId: string;
    relationshipDepth?: 'new' | 'developing' | 'established' | 'deep';
    prosodyHints?: {
        speechRate?: number;
        volume?: number;
        pitchVariance?: number;
    };
}
export interface TurnGuidance {
    /** Priority actions to address (most important first) */
    priorityActions: string[];
    /** Should we stop giving direct advice? */
    stopDirectAdvice: boolean;
    /** Tone guidance for response */
    toneGuidance: string;
    /** Length guidance */
    lengthGuidance: 'shorter' | 'normal' | 'longer';
    /** Subtext to address (if any) */
    subtext?: {
        type: string;
        probe: string | null;
    };
    /** Repair needed (if any) */
    repair?: {
        phrase: string;
        followUp?: string;
    };
    /** Affirmation to include (if any) */
    affirmation?: {
        phrase: string;
        placement: 'prefix' | 'inline' | 'suffix';
    };
    /** Hope injection (if appropriate) */
    hope?: {
        phrase: string;
        type: string;
    };
    /** Curiosity prompt (if appropriate) */
    curiosityPrompt?: string;
    /** Milestone to acknowledge (if any) */
    milestone?: string;
    /** Aftercare guidance (if needed) */
    aftercare?: {
        phase: string;
        checkIn?: string;
        grounding?: string;
        pacing: string;
    };
    /** Energy regulation guidance */
    energyGuidance?: {
        strategy: string;
        pace: string;
        intensity: string;
    };
    /** Paradoxical intervention (if appropriate) */
    paradoxicalPhrase?: string;
}
export interface ResponseModification {
    /** Prefix to add to response */
    prefix?: string;
    /** Suffix to add to response */
    suffix?: string;
    /** System prompt additions */
    systemPromptAdditions: string[];
    /** SSML modifications */
    ssmlHints?: {
        pace?: 'slow' | 'normal' | 'fast';
        emphasis?: string[];
        pauses?: Array<{
            after: string;
            duration: number;
        }>;
    };
}
/**
 * Initialize advanced humanization for a session
 */
export declare function initAdvancedHumanization(config: AdvancedHumanizationSessionConfig): SessionStartResult;
/**
 * Clean up advanced humanization for a session
 */
export declare function cleanupAdvancedHumanization(sessionId: string): void;
/**
 * Process a user turn and get comprehensive guidance
 */
export declare function processAdvancedTurn(sessionId: string, userMessage: string, context?: {
    detectedEmotion?: string;
    valence?: number;
    arousal?: number;
    topic?: string;
    prosodyHints?: {
        speechRate?: number;
        volume?: number;
        pitchVariance?: number;
    };
}): TurnGuidance | null;
/**
 * Get response modifications based on last turn's guidance
 */
export declare function getResponseModifications(sessionId: string): ResponseModification | null;
/**
 * Record that advice was given (for resistance tracking)
 */
export declare function recordAdviceGiven(sessionId: string): void;
/**
 * Record agent response (for repair detection)
 *
 * This flows to THREE systems:
 * 1. Advanced humanization repair engine (existing)
 * 2. Deep understanding repair intelligence (superhuman understanding)
 * 3. Ferni commitment tracking (V3.2 - track Ferni's promises)
 */
export declare function recordAgentResponse(sessionId: string, response: string): void;
/**
 * Record a relationship milestone
 */
export declare function recordMilestone(sessionId: string, type: 'vulnerability' | 'breakthrough' | 'inside_joke', context?: string): void;
/**
 * Add a shared memory (inside joke, phrase)
 */
export declare function addSharedMemory(sessionId: string, content: string, category: 'joke' | 'phrase' | 'reference'): void;
/**
 * Add a significant date to remember
 */
export declare function addSignificantDate(sessionId: string, date: Date, description: string): void;
/**
 * Get closing guidance for end of conversation
 */
export declare function getClosingGuidance(sessionId: string): {
    phrase: string;
    aftercareNeeded: boolean;
    checkIn: string | null;
} | null;
/**
 * Get current session state for debugging
 */
export declare function getAdvancedHumanizationState(sessionId: string): {
    turnCount: number;
    lastGuidance: TurnGuidance | null;
    orchestratorState: ReturnType<ReturnType<typeof getAdvancedHumanization>['getState']>;
} | null;
export { type AdvancedHumanizationContext, type AdvancedHumanizationResult, type SessionStartResult, };
//# sourceMappingURL=advanced-humanization-integration.d.ts.map