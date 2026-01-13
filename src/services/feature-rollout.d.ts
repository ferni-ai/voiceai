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
export type RolloutStage = 'pending' | 'validating' | 'rolling_out' | 'stable' | 'rolled_back' | 'failed';
export interface ValidationCheck {
    /** Check identifier */
    id: string;
    /** Human-readable name */
    name: string;
    /** Check function - returns true if passing */
    check: (featureId: string, context: RolloutContext) => Promise<ValidationResult>;
    /** Is this check required to pass? */
    required: boolean;
    /** Timeout in ms */
    timeoutMs?: number;
}
export interface ValidationResult {
    passed: boolean;
    message: string;
    metrics?: Record<string, number>;
    details?: unknown;
}
export interface RolloutContext {
    currentPercentage: number;
    targetPercentage: number;
    startedAt: Date;
    duration: number;
    metrics: RolloutMetrics;
}
export interface RolloutMetrics {
    /** Requests served by feature */
    requestCount: number;
    /** Error count */
    errorCount: number;
    /** Error rate (0-1) */
    errorRate: number;
    /** Average latency in ms */
    avgLatencyMs: number;
    /** P99 latency in ms */
    p99LatencyMs: number;
    /** User satisfaction score (if available) */
    satisfactionScore?: number;
}
export interface RolloutConfig {
    /** Feature flag ID to control */
    featureId: string;
    /** Percentage stages (e.g., [1, 10, 50, 100]) */
    stages: number[];
    /** Validation checks to run at each stage */
    validationChecks: string[];
    /** Minimum time at each stage before advancing (ms) */
    stageMinDurationMs: number;
    /** Auto-advance when validations pass */
    autoAdvance: boolean;
    /** Auto-rollback on validation failure */
    autoRollback: boolean;
    /** Metrics thresholds for auto-rollback */
    rollbackThresholds: {
        maxErrorRate: number;
        maxLatencyMs: number;
        minSatisfaction?: number;
    };
    /** Notification webhook for status updates */
    webhookUrl?: string;
    /** Who initiated the rollout */
    initiatedBy: string;
}
export interface RolloutState {
    config: RolloutConfig;
    stage: RolloutStage;
    currentStageIndex: number;
    currentPercentage: number;
    startedAt: string;
    lastValidationAt?: string;
    lastAdvancedAt?: string;
    validationResults: Array<{
        stageIndex: number;
        checkId: string;
        result: ValidationResult;
        timestamp: string;
    }>;
    metrics: RolloutMetrics;
    rollbackReason?: string;
}
export declare class FeatureRolloutService {
    private rollouts;
    private customChecks;
    private checkIntervalMs;
    private checkIntervalId?;
    constructor();
    /**
     * Register a custom validation check
     */
    registerCheck(check: ValidationCheck): void;
    /**
     * Start a new feature rollout
     */
    startRollout(config: RolloutConfig): Promise<RolloutState>;
    /**
     * Manually advance to next stage
     */
    advanceStage(featureId: string): Promise<RolloutState>;
    /**
     * Rollback a feature
     */
    rollback(featureId: string, reason: string): Promise<RolloutState>;
    /**
     * Get rollout status
     */
    getRolloutStatus(featureId: string): RolloutState | undefined;
    /**
     * Get all active rollouts
     */
    getAllRollouts(): RolloutState[];
    /**
     * Cancel a rollout (without rollback)
     */
    cancelRollout(featureId: string): void;
    private startMonitoring;
    private checkAllRollouts;
    private runValidation;
    private getChecks;
    private collectMetrics;
    private notifyStatus;
    /**
     * Cleanup
     */
    shutdown(): void;
}
export declare function getFeatureRollout(): FeatureRolloutService;
export declare const ROLLOUT_PRESETS: {
    /** Conservative rollout - slow and careful */
    conservative: {
        stages: number[];
        stageMinDurationMs: number;
        validationChecks: string[];
        autoAdvance: boolean;
        autoRollback: boolean;
        rollbackThresholds: {
            maxErrorRate: number;
            maxLatencyMs: number;
        };
    };
    /** Standard rollout - balanced approach */
    standard: {
        stages: number[];
        stageMinDurationMs: number;
        validationChecks: string[];
        autoAdvance: boolean;
        autoRollback: boolean;
        rollbackThresholds: {
            maxErrorRate: number;
            maxLatencyMs: number;
        };
    };
    /** Aggressive rollout - fast but with safety checks */
    aggressive: {
        stages: number[];
        stageMinDurationMs: number;
        validationChecks: string[];
        autoAdvance: boolean;
        autoRollback: boolean;
        rollbackThresholds: {
            maxErrorRate: number;
            maxLatencyMs: number;
        };
    };
    /** Canary only - stay at low percentage, manual advance */
    canary: {
        stages: number[];
        stageMinDurationMs: number;
        validationChecks: string[];
        autoAdvance: boolean;
        autoRollback: boolean;
        rollbackThresholds: {
            maxErrorRate: number;
            maxLatencyMs: number;
        };
    };
};
//# sourceMappingURL=feature-rollout.d.ts.map