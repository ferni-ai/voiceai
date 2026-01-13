/**
 * Conversation Manager - Orchestrates Real-Time Dynamics
 *
 * Coordinates interruption handling, turn-taking, topic changes,
 * and backchanneling for natural conversation flow.
 *
 * REFACTORED: Now session-scoped to prevent cross-session contamination.
 * Use getSessionConversationManager(sessionId) to get session-specific instance.
 * Legacy getConversationManager() still works for backward compatibility but is deprecated.
 */
import type { AudioFrame } from '@livekit/rtc-node';
import type { EmotionResult } from '../intelligence/emotion-detector.js';
import type { TopicWeight } from '../speech/speech-context.js';
export interface ConversationEnhancements {
    responsePrefix?: string;
    lengthGuidance: 'brief' | 'normal' | 'detailed';
    shouldInviteToSpeak: boolean;
    topicTransition?: string;
    backchannel?: string;
    metaGuidance: string[];
}
export declare class ConversationManager {
    private readonly sessionId;
    private interruptionHandler;
    private turnMonitor;
    private topicTracker;
    private agentCurrentlySpeaking;
    private currentAgentUtterance;
    private userSpeakingStartTime;
    private insightCallback;
    private personaId;
    private lastBackchannelTime;
    constructor(sessionId?: string);
    /**
     * Set the current persona ID for persona-specific behaviors
     * Called when persona is loaded or changes
     */
    setPersonaId(personaId: string): void;
    /**
     * Get the session-scoped backchanneling manager
     */
    private getBackchannelEngine;
    /**
     * Set the callback for capturing conversation insights
     * Called by services/index.ts during session setup
     */
    setInsightCallback(callback: (type: string, key: string, value: unknown, confidence: number) => void): void;
    private captureInsight;
    /**
     * Handle user starting to speak
     */
    handleUserStartedSpeaking(audioFrame?: AudioFrame): void;
    /**
     * Handle user finished speaking
     */
    handleUserFinishedSpeaking(durationMs: number): void;
    /**
     * Handle agent started speaking
     */
    handleAgentStartedSpeaking(utterance: string): void;
    /**
     * Handle agent finished speaking
     */
    handleAgentFinishedSpeaking(durationMs: number): void;
    /**
     * Check if agent is currently speaking
     * Used by backchannel system to avoid overlapping speech
     */
    isAgentSpeaking(): boolean;
    /**
     * Analyze conversation and get enhancements for next response
     */
    getConversationEnhancements(userMessage: string, emotion: EmotionResult, topicWeight: TopicWeight): ConversationEnhancements;
    /**
     * Build conversation guidance string for prompt
     */
    buildConversationGuidance(enhancements: ConversationEnhancements): string;
    /**
     * Get current topic
     */
    getCurrentTopic(): string | null;
    /**
     * Get topic history
     */
    getTopicHistory(): string[];
    /**
     * Reset for new session
     */
    reset(): void;
    /**
     * Get comprehensive stats
     */
    getStats(): {
        interruptions: {
            totalInterruptions: number;
            recentInterruptions: number;
            shouldYield: boolean;
            guidance: string;
        };
        turnTaking: import("../conversation/turn-taking.js").TurnTakingStats;
        currentTopic: string | null;
        backchannels: {
            lastTime: number;
            count: number;
        };
    };
}
/**
 * Get session-scoped conversation manager
 * This is the preferred way to get a ConversationManager instance.
 */
export declare function getSessionConversationManager(sessionId: string): ConversationManager;
/**
 * Reset session-scoped conversation manager
 */
export declare function resetSessionConversationManager(sessionId: string): void;
/**
 * Get global conversation manager
 * @deprecated Use getSessionConversationManager(sessionId) instead for session isolation
 */
export declare function getConversationManager(): ConversationManager;
/**
 * Reset global conversation manager
 * @deprecated Use resetSessionConversationManager(sessionId) instead
 */
export declare function resetConversationManager(): void;
//# sourceMappingURL=conversation-manager.d.ts.map