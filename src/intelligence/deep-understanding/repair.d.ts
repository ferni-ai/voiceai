/**
 * Repair Intelligence System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Detecting and fixing misunderstandings elegantly - knowing when
 * something landed wrong and having the wisdom to repair it.
 *
 * This is superhuman because it requires real-time detection of
 * subtle shifts in user response that indicate miscommunication.
 */
export type MisunderstandingType = 'tone' | 'content' | 'intent' | 'timing' | 'assumption' | 'boundary' | 'depth' | 'focus';
export type MisunderstandingSeverity = 'minor' | 'moderate' | 'significant';
export type RepairStrategy = 'acknowledge' | 'clarify' | 'reframe' | 'apologize' | 'redirect' | 'validate' | 'space';
export interface MisunderstandingDetection {
    /** Was there a misunderstanding? */
    detected: boolean;
    /** Type of misunderstanding */
    type: MisunderstandingType | null;
    /** Severity */
    severity: MisunderstandingSeverity;
    /** Confidence in detection */
    confidence: number;
    /** What went wrong */
    whatWentWrong: string;
    /** Evidence (user's reaction) */
    evidence: string[];
    /** Best repair strategy */
    repairStrategy: RepairStrategy;
}
export interface RepairApproach {
    /** Primary strategy */
    strategy: RepairStrategy;
    /** Opening phrase */
    opener: string;
    /** Full repair suggestion */
    fullRepair: string;
    /** What to avoid */
    avoid: string[];
    /** Follow-up if repair doesn't land */
    fallback: string;
}
export interface RepairAttempt {
    /** When attempted */
    timestamp: Date;
    /** Situation */
    situation: string;
    /** Strategy used */
    strategy: RepairStrategy;
    /** Outcome */
    outcome: 'resolved' | 'improved' | 'unchanged' | 'worsened';
    /** What worked / didn't */
    learning: string;
}
export interface RepairProfile {
    userId: string;
    /** Repair history */
    attempts: RepairAttempt[];
    /** What repair strategies work for this user */
    effectiveStrategies: Record<RepairStrategy, number>;
    /** Common misunderstanding types with this user */
    commonMisunderstandings: Record<MisunderstandingType, number>;
    /** Sensitivities (topics/tones that need extra care) */
    sensitivities: string[];
    /** Total repairs needed */
    totalMisunderstandings: number;
    /** Successful repairs */
    successfulRepairs: number;
}
/**
 * Get or create repair profile
 */
export declare function getRepairProfile(userId: string): RepairProfile;
/**
 * Store the AI's response for future reference
 */
export declare function recordAIResponse(sessionId: string, response: string): void;
/**
 * Detect if a misunderstanding occurred
 */
export declare function detectMisunderstanding(userId: string, sessionId: string, userResponse: string, emotionShift: number, // Change in emotion intensity (-1 to 1)
engagementShift: number): MisunderstandingDetection;
/**
 * Generate repair approach
 */
export declare function generateRepair(detection: MisunderstandingDetection): RepairApproach;
/**
 * Record repair outcome
 */
export declare function recordRepairOutcome(userId: string, detection: MisunderstandingDetection, approach: RepairApproach, outcome: RepairAttempt['outcome']): void;
/**
 * Format repair for prompt injection
 */
export declare function formatRepairForPrompt(detection: MisunderstandingDetection, approach: RepairApproach): string;
/**
 * Check if repair is needed (quick check for context builder)
 */
export declare function quickRepairCheck(userResponse: string, emotionShift: number): {
    needsRepair: boolean;
    severity: MisunderstandingSeverity;
};
/**
 * Import a repair profile into memory (for persistence)
 */
export declare function importRepairProfile(profile: RepairProfile): void;
/**
 * Reset all repair intelligence state (for testing)
 */
export declare function resetRepairIntelligence(): void;
declare const _default: {
    getRepairProfile: typeof getRepairProfile;
    recordAIResponse: typeof recordAIResponse;
    detectMisunderstanding: typeof detectMisunderstanding;
    generateRepair: typeof generateRepair;
    recordRepairOutcome: typeof recordRepairOutcome;
    formatRepairForPrompt: typeof formatRepairForPrompt;
    quickRepairCheck: typeof quickRepairCheck;
    resetRepairIntelligence: typeof resetRepairIntelligence;
};
export default _default;
//# sourceMappingURL=repair.d.ts.map