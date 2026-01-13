/**
 * Conversation Quality Module
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Implements sophisticated conversation tracking and enhancement:
 * - Farewell summary generation
 * - Session recovery
 * - Graceful error handling
 * - Small detail memory
 * - Physical/emotional state awareness
 * - Follow-up scheduling
 * - Conversation pacing score
 *
 * Every conversation should feel complete - even when interrupted.
 * We track what matters so we can pick up naturally, remember the
 * little things, and always leave conversations feeling heard.
 */
export interface FarewellSummary {
    nextTimeGreeting: string;
    keyThingsToRemember: string[];
    openLoops: string[];
    endingMood: 'positive' | 'neutral' | 'concerned' | 'distressed';
    relationshipNotes: string;
    specificDetails: SmallDetail[];
    followUps: FollowUpItem[];
}
/**
 * Generate a farewell summary for the next conversation
 */
export declare function generateFarewellSummary(conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
}>, topicsDiscussed: string[], userProfile: {
    name?: string;
    goals?: Array<{
        type: string;
        status: string;
    }>;
    familyMembers?: Array<{
        name: string;
        relationship: string;
    }>;
} | null, emotionalArc: {
    start: string;
    end: string;
}): FarewellSummary;
export interface SmallDetail {
    type: 'user_name' | 'person_name' | 'pet_name' | 'place' | 'company' | 'date' | 'amount' | 'other';
    value: string;
    context: string;
    extractedAt: Date;
}
/**
 * Extract specific details from user messages
 */
export declare function extractSmallDetails(text: string): SmallDetail[];
/**
 * Get a contextual reference to a remembered detail
 */
export declare function getDetailCallback(detail: SmallDetail): string;
export interface FollowUpItem {
    topic: string;
    suggestedDate: Date;
    priority: 'high' | 'medium' | 'low';
    reason: string;
}
/**
 * Extract potential follow-up items from conversation
 */
export declare function extractFollowUps(conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
}>, topics: string[]): FollowUpItem[];
/**
 * Generate a follow-up suggestion for Jack
 */
export declare function getFollowUpSuggestion(followUp: FollowUpItem): string;
export interface PersonaPhysicalState {
    energyLevel: 'high' | 'medium' | 'low';
    alertness: 'sharp' | 'normal' | 'tired';
    mood: 'upbeat' | 'mellow' | 'reflective' | 'sleepy';
    physicalNote: string | null;
    personaId?: string;
}
/**
 * Get persona's physical state based on time and conversation length
 * Works for any persona, falls back to generic if persona not configured
 */
export declare function getPersonaPhysicalState(hour: number, conversationMinutes: number, turnCount: number, personaId?: string): PersonaPhysicalState;
/**
 * Get a physical state interjection for any persona
 */
export declare function getPhysicalStateInterjection(state: PersonaPhysicalState): string | null;
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
/**
 * Calculate real-time conversation quality score
 */
export declare function calculatePacingScore(recentMessages: Array<{
    role: 'user' | 'assistant';
    content: string;
}>, turnCount: number, topicsDiscussed: string[], emotionalMoments: number, goalsReached: number): ConversationPacingScore;
export interface SessionRecoveryState {
    wasDisconnected: boolean;
    disconnectedAt: Date | null;
    lastTopic: string | null;
    lastUserMessage: string | null;
    recoveryGreeting: string;
}
/**
 * Generate session recovery state for dropped calls
 */
export declare function createSessionRecoveryState(lastTopic: string | null, lastUserMessage: string | null): SessionRecoveryState;
/**
 * Check if session should attempt recovery
 */
export declare function shouldAttemptRecovery(disconnectedAt: Date | null, maxRecoveryMinutes?: number): boolean;
export interface GracefulError {
    userMessage: string;
    internalError: string;
    recoverable: boolean;
}
/**
 * Generate a human-like error response
 */
export declare function getGracefulErrorResponse(errorType: string, context?: string): GracefulError;
export declare const ConversationQuality: {
    generateFarewellSummary: typeof generateFarewellSummary;
    extractSmallDetails: typeof extractSmallDetails;
    getDetailCallback: typeof getDetailCallback;
    extractFollowUps: typeof extractFollowUps;
    getFollowUpSuggestion: typeof getFollowUpSuggestion;
    getPersonaPhysicalState: typeof getPersonaPhysicalState;
    getPhysicalStateInterjection: typeof getPhysicalStateInterjection;
    calculatePacingScore: typeof calculatePacingScore;
    createSessionRecoveryState: typeof createSessionRecoveryState;
    shouldAttemptRecovery: typeof shouldAttemptRecovery;
    getGracefulErrorResponse: typeof getGracefulErrorResponse;
};
export default ConversationQuality;
//# sourceMappingURL=conversation-quality.d.ts.map