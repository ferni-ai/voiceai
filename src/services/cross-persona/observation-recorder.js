/**
 * Persona Observation Recorder - Cross-Persona Intelligence
 *
 * This module provides a simple interface for personas to record observations
 * about users. These observations feed into the Team Huddle system.
 *
 * Usage in persona context builders:
 * ```typescript
 * import { recordPersonaObservation } from '../../services/cross-persona/observation-recorder.js';
 *
 * // In Maya's context builder
 * recordPersonaObservation(userId, {
 *   personaId: 'maya',
 *   observationType: 'concern',
 *   content: 'Sleep habits declining for 2 weeks',
 *   confidence: 0.8,
 *   domain: 'habits',
 *   relatedTopics: ['sleep', 'energy', 'routine'],
 * });
 * ```
 *
 * @module services/cross-persona/observation-recorder
 */
import { createLogger } from '../../utils/safe-logger.js';
import { recordObservation } from './team-huddle.js';
const log = createLogger({ module: 'ObservationRecorder' });
// ============================================================================
// DOMAIN MAPPINGS
// ============================================================================
const PERSONA_DOMAINS = {
    ferni: 'coaching',
    maya: 'habits',
    peter: 'research',
    alex: 'communication',
    jordan: 'milestones',
    nayan: 'wisdom',
};
// ============================================================================
// RECORDING FUNCTIONS
// ============================================================================
/**
 * Record an observation from a persona.
 * This is the primary function to call from persona context builders.
 */
export function recordPersonaObservation(userId, observation) {
    recordObservation(userId, observation);
    log.debug({
        userId,
        persona: observation.personaId,
        type: observation.observationType,
        domain: observation.domain,
    }, `👁️ ${observation.personaId.toUpperCase()} observed: ${observation.content.slice(0, 50)}...`);
}
// ============================================================================
// CONVENIENCE FUNCTIONS FOR EACH PERSONA
// ============================================================================
/**
 * Record a concern (something worrying).
 */
export function recordConcern(userId, personaId, content, confidence, relatedTopics) {
    recordPersonaObservation(userId, {
        personaId,
        observationType: 'concern',
        content,
        confidence,
        domain: PERSONA_DOMAINS[personaId] || 'general',
        relatedTopics,
    });
}
/**
 * Record a pattern (recurring behavior or trend).
 */
export function recordPattern(userId, personaId, content, confidence, relatedTopics) {
    recordPersonaObservation(userId, {
        personaId,
        observationType: 'pattern',
        content,
        confidence,
        domain: PERSONA_DOMAINS[personaId] || 'general',
        relatedTopics,
    });
}
/**
 * Record an opportunity (potential for growth/improvement).
 */
export function recordOpportunity(userId, personaId, content, confidence, suggestedAction, relatedTopics) {
    recordPersonaObservation(userId, {
        personaId,
        observationType: 'opportunity',
        content,
        confidence,
        domain: PERSONA_DOMAINS[personaId] || 'general',
        relatedTopics,
        suggestedAction,
    });
}
/**
 * Record a milestone (achievement or progress).
 */
export function recordMilestone(userId, personaId, content, confidence, relatedTopics) {
    recordPersonaObservation(userId, {
        personaId,
        observationType: 'milestone',
        content,
        confidence,
        domain: PERSONA_DOMAINS[personaId] || 'general',
        relatedTopics,
    });
}
/**
 * Record an insight (deep understanding or realization).
 */
export function recordInsight(userId, personaId, content, confidence, relatedTopics) {
    recordPersonaObservation(userId, {
        personaId,
        observationType: 'insight',
        content,
        confidence,
        domain: PERSONA_DOMAINS[personaId] || 'general',
        relatedTopics,
    });
}
// ============================================================================
// PERSONA-SPECIFIC CONVENIENCE FUNCTIONS
// ============================================================================
/** Maya's habit observations */
export const maya = {
    concern: (userId, content, confidence, topics) => recordConcern(userId, 'maya', content, confidence, topics),
    pattern: (userId, content, confidence, topics) => recordPattern(userId, 'maya', content, confidence, topics),
    opportunity: (userId, content, confidence, action, topics) => recordOpportunity(userId, 'maya', content, confidence, action, topics),
    milestone: (userId, content, confidence, topics) => recordMilestone(userId, 'maya', content, confidence, topics),
};
/** Peter's research observations */
export const peter = {
    concern: (userId, content, confidence, topics) => recordConcern(userId, 'peter', content, confidence, topics),
    pattern: (userId, content, confidence, topics) => recordPattern(userId, 'peter', content, confidence, topics),
    insight: (userId, content, confidence, topics) => recordInsight(userId, 'peter', content, confidence, topics),
};
/** Alex's communication observations */
export const alex = {
    concern: (userId, content, confidence, topics) => recordConcern(userId, 'alex', content, confidence, topics),
    pattern: (userId, content, confidence, topics) => recordPattern(userId, 'alex', content, confidence, topics),
    opportunity: (userId, content, confidence, action, topics) => recordOpportunity(userId, 'alex', content, confidence, action, topics),
};
/** Jordan's milestone observations */
export const jordan = {
    milestone: (userId, content, confidence, topics) => recordMilestone(userId, 'jordan', content, confidence, topics),
    pattern: (userId, content, confidence, topics) => recordPattern(userId, 'jordan', content, confidence, topics),
    opportunity: (userId, content, confidence, action, topics) => recordOpportunity(userId, 'jordan', content, confidence, action, topics),
};
/** Nayan's wisdom observations */
export const nayan = {
    insight: (userId, content, confidence, topics) => recordInsight(userId, 'nayan', content, confidence, topics),
    pattern: (userId, content, confidence, topics) => recordPattern(userId, 'nayan', content, confidence, topics),
};
/** Ferni's coaching observations */
export const ferni = {
    concern: (userId, content, confidence, topics) => recordConcern(userId, 'ferni', content, confidence, topics),
    pattern: (userId, content, confidence, topics) => recordPattern(userId, 'ferni', content, confidence, topics),
    insight: (userId, content, confidence, topics) => recordInsight(userId, 'ferni', content, confidence, topics),
    milestone: (userId, content, confidence, topics) => recordMilestone(userId, 'ferni', content, confidence, topics),
};
// ============================================================================
// EXPORTS
// ============================================================================
export { PERSONA_DOMAINS };
//# sourceMappingURL=observation-recorder.js.map