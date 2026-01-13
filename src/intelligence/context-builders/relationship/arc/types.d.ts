/**
 * Relationship Arc Types
 *
 * > "Better than human" means tracking the full arc of a relationship,
 * > not just individual moments.
 *
 * These types define the data structures for tracking a relationship
 * from first meeting through deep partnership.
 *
 * @module intelligence/context-builders/relationship/arc/types
 */
/**
 * The four stages of a Ferni relationship
 *
 * Each stage has distinct behaviors, expectations, and appropriate depth.
 */
export type RelationshipStage = 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
/**
 * Stage configuration with thresholds
 */
export interface StageConfig {
    stage: RelationshipStage;
    minSessions: number;
    minTrustScore?: number;
    description: string;
    behaviors: string[];
}
export declare const STAGE_CONFIGS: Record<RelationshipStage, StageConfig>;
/**
 * Energy detected from user's first interaction
 */
export type DetectedEnergy = 'rushed' | 'anxious' | 'excited' | 'neutral' | 'low' | 'guarded';
/**
 * Data captured during the first meeting
 */
export interface FirstMeetingData {
    /** The user's very first words to Ferni */
    firstWords: string;
    /** Energy detected from voice/text */
    detectedEnergy: DetectedEnergy;
    /** Timestamp of first meeting */
    timestamp: number;
    /** Speech rate if detected (words per minute) */
    speechRate?: number;
    /** What we noticed about them (for callback) */
    observations: string[];
    /** Whether we've made a first-words callback */
    firstWordsCallbackMade: boolean;
}
/**
 * Types of key moments in the relationship
 */
export type KeyMomentType = 'breakthrough' | 'vulnerability' | 'celebration' | 'support' | 'humor' | 'growth' | 'challenge' | 'repair';
/**
 * A key moment in the relationship
 */
export interface KeyMoment {
    id: string;
    type: KeyMomentType;
    summary: string;
    quote?: string;
    timestamp: number;
    sessionId: string;
    personaId: string;
    referencedCount: number;
    lastReferenced?: number;
}
/**
 * Record of a stage transition
 */
export interface StageTransition {
    from: RelationshipStage;
    to: RelationshipStage;
    timestamp: number;
    trigger: string;
    sessionNumber: number;
}
/**
 * A term or phrase that's become part of our shared vocabulary
 */
export interface SharedVocabulary {
    term: string;
    meaning: string;
    origin?: string;
    firstUsed: number;
    useCount: number;
}
/**
 * Complete relationship arc data for a user
 *
 * This is the single source of truth for the relationship state
 */
export interface RelationshipArcData {
    userId: string;
    currentStage: RelationshipStage;
    stageTransitions: StageTransition[];
    firstMeeting: FirstMeetingData | null;
    keyMoments: KeyMoment[];
    sharedVocabulary: SharedVocabulary[];
    totalSessions: number;
    totalTurns: number;
    firstSessionDate: number;
    lastSessionDate: number;
    vulnerabilityCount: number;
    breakthroughCount: number;
    celebrationCount: number;
    referencedMilestones: string[];
    lastMilestoneReference?: number;
}
/**
 * Extended input for relationship-arc builders
 */
export interface RelationshipArcInput {
    userId: string;
    sessionId: string;
    sessionNumber: number;
    turnCount: number;
    userText: string;
    speechRate?: number;
    voiceEmotion?: {
        primary?: string;
        intensity?: number;
        confidence?: number;
    };
    relationshipData: RelationshipArcData | null;
}
/**
 * Create default relationship arc data for a new user
 */
export declare function createDefaultRelationshipArcData(userId: string): RelationshipArcData;
/**
 * Determine the appropriate stage based on stats
 */
export declare function determineStage(totalSessions: number, trustScore?: number): RelationshipStage;
/**
 * Generate a unique moment ID
 */
export declare function generateMomentId(): string;
//# sourceMappingURL=types.d.ts.map