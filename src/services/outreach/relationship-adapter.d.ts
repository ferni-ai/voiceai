/**
 * Relationship Adapter Service
 *
 * Adapts outreach tone, formality, and style based on relationship depth.
 * As relationships deepen, communication becomes more casual and personal.
 *
 * Relationship Stages:
 * - New: Formal, permission-seeking, careful
 * - Building: Friendly, warming up, learning
 * - Established: Casual, comfortable, familiar
 * - Deep: Intimate, inside jokes, friend-like
 *
 * Philosophy: How we talk to someone should reflect how well we know them.
 */
import type { AgentId } from '../agent-bus.js';
export type RelationshipStage = 'new' | 'building' | 'established' | 'deep';
export interface RelationshipProfile {
    userId: string;
    stage: RelationshipStage;
    metrics: {
        totalConversations: number;
        daysSinceFirst: number;
        emotionalMomentsShared: number;
        achievementsCelebrated: number;
        strugglesDiscussed: number;
        insideJokesCount: number;
    };
    memory: {
        startDate: Date;
        lastInteractionDate?: Date;
        preferredPersona?: AgentId;
        insideJokes: string[];
        sharedReferences: string[];
        nicknames: string[];
        significantMoments: SignificantMoment[];
    };
    communicationStyle: {
        prefersFormal: boolean;
        likesEmoji: boolean;
        appreciatesHumor: boolean;
        respondsToDirectness: boolean;
        needsGentleness: boolean;
    };
}
export interface SignificantMoment {
    id: string;
    date: Date;
    type: 'breakthrough' | 'celebration' | 'vulnerable_moment' | 'milestone' | 'funny';
    description: string;
    canReference: boolean;
}
export interface ToneAdjustment {
    formality: 'formal' | 'friendly' | 'casual' | 'intimate';
    emojiLevel: 'none' | 'minimal' | 'moderate' | 'expressive';
    humorAllowed: boolean;
    canUseNickname: boolean;
    canReferenceHistory: boolean;
    canBeVulnerable: boolean;
    canBeDirect: boolean;
    shouldAskPermission: boolean;
}
export interface MessageAdjustment {
    greeting: string;
    closingStyle: string;
    nameUsage: 'full_name' | 'first_name' | 'nickname' | 'omit';
    addedWarmth: string[];
    addedReferences: string[];
    toneModifiers: string[];
}
/**
 * Get or create relationship profile
 */
export declare function getRelationshipProfile(userId: string): RelationshipProfile;
/**
 * Calculate relationship stage from metrics
 */
export declare function calculateStage(profile: RelationshipProfile): RelationshipStage;
/**
 * Update stage based on current metrics
 */
export declare function updateStage(userId: string): RelationshipStage;
/**
 * Record a conversation
 */
export declare function recordConversation(userId: string, data: {
    persona?: AgentId;
    hadEmotionalMoment?: boolean;
    celebratedAchievement?: boolean;
    discussedStruggle?: boolean;
}): void;
/**
 * Add an inside joke
 */
export declare function addInsideJoke(userId: string, joke: string): void;
/**
 * Add a nickname
 */
export declare function addNickname(userId: string, nickname: string): void;
/**
 * Add a shared reference
 */
export declare function addSharedReference(userId: string, reference: string): void;
/**
 * Record a significant moment
 */
export declare function recordSignificantMoment(userId: string, moment: Omit<SignificantMoment, 'id'>): string;
/**
 * Update communication style preferences
 */
export declare function updateCommunicationStyle(userId: string, style: Partial<RelationshipProfile['communicationStyle']>): void;
/**
 * Get tone adjustment for current relationship stage
 */
export declare function getToneAdjustment(userId: string): ToneAdjustment;
/**
 * Get message adjustment for personalizing outreach
 */
export declare function getMessageAdjustment(userId: string, userName: string, preferredName?: string): MessageAdjustment;
/**
 * Transform a message based on relationship
 */
export declare function adaptMessage(userId: string, message: string, context: {
    userName: string;
    preferredName?: string;
    isGreeting?: boolean;
}): string;
/**
 * Get a random inside joke or reference for deep relationships
 */
export declare function getRandomReference(userId: string): string | null;
/**
 * Get a significant moment we can reference
 */
export declare function getReferenceableMoment(userId: string, type?: SignificantMoment['type']): SignificantMoment | null;
/**
 * Check if a specific action is appropriate for the relationship
 */
export declare function canDoAction(userId: string, action: 'call' | 'use_nickname' | 'reference_history' | 'be_vulnerable' | 'be_direct' | 'use_humor' | 'send_emoji'): boolean;
export declare function clearRelationshipData(userId: string): void;
declare const _default: {
    getRelationshipProfile: typeof getRelationshipProfile;
    calculateStage: typeof calculateStage;
    updateStage: typeof updateStage;
    recordConversation: typeof recordConversation;
    addInsideJoke: typeof addInsideJoke;
    addNickname: typeof addNickname;
    addSharedReference: typeof addSharedReference;
    recordSignificantMoment: typeof recordSignificantMoment;
    updateCommunicationStyle: typeof updateCommunicationStyle;
    getToneAdjustment: typeof getToneAdjustment;
    getMessageAdjustment: typeof getMessageAdjustment;
    adaptMessage: typeof adaptMessage;
    getRandomReference: typeof getRandomReference;
    getReferenceableMoment: typeof getReferenceableMoment;
    canDoAction: typeof canDoAction;
    clearRelationshipData: typeof clearRelationshipData;
};
export default _default;
//# sourceMappingURL=relationship-adapter.d.ts.map