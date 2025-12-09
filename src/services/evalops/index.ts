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

// ============================================================================
// TYPES
// ============================================================================

export type {
  // Core evaluation types
  ResponseEvaluation,
  ResponseEvaluationDimensions,
  EvaluationContext,
  
  // Fingerprint types
  PersonaVoiceFingerprint,
  
  // Test scenario types
  TestScenario,
  TestScenarioResult,
  ExpectedBehavior,
  
  // Report types
  PersonaEvalReport,
  EvalDashboard,
  
  // Experiment types
  EvalExperiment,
  
  // Config types
  SamplingConfig,
} from './types.js';

export { DEFAULT_SAMPLING_CONFIG } from './types.js';

// ============================================================================
// RESPONSE EVALUATION
// ============================================================================

export {
  evaluateResponse,
  evaluateVoiceConsistency,
  evaluateBatch,
  shouldSampleConversation,
  buildEvaluationPrompt,
  DEFAULT_EVALUATOR_CONFIG,
} from './response-evaluator.js';

// ============================================================================
// PERSONA FINGERPRINTS
// ============================================================================

export {
  // Individual fingerprints
  ferniFingerprint,
  peterFingerprint,
  mayaFingerprint,
  alexFingerprint,
  jordanFingerprint,
  nayanFingerprint,
  
  // Registry
  personaFingerprints,
  getPersonaFingerprint,
  getFingerprrintedPersonas,
  
  // Analysis utilities
  analyzeSignaturePhraseUsage,
  detectAntiPatterns,
  calculateVoiceDrift,
  getVoiceConsistencyScore,
} from './persona-fingerprints.js';

// ============================================================================
// TEST SCENARIOS
// ============================================================================

export {
  // Scenario collections
  ALL_TEST_SCENARIOS,
  personaVoiceScenarios,
  boundaryRespectScenarios,
  emotionalIntelligenceScenarios,
  trustBuildingScenarios,
  safetyScenarios,
  helpfulnessScenarios,
  
  // Scenario utilities
  getScenariosByCategory,
  getScenariosForPersona,
  getCriticalScenarios,
  
  // Scenario runners
  runScenario,
  runAllScenariosForPersona,
  runCriticalScenarios,
} from './test-scenarios.js';

// ============================================================================
// AUTOMATION & HOOKS
// ============================================================================

export {
  // Feature flags
  getEvalOpsFlags,
  setEvalOpsFlags,
  isEvalOpsEnabledForPersona,
  type EvalOpsFeatureFlags,
  
  // Metrics
  getEvalMetrics,
  resetEvalMetrics,
  
  // Evaluation storage
  getRecentEvaluations,
  getFlaggedEvaluations,
  
  // Alerting
  onFlaggedResponse,
  
  // Conversation hooks
  afterTurn,
  quickVoiceCheck,
  evalopsHook,
  
  // Scheduled suites
  runScheduledSuite,
  getSuiteResults,
  startScheduledEvaluation,
  stopScheduledEvaluation,
} from './automation.js';

// ============================================================================
// VOICE AGENT INTEGRATION
// ============================================================================

export {
  evaluateAgentResponse,
  recordUserMessage,
  getLastEvaluation,
  getSessionEvalStats,
  onSessionEnd,
} from './voice-agent-integration.js';

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

import { getPersonaFingerprint, getVoiceConsistencyScore } from './persona-fingerprints.js';
import { evaluateVoiceConsistency, evaluateResponse } from './response-evaluator.js';
import { runCriticalScenarios, ALL_TEST_SCENARIOS } from './test-scenarios.js';
import type { EvaluationContext, PersonaVoiceFingerprint } from './types.js';

/**
 * Quick health check for a persona's response quality
 * Returns a simple score and list of issues without full LLM evaluation
 */
export function quickHealthCheck(
  response: string,
  personaId: string
): {
  score: number;
  status: 'healthy' | 'warning' | 'critical';
  issues: string[];
} {
  const { score, issues } = evaluateVoiceConsistency(response, personaId);
  
  let status: 'healthy' | 'warning' | 'critical' = 'healthy';
  if (score < 70) status = 'warning';
  if (score < 50) status = 'critical';
  
  return { score, status, issues };
}

/**
 * Build minimal evaluation context for quick evaluations
 */
export function buildMinimalContext(
  personaId: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  turnNumber: number = 1
): EvaluationContext {
  const fingerprint = getPersonaFingerprint(personaId);
  if (!fingerprint) {
    throw new Error(`No fingerprint found for persona: ${personaId}`);
  }
  
  return {
    personaId,
    fingerprint,
    conversationHistory,
    turnNumber,
  };
}

/**
 * Get a summary of all personas' fingerprints for documentation
 */
export function getPersonaFingerprintSummary(): Record<string, {
  signaturePhrases: number;
  antiPatterns: number;
  warmth: number;
  energy: number;
  reasoningStyle: string;
}> {
  const personas = ['ferni', 'peter-john', 'maya-santos', 'alex-chen', 'jordan-taylor', 'nayan-patel'];
  const summary: Record<string, {
    signaturePhrases: number;
    antiPatterns: number;
    warmth: number;
    energy: number;
    reasoningStyle: string;
  }> = {};
  
  for (const personaId of personas) {
    const fp = getPersonaFingerprint(personaId);
    if (fp) {
      summary[personaId] = {
        signaturePhrases: fp.signaturePhrases.length,
        antiPatterns: fp.antiPatterns.length,
        warmth: fp.emotionalTone.warmth,
        energy: fp.emotionalTone.energy,
        reasoningStyle: fp.reasoningIndicators.style,
      };
    }
  }
  
  return summary;
}

/**
 * Get test scenario statistics
 */
export function getScenarioStats(): {
  total: number;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
  personaSpecific: Record<string, number>;
} {
  const byCategory: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const personaSpecific: Record<string, number> = {};
  
  for (const scenario of ALL_TEST_SCENARIOS) {
    byCategory[scenario.category] = (byCategory[scenario.category] || 0) + 1;
    bySeverity[scenario.severity] = (bySeverity[scenario.severity] || 0) + 1;
    
    if (scenario.applicablePersonas.length > 0) {
      for (const persona of scenario.applicablePersonas) {
        personaSpecific[persona] = (personaSpecific[persona] || 0) + 1;
      }
    }
  }
  
  return {
    total: ALL_TEST_SCENARIOS.length,
    byCategory,
    bySeverity,
    personaSpecific,
  };
}

