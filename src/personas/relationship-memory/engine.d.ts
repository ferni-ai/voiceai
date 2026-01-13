/**
 * Relationship Memory Engine
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This engine tracks, learns from, and intelligently leverages relationship history.
 * Not just "I remember you mentioned X" but "We've been through a lot together."
 *
 * The goal: Make every returning user feel genuinely KNOWN.
 */
import type { CallbackAttempt, InsideJoke, InsideJokeSeed, RelationshipContext, RelationshipMemory, RelationshipPromptInjection, RelationshipStage, RelationshipStageConfig, SharedMoment, SharedMomentType } from './types.js';
export declare const RELATIONSHIP_STAGE_CONFIGS: Record<RelationshipStage, RelationshipStageConfig>;
export declare class RelationshipMemoryEngine {
    private memory;
    private userId;
    private personaId;
    constructor(userId: string, personaId: string, existingMemory?: RelationshipMemory);
    private createNewMemory;
    private initializeMilestones;
    private initializeTemporalPatterns;
    /**
     * Get current relationship context for prompt injection
     */
    getRelationshipContext(): RelationshipContext;
    /**
     * Generate prompt injection for relationship-aware responses
     */
    buildPromptInjection(): RelationshipPromptInjection;
    private getStageGuidance;
    /**
     * Record a new shared moment
     */
    recordMoment(type: SharedMomentType, summary: string, options?: {
        topic?: string;
        userPhrase?: string;
        ourResponse?: string;
        significance?: number;
        tags?: string[];
    }): SharedMoment;
    /**
     * Record a callback attempt and its outcome
     */
    recordCallbackAttempt(reference: string, type: CallbackAttempt['type'], userResponse: CallbackAttempt['userResponse'], threadContinued: boolean, context: string): void;
    /**
     * Record a potential inside joke seed
     */
    recordInsideJokeSeed(phrase: string, context: string, userEngagement: InsideJokeSeed['userEngagement']): void;
    /**
     * Evaluate seeds and graduate promising ones
     */
    private evaluateInsideJokeSeeds;
    private generateJokeReference;
    /**
     * Record usage of an inside joke
     */
    recordInsideJokeUsage(jokeId: string, userResponse: InsideJoke['typicalResponse']): void;
    /**
     * Start a new session - updates temporal patterns
     */
    startSession(): void;
    /**
     * End session - finalize updates
     */
    endSession(sessionMood: 'positive' | 'neutral' | 'struggling' | 'crisis', sessionEnergy: 'high' | 'medium' | 'low', topics: string[]): void;
    private updateTrustScore;
    private evaluateStageProgression;
    private checkMilestone;
    private checkMomentMilestones;
    private checkSessionMilestones;
    private checkAnniversaryMilestones;
    private updateEmotionalTrajectory;
    private getRecentMoments;
    private getActiveInsideJokes;
    private getPendingMilestones;
    private getEffectiveCallbacks;
    private updateCallbackEffectiveness;
    private daysBetween;
    private getDayOfWeek;
    private getTimeOfDay;
    private isTypicalTime;
    private formatTimeAgo;
    private getMilestoneAcknowledgment;
    getMemory(): RelationshipMemory;
    getStage(): RelationshipStage;
    getTrustScore(): number;
}
/**
 * Get or create a relationship memory engine for a user-persona pair
 */
export declare function getRelationshipEngine(userId: string, personaId: string, existingMemory?: RelationshipMemory): RelationshipMemoryEngine;
/**
 * Clear a relationship engine (for cleanup)
 */
export declare function clearRelationshipEngine(userId: string, personaId: string): void;
export default RelationshipMemoryEngine;
//# sourceMappingURL=engine.d.ts.map