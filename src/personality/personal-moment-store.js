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
import { createLogger } from '../utils/safe-logger.js';
// Import and re-export transitions (for backwards compatibility)
export { STANDARD_TRANSITIONS } from './transitions.js';
// Import persona moments
import { ALEX_MOMENTS } from './moments/alex-moments.js';
import { FERNI_MOMENTS } from './moments/ferni-moments.js';
import { JORDAN_MOMENTS } from './moments/jordan-moments.js';
import { MAYA_MOMENTS } from './moments/maya-moments.js';
import { NAYAN_MOMENTS } from './moments/nayan-moments.js';
import { PETER_MOMENTS } from './moments/peter-moments.js';
const log = createLogger({ module: 'PersonalMomentStore' });
// ============================================================================
// MOMENT REGISTRY
// ============================================================================
/**
 * All persona moments indexed by persona ID
 */
const PERSONA_MOMENTS = {
    ferni: FERNI_MOMENTS,
    alex: ALEX_MOMENTS,
    maya: MAYA_MOMENTS,
    jordan: JORDAN_MOMENTS,
    peter: PETER_MOMENTS,
    nayan: NAYAN_MOMENTS,
};
// ============================================================================
// PUBLIC API
// ============================================================================
/**
 * Get all moments for a persona
 */
export function getMomentsForPersona(personaId) {
    const moments = PERSONA_MOMENTS[personaId.toLowerCase()];
    if (!moments) {
        log.warn({ personaId }, 'No moments found for persona');
        return [];
    }
    return moments;
}
/**
 * Get a specific moment by ID
 */
export function getMomentById(personaId, momentId) {
    const moments = getMomentsForPersona(personaId);
    return moments.find((m) => m.id === momentId) || null;
}
/**
 * Get moments filtered by topic
 */
export function getMomentsByTopic(personaId, topic) {
    return getMomentsForPersona(personaId).filter((m) => m.topic === topic);
}
/**
 * Get moments appropriate for a relationship stage
 */
export function getMomentsForRelationshipStage(personaId, stage) {
    const stageOrder = ['stranger', 'acquaintance', 'friend', 'trusted'];
    const stageIndex = stageOrder.indexOf(stage);
    return getMomentsForPersona(personaId).filter((m) => {
        const momentStageIndex = stageOrder.indexOf(m.minRelationshipStage);
        return momentStageIndex <= stageIndex;
    });
}
/**
 * Get moments by depth level
 */
export function getMomentsByDepth(personaId, depth) {
    return getMomentsForPersona(personaId).filter((m) => m.depth === depth);
}
/**
 * Search moments by keyword
 */
export function searchMomentsByKeyword(personaId, keyword) {
    const lowerKeyword = keyword.toLowerCase();
    return getMomentsForPersona(personaId).filter((m) => m.triggers.keywords.some((k) => k.toLowerCase().includes(lowerKeyword)));
}
/**
 * Get moments that can be asked about (have follow-up enabled)
 */
export function getAskableMoments(personaId) {
    return getMomentsForPersona(personaId).filter((m) => m.canAskAbout);
}
/**
 * Get all registered persona IDs
 */
export function getRegisteredPersonaIds() {
    return Object.keys(PERSONA_MOMENTS);
}
/**
 * Get statistics about a persona's moments
 */
export function getMomentStats(personaId) {
    const moments = getMomentsForPersona(personaId);
    const byDepth = {
        surface: 0,
        medium: 0,
        deep: 0,
        sacred: 0,
    };
    const byTopic = {};
    for (const moment of moments) {
        byDepth[moment.depth]++;
        byTopic[moment.topic] = (byTopic[moment.topic] || 0) + 1;
    }
    return {
        total: moments.length,
        byDepth,
        byTopic,
        askable: moments.filter((m) => m.canAskAbout).length,
    };
}
// ============================================================================
// MOMENT CREATION HELPERS
// ============================================================================
/**
 * Helper to create a personal moment with defaults
 */
export function createMoment(personaId, partial) {
    return {
        personaId,
        maxSharesPerUser: partial.maxSharesPerUser ?? 1,
        cooldownDays: partial.cooldownDays ?? 30,
        canAskAbout: partial.canAskAbout ?? false,
        weight: partial.weight ?? 1.0,
        ...partial,
    };
}
// NOTE: STANDARD_TRANSITIONS is now imported from ./transitions.ts and re-exported at the top of this file
// ============================================================================
// EXPORTS
// ============================================================================
export { PERSONA_MOMENTS, };
//# sourceMappingURL=personal-moment-store.js.map