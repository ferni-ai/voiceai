/**
 * Crisis Detection System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Detects crisis signals in user speech and triggers appropriate responses.
 * User safety is non-negotiable. Ferni must recognize crisis and connect
 * to resources while staying present.
 *
 * Philosophy:
 * - Never abandon the user ("I'm here, AND I want you to have more support")
 * - Validate first, resources second
 * - Warm handoff language, not clinical
 * - Conservative detection (false positives are acceptable for safety)
 *
 * @module CrisisDetection
 */
export type CrisisType = 'suicidal_ideation' | 'self_harm' | 'domestic_abuse' | 'child_abuse' | 'elder_abuse' | 'substance_crisis' | 'severe_distress' | 'panic_attack' | 'psychotic_symptoms' | 'eating_disorder_crisis' | 'sexual_assault';
export type CrisisSeverity = 'low' | 'medium' | 'high' | 'critical';
export interface CrisisSignal {
    type: CrisisType;
    severity: CrisisSeverity;
    confidence: number;
    matchedPatterns: string[];
    contextualFactors: string[];
}
export interface CrisisDetectionResult {
    /** Whether any crisis was detected */
    detected: boolean;
    /** The primary crisis signal (highest severity) */
    primary: CrisisSignal | null;
    /** All detected crisis signals */
    signals: CrisisSignal[];
    /** Requires immediate resource connection */
    requiresImmediateAction: boolean;
    /** Suggested response approach */
    responseApproach: 'acknowledge' | 'validate_and_resource' | 'immediate_resource' | 'continue';
    /** Raw detection metadata for logging */
    metadata: {
        processedAt: Date;
        textLength: number;
        patternMatchCount: number;
    };
}
/**
 * Detect crisis signals in user text.
 *
 * @param text - The user's message
 * @param context - Additional context about the conversation
 * @returns Crisis detection result
 */
export declare function detectCrisis(text: string, context?: {
    /** Recent emotional state */
    recentEmotion?: string;
    /** Previous crisis signals in session */
    previousSignals?: CrisisSignal[];
    /** Relationship stage with user */
    relationshipStage?: string;
}): CrisisDetectionResult;
/**
 * Check if a crisis type is active for a user
 * (based on recent session signals)
 */
export declare function isCrisisActive(sessionSignals: CrisisSignal[], crisisType: CrisisType): boolean;
/**
 * Get the highest severity crisis in a session
 */
export declare function getHighestSeverityCrisis(signals: CrisisSignal[]): CrisisSignal | null;
declare const _default: {
    detectCrisis: typeof detectCrisis;
    isCrisisActive: typeof isCrisisActive;
    getHighestSeverityCrisis: typeof getHighestSeverityCrisis;
};
export default _default;
//# sourceMappingURL=crisis-detection.d.ts.map