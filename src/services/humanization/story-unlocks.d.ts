/**
 * Story Unlocks System
 *
 * Stories aren't just triggered by topics - they UNLOCK based on:
 * - Relationship depth (some stories need trust)
 * - Emotional moment type (some stories fit certain moments)
 * - Narrative arc phase (don't tell heavy stories in opening)
 * - Previous stories told (build on what's been shared)
 *
 * This makes storytelling feel EARNED, not random.
 *
 * "I've never told you this, but..." (after trust is established)
 * "This reminds me of something I shared before..." (continuity)
 *
 * @module @ferni/story-unlocks
 */
import type { NarrativePhase } from '../../conversation/index.js';
/**
 * Requirements for a story to unlock
 */
export interface StoryUnlockRequirements {
    /** Minimum relationship stage required */
    minRelationship: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
    /** Emotional contexts where this story fits */
    fitsEmotions: string[];
    /** Narrative phases where this story is appropriate */
    fitsPhases: NarrativePhase[];
    /** Other stories that should be told first (builds on them) */
    prerequisiteStories?: string[];
    /** Topics that trigger this story */
    topicTriggers: string[];
    /** How vulnerable/deep is this story */
    depth: 'surface' | 'medium' | 'deep' | 'sacred';
    /** Minimum turns into relationship before this story */
    minTurns?: number;
    /** Whether this story needs emotional permission */
    needsEmotionalPermission?: boolean;
}
/**
 * Story with unlock metadata
 */
export interface UnlockableStory {
    id: string;
    content: string;
    title?: string;
    requirements: StoryUnlockRequirements;
    /** How to introduce this story */
    introductions: {
        first_time: string[];
        callback: string[];
    };
    /** Related themes for callbacks */
    themes: string[];
}
/**
 * Context for evaluating story unlocks
 */
export interface UnlockContext {
    relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
    currentPhase: NarrativePhase;
    userEmotion?: string;
    emotionalIntensity?: number;
    currentTopic?: string;
    turn: number;
    storiesTold: string[];
    isVulnerableMoment?: boolean;
}
/**
 * Result of unlock evaluation
 */
export interface UnlockResult {
    isUnlocked: boolean;
    story: UnlockableStory;
    fitScore: number;
    introduction: string;
    reason: string;
}
/**
 * Get all unlocked stories for current context
 */
export declare function getUnlockedStories(context: UnlockContext): UnlockResult[];
/**
 * Get the best story for current moment
 */
export declare function getBestStoryForMoment(context: UnlockContext): UnlockResult | null;
/**
 * Check if a specific story is unlocked
 */
export declare function isStoryUnlocked(storyId: string, context: UnlockContext): boolean;
/**
 * Get stories by depth level
 */
export declare function getStoriesByDepth(depth: StoryUnlockRequirements['depth']): string[];
/**
 * Get stories for a topic
 */
export declare function getStoriesForTopic(topic: string, context: UnlockContext): UnlockResult[];
/**
 * Get the introduction for a story
 */
export declare function getStoryIntroduction(storyId: string, hasBeenToldBefore: boolean): string;
/**
 * Register story unlock requirements (for custom stories)
 */
export declare function registerStoryUnlock(storyId: string, requirements: StoryUnlockRequirements): void;
/**
 * Get all story IDs with unlock requirements
 */
export declare function getAllStoryIds(): string[];
/**
 * Get stories that naturally follow from a told story
 */
export declare function getFollowUpStories(storyId: string, context: UnlockContext): UnlockResult[];
/**
 * Record that a story was told
 */
export declare function recordStoryTold(sessionId: string, storyId: string): void;
/**
 * Get stories told this session
 */
export declare function getStoriesToldThisSession(sessionId: string): string[];
/**
 * Clear session story tracking
 */
export declare function clearStoryProgression(sessionId: string): void;
export declare const storyUnlocks: {
    getUnlocked: typeof getUnlockedStories;
    getBest: typeof getBestStoryForMoment;
    isUnlocked: typeof isStoryUnlocked;
    byDepth: typeof getStoriesByDepth;
    forTopic: typeof getStoriesForTopic;
    followUps: typeof getFollowUpStories;
    allIds: typeof getAllStoryIds;
    getIntro: typeof getStoryIntroduction;
    register: typeof registerStoryUnlock;
    recordTold: typeof recordStoryTold;
    getTold: typeof getStoriesToldThisSession;
    clearSession: typeof clearStoryProgression;
};
export default storyUnlocks;
//# sourceMappingURL=story-unlocks.d.ts.map