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
import { type PersonaId } from './team-huddle.js';
export interface SimpleObservation {
    /** Which persona is making the observation */
    personaId: PersonaId;
    /** Type of observation */
    observationType: 'pattern' | 'concern' | 'opportunity' | 'milestone' | 'insight';
    /** What was observed */
    content: string;
    /** How confident in this observation (0-1) */
    confidence: number;
    /** Domain of expertise (habits, research, communication, milestones, wisdom, coaching) */
    domain: string;
    /** Related topics for cross-persona matching */
    relatedTopics?: string[];
    /** Suggested action if any */
    suggestedAction?: string;
}
declare const PERSONA_DOMAINS: Record<PersonaId, string>;
/**
 * Record an observation from a persona.
 * This is the primary function to call from persona context builders.
 */
export declare function recordPersonaObservation(userId: string, observation: SimpleObservation): void;
/**
 * Record a concern (something worrying).
 */
export declare function recordConcern(userId: string, personaId: PersonaId, content: string, confidence: number, relatedTopics?: string[]): void;
/**
 * Record a pattern (recurring behavior or trend).
 */
export declare function recordPattern(userId: string, personaId: PersonaId, content: string, confidence: number, relatedTopics?: string[]): void;
/**
 * Record an opportunity (potential for growth/improvement).
 */
export declare function recordOpportunity(userId: string, personaId: PersonaId, content: string, confidence: number, suggestedAction?: string, relatedTopics?: string[]): void;
/**
 * Record a milestone (achievement or progress).
 */
export declare function recordMilestone(userId: string, personaId: PersonaId, content: string, confidence: number, relatedTopics?: string[]): void;
/**
 * Record an insight (deep understanding or realization).
 */
export declare function recordInsight(userId: string, personaId: PersonaId, content: string, confidence: number, relatedTopics?: string[]): void;
/** Maya's habit observations */
export declare const maya: {
    concern: (userId: string, content: string, confidence: number, topics?: string[]) => void;
    pattern: (userId: string, content: string, confidence: number, topics?: string[]) => void;
    opportunity: (userId: string, content: string, confidence: number, action?: string, topics?: string[]) => void;
    milestone: (userId: string, content: string, confidence: number, topics?: string[]) => void;
};
/** Peter's research observations */
export declare const peter: {
    concern: (userId: string, content: string, confidence: number, topics?: string[]) => void;
    pattern: (userId: string, content: string, confidence: number, topics?: string[]) => void;
    insight: (userId: string, content: string, confidence: number, topics?: string[]) => void;
};
/** Alex's communication observations */
export declare const alex: {
    concern: (userId: string, content: string, confidence: number, topics?: string[]) => void;
    pattern: (userId: string, content: string, confidence: number, topics?: string[]) => void;
    opportunity: (userId: string, content: string, confidence: number, action?: string, topics?: string[]) => void;
};
/** Jordan's milestone observations */
export declare const jordan: {
    milestone: (userId: string, content: string, confidence: number, topics?: string[]) => void;
    pattern: (userId: string, content: string, confidence: number, topics?: string[]) => void;
    opportunity: (userId: string, content: string, confidence: number, action?: string, topics?: string[]) => void;
};
/** Nayan's wisdom observations */
export declare const nayan: {
    insight: (userId: string, content: string, confidence: number, topics?: string[]) => void;
    pattern: (userId: string, content: string, confidence: number, topics?: string[]) => void;
};
/** Ferni's coaching observations */
export declare const ferni: {
    concern: (userId: string, content: string, confidence: number, topics?: string[]) => void;
    pattern: (userId: string, content: string, confidence: number, topics?: string[]) => void;
    insight: (userId: string, content: string, confidence: number, topics?: string[]) => void;
    milestone: (userId: string, content: string, confidence: number, topics?: string[]) => void;
};
export { PERSONA_DOMAINS, type PersonaId };
//# sourceMappingURL=observation-recorder.d.ts.map