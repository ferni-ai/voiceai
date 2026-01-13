/**
 * Latency Tracker Service
 *
 * Tracks real response times from external services for monitoring.
 * Provides rolling averages and current latency data for dashboards.
 *
 * Tracked services:
 * - LiveKit (voice infrastructure)
 * - Gemini (LLM)
 * - Cartesia (TTS)
 * - Firestore (database)
 * - OpenAI (fallback LLM)
 *
 * @module LatencyTracker
 */
export type ServiceName = 'livekit' | 'gemini' | 'cartesia' | 'firestore' | 'openai' | 'deepgram';
export interface LatencyRecord {
    service: ServiceName;
    durationMs: number;
    timestamp: Date;
    success: boolean;
    operation?: string;
}
export interface ServiceLatencyStats {
    service: ServiceName;
    avgLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    minLatencyMs: number;
    maxLatencyMs: number;
    totalCalls: number;
    successRate: number;
    lastLatencyMs: number | null;
    lastCallTime: Date | null;
}
/**
 * Record a latency measurement for a service
 */
export declare function recordLatency(service: ServiceName, durationMs: number, success?: boolean, operation?: string): void;
/**
 * Wrap an async operation to automatically track its latency
 */
export declare function trackLatency<T>(service: ServiceName, operation: string, fn: () => Promise<T>): Promise<T>;
/**
 * Create a latency-tracking wrapper for a function
 */
export declare function withLatencyTracking<TArgs extends unknown[], TReturn>(service: ServiceName, operation: string, fn: (...args: TArgs) => Promise<TReturn>): (...args: TArgs) => Promise<TReturn>;
/**
 * Get latency statistics for a specific service
 */
export declare function getServiceStats(service: ServiceName): ServiceLatencyStats;
/**
 * Get latency statistics for all services
 */
export declare function getAllServiceStats(): Record<ServiceName, ServiceLatencyStats>;
/**
 * Get average latency across all services (for dashboard overview)
 */
export declare function getAverageLatency(): number;
/**
 * Get summary for dashboard display
 */
export declare function getLatencySummary(): {
    avgResponseTime: number;
    services: Array<{
        name: string;
        latency: number;
        status: 'healthy' | 'degraded' | 'down';
    }>;
};
/**
 * Perform a health check on a service by pinging it
 * Returns latency in ms or -1 if failed
 */
export declare function pingService(service: ServiceName): Promise<number>;
/**
 * Run health checks on all services
 */
export declare function healthCheckAllServices(): Promise<Array<{
    service: ServiceName;
    latency: number;
    healthy: boolean;
}>>;
declare const _default: {
    recordLatency: typeof recordLatency;
    trackLatency: typeof trackLatency;
    withLatencyTracking: typeof withLatencyTracking;
    getServiceStats: typeof getServiceStats;
    getAllServiceStats: typeof getAllServiceStats;
    getAverageLatency: typeof getAverageLatency;
    getLatencySummary: typeof getLatencySummary;
    pingService: typeof pingService;
    healthCheckAllServices: typeof healthCheckAllServices;
};
export default _default;
//# sourceMappingURL=latency-tracker.d.ts.map