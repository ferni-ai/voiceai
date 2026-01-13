/**
 * Feature Rollout Service
 *
 * Automated feature validation and progressive rollout system.
 *
 * Features:
 * - Define validation criteria per feature
 * - Automated health checks before rollout
 * - Progressive rollout stages (1% → 10% → 50% → 100%)
 * - Auto-rollback on metrics degradation
 * - Integration with feature flags
 *
 * Usage:
 *   const rollout = getFeatureRollout();
 *
 *   // Start a rollout
 *   await rollout.startRollout('new-voice-model', {
 *     stages: [1, 10, 50, 100],
 *     validationChecks: ['health', 'latency', 'error_rate'],
 *     autoAdvance: true,
 *   });
 *
 *   // Check rollout status
 *   const status = rollout.getRolloutStatus('new-voice-model');
 */
import { createLogger } from '../utils/safe-logger.js';
import { registerInterval, clearNamedInterval } from '../utils/interval-manager.js';
import { getFeatureFlags } from './feature-flags.js';
import { notifyRollout } from './slack-notifications.js';
const log = createLogger({ module: 'FeatureRollout' });
/** Interval name for the rollout checker */
const FEATURE_ROLLOUT_INTERVAL = 'feature-rollout-check';
// ============================================================================
// BUILT-IN VALIDATION CHECKS
// ============================================================================
const BUILTIN_CHECKS = {
    health: {
        id: 'health',
        name: 'Health Check',
        required: true,
        timeoutMs: 5000,
        check: async (featureId, context) => {
            // Check if the feature's dependent services are healthy
            // SECURITY: localhost fallback only in development
            try {
                const isDev = process.env.NODE_ENV !== 'production';
                const healthUrl = process.env.HEALTH_CHECK_URL || (isDev ? 'http://localhost:3001/health' : '');
                const response = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
                if (!response.ok) {
                    return { passed: false, message: `Health check failed: ${response.status}` };
                }
                const data = (await response.json());
                return {
                    passed: data.status === 'ok' || data.status === 'healthy',
                    message: `Health status: ${data.status}`,
                };
            }
            catch (error) {
                return { passed: false, message: `Health check error: ${error}` };
            }
        },
    },
    error_rate: {
        id: 'error_rate',
        name: 'Error Rate Check',
        required: true,
        check: async (_featureId, context) => {
            const threshold = 0.05; // 5%
            const passed = context.metrics.errorRate <= threshold;
            return {
                passed,
                message: `Error rate: ${(context.metrics.errorRate * 100).toFixed(2)}% (threshold: ${threshold * 100}%)`,
                metrics: { errorRate: context.metrics.errorRate },
            };
        },
    },
    latency: {
        id: 'latency',
        name: 'Latency Check',
        required: true,
        check: async (_featureId, context) => {
            const threshold = 500; // 500ms p99
            const passed = context.metrics.p99LatencyMs <= threshold;
            return {
                passed,
                message: `P99 latency: ${context.metrics.p99LatencyMs}ms (threshold: ${threshold}ms)`,
                metrics: { p99LatencyMs: context.metrics.p99LatencyMs },
            };
        },
    },
    min_traffic: {
        id: 'min_traffic',
        name: 'Minimum Traffic Check',
        required: false,
        check: async (_featureId, context) => {
            // Require minimum sample size before advancing
            const minRequests = 100;
            const passed = context.metrics.requestCount >= minRequests;
            return {
                passed,
                message: `Request count: ${context.metrics.requestCount} (minimum: ${minRequests})`,
                metrics: { requestCount: context.metrics.requestCount },
            };
        },
    },
    duration: {
        id: 'duration',
        name: 'Stage Duration Check',
        required: true,
        check: async (_featureId, context) => {
            const minDuration = 5 * 60 * 1000; // 5 minutes minimum
            const passed = context.duration >= minDuration;
            return {
                passed,
                message: `Stage duration: ${Math.round(context.duration / 1000)}s (minimum: ${minDuration / 1000}s)`,
                metrics: { durationMs: context.duration },
            };
        },
    },
};
// ============================================================================
// FEATURE ROLLOUT SERVICE
// ============================================================================
export class FeatureRolloutService {
    rollouts = new Map();
    customChecks = new Map();
    checkIntervalMs = 30000; // Check every 30 seconds
    checkIntervalId;
    constructor() {
        // Start monitoring loop
        this.startMonitoring();
        log.info('Feature rollout service initialized');
    }
    /**
     * Register a custom validation check
     */
    registerCheck(check) {
        this.customChecks.set(check.id, check);
        log.info({ checkId: check.id }, 'Registered custom validation check');
    }
    /**
     * Start a new feature rollout
     */
    async startRollout(config) {
        const { featureId } = config;
        // Check if rollout already exists
        if (this.rollouts.has(featureId)) {
            throw new Error(`Rollout already in progress for ${featureId}`);
        }
        // Validate feature flag exists
        const flags = getFeatureFlags();
        const flag = flags.getFlag(featureId);
        if (!flag) {
            throw new Error(`Feature flag "${featureId}" not found`);
        }
        // Initialize rollout state
        const state = {
            config,
            stage: 'validating',
            currentStageIndex: 0,
            currentPercentage: 0,
            startedAt: new Date().toISOString(),
            validationResults: [],
            metrics: {
                requestCount: 0,
                errorCount: 0,
                errorRate: 0,
                avgLatencyMs: 0,
                p99LatencyMs: 0,
            },
        };
        this.rollouts.set(featureId, state);
        log.info({ featureId, stages: config.stages }, 'Starting feature rollout');
        // Run initial validation
        await this.runValidation(featureId);
        // Send Slack notification
        await notifyRollout(featureId, 'started', {
            percentage: 0,
            stage: 'validating',
            initiatedBy: config.initiatedBy,
        });
        // Notify webhook
        await this.notifyStatus(featureId, 'Rollout started');
        return state;
    }
    /**
     * Manually advance to next stage
     */
    async advanceStage(featureId) {
        const state = this.rollouts.get(featureId);
        if (!state) {
            throw new Error(`No rollout found for ${featureId}`);
        }
        if (state.stage === 'rolled_back' || state.stage === 'failed') {
            throw new Error(`Cannot advance ${state.stage} rollout`);
        }
        const nextIndex = state.currentStageIndex + 1;
        if (nextIndex >= state.config.stages.length) {
            // Already at final stage
            state.stage = 'stable';
            await this.notifyStatus(featureId, 'Rollout complete - feature fully enabled');
            return state;
        }
        const nextPercentage = state.config.stages[nextIndex];
        // Update feature flag percentage
        const flags = getFeatureFlags();
        await flags.updateFlag(featureId, {
            rolloutPercentage: nextPercentage,
            enabled: true,
        });
        state.currentStageIndex = nextIndex;
        state.currentPercentage = nextPercentage;
        state.lastAdvancedAt = new Date().toISOString();
        state.stage = 'rolling_out';
        log.info({ featureId, percentage: nextPercentage }, 'Advanced rollout stage');
        // Send Slack notification
        await notifyRollout(featureId, 'advanced', {
            percentage: nextPercentage,
            stage: state.stage,
        });
        await this.notifyStatus(featureId, `Advanced to ${nextPercentage}%`);
        return state;
    }
    /**
     * Rollback a feature
     */
    async rollback(featureId, reason) {
        const state = this.rollouts.get(featureId);
        if (!state) {
            throw new Error(`No rollout found for ${featureId}`);
        }
        // Disable the feature flag
        const flags = getFeatureFlags();
        await flags.updateFlag(featureId, {
            enabled: false,
            rolloutPercentage: 0,
        });
        state.stage = 'rolled_back';
        state.currentPercentage = 0;
        state.rollbackReason = reason;
        log.warn({ featureId, reason }, 'Feature rolled back');
        // Send Slack notification
        await notifyRollout(featureId, 'rolled_back', {
            percentage: 0,
            stage: 'rolled_back',
            reason,
        });
        await this.notifyStatus(featureId, `ROLLED BACK: ${reason}`);
        return state;
    }
    /**
     * Get rollout status
     */
    getRolloutStatus(featureId) {
        return this.rollouts.get(featureId);
    }
    /**
     * Get all active rollouts
     */
    getAllRollouts() {
        return Array.from(this.rollouts.values());
    }
    /**
     * Cancel a rollout (without rollback)
     */
    cancelRollout(featureId) {
        this.rollouts.delete(featureId);
        log.info({ featureId }, 'Rollout cancelled');
    }
    // ============================================================================
    // INTERNAL METHODS
    // ============================================================================
    startMonitoring() {
        registerInterval(FEATURE_ROLLOUT_INTERVAL, () => {
            this.checkAllRollouts().catch((err) => {
                log.error({ error: err }, 'Error checking rollouts');
            });
        }, this.checkIntervalMs);
    }
    async checkAllRollouts() {
        for (const [featureId, state] of this.rollouts) {
            if (state.stage === 'rolling_out' || state.stage === 'validating') {
                await this.runValidation(featureId);
            }
        }
    }
    async runValidation(featureId) {
        const state = this.rollouts.get(featureId);
        if (!state)
            return;
        const context = {
            currentPercentage: state.currentPercentage,
            targetPercentage: state.config.stages[state.currentStageIndex] || 0,
            startedAt: new Date(state.startedAt),
            duration: Date.now() - new Date(state.startedAt).getTime(),
            metrics: state.metrics,
        };
        // Collect current metrics
        await this.collectMetrics(featureId);
        // Run validation checks
        const checks = this.getChecks(state.config.validationChecks);
        let allPassed = true;
        let requiredFailed = false;
        for (const check of checks) {
            try {
                const result = await Promise.race([
                    check.check(featureId, context),
                    new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('Check timeout')), check.timeoutMs || 10000);
                    }),
                ]);
                state.validationResults.push({
                    stageIndex: state.currentStageIndex,
                    checkId: check.id,
                    result,
                    timestamp: new Date().toISOString(),
                });
                if (!result.passed) {
                    allPassed = false;
                    if (check.required) {
                        requiredFailed = true;
                    }
                }
                log.debug({ featureId, checkId: check.id, passed: result.passed }, 'Validation check completed');
            }
            catch (error) {
                const result = {
                    passed: false,
                    message: `Check failed: ${error}`,
                };
                state.validationResults.push({
                    stageIndex: state.currentStageIndex,
                    checkId: check.id,
                    result,
                    timestamp: new Date().toISOString(),
                });
                allPassed = false;
                if (check.required) {
                    requiredFailed = true;
                }
            }
        }
        state.lastValidationAt = new Date().toISOString();
        // Check rollback thresholds
        const { rollbackThresholds } = state.config;
        if (state.metrics.errorRate > rollbackThresholds.maxErrorRate ||
            state.metrics.p99LatencyMs > rollbackThresholds.maxLatencyMs) {
            if (state.config.autoRollback) {
                const reason = state.metrics.errorRate > rollbackThresholds.maxErrorRate
                    ? `Error rate ${(state.metrics.errorRate * 100).toFixed(1)}% exceeded threshold ${rollbackThresholds.maxErrorRate * 100}%`
                    : `Latency ${state.metrics.p99LatencyMs}ms exceeded threshold ${rollbackThresholds.maxLatencyMs}ms`;
                await this.rollback(featureId, reason);
                return;
            }
        }
        // Handle validation results
        if (requiredFailed) {
            if (state.config.autoRollback) {
                await this.rollback(featureId, 'Required validation check failed');
            }
            else {
                state.stage = 'failed';
            }
            return;
        }
        // Auto-advance if enabled and all checks passed
        if (allPassed && state.config.autoAdvance && state.stage === 'rolling_out') {
            const minDuration = state.config.stageMinDurationMs;
            const stageDuration = state.lastAdvancedAt
                ? Date.now() - new Date(state.lastAdvancedAt).getTime()
                : Date.now() - new Date(state.startedAt).getTime();
            if (stageDuration >= minDuration) {
                await this.advanceStage(featureId);
            }
        }
        // Transition from validating to rolling_out if initial validation passed
        if (state.stage === 'validating' && allPassed) {
            state.stage = 'rolling_out';
            await this.advanceStage(featureId);
        }
    }
    getChecks(checkIds) {
        return checkIds
            .map((id) => {
            return this.customChecks.get(id) || BUILTIN_CHECKS[id];
        })
            .filter(Boolean);
    }
    async collectMetrics(featureId) {
        const state = this.rollouts.get(featureId);
        if (!state)
            return;
        // Integrate with observability hub for real metrics
        try {
            const { observabilityHub } = await import('./observability/hub.js');
            const snapshot = observabilityHub.getSnapshot(5); // Last 5 minutes
            // Use LLM and UX metrics for rollout decisions
            const { llm, ux, errors } = snapshot;
            state.metrics = {
                requestCount: llm.totalCalls || 0,
                errorCount: Math.round(llm.totalCalls * (llm.errorRate / 100)),
                errorRate: llm.errorRate / 100, // Convert from percentage
                avgLatencyMs: llm.avgLatencyMs || 0,
                p99LatencyMs: llm.p95LatencyMs || 0, // Use p95 as proxy for p99
                satisfactionScore: ux.avgQualityScore / 100, // Normalize to 0-1
            };
            log.debug({ featureId, errorRate: state.metrics.errorRate, latency: state.metrics.p99LatencyMs }, 'Collected metrics from observability hub');
        }
        catch (error) {
            // Fallback to API fetch if observability hub not available
            // SECURITY: localhost fallback only in development
            try {
                const isDev = process.env.NODE_ENV !== 'production';
                const metricsUrl = process.env.METRICS_URL || (isDev ? 'http://localhost:3002/api/observability/llm' : '');
                const response = await fetch(metricsUrl, { signal: AbortSignal.timeout(5000) });
                if (response.ok) {
                    const data = (await response.json());
                    state.metrics = {
                        requestCount: data.totalRequests || 0,
                        errorCount: data.errorCount || 0,
                        errorRate: data.totalRequests ? (data.errorCount || 0) / data.totalRequests : 0,
                        avgLatencyMs: data.avgLatency || 0,
                        p99LatencyMs: data.p99Latency || 0,
                    };
                }
            }
            catch {
                log.debug({ featureId, error }, 'Failed to collect metrics, keeping existing');
            }
        }
    }
    async notifyStatus(featureId, message) {
        const state = this.rollouts.get(featureId);
        if (!state?.config.webhookUrl)
            return;
        try {
            await fetch(state.config.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    featureId,
                    message,
                    stage: state.stage,
                    percentage: state.currentPercentage,
                    timestamp: new Date().toISOString(),
                }),
                signal: AbortSignal.timeout(5000),
            });
        }
        catch (error) {
            log.warn({ featureId, error }, 'Failed to send rollout notification');
        }
    }
    /**
     * Cleanup
     */
    shutdown() {
        clearNamedInterval(FEATURE_ROLLOUT_INTERVAL);
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
let rolloutService = null;
export function getFeatureRollout() {
    if (!rolloutService) {
        rolloutService = new FeatureRolloutService();
    }
    return rolloutService;
}
// ============================================================================
// PRESET ROLLOUT CONFIGURATIONS
// ============================================================================
export const ROLLOUT_PRESETS = {
    /** Conservative rollout - slow and careful */
    conservative: {
        stages: [1, 5, 10, 25, 50, 75, 100],
        stageMinDurationMs: 30 * 60 * 1000, // 30 minutes per stage
        validationChecks: ['health', 'error_rate', 'latency', 'min_traffic', 'duration'],
        autoAdvance: true,
        autoRollback: true,
        rollbackThresholds: {
            maxErrorRate: 0.01, // 1%
            maxLatencyMs: 300,
        },
    },
    /** Standard rollout - balanced approach */
    standard: {
        stages: [5, 25, 50, 100],
        stageMinDurationMs: 15 * 60 * 1000, // 15 minutes per stage
        validationChecks: ['health', 'error_rate', 'latency'],
        autoAdvance: true,
        autoRollback: true,
        rollbackThresholds: {
            maxErrorRate: 0.05, // 5%
            maxLatencyMs: 500,
        },
    },
    /** Aggressive rollout - fast but with safety checks */
    aggressive: {
        stages: [10, 50, 100],
        stageMinDurationMs: 5 * 60 * 1000, // 5 minutes per stage
        validationChecks: ['health', 'error_rate'],
        autoAdvance: true,
        autoRollback: true,
        rollbackThresholds: {
            maxErrorRate: 0.1, // 10%
            maxLatencyMs: 1000,
        },
    },
    /** Canary only - stay at low percentage, manual advance */
    canary: {
        stages: [1, 5],
        stageMinDurationMs: 60 * 60 * 1000, // 1 hour per stage
        validationChecks: ['health', 'error_rate', 'latency', 'min_traffic'],
        autoAdvance: false,
        autoRollback: true,
        rollbackThresholds: {
            maxErrorRate: 0.02,
            maxLatencyMs: 400,
        },
    },
};
//# sourceMappingURL=feature-rollout.js.map