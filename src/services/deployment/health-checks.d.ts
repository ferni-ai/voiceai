/**
 * Service Health Checks
 *
 * Provides health check functions for all major services.
 * Used by monitoring, deployment validation, and API endpoints.
 *
 * @module services/health-checks
 */
export interface HealthCheckResult {
    service: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    latencyMs: number;
    message?: string;
    details?: Record<string, unknown>;
}
export interface SystemHealthReport {
    timestamp: string;
    overall: 'healthy' | 'degraded' | 'unhealthy';
    services: HealthCheckResult[];
    summary: {
        total: number;
        healthy: number;
        degraded: number;
        unhealthy: number;
    };
}
/**
 * Check trust systems health
 */
export declare function checkTrustSystemsHealth(): Promise<HealthCheckResult>;
/**
 * Check outreach system health
 */
export declare function checkOutreachHealth(): Promise<HealthCheckResult>;
/**
 * Check observability system health
 */
export declare function checkObservabilityHealth(): Promise<HealthCheckResult>;
/**
 * Check persistence layer health
 */
export declare function checkPersistenceHealth(): Promise<HealthCheckResult>;
/**
 * Check cognitive intelligence health
 */
export declare function checkCognitiveIntelligenceHealth(): Promise<HealthCheckResult>;
/**
 * Check therapeutic frameworks health
 */
export declare function checkTherapeuticFrameworksHealth(): Promise<HealthCheckResult>;
/**
 * Check feature flags health
 */
export declare function checkFeatureFlagsHealth(): Promise<HealthCheckResult>;
/**
 * Check session management health
 */
export declare function checkSessionManagementHealth(): Promise<HealthCheckResult>;
/**
 * Check wellbeing tracking health
 */
export declare function checkWellbeingTrackingHealth(): Promise<HealthCheckResult>;
/**
 * Run all health checks and return a comprehensive report
 */
export declare function runAllHealthChecks(): Promise<SystemHealthReport>;
/**
 * Run critical health checks only (faster, for frequent polling)
 */
export declare function runCriticalHealthChecks(): Promise<SystemHealthReport>;
declare const _default: {
    runAllHealthChecks: typeof runAllHealthChecks;
    runCriticalHealthChecks: typeof runCriticalHealthChecks;
    checkTrustSystemsHealth: typeof checkTrustSystemsHealth;
    checkOutreachHealth: typeof checkOutreachHealth;
    checkObservabilityHealth: typeof checkObservabilityHealth;
    checkPersistenceHealth: typeof checkPersistenceHealth;
    checkCognitiveIntelligenceHealth: typeof checkCognitiveIntelligenceHealth;
    checkTherapeuticFrameworksHealth: typeof checkTherapeuticFrameworksHealth;
    checkFeatureFlagsHealth: typeof checkFeatureFlagsHealth;
    checkSessionManagementHealth: typeof checkSessionManagementHealth;
    checkWellbeingTrackingHealth: typeof checkWellbeingTrackingHealth;
};
export default _default;
//# sourceMappingURL=health-checks.d.ts.map