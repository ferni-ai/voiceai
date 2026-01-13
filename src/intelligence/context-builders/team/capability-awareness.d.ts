/**
 * Capability Awareness Context Builder
 *
 * Injects explicit "I can do X, defer to Y for Z" awareness into each persona's
 * system prompt. This makes the AI team work like a real human team - where
 * everyone has broad skills but knows their specialty and respects others'.
 *
 * ## Philosophy
 *
 * A great human team member knows:
 * 1. Their core strengths (what they're best at)
 * 2. Their general capabilities (what they can help with)
 * 3. When to defer (when a colleague would be better)
 * 4. How to bridge (acknowledge overlaps gracefully)
 *
 * This builder creates that meta-awareness for each persona.
 *
 * @module intelligence/context-builders/team/capability-awareness
 */
import type { AgentId } from '../../../services/agent-bus.js';
interface CapabilityProfile {
    /** What this persona excels at - their unique value */
    coreStrengths: string[];
    /** What they can competently handle */
    generalCapabilities: string[];
    /** When to suggest another team member */
    deferTo: Record<string, {
        persona: AgentId;
        reason: string;
    }>;
    /** Topics where they share expertise with others */
    sharedDomains: Record<string, AgentId[]>;
    /** What they explicitly should NOT try to handle */
    boundaries: string[];
}
interface TeamCapabilityMap {
    ferni: CapabilityProfile;
    maya: CapabilityProfile;
    peter: CapabilityProfile;
    jordan: CapabilityProfile;
    alex: CapabilityProfile;
    nayan: CapabilityProfile;
}
/**
 * Explicit capability mapping for the Ferni team.
 *
 * This is the "source of truth" for who does what.
 * Update this when adding new personas or domains.
 */
export declare const TEAM_CAPABILITIES: TeamCapabilityMap;
/**
 * Build capability awareness context for a persona.
 *
 * This creates the "I can do X, defer to Y for Z" meta-awareness
 * that makes the AI team work like a real human team.
 */
export declare function buildCapabilityAwarenessContext(personaId: AgentId): string;
/**
 * Build a concise team overview for any persona.
 * Useful for "meet the team" moments or handoff context.
 */
export declare function buildTeamOverview(): string;
/**
 * Get capability profile for a persona.
 */
export declare function getCapabilityProfile(personaId: AgentId): CapabilityProfile | null;
/**
 * Find the best persona for a given topic.
 * Returns null if no clear specialist.
 */
export declare function findSpecialistFor(topic: string): AgentId | null;
declare const _default: {
    buildCapabilityAwarenessContext: typeof buildCapabilityAwarenessContext;
    buildTeamOverview: typeof buildTeamOverview;
    getCapabilityProfile: typeof getCapabilityProfile;
    findSpecialistFor: typeof findSpecialistFor;
    TEAM_CAPABILITIES: TeamCapabilityMap;
};
export default _default;
//# sourceMappingURL=capability-awareness.d.ts.map