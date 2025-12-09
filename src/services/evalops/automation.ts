/**
 * EvalOps Automation
 *
 * > "E2E automation - evaluate quality without human intervention."
 *
 * This module provides:
 * - Automatic sampling of conversations for evaluation
 * - Real-time voice consistency monitoring
 * - Scheduled test suite runs
 * - Integration hooks for the conversation pipeline
 * - Feature flag support for gradual rollout
 *
 * Usage:
 * ```typescript
 * import { evalopsHook, scheduleEvaluation, runScheduledSuite } from './evalops/automation';
 *
 * // Hook into conversation turns
 * evalopsHook.afterTurn(sessionId, personaId, userMessage, aiResponse, context);
 *
 * // Run scheduled evaluation suite
 * await runScheduledSuite('ferni');
 * ```
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  evaluateResponse,
  evaluateVoiceConsistency,
  shouldSampleConversation,
  type EvaluationContext,
  type ResponseEvaluation,
  type SamplingConfig,
  DEFAULT_SAMPLING_CONFIG,
} from './index.js';
import { getPersonaFingerprint } from './persona-fingerprints.js';
import { runCriticalScenarios, runAllScenariosForPersona } from './test-scenarios.js';

const log = getLogger();

// ============================================================================
// FEATURE FLAGS
// ============================================================================

export interface EvalOpsFeatureFlags {
  /** Master switch for all EvalOps features */
  enabled: boolean;
  
  /** Enable automatic sampling of conversations */
  autoSampling: boolean;
  
  /** Enable real-time voice consistency checks */
  voiceChecks: boolean;
  
  /** Enable full LLM evaluation (vs just heuristic) */
  llmEvaluation: boolean;
  
  /** Enable scheduled test suite runs */
  scheduledSuites: boolean;
  
  /** Enable alerting for flagged responses */
  alerting: boolean;
  
  /** Sample rate override (0-100) */
  sampleRateOverride: number | null;
  
  /** Personas to evaluate (empty = all) */
  enabledPersonas: string[];
}

const DEFAULT_FLAGS: EvalOpsFeatureFlags = {
  enabled: true,
  autoSampling: true,
  voiceChecks: true,
  llmEvaluation: false, // Start with heuristic-only
  scheduledSuites: false,
  alerting: true,
  sampleRateOverride: null,
  enabledPersonas: [], // All personas
};

let featureFlags: EvalOpsFeatureFlags = { ...DEFAULT_FLAGS };

/**
 * Get current feature flags
 */
export function getEvalOpsFlags(): EvalOpsFeatureFlags {
  return { ...featureFlags };
}

/**
 * Update feature flags
 */
export function setEvalOpsFlags(updates: Partial<EvalOpsFeatureFlags>): void {
  featureFlags = { ...featureFlags, ...updates };
  log.info({ flags: featureFlags }, 'EvalOps feature flags updated');
}

/**
 * Check if EvalOps is enabled for a persona
 */
export function isEvalOpsEnabledForPersona(personaId: string): boolean {
  if (!featureFlags.enabled) return false;
  if (featureFlags.enabledPersonas.length === 0) return true;
  return featureFlags.enabledPersonas.includes(personaId);
}

// ============================================================================
// METRICS TRACKING
// ============================================================================

interface EvalMetrics {
  totalEvaluations: number;
  totalSampled: number;
  totalSkipped: number;
  flaggedResponses: number;
  averageScore: number;
  scoresByPersona: Record<string, { count: number; total: number }>;
  lastEvaluationTime: Date | null;
  errors: number;
}

const metrics: EvalMetrics = {
  totalEvaluations: 0,
  totalSampled: 0,
  totalSkipped: 0,
  flaggedResponses: 0,
  averageScore: 0,
  scoresByPersona: {},
  lastEvaluationTime: null,
  errors: 0,
};

/**
 * Get current evaluation metrics
 */
export function getEvalMetrics(): EvalMetrics {
  return { ...metrics };
}

