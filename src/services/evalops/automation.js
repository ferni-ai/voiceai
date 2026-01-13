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
import { registerInterval, clearNamedInterval } from '../../utils/interval-manager.js';
import { fetchRecentEvaluations as fetchRecentEvaluationsFromFirestore, persistEvaluation, } from './evaluation-persistence.js';
import { DEFAULT_SAMPLING_CONFIG, evaluateResponse, evaluateVoiceConsistency, shouldSampleConversation, } from './index.js';
import { getPersonaFingerprint } from './persona-fingerprints.js';
import { runAllScenariosForPersona, runCriticalScenarios } from './test-scenarios.js';
const log = getLogger();
// Activity recording helper (lazy import to avoid circular deps)
async function recordEvalActivity(event) {
    try {
        const dashboard = await import('../../api/v1/admin/dashboard.js');
        dashboard.recordActivity({
            type: event.type,
            action: event.action,
            description: event.description,
            metadata: event.metadata,
        });
    }
    catch {
        // Silently fail if dashboard module not available
    }
}
const DEFAULT_FLAGS = {
    enabled: true,
    autoSampling: true,
    voiceChecks: true,
    llmEvaluation: false, // Start with heuristic-only
    scheduledSuites: false,
    alerting: true,
    sampleRateOverride: null,
    enabledPersonas: [], // All personas
};
let featureFlags = { ...DEFAULT_FLAGS };
/**
 * Get current feature flags
 */
export function getEvalOpsFlags() {
    return { ...featureFlags };
}
/**
 * Update feature flags
 */
export function setEvalOpsFlags(updates) {
    featureFlags = { ...featureFlags, ...updates };
    log.info({ flags: featureFlags }, 'EvalOps feature flags updated');
}
/**
 * Check if EvalOps is enabled for a persona
 */
