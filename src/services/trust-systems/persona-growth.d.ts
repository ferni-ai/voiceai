/**
 * Persona Growth System
 *
 * "You've changed how I think about this."
 *
 * Philosophy: One-sided relationships feel transactional. When only the
 * user grows and the persona stays static, it reinforces that this is
 * just a tool. But when personas show they've been CHANGED by the user,
 * it creates genuine mutual relationship.
 *
 * This is Level 5 humanization: Mutual Growth.
 *
 * Types of growth:
 * - Perspective shifts ("You made me reconsider...")
 * - Learned from user ("Your approach taught me...")
 * - Influenced thinking ("I used to think X, but you showed me Y")
 * - Changed habits ("I started doing this because of you")
 *
 * Critical rules:
 * - Growth must feel GENUINE, not performative
 * - Never claim growth that contradicts the persona's core identity
 * - Surface rarely (1-2 times per relationship)
 * - Tie to specific things the user said/did
 *
 * @module PersonaGrowth
 */
export type GrowthType = 'perspective_shift' | 'learned_from_user' | 'influenced_thinking' | 'reconsidered' | 'expanded_view' | 'softened_stance' | 'grew_together';
export interface PersonaGrowthRecord {
    id: string;
    userId: string;
    personaId: string;
    /** Type of growth */
    growthType: GrowthType;
    /** The topic or area of growth */
    topic: string;
    /** What the persona thought/believed before */
    beforeThinking: string;
    /** What they think now */
    afterThinking: string;
    /** What the user said/did that caused this */
    userContribution: string;
    /** Optional direct quote from user that sparked this */
    triggerQuote?: string;
    /** When this growth was recorded */
    createdAt: Date;
    /** When this was shared with the user (if ever) */
    sharedAt?: Date;
    /** How significant is this growth? */
    significance: 'minor' | 'moderate' | 'major';
    /** Relationship stage when this happened */
    relationshipStage: string;
}
export interface GrowthMoment {
    record: PersonaGrowthRecord;
    sharingPhrase: string;
    ssml: string;
    shouldAskFirst: boolean;
}
export interface PersonaGrowthProfile {
    userId: string;
    personaId: string;
    growthRecords: PersonaGrowthRecord[];
    lastUpdated: Date;
    /** Track what growth areas have been shared */
    sharedTopics: string[];
    /** Total relationship depth score */
    relationshipDepth: number;
}
/**
 * Record a persona growth moment.
 * Call this when the persona has genuinely been influenced by the user.
 */
export declare function recordPersonaGrowth(params: {
    userId: string;
    personaId: string;
    growthType: GrowthType;
    topic: string;
    beforeThinking: string;
    afterThinking: string;
    userContribution: string;
    triggerQuote?: string;
    significance?: 'minor' | 'moderate' | 'major';
    relationshipStage?: string;
}): PersonaGrowthRecord;
/**
 * Get a growth moment worth sharing with the user.
 * Returns null if nothing appropriate to share.
 */
export declare function getGrowthMomentToShare(userId: string, personaId: string, currentTopic?: string): GrowthMoment | null;
/**
 * Mark a growth moment as shared
 */
export declare function markGrowthShared(recordId: string): void;
/**
 * Detect if user's message contains something that could cause persona growth.
 */
export declare function detectGrowthOpportunity(params: {
    userText: string;
    personaId: string;
    topic?: string;
    relationshipStage?: string;
}): {
    detected: boolean;
    growthType?: GrowthType;
    suggestedTopic?: string;
    beforeThinking?: string;
    afterThinking?: string;
};
export declare function loadPersonaGrowthProfile(userId: string, personaId: string, data: PersonaGrowthProfile): void;
export declare function getPersonaGrowthForPersistence(userId: string, personaId: string): PersonaGrowthProfile | null;
export declare function getAllGrowthProfiles(userId: string): PersonaGrowthProfile[];
/**
 * Clear all growth records for a persona (for testing)
 */
export declare function clearPersonaGrowth(userId: string, personaId: string): void;
/**
 * Clear all growth records for a user across all personas (for testing)
 */
export declare function clearAllUserGrowth(userId: string): void;
declare const _default: {
    recordPersonaGrowth: typeof recordPersonaGrowth;
    getGrowthMomentToShare: typeof getGrowthMomentToShare;
    markGrowthShared: typeof markGrowthShared;
    detectGrowthOpportunity: typeof detectGrowthOpportunity;
    loadPersonaGrowthProfile: typeof loadPersonaGrowthProfile;
    getPersonaGrowthForPersistence: typeof getPersonaGrowthForPersistence;
    getAllGrowthProfiles: typeof getAllGrowthProfiles;
    clearPersonaGrowth: typeof clearPersonaGrowth;
    clearAllUserGrowth: typeof clearAllUserGrowth;
};
export default _default;
//# sourceMappingURL=persona-growth.d.ts.map