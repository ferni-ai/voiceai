/**
 * Story Tracking Service
 *
 * Tracks which stories have been told to which users, gates stories by
 * relationship stage, and manages narrative arcs.
 *
 * Persists to user profile for cross-session narrative continuity.
 */
import type { PersonaRelationshipStage } from '../types/user-profile.js';
export interface Story {
    id: string;
    personaId: string;
    title: string;
    content: string;
    emotionalTags: string[];
    relationshipGate: PersonaRelationshipStage;
    category: 'personal' | 'teaching' | 'wisdom' | 'vulnerability' | 'humor';
    followsFrom?: string;
    leadsTo?: string[];
}
export interface StoryTellingContext {
    personaId: string;
    userId: string;
    relationshipStage: PersonaRelationshipStage;
    userMood?: string;
    currentTopic?: string;
    /** Optional bundle runtime for accessing story graph */
    bundleRuntime?: {
        getRecommendedStories?: (context: string) => string[];
    };
}
export interface StoryResult {
    story: Story;
    canTell: boolean;
    reason?: string;
}
/**
 * Check if a story has been told to a user by a specific persona
 */
export declare function hasStoryBeenTold(userId: string, personaId: string, storyId: string): Promise<boolean>;
/**
 * Mark a story as told to a user
 * Persists to Firestore for cross-session narrative continuity
 */
export declare function markStoryTold(userId: string, personaId: string, storyId: string): Promise<void>;
/**
 * Get all stories told to a user by a persona
 */
export declare function getStoriesTold(userId: string, personaId: string): Promise<string[]>;
/**
 * Check if user qualifies for a story based on relationship stage
 */
export declare function canTellStory(story: Story, relationshipStage: PersonaRelationshipStage): boolean;
/**
 * Story graph context trigger type
 * Used to match user context to recommended stories from bundle story graphs
 */
export interface StoryGraphContextTrigger {
    recommended_stories: string[];
    priority: 'high' | 'medium' | 'low';
    requires_trust?: boolean;
    timing?: 'after_comfort' | 'immediate';
}
/**
 * Story graph configuration from bundle _story-graph.json
 */
export interface StoryGraphConfig {
    context_triggers?: Record<string, StoryGraphContextTrigger>;
    story_timing_rules?: {
        minimum_turns_before_first_story?: number;
        minimum_turns_between_stories?: number;
        max_stories_per_session?: number;
        never_tell_story_when?: string[];
        ideal_moments?: string[];
    };
}
/**
 * Register a story graph for a persona (loaded from bundles)
 */
export declare function registerStoryGraph(personaId: string, graph: StoryGraphConfig): void;
/**
 * Find an appropriate story for the context
 *
 * HUMANIZATION FIX: Now uses story graph context_triggers from bundles
 * for smarter, persona-specific story selection instead of basic keyword matching.
 */
export declare function findStoryForContext(context: StoryTellingContext, availableStories: Story[]): Promise<StoryResult | null>;
/**
 * Get continuation stories (stories that follow from a just-told story)
 */
export declare function getContinuationStories(storyId: string, context: StoryTellingContext, allStories: Story[]): Promise<Story[]>;
/**
 * Register a story (for loading from bundles)
 */
export declare function registerStory(story: Story): void;
/**
 * Get all registered stories for a persona
 */
export declare function getPersonaStories(personaId: string): Story[];
/**
 * Clear story tracking for a user (for testing/reset)
 */
export declare function clearUserStoryHistory(userId: string, personaId?: string): Promise<void>;
/**
 * Get story statistics for a user-persona pair
 */
export declare function getStoryStats(userId: string, personaId: string): Promise<{
    totalTold: number;
    availableStories: number;
    completedArcs: number;
}>;
/**
 * Force immediate persistence (for graceful shutdown)
 */
export declare function flushStoryPersistence(): Promise<void>;
export declare const StoryTrackingService: {
    hasBeenTold: typeof hasStoryBeenTold;
    markTold: typeof markStoryTold;
    getStoriesTold: typeof getStoriesTold;
    canTell: typeof canTellStory;
    findForContext: typeof findStoryForContext;
    getContinuations: typeof getContinuationStories;
    register: typeof registerStory;
    getPersonaStories: typeof getPersonaStories;
    clearHistory: typeof clearUserStoryHistory;
    getStats: typeof getStoryStats;
    flush: typeof flushStoryPersistence;
};
export default StoryTrackingService;
//# sourceMappingURL=story-tracking.d.ts.map