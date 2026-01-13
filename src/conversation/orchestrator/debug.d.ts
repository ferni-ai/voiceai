/**
 * Orchestrator Debug & Monitoring Utilities
 *
 * Provides real-time inspection and debugging capabilities:
 * - Live metrics dashboard data
 * - Session state inspection
 * - Feature toggle testing
 * - Performance profiling
 * - Session replay/export
 *
 * @module @ferni/conversation/orchestrator/debug
 */
import { type UnifiedFeatureState } from './config-adapter.js';
import { type OrchestratorMetrics } from './metrics.js';
import { type CircuitState } from './performance.js';
import type { OrchestratorInput, OrchestratorOutput } from './types.js';
/**
 * Complete debug snapshot of orchestrator state
 */
export interface DebugSnapshot {
    timestamp: number;
    sessionId: string;
    personaId: string;
    config: UnifiedFeatureState;
    metrics: OrchestratorMetrics;
    performance: {
        cacheSize: number;
        circuitBreakers: Record<string, {
            state: CircuitState;
            failures: number;
        }>;
    };
    recentOrchestrations: OrchestrationRecord[];
    health: HealthIndicators;
}
/**
 * Record of a single orchestration
 */
export interface OrchestrationRecord {
    turn: number;
    timestamp: number;
    input: {
        userMessage: string;
        userEmotion?: string;
        topic?: string;
        wasPersonalSharing?: boolean;
    };
    output: {
        appliedFeatures: string[];
        pacing: string;
        confidence: number;
    };
    timing: Record<string, number>;
}
/**
 * Health indicators for monitoring
 */
export interface HealthIndicators {
    status: 'healthy' | 'degraded' | 'unhealthy';
    issues: string[];
    recommendations: string[];
    avgLatency: number;
    p95Latency: number;
    errorRate: number;
    cacheHitRate: number;
    circuitBreakerHealth: 'all_closed' | 'some_open' | 'all_open';
}
/**
 * A/B test configuration
 */
export interface ABTestConfig {
    name: string;
    enabled: boolean;
    variants: {
        control: {
            useOrchestrator: boolean;
            preset?: string;
        };
        treatment: {
            useOrchestrator: boolean;
            preset?: string;
        };
    };
    trafficPercentage: number;
    startTime: number;
    endTime?: number;
}
/**
 * Get complete debug snapshot
 */
export declare function getDebugSnapshot(sessionId: string, personaId?: string): DebugSnapshot;
/**
 * Get health status
 */
export declare function getHealthStatus(sessionId: string): HealthIndicators;
/**
 * Get aggregated system health across all sessions
 */
export declare function getSystemHealth(): {
    activeSessions: number;
    totalOrchestrations: number;
    avgLatency: number;
    errorRate: number;
    status: 'healthy' | 'degraded' | 'unhealthy';
};
/**
 * Record an orchestration for debugging
 */
export declare function recordOrchestration(sessionId: string, input: OrchestratorInput, output: OrchestratorOutput): void;
/**
 * Get session records
 */
export declare function getSessionRecords(sessionId: string): OrchestrationRecord[];
/**
 * Export session for analysis
 */
export declare function exportSession(sessionId: string): string;
/**
 * Clear session records
 */
export declare function clearSessionRecords(sessionId?: string): void;
/**
 * Create an A/B test
 */
export declare function createABTest(config: ABTestConfig): void;
/**
 * Get variant for a user in a test
 */
export declare function getABTestVariant(testName: string, userId: string): {
    variant: 'control' | 'treatment';
    config: ABTestConfig['variants']['control'];
} | null;
/**
 * Get A/B test stats
 */
export declare function getABTestStats(testName: string): {
    controlCount: number;
    treatmentCount: number;
    controlMetrics: Record<string, number>;
    treatmentMetrics: Record<string, number>;
} | null;
/**
 * End an A/B test
 */
export declare function endABTest(testName: string): void;
/**
 * Clear A/B test data
 */
export declare function clearABTests(): void;
/**
 * Profile an orchestration with detailed timing
 */
export declare function profileOrchestration<T>(name: string, fn: () => Promise<T>): Promise<{
    result: T;
    profile: {
        name: string;
        durationMs: number;
    };
}>;
/**
 * Create a profiler for detailed phase timing
 */
export declare function createProfiler(): {
    mark: (name: string) => void;
    getMarks: () => Array<{
        name: string;
        timestamp: number;
        delta: number;
    }>;
    reset: () => void;
};
/**
 * Log a formatted debug summary
 */
export declare function logDebugSummary(sessionId: string): void;
/**
 * Log feature application stats
 */
export declare function logFeatureStats(sessionId: string): void;
export declare const orchestratorDebug: {
    getSnapshot: typeof getDebugSnapshot;
    getHealth: typeof getHealthStatus;
    getSystemHealth: typeof getSystemHealth;
    record: typeof recordOrchestration;
    getRecords: typeof getSessionRecords;
    export: typeof exportSession;
    clearRecords: typeof clearSessionRecords;
    createTest: typeof createABTest;
    getVariant: typeof getABTestVariant;
    getTestStats: typeof getABTestStats;
    endTest: typeof endABTest;
    clearTests: typeof clearABTests;
    profile: typeof profileOrchestration;
    createProfiler: typeof createProfiler;
    logSummary: typeof logDebugSummary;
    logFeatures: typeof logFeatureStats;
};
//# sourceMappingURL=debug.d.ts.map