/**
 * Reset evaluation metrics
 */
export function resetEvalMetrics(): void {
  metrics.totalEvaluations = 0;
  metrics.totalSampled = 0;
  metrics.totalSkipped = 0;
  metrics.flaggedResponses = 0;
  metrics.averageScore = 0;
  metrics.scoresByPersona = {};
  metrics.lastEvaluationTime = null;
  metrics.errors = 0;
}

function updateMetrics(evaluation: ResponseEvaluation): void {
  metrics.totalEvaluations++;
  metrics.totalSampled++;
  metrics.lastEvaluationTime = new Date();
  
  if (evaluation.flagged) {
    metrics.flaggedResponses++;
  }
  
  // Update running average
  metrics.averageScore = (
    (metrics.averageScore * (metrics.totalEvaluations - 1) + evaluation.overallScore) /
    metrics.totalEvaluations
  );
  
  // Update per-persona scores
  const personaId = evaluation.personaId;
  if (!metrics.scoresByPersona[personaId]) {
    metrics.scoresByPersona[personaId] = { count: 0, total: 0 };
  }
  metrics.scoresByPersona[personaId].count++;
  metrics.scoresByPersona[personaId].total += evaluation.overallScore;
}

// ============================================================================
// EVALUATION STORAGE
// ============================================================================

interface StoredEvaluation extends ResponseEvaluation {
  sessionId: string;
}

const evaluationStore: StoredEvaluation[] = [];
const MAX_STORED_EVALUATIONS = 1000;

/**
 * Store an evaluation result
 */
function storeEvaluation(sessionId: string, evaluation: ResponseEvaluation): void {
  evaluationStore.push({ ...evaluation, sessionId });
  
  // Keep only recent evaluations
  if (evaluationStore.length > MAX_STORED_EVALUATIONS) {
    evaluationStore.shift();
  }
}

/**
 * Get recent evaluations
 */
export function getRecentEvaluations(
  limit: number = 50,
  filters?: { personaId?: string; flagged?: boolean }
): StoredEvaluation[] {
  let results = [...evaluationStore];
  
  if (filters?.personaId) {
    results = results.filter(e => e.personaId === filters.personaId);
  }
  if (filters?.flagged !== undefined) {
    results = results.filter(e => e.flagged === filters.flagged);
  }
  
  return results.slice(-limit).reverse();
}

/**
 * Get flagged evaluations
 */
export function getFlaggedEvaluations(limit: number = 20): StoredEvaluation[] {
  return getRecentEvaluations(limit, { flagged: true });
}

// ============================================================================
// ALERTING
// ============================================================================

type AlertHandler = (evaluation: ResponseEvaluation) => void | Promise<void>;

const alertHandlers: AlertHandler[] = [];

/**
 * Register an alert handler for flagged responses
 */
export function onFlaggedResponse(handler: AlertHandler): () => void {
  alertHandlers.push(handler);
  return () => {
    const index = alertHandlers.indexOf(handler);
    if (index > -1) alertHandlers.splice(index, 1);
  };
}

async function sendAlerts(evaluation: ResponseEvaluation): Promise<void> {
  if (!featureFlags.alerting) return;
  if (!evaluation.flagged) return;
  
  for (const handler of alertHandlers) {
    try {
      await handler(evaluation);
    } catch (error) {
      log.error({ error }, 'Alert handler failed');
    }
  }
}

// ============================================================================
// CONVERSATION HOOK
// ============================================================================

interface TurnContext {
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  userProfile?: {
    name?: string;
    relationshipStage?: string;
    totalConversations?: number;
  };
  trustContext?: {
    activeBoundaries?: string[];
    recentWins?: string[];
  };
  emotionalContext?: {
    userEmotion?: string;
    emotionIntensity?: number;
    distressLevel?: number;
  };
  turnNumber: number;
  isNewUser?: boolean;
  hasUserReportedIssue?: boolean;
}

