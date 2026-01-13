/**
 * Security Events Service
 *
 * Comprehensive security monitoring and audit logging for Ferni AI.
 * Tracks authentication events, suspicious activity, and security anomalies.
 *
 * Philosophy: Security should be invisible but omnipresent.
 * Like a good friend who notices when something's off, but doesn't make a big deal of it.
 *
 * Features:
 * - Failed login tracking with intelligent lockout
 * - Anomaly detection (unusual times, locations, behaviors)
 * - Audit trail for sensitive operations
 * - Privacy-preserving logging (no PII in logs)
 *
 * PERSISTENCE: Uses Redis for rate limiting, Firestore for event audit log.
 *
 * @module SecurityEvents
 */
/**
 * Security event types we track
 */
export type SecurityEventType = 'auth_success' | 'auth_failure' | 'auth_lockout' | 'auth_unlock' | 'jwt_expired' | 'jwt_invalid' | 'api_key_invalid' | 'session_start' | 'session_end' | 'session_timeout' | 'profile_access' | 'profile_update' | 'profile_delete' | 'data_export' | 'password_change' | 'identifier_linked' | 'anomaly_detected' | 'rate_limit_exceeded' | 'suspicious_activity' | 'voice_mismatch' | 'voice_enrolled' | 'voice_verification_failed' | 'agent_graceful_exit';
/**
 * Severity levels
 */
export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';
/**
 * Security event record
 */
export interface SecurityEvent {
    id: string;
    type: SecurityEventType;
    severity: SecuritySeverity;
    timestamp: Date;
    actorId?: string;
    actorType: 'user' | 'system' | 'api' | 'unknown';
    targetId?: string;
    ipHash?: string;
    userAgentHash?: string;
    action: string;
    outcome: 'success' | 'failure' | 'blocked' | 'warning';
    details?: Record<string, unknown>;
    sessionId?: string;
    requestId?: string;
    correlationId?: string;
}
/**
 * Anomaly detection config
 */
interface AnomalyConfig {
    /** Max failed attempts before lockout */
    maxFailedAttempts: number;
    /** Lockout duration in ms */
    lockoutDurationMs: number;
    /** Window for counting failures */
    failureWindowMs: number;
    /** Unusual hour threshold (e.g., 3 AM) */
    unusualHourStart: number;
    unusualHourEnd: number;
}
/**
 * Record a security event
 */
export declare function recordSecurityEvent(params: {
    type: SecurityEventType;
    actorId?: string;
    actorType?: 'user' | 'system' | 'api' | 'unknown';
    targetId?: string;
    ip?: string;
    userAgent?: string;
    action: string;
    outcome: 'success' | 'failure' | 'blocked' | 'warning';
    details?: Record<string, unknown>;
    sessionId?: string;
    requestId?: string;
}): Promise<SecurityEvent>;
/**
 * Track a failed authentication attempt
 * Returns true if account should be locked out
 */
export declare function trackFailedAuth(identifier: string, ip?: string, reason?: string, config?: AnomalyConfig): Promise<{
    shouldLock: boolean;
    attemptsRemaining: number;
    lockoutUntil?: Date;
}>;
/**
 * Clear failed attempts after successful auth
 */
export declare function clearFailedAuth(identifier: string, ip?: string): Promise<void>;
/**
 * Check if an identifier is currently locked out
 */
export declare function isLockedOut(identifier: string): {
    locked: boolean;
    remainingMs?: number;
    lockoutUntil?: Date;
};
/**
 * Detect anomalies in authentication behavior
 */
export declare function detectAnomalies(params: {
    userId: string;
    ip?: string;
    userAgent?: string;
    action: string;
    hour?: number;
}): Promise<{
    isAnomalous: boolean;
    reasons: string[];
}>;
/**
 * Record successful authentication
 */
export declare function recordSuccessfulAuth(params: {
    userId: string;
    method: 'jwt' | 'api_key' | 'voice' | 'device' | 'firebase';
    ip?: string;
    userAgent?: string;
    sessionId?: string;
}): Promise<void>;
/**
 * Record sensitive data access
 */
export declare function recordDataAccess(params: {
    userId: string;
    targetUserId: string;
    dataType: 'profile' | 'summaries' | 'moments' | 'voice_sketch' | 'full_export';
    action: 'read' | 'update' | 'delete' | 'export';
    ip?: string;
    sessionId?: string;
}): Promise<void>;
/**
 * Record voice-related security events
 */
export declare function recordVoiceEvent(params: {
    userId: string;
    type: 'enrolled' | 'verified' | 'mismatch' | 'failed';
    confidence?: number;
    ip?: string;
    sessionId?: string;
}): Promise<void>;
/**
 * Get security metrics for monitoring
 */
export declare function getSecurityMetrics(): {
    recentEventsCount: number;
    activeLockedAccounts: number;
    eventsByType: Record<string, number>;
    eventsBySeverity: Record<string, number>;
    last24hFailures: number;
};
/**
 * Get recent events for dashboard/debugging
 */
export declare function getRecentEvents(filter?: Partial<{
    type: SecurityEventType;
    severity: SecuritySeverity;
    actorId: string;
    limit: number;
}>): SecurityEvent[];
/**
 * Agent graceful exit reasons (for pattern tracking)
 */
export type AgentExitReason = 'uncomfortable' | 'boundary_crossed' | 'inappropriate_content' | 'harassment' | 'unproductive' | 'safety_concern';
/**
 * Record an agent-initiated graceful exit event.
 *
 * This tracks when agents choose to end conversations due to
 * discomfort, boundary violations, or safety concerns.
 * Used for:
 * - Pattern detection (same user triggering multiple exits)
 * - Safety monitoring
 * - Quality improvement
 */
export declare function recordAgentGracefulExit(params: {
    userId?: string;
    sessionId?: string;
    personaId?: string;
    reason: AgentExitReason;
    briefNote?: string;
}): Promise<SecurityEvent>;
/**
 * Initialize security events with persistent store
 */
export declare function initializeSecurityEvents(store?: {
    saveEvent: (event: SecurityEvent) => Promise<void>;
    getEvents: (filter: Partial<SecurityEvent>, limit?: number) => Promise<SecurityEvent[]>;
}): void;
/**
 * Cleanup old entries (call periodically)
 */
export declare function cleanupSecurityData(): void;
declare const _default: {
    recordSecurityEvent: typeof recordSecurityEvent;
    recordAgentGracefulExit: typeof recordAgentGracefulExit;
    trackFailedAuth: typeof trackFailedAuth;
    clearFailedAuth: typeof clearFailedAuth;
    isLockedOut: typeof isLockedOut;
    detectAnomalies: typeof detectAnomalies;
    recordSuccessfulAuth: typeof recordSuccessfulAuth;
    recordDataAccess: typeof recordDataAccess;
    recordVoiceEvent: typeof recordVoiceEvent;
    getSecurityMetrics: typeof getSecurityMetrics;
    getRecentEvents: typeof getRecentEvents;
    initializeSecurityEvents: typeof initializeSecurityEvents;
    cleanupSecurityData: typeof cleanupSecurityData;
};
export default _default;
//# sourceMappingURL=security-events.d.ts.map