export function isEvalOpsEnabledForPersona(personaId) {
    if (!featureFlags.enabled)
        return false;
    if (featureFlags.enabledPersonas.length === 0)
        return true;
    return featureFlags.enabledPersonas.includes(personaId);
}
const metrics = {
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
export function getEvalMetrics() {
    return { ...metrics };
}
/**
 * Reset evaluation metrics
 */
export function resetEvalMetrics() {
    metrics.totalEvaluations = 0;
    metrics.totalSampled = 0;
    metrics.totalSkipped = 0;
    metrics.flaggedResponses = 0;
    metrics.averageScore = 0;
    metrics.scoresByPersona = {};
    metrics.lastEvaluationTime = null;
    metrics.errors = 0;
}
function updateMetrics(evaluation) {
    metrics.totalEvaluations++;
    metrics.totalSampled++;
    metrics.lastEvaluationTime = new Date();
    if (evaluation.flagged) {
        metrics.flaggedResponses++;
    }
    // Update running average
    metrics.averageScore =
        (metrics.averageScore * (metrics.totalEvaluations - 1) + evaluation.overallScore) /
            metrics.totalEvaluations;
    // Update per-persona scores
    const { personaId } = evaluation;
    if (!metrics.scoresByPersona[personaId]) {
        metrics.scoresByPersona[personaId] = { count: 0, total: 0 };
    }
    metrics.scoresByPersona[personaId].count++;
    metrics.scoresByPersona[personaId].total += evaluation.overallScore;
}
const evaluationStore = [];
const MAX_STORED_EVALUATIONS = 1000;
/**
 * Store an evaluation result
 */
function storeEvaluation(sessionId, evaluation) {
    evaluationStore.push({ ...evaluation, sessionId });
    // Keep only recent evaluations
    if (evaluationStore.length > MAX_STORED_EVALUATIONS) {
        evaluationStore.shift();
    }
    // Persist asynchronously (never block)
    void persistEvaluation({ ...evaluation, sessionId }).catch(() => undefined);
    // Record to activity log
    if (evaluation.flagged) {
        // Find the lowest scoring dimension
        const dimensions = evaluation.dimensions;
        const lowestDimension = Object.entries(dimensions).reduce((lowest, [name, score]) => (score < lowest.score ? { name, score } : lowest), { name: 'quality', score: 100 });
        void recordEvalActivity({
            type: 'evalops',
            action: 'flagged',
            description: `Response flagged for ${evaluation.personaId}: ${lowestDimension.name} (${evaluation.overallScore}%)`,
            metadata: {
                personaId: evaluation.personaId,
                score: evaluation.overallScore,
                lowestDimension: lowestDimension.name,
            },
        });
    }
}
/**
 * Get recent evaluations
 */
export async function getRecentEvaluations(limit = 50, filters) {
    const fromFirestore = await fetchRecentEvaluationsFromFirestore(limit, filters);
    if (fromFirestore.length > 0) {
        // Ensure sessionId exists (ResponseEvaluation has it; StoredEvaluation expects it too)
        return fromFirestore.map((e) => ({ ...e, sessionId: e.sessionId }));
    }
    let results = [...evaluationStore];
    if (filters?.personaId) {
        results = results.filter((e) => e.personaId === filters.personaId);
    }
    if (filters?.flagged !== undefined) {
        results = results.filter((e) => e.flagged === filters.flagged);
    }
    return results.slice(-limit).reverse();
}
/**
 * Get flagged evaluations
 */
export async function getFlaggedEvaluations(limit = 20) {
    return await getRecentEvaluations(limit, { flagged: true });
}
/**
 * Get aggregate dimension averages across all evaluations
 * Returns scores for each dimension (0-100 scale)
 */
export function getDimensionAverages() {
    if (evaluationStore.length === 0) {
        // No evaluations yet - return zeros to indicate no data
        return {
            personaVoice: 0,
            emotionalIntelligence: 0,
            helpfulness: 0,
            authenticity: 0,
            safety: 0,
            contextUse: 0,
            trustBuilding: 0,
            sampleSize: 0,
        };
    }
    const totals = {
        personaVoice: 0,
        emotionalIntelligence: 0,
        helpfulness: 0,
        authenticity: 0,
        safety: 0,
        contextUse: 0,
        trustBuilding: 0,
    };
    for (const evaluation of evaluationStore) {
        totals.personaVoice += evaluation.dimensions.personaVoice;
        totals.emotionalIntelligence += evaluation.dimensions.emotionalIntelligence;
        totals.helpfulness += evaluation.dimensions.helpfulness;
        totals.authenticity += evaluation.dimensions.authenticity;
        totals.safety += evaluation.dimensions.safety;
        totals.contextUse += evaluation.dimensions.contextUse;
        totals.trustBuilding += evaluation.dimensions.trustBuilding;
    }
    const count = evaluationStore.length;
    return {
        personaVoice: Math.round(totals.personaVoice / count),
        emotionalIntelligence: Math.round(totals.emotionalIntelligence / count),
        helpfulness: Math.round(totals.helpfulness / count),
        authenticity: Math.round(totals.authenticity / count),
        safety: Math.round(totals.safety / count),
        contextUse: Math.round(totals.contextUse / count),
        trustBuilding: Math.round(totals.trustBuilding / count),
        sampleSize: count,
    };
}
const alertHandlers = [];
/**
 * Register an alert handler for flagged responses
 */
export function onFlaggedResponse(handler) {
    alertHandlers.push(handler);
    return () => {
        const index = alertHandlers.indexOf(handler);
        if (index > -1)
            alertHandlers.splice(index, 1);
    };
}
async function sendAlerts(evaluation) {
    if (!featureFlags.alerting)
        return;
    if (!evaluation.flagged)
        return;
    for (const handler of alertHandlers) {
        try {
            await handler(evaluation);
        }
        catch (error) {
            log.error({ error }, 'Alert handler failed');
        }
    }
}
/**
 * Hook to evaluate a conversation turn
 * Call this after each AI response is generated
 */
export async function afterTurn(sessionId, personaId, userMessage, aiResponse, context) {
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
    const config = {
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
        const evalContext = {
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
    }
    catch (error) {
        metrics.errors++;
        log.error({ error, sessionId, personaId }, 'Turn evaluation failed');
        return null;
    }
}
/**
 * Quick voice check without full evaluation
 */
export function quickVoiceCheck(personaId, response) {
    if (!featureFlags.enabled || !featureFlags.voiceChecks) {
        return { score: 100, status: 'healthy', issues: [] };
    }
    const { score, issues } = evaluateVoiceConsistency(response, personaId);
    let status = 'healthy';
    if (score < 70)
        status = 'warning';
    if (score < 50)
        status = 'critical';
    return { score, status, issues };
}
const suiteResults = [];
/**
 * Run test suite for a persona
 * Requires a response generator function
 */
export async function runScheduledSuite(personaId, generateResponse, criticalOnly = false) {
    if (!featureFlags.enabled || !featureFlags.scheduledSuites) {
        throw new Error('Scheduled suites are disabled');
    }
    log.info({ personaId, criticalOnly }, 'Starting scheduled test suite');
    const results = criticalOnly
        ? await runCriticalScenarios(personaId, generateResponse)
        : (await runAllScenariosForPersona(personaId, generateResponse)).results;
    const passed = results.filter((r) => r.passed).length;
    const failed = results.length - passed;
    const criticalFailures = results.filter((r) => !r.passed).length; // All critical in criticalOnly mode
    const result = {
        personaId,
        timestamp: new Date(),
        passed,
        failed,
        criticalFailures,
        passRate: (passed / results.length) * 100,
    };
    suiteResults.push(result);
    if (suiteResults.length > 100)
        suiteResults.shift();
    // Record to activity log
    void recordEvalActivity({
        type: 'evalops',
        action: 'suite_completed',
        description: `EvalOps suite completed for ${personaId}: ${result.passRate.toFixed(0)}% pass rate (${passed}/${results.length})`,
        metadata: { personaId, passed, failed, passRate: result.passRate },
    });
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
export function getSuiteResults(personaId) {
    if (personaId) {
        return suiteResults.filter((r) => r.personaId === personaId);
    }
    return [...suiteResults];
}
const EVALOPS_SCHEDULED_INTERVAL = 'evalops-scheduled-evaluation';
/**
 * Start scheduled evaluation runs
 */
export function startScheduledEvaluation(config) {
    // Clear any existing interval
    clearNamedInterval(EVALOPS_SCHEDULED_INTERVAL);
    const intervalMs = typeof config.schedule === 'number' ? config.schedule : 24 * 60 * 60 * 1000; // Default: daily
    registerInterval(EVALOPS_SCHEDULED_INTERVAL, () => {
        if (!featureFlags.enabled || !featureFlags.scheduledSuites)
            return;
        // Run async operations
        void (async () => {
            for (const personaId of config.personas) {
                try {
                    await runScheduledSuite(personaId, config.generateResponse, config.criticalOnly);
                }
                catch (error) {
                    log.error({ error, personaId }, 'Scheduled suite failed');
                }
            }
        })();
    }, intervalMs);
    log.info({ intervalMs, personas: config.personas }, 'Scheduled evaluation started');
}
/**
 * Stop scheduled evaluation runs
 */
export function stopScheduledEvaluation() {
    clearNamedInterval(EVALOPS_SCHEDULED_INTERVAL);
    log.info('Scheduled evaluation stopped');
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
//# sourceMappingURL=automation.js.map