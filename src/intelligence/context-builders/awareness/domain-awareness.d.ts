/**
 * Domain Fluency Context Builder
 *
 * Makes Ferni aware of capabilities at a CONCEPTUAL level, not as tool lists.
 *
 * A brilliant human colleague doesn't think "I have getWeather, searchWeb, playMusic".
 * They think "I can help you understand what's going on in the world, set the mood,
 * dig into anything you're curious about."
 *
 * This builder injects domain-level awareness:
 * - WHAT areas of life Ferni can help with
 * - HOW deeply (surface vs. expert)
 * - WHEN to naturally surface capabilities
 * - WHO on the team specializes in what
 *
 * > "Better than human" = superhuman capabilities expressed humanly
 *
 * @module intelligence/context-builders/awareness/domain-fluency
 */
import { type ContextBuilder } from '../index.js';
/**
 * Domain fluency describes WHAT Ferni can help with at a conceptual level.
 * This is NOT a tool list - it's expertise awareness.
 */
interface DomainFluency {
    /** Human-readable domain name */
    domain: string;
    /** How Ferni would naturally express this capability */
    naturalExpression: string;
    /** A/B test variants for naturalExpression (for testing which framings resonate) */
    expressionVariants?: string[];
    /** Conceptual triggers - not regex patterns, but understanding */
    conceptualTriggers: string[];
    /** Depth of expertise */
    depth: 'surface' | 'solid' | 'expert';
    /** Who on the team goes deeper in this area */
    teamExpert?: string;
    /** When to naturally surface this capability */
    surfaceWhen: string;
}
/**
 * Ferni's core domain fluencies - these are conceptual, not technical
 *
 * Some domains have `expressionVariants` for A/B testing different framings.
 * The system will automatically assign users to variants for testing.
 */
declare const FERNI_DOMAIN_FLUENCIES: DomainFluency[];
/**
 * Team expertise - for confident handoff awareness
 */
declare const TEAM_EXPERTISE: {
    Maya: {
        specialty: string;
        naturalExpression: string;
    };
    Alex: {
        specialty: string;
        naturalExpression: string;
    };
    Peter: {
        specialty: string;
        naturalExpression: string;
    };
    Jordan: {
        specialty: string;
        naturalExpression: string;
    };
    Nayan: {
        specialty: string;
        naturalExpression: string;
    };
};
/**
 * Maya's domain fluencies - habits, routines, small wins
 */
declare const MAYA_DOMAIN_FLUENCIES: DomainFluency[];
/**
 * Peter's domain fluencies - research, analysis, deep dives
 */
declare const PETER_DOMAIN_FLUENCIES: DomainFluency[];
/**
 * Alex's domain fluencies - communication, calendar, organization
 */
declare const ALEX_DOMAIN_FLUENCIES: DomainFluency[];
/**
 * Jordan's domain fluencies - milestones, celebrations, events
 */
declare const JORDAN_DOMAIN_FLUENCIES: DomainFluency[];
/**
 * Nayan's domain fluencies - wisdom, philosophy, big questions
 */
declare const NAYAN_DOMAIN_FLUENCIES: DomainFluency[];
/**
 * Get domain fluencies for a specific persona
 */
declare function getPersonaDomainFluencies(personaId: string): DomainFluency[];
/**
 * Track when capability awareness leads to engagement.
 * This feeds into the collective learning system.
 */
export interface CapabilityEffectiveness {
    /** Domain that was surfaced */
    domain: string;
    /** Persona who surfaced it */
    personaId: string;
    /** Turn when capability was mentioned/surfaced */
    turnMentioned: number;
    /** Did user engage with this capability? */
    userEngaged: boolean;
    /** Did we actually use a tool in this domain? */
    toolUsed: boolean;
    /** User's emotional state when surfaced */
    userEmotion?: string;
    /** Timestamp */
    timestamp: Date;
}
/**
 * Track a capability being surfaced (called by builder)
 */
export declare function trackCapabilitySurfaced(sessionKey: string, domain: string, personaId: string, turnCount: number, userEmotion?: string): void;
/**
 * Mark that user engaged with a surfaced capability
 */
export declare function markCapabilityEngaged(sessionKey: string, domain: string): void;
/**
 * Mark that a tool was used in a domain
 */
export declare function markCapabilityToolUsed(sessionKey: string, domain: string): void;
/**
 * Get effectiveness data for a session (for persistence)
 */
export declare function getCapabilityEffectiveness(sessionKey: string): CapabilityEffectiveness[];
/**
 * Clear tracking data for a session
 */
export declare function clearCapabilityTracking(sessionKey: string): void;
export declare const domainFluencyBuilder: ContextBuilder;
export default domainFluencyBuilder;
export { FERNI_DOMAIN_FLUENCIES, MAYA_DOMAIN_FLUENCIES, PETER_DOMAIN_FLUENCIES, ALEX_DOMAIN_FLUENCIES, JORDAN_DOMAIN_FLUENCIES, NAYAN_DOMAIN_FLUENCIES, TEAM_EXPERTISE, getPersonaDomainFluencies, type DomainFluency, };
//# sourceMappingURL=domain-awareness.d.ts.map