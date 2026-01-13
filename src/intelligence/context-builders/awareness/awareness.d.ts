/**
 * Awareness Context Builder
 *
 * The integration point for Ferni's "better than human" awareness capabilities.
 * Combines all awareness signals to inject context-appropriate guidance.
 *
 * What makes this "awareness" not just "responsiveness":
 * - MOMENTUM awareness: Sensing the energy flow of conversation
 * - THINKING awareness: Knowing when to pause and consider
 * - ASSOCIATION awareness: Noticing when memories/tangents are triggered
 * - SELF awareness: Tracking if our responses are landing
 * - EMOTIONAL awareness: Reading user's state continuously
 *
 * The goal: Every response shows that Ferni is PRESENT, not just processing.
 *
 * @module intelligence/context-builders/awareness
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
interface AwarenessProfile {
    /** How often to inject momentum-based guidance */
    momentumGuidanceProbability: number;
    /** How often to suggest thinking pauses */
    thinkingPauseProbability: number;
    /** How much to weight self-awareness feedback */
    selfAwarenessWeight: number;
    /** Persona-specific awareness phrases */
    phrases: {
        sensing_depth: string[];
        noticing_shift: string[];
        feeling_energy: string[];
        moment_of_presence: string[];
    };
}
declare const DEFAULT_AWARENESS_PROFILE: AwarenessProfile;
declare const FERNI_AWARENESS_PROFILE: AwarenessProfile;
declare const AWARENESS_PROFILES: Record<string, AwarenessProfile>;
declare function buildAwarenessContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { AWARENESS_PROFILES, buildAwarenessContext, DEFAULT_AWARENESS_PROFILE, FERNI_AWARENESS_PROFILE, };
//# sourceMappingURL=awareness.d.ts.map