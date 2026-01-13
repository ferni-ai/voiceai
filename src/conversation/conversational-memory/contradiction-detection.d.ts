/**
 * Contradiction Detection
 *
 * Detects when users contradict their earlier statements or profile data.
 * Generates gentle, non-accusatory clarification phrases.
 *
 * @module conversation/conversational-memory/contradiction-detection
 */
import type { ProfileContradiction, UserProfile, UserStatement } from './types.js';
export declare class ContradictionDetector {
    /**
     * Check if user contradicted something they said earlier (this session)
     */
    checkForContradiction(newStatement: string, topic: string, relatedStatements: UserStatement[]): UserStatement | null;
    /**
     * Enhanced contradiction detection using profile memory
     * Checks against both current session AND historical profile data
     */
    checkForProfileContradiction(newStatement: string, profile?: UserProfile): ProfileContradiction | null;
    /**
     * Generate a gentle contradiction acknowledgment for session contradiction
     */
    generateAcknowledgment(original: UserStatement): string;
    /**
     * Generate a gentle clarification for a profile contradiction
     * The agent should NOT be accusatory - just curious
     */
    generateProfileClarification(contradiction: ProfileContradiction): string;
}
//# sourceMappingURL=contradiction-detection.d.ts.map