/**
 * Hook to evaluate a conversation turn
 * Call this after each AI response is generated
 */
export async function afterTurn(
  sessionId: string,
  personaId: string,
  userMessage: string,
  aiResponse: string,
  context: TurnContext
): Promise<ResponseEvaluation | null> {
  // Check if evaluation is enabled
  if (!featureFlags.enabled || !featureFlags.autoSampling) {
    metrics.totalSkipped++;
    return null;
  }
  
  // Check if persona is enabled
  if (!isEvalOpsEnabledForPersona(personaId)) {
    metrics.totalSkipped++;
    return null;
  }
  
  // Determine sample rate
  const sampleRate = featureFlags.sampleRateOverride ?? DEFAULT_SAMPLING_CONFIG.sampleRate;
  const config: SamplingConfig = {
    ...DEFAULT_SAMPLING_CONFIG,
    sampleRate,
  };
  
  // Determine if we should sample this turn
  const shouldSample = shouldSampleConversation(context.turnNumber, config, {
    userReportedIssue: context.hasUserReportedIssue,
    isLongConversation: context.turnNumber > 15,
    emotionalIntensity: context.emotionalContext?.emotionIntensity,
    isNewUser: context.isNewUser,
  });
  
  if (!shouldSample) {
    metrics.totalSkipped++;
    return null;
  }
  
  try {
    // Always do quick voice check (cheap)
    if (featureFlags.voiceChecks) {
      const { score, issues } = evaluateVoiceConsistency(aiResponse, personaId);
      if (score < 50 || issues.length > 2) {
        log.warn({ personaId, score, issues }, 'Voice consistency issue detected');
      }
    }
    
    // Build evaluation context
    const fingerprint = getPersonaFingerprint(personaId);
    if (!fingerprint) {
      log.warn({ personaId }, 'No fingerprint for persona');
      return null;
    }
    
    const evalContext: EvaluationContext = {
      personaId,
      fingerprint,
      conversationHistory: context.conversationHistory,
      userProfile: context.userProfile,
      trustContext: context.trustContext,
      emotionalContext: context.emotionalContext,
      turnNumber: context.turnNumber,
    };
    
    // Run evaluation
    const evaluation = await evaluateResponse(userMessage, aiResponse, evalContext, {
      // Only use LLM if enabled (otherwise it falls back to heuristic)
      apiKey: featureFlags.llmEvaluation ? undefined : '', // Empty string triggers heuristic
    });
    
    // Store and track metrics
    storeEvaluation(sessionId, evaluation);
    updateMetrics(evaluation);
    
    // Send alerts for flagged responses
    await sendAlerts(evaluation);
    
    log.debug({
      sessionId,
      personaId,
      score: evaluation.overallScore,
      flagged: evaluation.flagged,
    }, 'Turn evaluated');
    
    return evaluation;
  } catch (error) {
    metrics.errors++;
    log.error({ error, sessionId, personaId }, 'Turn evaluation failed');
    return null;
  }
}

/**
 * Quick voice check without full evaluation
 */
export function quickVoiceCheck(
  personaId: string,
  response: string
): { score: number; status: 'healthy' | 'warning' | 'critical'; issues: string[] } {
  if (!featureFlags.enabled || !featureFlags.voiceChecks) {
    return { score: 100, status: 'healthy', issues: [] };
  }
  
  const { score, issues } = evaluateVoiceConsistency(response, personaId);
  
  let status: 'healthy' | 'warning' | 'critical' = 'healthy';
  if (score < 70) status = 'warning';
  if (score < 50) status = 'critical';
  
  return { score, status, issues };
}

// ============================================================================
// SCHEDULED TEST SUITES
// ============================================================================

interface ScheduledSuiteResult {
  personaId: string;
  timestamp: Date;
  passed: number;
  failed: number;
  criticalFailures: number;
  passRate: number;
}

const suiteResults: ScheduledSuiteResult[] = [];

