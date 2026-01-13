/**
 * Cloud Run Container Restart Service
 *
 * Provides automatic container restart capabilities via Cloud Run Admin API.
 * Used for self-healing when containers get into bad states.
 *
 * Features:
 * - Rolling restart (deploy same image with traffic migration)
 * - Single instance restart
 * - Health-based auto-restart
 * - Cooldown protection
 */
export interface RestartOptions {
    /** Service name (e.g., 'voiceai-agent', 'bogle-ui') */
    serviceName: string;
    /** GCP region (default: 'us-central1') */
    region?: string;
    /** GCP project ID (default: from env) */
    projectId?: string;
    /** Reason for restart */
    reason: string;
    /** Whether to notify via alerting */
    notify?: boolean;
    /** Force restart even if in cooldown */
    force?: boolean;
}
export interface RestartResult {
    success: boolean;
    serviceName: string;
    previousRevision?: string;
    newRevision?: string;
    error?: string;
    durationMs: number;
}
declare const restartHistory: Array<{
    serviceName: string;
    timestamp: Date;
    reason: string;
    success: boolean;
}>;
/**
 * Restart a Cloud Run service
 *
 * This triggers a rolling restart by deploying a new revision
 * with the same container image.
 */
export declare function restartService(options: RestartOptions): Promise<RestartResult>;
/**
 * Check if a service can be restarted (not in cooldown)
 */
export declare function canRestart(serviceName: string): boolean;
/**
 * Get cooldown remaining time in seconds
 */
export declare function getCooldownRemaining(serviceName: string): number;
/**
 * Get restart history
 */
export declare function getRestartHistory(): typeof restartHistory;
/**
 * Clear cooldown for a service (admin use)
 */
export declare function clearCooldown(serviceName: string): void;
/**
 * Handle critical failure that may require restart
 */
export declare function handleCriticalFailure(serviceName: string, error: Error, context?: Record<string, unknown>): Promise<RestartResult | null>;
/**
 * Setup auto-restart handler for uncaught exceptions
 */
export declare function setupAutoRestart(serviceName: string): void;
export {};
//# sourceMappingURL=cloud-run-restart.d.ts.map