/**
 * User Learning Engine - Main Implementation
 *
 * @module intelligence/user-learning-engine/engine
 */
import type { UserProfile, KeyMoment } from '../../types/user-profile.js';
import type { EmotionResult } from '../emotion-detector.js';
import type { IntentResult } from '../intent-classifier.js';
import type { ConversationState } from '../conversation-state.js';
import { type SmallDetail } from '../conversation-quality.js';
import type { LearningInsight, ConversationLearningData, DynamicUserContext } from './types.js';
export type { LearningInsight, ConversationLearningData, DynamicUserContext } from './types.js';
export declare class UserLearningEngine {
    private sessionInsights;
    private sessionKeyMoments;
    private sessionSmallDetails;
    private sessionEmotions;
    private sessionStoriesTold;
    private conversationHistory;
    private topicsDiscussed;
    private turnsSinceLastCapture;
    private lastVoiceEmotion;
    private voiceEmotionValidations;
    private voiceEmotionAccuracy;
    /**
     * Process a user turn and extract learning opportunities
     */
    processUserTurn(message: string, analysis: {
        emotion: EmotionResult;
        intent: IntentResult;
        state: ConversationState;
    }, profile: UserProfile | null): void;
    /**
     * Record a voice emotion detection for later validation
     */
    recordVoiceEmotion(emotion: string, confidence: number): void;
    /**
     * Validate voice emotion prediction against subsequent text emotion
     * This helps calibrate voice emotion detection accuracy
     */
    private validateVoiceEmotionPrediction;
    /**
     * Get current voice emotion detection accuracy
     */
    getVoiceEmotionAccuracy(): number;
    /**
     * Process an assistant turn
     * Now also tracks stories Jack tells to avoid repetition
     */
    processAssistantTurn(message: string): void;
    /**
     * Detect if Jack is telling a story (for avoiding repetition)
     */
    private detectStoryTelling;
    /**
     * Extract the theme of a story
     */
    private extractStoryTheme;
    /**
     * Detect if current turn contains a key moment worth remembering
     */
    private detectKeyMoment;
    /**
     * Generate a natural summary of a key moment
     */
    private generateMomentSummary;
    /**
     * Learn preferences from conversation patterns
     */
    private learnPreferences;
    /**
     * Extract explicit insights from user statements
     */
    private extractExplicitInsights;
    /**
     * Build dynamic context for prompt enrichment
     */
    buildDynamicContext(profile: UserProfile | null): DynamicUserContext;
    /**
     * Finalize session and return all learning data
     */
    finalizeSession(profile: UserProfile | null): ConversationLearningData;
    /**
     * Build preference updates from insights
     */
    private buildPreferenceUpdates;
    /**
     * Apply learning data to user profile
     */
    static applyLearningToProfile(profile: UserProfile, learning: ConversationLearningData): UserProfile;
    /**
     * Get current session stats
     */
    getSessionStats(): {
        turns: number;
        keyMoments: number;
        insights: number;
        detailsCaptured: number;
        storiesTold: number;
        topicsDiscussed: string[];
    };
    /**
     * Get current session key moments (for real-time retrieval)
     * This allows KeyMomentRetrieval to access moments from the CURRENT session
     */
    getCurrentSessionKeyMoments(): KeyMoment[];
    /**
     * Get current session small details (for real-time callbacks)
     */
    getCurrentSessionDetails(): SmallDetail[];
    /**
     * Get current session topics
     */
    getCurrentSessionTopics(): string[];
    /**
     * Capture an external insight (from tasks, conversation manager, etc.)
     * This allows other modules to feed insights into the learning engine
     */
    captureExternalInsight(insight: Omit<LearningInsight, 'capturedAt'>): void;
    /**
     * Capture an external key moment (from tasks, conversation manager, etc.)
     */
    captureExternalKeyMoment(moment: KeyMoment): void;
    /**
     * Generate proactive insights - natural suggestions based on what Jack has learned
     * Called mid-conversation to suggest things Jack might naturally bring up
     */
    getProactiveInsight(profile: UserProfile | null, turnCount: number): string | null;
    /**
     * Helper for proactive insights
     */
    private getTimeAgoString;
    /**
     * Contribute session learnings to community insights
     * Call this at the end of each session to help improve all personas
     */
    contributeToCommunnityLearning(personaId: string, sessionData: {
        engagementScores: number[];
        userSatisfaction: 'positive' | 'neutral' | 'negative';
        breakthoughQuestions?: Array<{
            question: string;
            engagementLift: number;
        }>;
    }): void;
    /**
     * Get community-informed context for better responses
     * Call this to get suggestions based on what works across users
     */
    getCommunityContext(personaId: string, context: {
        userEmotion: string;
        topic: string;
        relationshipStage: string;
    }): {
        suggestedStrategy?: string;
        recommendedStories?: string[];
        effectiveQuestions?: string[];
        adjustments?: string[];
    };
    private detectResponseType;
    private getResponseLength;
    private getTimeOfDay;
    private detectStoryReaction;
    /**
     * Reset for new session
     */
    reset(): void;
}
/**
 * Get the singleton learning engine
 */
export declare function getLearningEngine(): UserLearningEngine;
/**
 * Reset for testing or new session
 */
export declare function resetLearningEngine(): void;
export default UserLearningEngine;
//# sourceMappingURL=engine.d.ts.map