/**
 * Run test suite for a persona
 * Requires a response generator function
 */
export async function runScheduledSuite(
  personaId: string,
  generateResponse: (probe: string, context?: unknown) => Promise<string>,
  criticalOnly: boolean = false
): Promise<ScheduledSuiteResult> {
  if (!featureFlags.enabled || !featureFlags.scheduledSuites) {
    throw new Error('Scheduled suites are disabled');
  }
  
  log.info({ personaId, criticalOnly }, 'Starting scheduled test suite');
  
  const results = criticalOnly
    ? await runCriticalScenarios(personaId, generateResponse)
    : (await runAllScenariosForPersona(personaId, generateResponse)).results;
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  const criticalFailures = results.filter(r => !r.passed).length; // All critical in criticalOnly mode
  
  const result: ScheduledSuiteResult = {
    personaId,
    timestamp: new Date(),
    passed,
    failed,
    criticalFailures,
    passRate: (passed / results.length) * 100,
  };
  
  suiteResults.push(result);
  if (suiteResults.length > 100) suiteResults.shift();
  
  log.info({
    personaId,
    passed,
    failed,
    passRate: result.passRate,
  }, 'Scheduled test suite complete');
  
  return result;
}

/**
 * Get recent suite results
 */
export function getSuiteResults(personaId?: string): ScheduledSuiteResult[] {
  if (personaId) {
    return suiteResults.filter(r => r.personaId === personaId);
  }
  return [...suiteResults];
}

// ============================================================================
// CRON-STYLE SCHEDULING
// ============================================================================

interface ScheduleConfig {
  /** Cron expression or interval in ms */
  schedule: string | number;
  /** Personas to test */
  personas: string[];
  /** Run critical scenarios only */
  criticalOnly: boolean;
  /** Response generator */
  generateResponse: (probe: string, context?: unknown) => Promise<string>;
}

let scheduledInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start scheduled evaluation runs
 */
export function startScheduledEvaluation(config: ScheduleConfig): void {
  if (scheduledInterval) {
    clearInterval(scheduledInterval);
  }
  
  const intervalMs = typeof config.schedule === 'number' 
    ? config.schedule 
    : 24 * 60 * 60 * 1000; // Default: daily
  
  scheduledInterval = setInterval(async () => {
    if (!featureFlags.enabled || !featureFlags.scheduledSuites) return;
    
    for (const personaId of config.personas) {
      try {
        await runScheduledSuite(personaId, config.generateResponse, config.criticalOnly);
      } catch (error) {
        log.error({ error, personaId }, 'Scheduled suite failed');
      }
    }
  }, intervalMs);
  
  log.info({ intervalMs, personas: config.personas }, 'Scheduled evaluation started');
}

/**
 * Stop scheduled evaluation runs
 */
export function stopScheduledEvaluation(): void {
  if (scheduledInterval) {
    clearInterval(scheduledInterval);
    scheduledInterval = null;
    log.info('Scheduled evaluation stopped');
  }
}

// ============================================================================
// HOOK OBJECT FOR EASY INTEGRATION
// ============================================================================

/**
 * EvalOps hooks for conversation pipeline integration
 */
export const evalopsHook = {
  /**
   * Call after each AI response is generated
   */
  afterTurn,
  
  /**
   * Quick voice check (synchronous, cheap)
   */
  quickVoiceCheck,
  
  /**
   * Check if evaluation is enabled for a persona
   */
  isEnabled: isEvalOpsEnabledForPersona,
  
  /**
   * Get current metrics
   */
  getMetrics: getEvalMetrics,
  
  /**
   * Get recent evaluations
   */
  getRecent: getRecentEvaluations,
  
  /**
   * Get flagged responses
   */
  getFlagged: getFlaggedEvaluations,
  
  /**
   * Register alert handler
   */
  onFlagged: onFlaggedResponse,
};

// ============================================================================
// EXPORTS
// ============================================================================

export default evalopsHook;

