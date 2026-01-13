/**
 * Conversation State Machine
 *
 * Tracks conversation phase and manages state transitions.
 * Enables appropriate tone and approach for each phase.
 */
import type { EmotionResult } from '../detectors/emotion.js';
import type { IntentResult } from '../detectors/intent.js';
/**
 * Conversation phases
 */
export type ConversationPhase = 'greeting' | 'warming_up' | 'exploring' | 'advising' | 'supporting' | 'wrapping_up' | 'follow_up';
/**
 * Conversation state
 */
export interface ConversationState {
    phase: ConversationPhase;
    turnCount: number;
    startedAt: Date;
    lastActivityAt: Date;
    greetingComplete: boolean;
    nameObtained: boolean;
    emotionalStateKnown: boolean;
    primaryConcernIdentified: boolean;
    currentMood: string;
    distressLevel: number;
    emotionalTrend: 'improving' | 'stable' | 'declining' | 'unknown';
    topicsDiscussed: string[];
    currentTopic: string | null;
    topicsToCircleBack: string[];
    userWantsToEnd: boolean;
    userNeedsSupport: boolean;
    userIsReturning: boolean;
}
/**
 * Phase guidance for agent behavior
 */
export interface PhaseGuidance {
    phase: ConversationPhase;
    voiceMode: 'warm_welcome' | 'curious_friend' | 'tender_elder' | 'wise_counselor' | 'playful_grandpa';
    pacing: 'slow' | 'moderate' | 'natural';
    focus: string;
    shouldAsk: string[];
    shouldAvoid: string[];
    transitionCue: string;
}
/**
 * Conversation State Machine
 */
export declare class ConversationStateMachine {
    private state;
    constructor(isReturningUser?: boolean);
    /**
     * Create initial state
     */
    private createInitialState;
    /**
     * Process a turn and update state
     */
    processTurn(input: {
        userMessage: string;
        emotion?: EmotionResult;
        intent?: IntentResult;
        topics?: string[];
        userName?: string;
    }): ConversationState;
    /**
     * Update conversation phase based on state
     */
    private updatePhase;
    /**
     * Get current state
     */
    getState(): ConversationState;
    /**
     * Get current phase
     */
    getPhase(): ConversationPhase;
    /**
     * Get phase guidance
     */
    getGuidance(): PhaseGuidance;
    /**
     * Mark greeting as complete
     */
    completeGreeting(): void;
    /**
     * Mark support as no longer needed
     */
    resolveSupport(): void;
    /**
     * Force transition to a specific phase
     */
    transitionTo(phase: ConversationPhase): void;
    /**
     * Get context string for prompts
     */
    getContextString(): string;
    /**
     * Get duration in minutes
     */
    getDurationMinutes(): number;
    /**
     * Reset state (for testing)
     */
    reset(isReturningUser?: boolean): void;
}
/**
 * Get the default state machine
 */
export declare function getStateMachine(isReturningUser?: boolean): ConversationStateMachine;
/**
 * Reset the default state machine
 */
export declare function resetStateMachine(isReturningUser?: boolean): ConversationStateMachine;
export default ConversationStateMachine;
//# sourceMappingURL=conversation.d.ts.map