/**
 * Conversation Quality Types
 *
 * Type definitions for conversation quality tracking and enhancement.
 *
 * @module conversation-quality/types
 */
/** Farewell summary for next conversation */
export interface FarewellSummary {
    /** What to greet them with next time */
    nextTimeGreeting: string;
    /** Important things to remember */
    keyThingsToRemember: string[];
    /** Unfinished business */
    openLoops: string[];
    /** Emotional state at end */
    endingMood: 'positive' | 'neutral' | 'concerned' | 'distressed';
    /** Relationship notes */
    relationshipNotes: string;
    /** Specific details mentioned */
    specificDetails: SmallDetail[];
    /** Follow-up items */
    followUps: FollowUpItem[];
}
/** Small detail extracted from conversation */
export interface SmallDetail {
    type: 'user_name' | 'person_name' | 'pet_name' | 'place' | 'company' | 'date' | 'amount' | 'other';
    value: string;
    context: string;
    extractedAt: Date;
}
/** Follow-up item for future conversations */
export interface FollowUpItem {
    topic: string;
    suggestedDate: Date;
    priority: 'high' | 'medium' | 'low';
    reason: string;
}
/** Persona physical state */
export interface PersonaPhysicalState {
    energyLevel: 'high' | 'medium' | 'low';
    alertness: 'sharp' | 'normal' | 'tired';
    mood: 'upbeat' | 'mellow' | 'reflective' | 'sleepy';
    physicalNote: string | null;
    personaId?: string;
}
/** Conversation pacing score */
export interface ConversationPacingScore {
    overallScore: number;
    factors: {
        engagement: number;
        depth: number;
        rapport: number;
        progress: number;
    };
    assessment: 'excellent' | 'good' | 'okay' | 'needs_attention' | 'struggling';
    suggestions: string[];
}
/** Session recovery state for dropped calls */
export interface SessionRecoveryState {
    wasDisconnected: boolean;
    disconnectedAt: Date | null;
    lastTopic: string | null;
    lastUserMessage: string | null;
    recoveryGreeting: string;
}
/** Graceful error response */
export interface GracefulError {
    userMessage: string;
    internalError: string;
    recoverable: boolean;
}
//# sourceMappingURL=types.d.ts.map