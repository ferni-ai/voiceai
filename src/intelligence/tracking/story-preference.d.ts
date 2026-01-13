/**
 * Story Preference Learning Engine
 *
 * Learns which types of stories resonate with each user by tracking:
 * - Story characteristics (length, type, emotional depth)
 * - User engagement signals after stories
 * - Topics that trigger good story reception
 * - Personal vs educational story preference
 */
export type StoryType = 'personal' | 'client' | 'historical' | 'metaphorical' | 'educational' | 'inspirational' | 'cautionary';
export type StoryLength = 'brief' | 'medium' | 'detailed';
export type EmotionalDepth = 'light' | 'moderate' | 'deep';
export interface StoryAttempt {
    id: string;
    timestamp: Date;
    type: StoryType;
    length: StoryLength;
    emotionalDepth: EmotionalDepth;
    topic: string;
    preview: string;
    userEngagement?: UserEngagement;
    engagementTimestamp?: Date;
}
export interface UserEngagement {
    responseLength: 'short' | 'medium' | 'long';
    askedFollowUp: boolean;
    sharedOwn: boolean;
    emotionalResponse: boolean;
    changedTopic: boolean;
    expressedInterest: string[];
}
export interface StoryPreferences {
    typeScores: Record<StoryType, number>;
    preferredLength: StoryLength;
    preferredDepth: EmotionalDepth;
    goodTopics: string[];
    badTopics: string[];
    sharesTrigger: boolean;
    asksTrigger: boolean;
    totalAttempts: number;
    averageEngagement: number;
    likesStories: boolean;
    bestTypes: StoryType[];
}
export interface StoryGuidance {
    shouldTellStory: boolean;
    recommendedType?: StoryType;
    recommendedLength?: StoryLength;
    recommendedDepth?: EmotionalDepth;
    avoidTypes: StoryType[];
    contextNote?: string;
    confidence: number;
}
export declare class StoryPreferenceEngine {
    private attempts;
    private pendingStory;
    private sessionStoryCount;
    constructor();
    recordStory(content: string, topic: string, type?: StoryType, emotionalDepth?: EmotionalDepth): string;
    private detectStoryType;
    private detectLength;
    private detectDepth;
    analyzeEngagement(userResponse: string): UserEngagement | null;
    private categorizeLength;
    private extractInterestPhrases;
    calculatePreferences(): StoryPreferences;
    private engagementToScore;
    private findBestOption;
    getStoryGuidance(currentTopic: string, currentEmotion?: string, turnCount?: number): StoryGuidance;
    formatGuidanceForPrompt(): string;
    reset(): void;
    getSessionStats(): {
        storiesTold: number;
        pendingEngagement: boolean;
    };
}
export declare function getStoryPreference(userId: string): StoryPreferenceEngine;
export declare function removeStoryPreference(userId: string): void;
//# sourceMappingURL=story-preference.d.ts.map