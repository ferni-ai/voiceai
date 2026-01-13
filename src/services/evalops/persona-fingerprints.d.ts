/**
 * Persona Voice Fingerprints
 *
 * > "Every persona has a unique voice fingerprint - the patterns that make them THEM."
 *
 * This module defines the expected voice characteristics for each persona,
 * used by the evaluation system to detect voice consistency and drift.
 *
 * A fingerprint captures:
 * - Signature phrases (what they say)
 * - Anti-patterns (what they should NOT say)
 * - Vocabulary profile (word choice patterns)
 * - Sentence structure (how they construct responses)
 * - Emotional tone (warmth, directness, energy)
 * - Reasoning style (how they think through problems)
 */
import type { PersonaVoiceFingerprint } from './types.js';
export declare const ferniFingerprint: PersonaVoiceFingerprint;
export declare const peterFingerprint: PersonaVoiceFingerprint;
export declare const mayaFingerprint: PersonaVoiceFingerprint;
export declare const alexFingerprint: PersonaVoiceFingerprint;
export declare const jordanFingerprint: PersonaVoiceFingerprint;
export declare const nayanFingerprint: PersonaVoiceFingerprint;
/**
 * All persona fingerprints indexed by ID
 */
export declare const personaFingerprints: Record<string, PersonaVoiceFingerprint>;
/**
 * Get fingerprint for a persona
 */
export declare function getPersonaFingerprint(personaId: string): PersonaVoiceFingerprint | undefined;
/**
 * Get all persona IDs with fingerprints
 */
export declare function getFingerprrintedPersonas(): string[];
/**
 * Analyze a response for signature phrase usage
 */
export declare function analyzeSignaturePhraseUsage(response: string, fingerprint: PersonaVoiceFingerprint): {
    used: string[];
    usageRate: number;
};
/**
 * Detect anti-patterns in a response
 */
export declare function detectAntiPatterns(response: string, fingerprint: PersonaVoiceFingerprint): {
    detected: string[];
    violationCount: number;
};
/**
 * Calculate voice drift score (0 = perfect, 1 = complete drift)
 */
export declare function calculateVoiceDrift(response: string, fingerprint: PersonaVoiceFingerprint): number;
/**
 * Get voice consistency score (0-100, higher is better)
 */
export declare function getVoiceConsistencyScore(response: string, fingerprint: PersonaVoiceFingerprint): number;
//# sourceMappingURL=persona-fingerprints.d.ts.map