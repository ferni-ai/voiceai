/**
 * Health Monitors for Critical Services
 *
 * Proactive health checking for LiveKit, Cartesia, Gemini, Firestore, etc.
 * Detects issues before they impact users.
 *
 * Features:
 * - Periodic health checks for each service
 * - Circuit breaker integration
 * - Anomaly detection integration
 * - Automatic alerting on degradation
 */
export interface HealthCheckResult {
    healthy: boolean;
    latencyMs: number;
    details?: string;
    error?: string;
    metadata?: Record<string, unknown>;
}
export interface HealthMonitor {
    name: string;
    displayName: string;
    category: 'voice' | 'ai' | 'database' | 'integration';
    criticalFor: ('dispatch' | 'session' | 'audio' | 'memory' | 'tools')[];
    check: () => Promise<HealthCheckResult>;
    lastResult?: HealthCheckResult;
    lastCheck?: number;
}
export interface HealthStatus {
    overall: 'healthy' | 'degraded' | 'critical';
    timestamp: string;
    monitors: Record<string, HealthCheckResult & {
        name: string;
        displayName: string;
    }>;
    unhealthyServices: string[];
    recommendations: string[];
}
/**
 * Run health check for a specific service
 */
export declare function checkServiceHealth(serviceName: string): Promise<HealthCheckResult | null>;
/**
 * Run all health checks
 */
export declare function runAllHealthChecks(): Promise<HealthStatus>;
/**
 * Check if a specific capability is available
 */
export declare function isCapabilityHealthy(capability: 'dispatch' | 'session' | 'audio' | 'memory' | 'tools'): boolean;
/**
 * Get cached health status (doesn't run new checks)
 */
export declare function getCachedHealthStatus(): HealthStatus;
/**
 * Get list of all monitors
 */
export declare function getMonitors(): readonly HealthMonitor[];
/**
 * Start background health monitoring
 * @param intervalMs - Interval for standard checks (default 30s)
 * @param criticalIntervalMs - Interval for critical service checks (default 15s)
 */
export declare function startHealthMonitoring(intervalMs?: number, criticalIntervalMs?: number): void;
/**
 * Stop background health monitoring
 */
export declare function stopHealthMonitoring(): void;
/**
 * Check if monitoring is running
 */
export declare function isMonitoringActive(): boolean;
/**
 * Get consecutive failure count for a service
 */
export declare function getConsecutiveFailures(serviceName: string): number;
//# sourceMappingURL=health-monitors.d.ts.map