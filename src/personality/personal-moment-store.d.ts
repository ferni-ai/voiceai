/**
 * Personal Moment Store
 *
 * Unified store for all persona's discoverable personality moments.
 * Personality emerges through relevance and relationship, not repetition.
 *
 * Each persona has their own set of moments that surface when contextually
 * appropriate, creating the feeling of a real person being discovered over time.
 *
 * @module personality/personal-moment-store
 */
import type { PersonalMoment, PersonalMomentTopic, RelationshipStage, ShareDepth } from './types.js';
export { STANDARD_TRANSITIONS } from './transitions.js';
/**
 * All persona moments indexed by persona ID
 */
declare const PERSONA_MOMENTS: Record<string, PersonalMoment[]>;
/**
 * Get all moments for a persona
 */
export declare function getMomentsForPersona(personaId: string): PersonalMoment[];
/**
 * Get a specific moment by ID
 */
export declare function getMomentById(personaId: string, momentId: string): PersonalMoment | null;
/**
 * Get moments filtered by topic
 */
export declare function getMomentsByTopic(personaId: string, topic: PersonalMomentTopic): PersonalMoment[];
/**
 * Get moments appropriate for a relationship stage
 */
export declare function getMomentsForRelationshipStage(personaId: string, stage: RelationshipStage): PersonalMoment[];
/**
 * Get moments by depth level
 */
export declare function getMomentsByDepth(personaId: string, depth: ShareDepth): PersonalMoment[];
/**
 * Search moments by keyword
 */
export declare function searchMomentsByKeyword(personaId: string, keyword: string): PersonalMoment[];
/**
 * Get moments that can be asked about (have follow-up enabled)
 */
export declare function getAskableMoments(personaId: string): PersonalMoment[];
/**
 * Get all registered persona IDs
 */
export declare function getRegisteredPersonaIds(): string[];
/**
 * Get statistics about a persona's moments
 */
export declare function getMomentStats(personaId: string): {
    total: number;
    byDepth: Record<ShareDepth, number>;
    byTopic: Record<string, number>;
    askable: number;
};
/**
 * Helper to create a personal moment with defaults
 */
export declare function createMoment(personaId: string, partial: Partial<PersonalMoment> & Pick<PersonalMoment, 'id' | 'topic' | 'content' | 'triggers' | 'transitions' | 'depth' | 'minRelationshipStage'>): PersonalMoment;
export { PERSONA_MOMENTS, type PersonalMoment, type PersonalMomentTopic, type RelationshipStage, type ShareDepth, };
//# sourceMappingURL=personal-moment-store.d.ts.map