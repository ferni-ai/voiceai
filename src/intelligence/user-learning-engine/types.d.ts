/**
 * User Learning Engine - Type Definitions
 *
 * Types for the user learning and memory system.
 *
 * @module intelligence/user-learning-engine/types
 */
import type { KeyMoment, EmotionalPattern } from '../../types/user-profile.js';
import type { SmallDetail, FollowUpItem, FarewellSummary } from '../conversation-quality.js';
/**
 * Learning insight captured during conversation
 */
export interface LearningInsight {
    type: 'preference' | 'concern' | 'goal' | 'relationship' | 'communication_style' | 'topic_interest' | 'emotional_pattern';
    key: string;
    value: unknown;
    confidence: number;
    source: 'explicit' | 'inferred';
    capturedAt: Date;
    context?: string;
}
/**
 * Local type for preference updates (subset of what we track)
 */
export interface PreferenceUpdates {
    responseLength?: 'brief' | 'thorough' | 'unknown';
    storyAppetite?: 'loves_stories' | 'prefers_facts' | 'unknown';
    humorReceptivity?: 'high' | 'medium' | 'low' | 'unknown';
}
/**
 * Conversation analysis result for learning
 */
export interface ConversationLearningData {
    insights: LearningInsight[];
    keyMoments: KeyMoment[];
    smallDetails: SmallDetail[];
    emotionalPatterns: EmotionalPattern[];
    storiesTold: Array<{
        storyId: string;
        theme: string;
        sharedAt: Date;
    }>;
    preferenceUpdates: PreferenceUpdates;
    followUps: FollowUpItem[];
    farewellSummary?: FarewellSummary;
}
/**
 * Dynamic context for prompt enrichment
 */
export interface DynamicUserContext {
    communicationGuidance: string;
    preferenceGuidance: string;
    relevantKeyMoments: string[];
    relevantPastTopics: string[];
    rememberedDetails: string[];
    relationshipDepth: string;
    emotionalHistory: string;
    activeGoals: string[];
    knownConcerns: string[];
    formattedForPrompt: string;
}
/**
 * Voice emotion validation data
 */
export interface VoiceEmotionValidation {
    predicted: string;
    confirmed: boolean;
    timestamp: Date;
}
/**
 * Stored story data
 */
export interface StoryRecord {
    storyId: string;
    theme: string;
    sharedAt: Date;
}
//# sourceMappingURL=types.d.ts.map