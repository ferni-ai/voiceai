/**
 * Meta-Relationship Awareness & Somatic Presence
 *
 * > "We've built something real here, haven't we?"
 *
 * Two systems that create deep connection:
 * 1. Meta-Relationship - Commenting on the relationship itself
 * 2. Somatic Presence - Physical embodiment cues
 *
 * @module @ferni/superhuman/meta-relationship
 */
import type { MetaRelationshipResult, RelationshipMilestone, RelationshipStage, SomaticContext, SomaticResult } from './types.js';
export declare class MetaRelationshipEngine {
    private userId;
    private personaId;
    private milestones;
    private currentStage;
    private lastMetaCommentTurn;
    private sessionCount;
    constructor(userId: string, existing?: {
        milestones?: RelationshipMilestone[];
        stage?: RelationshipStage;
        sessionCount?: number;
    }, personaId?: string);
    setPersonaId(personaId: string): void;
    /**
     * Record a relationship milestone
     */
    recordMilestone(type: RelationshipMilestone['type'], description: string): void;
    /**
     * Record session (for milestone tracking)
     */
    recordSession(): void;
    /**
     * Update relationship stage
     */
    updateStage(stage: RelationshipStage): void;
    /**
     * Check if we should make a meta-relationship comment
     */
    checkForMetaComment(context: {
        turnCount: number;
        wasVulnerable: boolean;
        wasLaughter: boolean;
        wasBreakthrough: boolean;
    }): MetaRelationshipResult;
    private checkMilestoneComment;
    private selectRandom;
    /**
     * Get current stage
     */
    getStage(): RelationshipStage;
    /**
     * Get milestones
     */
    getMilestones(): RelationshipMilestone[];
    /**
     * Export for persistence
     */
    export(): {
        milestones: RelationshipMilestone[];
        stage: RelationshipStage;
        sessionCount: number;
    };
    /**
     * Import from persistence
     */
    import(data: ReturnType<MetaRelationshipEngine['export']>): void;
    /**
     * Reset
     */
    reset(): void;
}
export declare class SomaticPresenceEngine {
    private userId;
    private lastSomaticTurn;
    private usedCuesThisSession;
    constructor(userId: string);
    /**
     * Check if we should emit a somatic cue
     */
    checkForSomaticCue(context: SomaticContext, turnCount: number): SomaticResult;
    private determineCueType;
    private getProbability;
    private getPlacement;
    private selectRandom;
    /**
     * Reset for new session
     */
    reset(): void;
}
export declare function getMetaRelationship(userId: string, existing?: {
    milestones?: RelationshipMilestone[];
    stage?: RelationshipStage;
    sessionCount?: number;
}): MetaRelationshipEngine;
export declare function getSomaticPresence(userId: string): SomaticPresenceEngine;
export declare function clearMetaRelationship(userId: string): void;
export declare function clearSomaticPresence(userId: string): void;
declare const _default: {
    MetaRelationshipEngine: typeof MetaRelationshipEngine;
    SomaticPresenceEngine: typeof SomaticPresenceEngine;
    getMetaRelationship: typeof getMetaRelationship;
    getSomaticPresence: typeof getSomaticPresence;
};
export default _default;
//# sourceMappingURL=meta-relationship.d.ts.map