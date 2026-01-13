/**
 * Human Personality System - Types
 *
 * Core type definitions for the personality system that makes Ferni feel human.
 * Personality emerges through relevance and relationship, not repetition.
 *
 * @module personality/types
 */
/**
 * Depth levels for personal sharing
 * Deeper content requires stronger relationships
 */
export type ShareDepth = 'surface' | 'medium' | 'deep' | 'sacred';
/**
 * Relationship stages that gate personal sharing
 */
export type RelationshipStage = 'stranger' | 'acquaintance' | 'friend' | 'trusted';
/**
 * A personal moment that Ferni can share when contextually relevant
 *
 * These are the building blocks of discoverable personality.
 * Instead of announcing traits, Ferni reveals them through moments that matter.
 */
export interface PersonalMoment {
    /** Unique identifier */
    id: string;
    /** Persona this moment belongs to (e.g., 'ferni', 'alex') */
    personaId: string;
    /** Category of this moment */
    topic: PersonalMomentTopic;
    /** What Ferni might share - the actual content */
    content: string;
    /** Alternative ways to express this (for variety) */
    variations?: string[];
    /** When to surface this moment */
    triggers: {
        /** Keywords that make this relevant */
        keywords: string[];
        /** User emotions that make this appropriate */
        emotions?: string[];
        /** Conversation topics that connect */
        topics?: string[];
        /** Direct questions that should surface this */
        directQuestions?: RegExp[];
    };
    /** How to introduce this naturally */
    transitions: string[];
    /** Relationship gating */
    depth: ShareDepth;
    minRelationshipStage: RelationshipStage;
    /** Sharing limits per user */
    maxSharesPerUser: number;
    /** Minimum days before re-sharing with same user */
    cooldownDays: number;
    /** Can the user ask about this later? */
    canAskAbout: boolean;
    /** Ways to reference it in future conversations */
    followUpPrompts?: string[];
    /** Optional: related moments that could be shared together or as follow-ups */
    relatedMoments?: string[];
    /** Weighting for selection (higher = more likely when relevant) */
    weight?: number;
}
/**
 * Categories for personal moments
 */
export type PersonalMomentTopic = 'morning_routine' | 'creative_struggle' | 'family_life' | 'travel_wisdom' | 'nature_connection' | 'music_and_mood' | 'personal_struggle' | 'life_lesson' | 'grief_and_loss' | 'fear_and_courage' | 'guilty_pleasure' | 'unpopular_opinion' | 'physical_habit' | 'sensory_memory' | 'dream_chasing' | 'ongoing_growth' | 'relationship_insight';
/**
 * Record of a moment Ferni shared with a specific user
 */
export interface SharedMomentRecord {
    /** The moment that was shared */
    momentId: string;
    /** When it was shared */
    sharedAt: Date;
    /** Why it came up / conversation context */
    context: string;
    /** How the user responded (if notable) */
    userReaction?: string;
    /** Has the user asked about this since? */
    hasFollowedUp: boolean;
}
/**
 * A moment the user shared that's worth remembering for callbacks
 */
export interface UserMomentRecord {
    /** Unique ID */
    id: string;
    /** What they shared */
    what: string;
    /** Keywords for matching */
    keywords: string[];
    /** When they shared it */
    sharedAt: Date;
    /** How important/emotional this seemed (0-1) */
    emotionalWeight: number;
    /** Category of moment */
    category: UserMomentCategory;
    /** When to follow up (if time-based, e.g., "recital on Friday") */
    followUpAfter?: Date;
    /** The follow-up question to ask */
    followUpQuestion: string;
    /** Alternative ways to ask */
    alternateQuestions: string[];
    /** Has Ferni followed up on this? */
    followedUp: boolean;
    /** When was it followed up on */
    followedUpAt?: Date;
}
/**
 * Categories for user moments (helps with callback timing/priority)
 */
