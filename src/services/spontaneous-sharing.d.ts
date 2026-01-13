/**
 * Spontaneous Sharing Service
 *
 * Surfaces persona quirks, contradictions, and personal details naturally
 * based on conversation context and relationship stage.
 *
 * PERSISTENCE: Tracks what's been shared to avoid repetition. Persists to
 * Firestore via the unified persistence layer.
 */
import type { PersonaRelationshipStage } from '../types/user-profile.js';
export interface SharingContext {
    personaId: string;
    relationshipStage: PersonaRelationshipStage;
    currentTopic?: string;
    userMessage?: string;
    turnCount: number;
}
export interface ShareResult {
    content: string;
    type: 'endearing_contradiction' | 'simple_joy' | 'pet_peeve' | 'growth_edge' | 'relationship_moment' | 'guilty_pleasure' | 'strong_opinion';
    triggered_by?: string;
}
/**
 * Initialize persistence for spontaneous sharing
 */
export declare function initializeSpontaneousSharingPersistence(): Promise<void>;
/**
 * Shutdown spontaneous sharing persistence
 */
export declare function shutdownSpontaneousSharingPersistence(): Promise<void>;
/**
 * Try to surface an endearing contradiction
 */
export declare function surfaceEnderingContradiction(context: SharingContext, userId: string): Promise<ShareResult | null>;
/**
 * Try to share a simple joy based on topic
 */
export declare function shareSimpleJoy(context: SharingContext, userId: string): Promise<ShareResult | null>;
/**
 * Reference a pet peeve when relevant topic comes up
 */
export declare function referencePetPeeve(context: SharingContext, userId: string): Promise<ShareResult | null>;
/**
 * Share a growth edge (Maya-style vulnerability)
 */
export declare function shareGrowthEdge(context: SharingContext, userId: string): Promise<ShareResult | null>;
/**
 * Share a relationship moment
 */
export declare function shareRelationshipMoment(context: SharingContext, userId: string): Promise<ShareResult | null>;
/**
 * Share a guilty pleasure
 */
export declare function shareGuiltyPleasure(context: SharingContext, userId: string): Promise<ShareResult | null>;
/**
 * Try all spontaneous sharing options and return the best one
 */
export declare function trySpontaneousShare(context: SharingContext, userId: string): Promise<ShareResult | null>;
/**
 * Clear shared content tracking for a user
 */
export declare function clearSharedContent(personaId: string, userId: string): Promise<void>;
export declare const SpontaneousSharingService: {
    initialize: typeof initializeSpontaneousSharingPersistence;
    shutdown: typeof shutdownSpontaneousSharingPersistence;
    surfaceContradiction: typeof surfaceEnderingContradiction;
    shareJoy: typeof shareSimpleJoy;
    referencePeeve: typeof referencePetPeeve;
    shareGrowthEdge: typeof shareGrowthEdge;
    shareRelationshipMoment: typeof shareRelationshipMoment;
    shareGuiltyPleasure: typeof shareGuiltyPleasure;
    trySpontaneousShare: typeof trySpontaneousShare;
    clearSharedContent: typeof clearSharedContent;
};
export default SpontaneousSharingService;
//# sourceMappingURL=spontaneous-sharing.d.ts.map