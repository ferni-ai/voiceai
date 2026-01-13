/**
 * Story Timing Intelligence
 *
 * Smart story triggering based on conversation context.
 * Ensures stories are told at the right moment for maximum impact.
 *
 * Features:
 * - Rapport-based gating (don't tell personal stories too early)
 * - Pacing awareness (don't tell stories when user is rushed)
 * - Story spacing (avoid back-to-back stories)
 * - Emotional appropriateness (match story to mood)
 * - Topic relevance scoring
 */
import type { PersonaConfig, StoryConfig } from '../personas/types.js';
import type { EmotionalArc } from './emotional-arc.js';
export interface StoryTimingContext {
    turnCount: number;
    conversationDurationMs: number;
    lastStoryTurn?: number;
    storiesToldThisSession: string[];
    emotionalArc?: EmotionalArc;
    userEngagement: 'high' | 'medium' | 'low' | 'unknown';
    userPacing: 'rushed' | 'relaxed' | 'normal' | 'unknown';
    currentTopic?: string;
    recentTopics?: string[];
}
export interface StoryRecommendation {
    shouldTell: boolean;
    story?: StoryConfig;
    reason: string;
    timing: 'now' | 'soon' | 'wait' | 'never';
    transitionPhrase?: string;
    confidenceScore: number;
}
export interface StoryMetrics {
    storiesTold: number;
    storiesSkipped: number;
    avgEngagementAfterStory: number;
    successfulStories: string[];
}
export declare class StoryTimingEngine {
    private storiesTold;
    private lastStoryTurn;
    private storyOutcomes;
    private readonly minTurnsBeforeFirstStory;
    private readonly minTurnsBetweenStories;
    private readonly maxStoriesPerSession;
    private readonly rapportThreshold;
    constructor();
    /**
     * Evaluate if a story should be told now
     */
    evaluateStoryTiming(persona: PersonaConfig, context: StoryTimingContext, candidateStory?: StoryConfig): StoryRecommendation;
    /**
     * Find the best story for the current context
     */
    findBestStory(persona: PersonaConfig, context: StoryTimingContext): StoryConfig | null;
    /**
     * Record that a story was told
     */
    recordStoryTold(storyId: string, turn: number): void;
    /**
     * Record story outcome for learning
     */
    recordStoryOutcome(storyId: string, wasWellReceived: boolean): void;
    /**
     * Get metrics for the session
     */
    getMetrics(): StoryMetrics;
    /**
     * Reset for new session
     */
    reset(): void;
    private checkGatingConditions;
    private scoreStoryFit;
    private checkEmotionalFit;
    private generateTransition;
}
export declare function getStoryTimingEngine(): StoryTimingEngine;
export declare function resetStoryTimingEngine(): void;
export default StoryTimingEngine;
//# sourceMappingURL=story-timing.d.ts.map