export type UserMomentCategory = 'upcoming_event' | 'ongoing_situation' | 'decision_point' | 'relationship_moment' | 'achievement' | 'struggle' | 'goal' | 'life_update';
/**
 * The full relationship memory between Ferni and a user
 */
export interface PersonalityRelationship {
    /** User ID */
    userId: string;
    /** Persona ID (e.g., 'ferni') */
    personaId: string;
    /** When this relationship record was created */
    createdAt: Date;
    /** Last interaction */
    lastInteraction: Date;
    /** Moments Ferni has shared with this user */
    sharedMoments: SharedMomentRecord[];
    /** Moments the user has shared (for callbacks) */
    userMoments: UserMomentRecord[];
    /** Topics the user now knows about Ferni */
    discoveredTopics: PersonalMomentTopic[];
    /** Count of vulnerable shares (affects relationship depth) */
    vulnerabilityDepth: number;
}
/**
 * Result of finding a relevant moment to share
 */
export interface RelevanceMatch {
    /** The moment that matches */
    moment: PersonalMoment;
    /** How relevant (0-1) */
    relevanceScore: number;
    /** Why this is relevant */
    reason: string;
    /** Suggested transition phrase */
    suggestedTransition: string;
    /** Has this been shared with this user before? */
    previouslyShared: boolean;
    /** If shared before, when? */
    lastSharedAt?: Date;
}
/**
 * A pending callback to ask the user about something they shared
 */
export interface PendingCallback {
    /** The user moment this is for */
    userMomentId: string;
    /** User ID */
    userId: string;
    /** What to follow up about */
    topic: string;
    /** The original context */
    originalContext: string;
    /** Priority for surfacing */
    priority: 'high' | 'medium' | 'low';
    /** When this becomes relevant to ask about */
    activeAfter: Date;
    /** The follow-up question */
    question: string;
    /** How to transition into asking */
    transitions: string[];
}
/**
 * Output from the human personality context builder
 */
export interface HumanPersonalityContext {
    /** Pending callbacks to surface */
    callbacks: PendingCallback[];
    /** Relevant moment to potentially share */
    relevantMoment?: RelevanceMatch;
    /** User moments extracted from their message (to store) */
    extractedUserMoments: Array<Omit<UserMomentRecord, 'id' | 'sharedAt'>>;
    /** Debug info */
    debug: {
        momentsConsidered: number;
        callbacksAvailable: number;
        relationshipStage: RelationshipStage;
        discoveredTopics: PersonalMomentTopic[];
    };
}
/**
 * Firestore document for personality relationship
 * Dates are stored as ISO strings
 */
export interface PersonalityRelationshipDoc {
    userId: string;
    personaId: string;
    createdAt: string;
    lastInteraction: string;
    sharedMoments: Array<Omit<SharedMomentRecord, 'sharedAt'> & {
        sharedAt: string;
    }>;
    userMoments: Array<Omit<UserMomentRecord, 'sharedAt' | 'followUpAfter' | 'followedUpAt'> & {
        sharedAt: string;
        followUpAfter?: string;
        followedUpAt?: string;
    }>;
    discoveredTopics: PersonalMomentTopic[];
    vulnerabilityDepth: number;
}
/**
 * Options for finding relevant moments
 */
export interface RelevanceOptions {
    /** Current user message */
    userMessage: string;
    /** Detected user emotion */
    userEmotion?: string;
    /** Recent conversation topics */
    recentTopics?: string[];
    /** Current relationship stage */
    relationshipStage: RelationshipStage;
    /** The user's relationship memory with this persona */
    relationship?: PersonalityRelationship;
    /** Minimum relevance score to return a match */
    minRelevanceScore?: number;
    /** Maximum number of matches to return */
    maxMatches?: number;
}
/**
 * Options for callback detection
 */
export interface CallbackExtractionOptions {
    /** The user's message to analyze */
    userMessage: string;
    /** Recent messages for context */
    recentMessages?: string[];
    /** User's emotional state */
    emotionalState?: string;
}
//# sourceMappingURL=types.d.ts.map