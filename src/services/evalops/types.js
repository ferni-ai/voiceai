/**
 * EvalOps Type Definitions
 *
 * > "Better than human" requires measurement.
 *
 * This module defines the types for Ferni's evaluation operations system.
 * EvalOps ensures that persona behaviors actually manifest in LLM outputs,
 * not just exist as beautiful architecture.
 *
 * Core Philosophy:
 * 1. You can't improve what you don't measure
 * 2. Persona voice consistency is measurable
 * 3. Trust building behaviors can be verified
 * 4. Emotional intelligence can be evaluated
 */
export const DEFAULT_SAMPLING_CONFIG = {
    sampleRate: 5, // 5% of conversations
    minPerPersonaPerDay: 10,
    maxPerDay: 500,
    alwaysEvaluateIf: {
        userReportedIssue: true,
        longConversation: true,
        emotionalIntensity: true,
        newUser: true,
    },
    evaluatorModel: 'claude-3-5-sonnet',
};
//# sourceMappingURL=types.js.map