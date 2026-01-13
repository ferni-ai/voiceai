/**
 * Ferni EvalOps - Evaluation Operations System
 *
 * > "Better than human" requires measurement.
 *
 * This module provides:
 * - LLM-as-Judge response evaluation
 * - Persona voice fingerprinting
 * - Automated test scenarios
 * - Continuous quality monitoring
 *
 * Philosophy:
 * - You can't improve what you don't measure
 * - Persona consistency is measurable
 * - Trust building behaviors can be verified
 * - Emotional intelligence can be evaluated
 *
 * Usage:
 * ```typescript
 * import { evaluateResponse, runScenario, getVoiceConsistencyScore } from './services/evalops';
 *
 * // Evaluate a single response
 * const evaluation = await evaluateResponse(userMessage, aiResponse, context);
 *
 * // Quick voice check
 * const { score, issues } = evaluateVoiceConsistency(response, 'ferni');
 *
 * // Run test scenarios
 * const results = await runAllScenariosForPersona('ferni', generateResponse);
 * ```
 */
export type { ResponseEvaluation, ResponseEvaluationDimensions, EvaluationContext, PersonaVoiceFingerprint, TestScenario, TestScenarioResult, ExpectedBehavior, PersonaEvalReport, EvalDashboard, EvalExperiment, SamplingConfig, } from './types.js';
export { DEFAULT_SAMPLING_CONFIG } from './types.js';
export { evaluateResponse, evaluateVoiceConsistency, evaluateBatch, shouldSampleConversation, buildEvaluationPrompt, DEFAULT_EVALUATOR_CONFIG, } from './response-evaluator.js';
export { ferniFingerprint, peterFingerprint, mayaFingerprint, alexFingerprint, jordanFingerprint, nayanFingerprint, personaFingerprints, getPersonaFingerprint, getFingerprrintedPersonas, analyzeSignaturePhraseUsage, detectAntiPatterns, calculateVoiceDrift, getVoiceConsistencyScore, } from './persona-fingerprints.js';
export { ALL_TEST_SCENARIOS, personaVoiceScenarios, boundaryRespectScenarios, emotionalIntelligenceScenarios, trustBuildingScenarios, safetyScenarios, helpfulnessScenarios, getScenariosByCategory, getScenariosForPersona, getCriticalScenarios, runScenario, runAllScenariosForPersona, runCriticalScenarios, } from './test-scenarios.js';
export { getEvalOpsFlags, setEvalOpsFlags, isEvalOpsEnabledForPersona, type EvalOpsFeatureFlags, getEvalMetrics, resetEvalMetrics, getRecentEvaluations, getFlaggedEvaluations, onFlaggedResponse, afterTurn, quickVoiceCheck, evalopsHook, runScheduledSuite, getSuiteResults, startScheduledEvaluation, stopScheduledEvaluation, } from './automation.js';
export { evaluateAgentResponse, recordUserMessage, getLastEvaluation, getSessionEvalStats, onSessionEnd, } from './voice-agent-integration.js';
import type { EvaluationContext } from './types.js';
/**
 * Quick health check for a persona's response quality
 * Returns a simple score and list of issues without full LLM evaluation
 */
export declare function quickHealthCheck(response: string, personaId: string): {
    score: number;
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
};
/**
 * Build minimal evaluation context for quick evaluations
 */
export declare function buildMinimalContext(personaId: string, conversationHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
}>, turnNumber?: number): EvaluationContext;
/**
 * Get a summary of all personas' fingerprints for documentation
 */
export declare function getPersonaFingerprintSummary(): Record<string, {
    signaturePhrases: number;
    antiPatterns: number;
    warmth: number;
    energy: number;
    reasoningStyle: string;
}>;
/**
 * Get test scenario statistics
 */
export declare function getScenarioStats(): {
    total: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    personaSpecific: Record<string, number>;
};
//# sourceMappingURL=index.d.ts.map