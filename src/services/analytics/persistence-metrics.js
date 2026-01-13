/**
 * Persistence Metrics & Monitoring
 *
 * Tracks key metrics for the intelligence persistence system to enable
 * observability into how well user learning is working.
 *
 * Metrics tracked:
 * - Profile save/load operations
 * - Intelligence state export/import
 * - Auto-save frequency and success
 * - Session lifecycle events
 * - Data integrity checks
 *
 * @module services/persistence-metrics
 */
import { getLogger } from '../../utils/safe-logger.js';
import { diag } from '../diagnostic-logger.js';
// ============================================================================
// METRICS TRACKER
// ============================================================================
class PersistenceMetricsTracker {
    startTime;
    logger = getLogger();
    // Metric storage
    profileLoads = this.createMetricValue();
    profileSaves = this.createMetricValue();
    profileUpdates = this.createMetricValue();
    intelligenceExports = this.createMetricValue();
    intelligenceImports = this.createMetricValue();
    sessionsStarted = this.createMetricValue();
    sessionsEnded = this.createMetricValue();
    autoSaves = this.createMetricValue();
    handoffs = this.createMetricValue();
    validationErrors = this.createMetricValue();
    dataRecoveries = this.createMetricValue();
    // Active session tracking
    activeSessions = new Map();
    constructor() {
        this.startTime = new Date();
        diag.memory('Persistence metrics tracker initialized');
    }
    createMetricValue() {
        return {
            count: 0,
            lastOccurred: null,
            lastDurationMs: null,
            totalDurationMs: 0,
            errors: 0,
            lastError: null,
        };
    }
    recordMetric(metric, durationMs, error) {
        metric.count++;
        metric.lastOccurred = new Date();
        if (durationMs !== undefined) {
            metric.lastDurationMs = durationMs;
            metric.totalDurationMs += durationMs;
        }
        if (error) {
            metric.errors++;
            metric.lastError = error;
        }
    }
    // ============================================================================
    // PROFILE OPERATIONS
    // ============================================================================
    recordProfileLoad(userId, durationMs, error) {
        this.recordMetric(this.profileLoads, durationMs, error);
        if (error) {
            this.logger.warn({ userId, error, durationMs }, 'Profile load failed');
        }
        else {
            diag.memory('Profile loaded', { userId, durationMs });
        }
    }
    recordProfileSave(userId, durationMs, error) {
        this.recordMetric(this.profileSaves, durationMs, error);
        if (error) {
            this.logger.warn({ userId, error, durationMs }, 'Profile save failed');
        }
        else {
            diag.memory('Profile saved', { userId, durationMs });
        }
    }
    recordProfileUpdate(userId, field, durationMs, error) {
        this.recordMetric(this.profileUpdates, durationMs, error);
        if (error) {
            this.logger.warn({ userId, field, error }, 'Profile update failed');
        }
    }
    // ============================================================================
    // INTELLIGENCE OPERATIONS
    // ============================================================================
    recordIntelligenceExport(userId, engineCount, durationMs, error) {
        this.recordMetric(this.intelligenceExports, durationMs, error);
        // Update active session if exists
        const session = this.findSessionByUser(userId);
        if (session) {
            session.intelligenceExports++;
        }
        if (error) {
            this.logger.warn({ userId, engineCount, error }, 'Intelligence export failed');
        }
        else {
            diag.memory('Intelligence exported', { userId, engineCount, durationMs });
        }
    }
    recordIntelligenceImport(userId, engineCount, durationMs, error) {
        this.recordMetric(this.intelligenceImports, durationMs, error);
        // Update active session if exists
        const session = this.findSessionByUser(userId);
        if (session) {
            session.intelligenceImports++;
        }
        if (error) {
            this.logger.warn({ userId, engineCount, error }, 'Intelligence import failed');
        }
        else {
            diag.memory('Intelligence imported', { userId, engineCount, durationMs });
        }
    }
    // ============================================================================
    // SESSION OPERATIONS
    // ============================================================================
    recordSessionStart(sessionId, userId, personaId) {
        this.recordMetric(this.sessionsStarted);
        const session = {
            sessionId,
            userId,
            personaId,
            startTime: new Date(),
            endTime: null,
            autoSaveCount: 0,
            intelligenceExports: 0,
            intelligenceImports: 0,
            handoffCount: 0,
        };
        this.activeSessions.set(sessionId, session);
        diag.session('Session started (persistence tracking)', {
            sessionId,
            userId,
            personaId,
            activeSessions: this.activeSessions.size,
        });
    }
    recordSessionEnd(sessionId, durationMs, error) {
        this.recordMetric(this.sessionsEnded, durationMs, error);
        const session = this.activeSessions.get(sessionId);
        if (session) {
            session.endTime = new Date();
            diag.session('Session ended (persistence tracking)', {
                sessionId,
                userId: session.userId,
                personaId: session.personaId,
                durationMinutes: Math.round((session.endTime.getTime() - session.startTime.getTime()) / 60000),
                autoSaveCount: session.autoSaveCount,
                intelligenceExports: session.intelligenceExports,
                handoffs: session.handoffCount,
            });
            // Remove from active sessions after a delay (for metrics queries)
            setTimeout(() => {
                this.activeSessions.delete(sessionId);
            }, 60000); // Keep for 1 minute after end
        }
        if (error) {
            this.logger.warn({ sessionId, error }, 'Session end had errors');
        }
    }
    recordAutoSave(sessionId, durationMs, error) {
        this.recordMetric(this.autoSaves, durationMs, error);
        const session = this.activeSessions.get(sessionId);
        if (session) {
            session.autoSaveCount++;
        }
        if (error) {
            this.logger.warn({ sessionId, error, durationMs }, 'Auto-save failed');
        }
    }
    // ============================================================================
    // HANDOFF OPERATIONS
    // ============================================================================
    recordHandoff(sessionId, fromAgent, toAgent, durationMs, error) {
        this.recordMetric(this.handoffs, durationMs, error);
        const session = this.activeSessions.get(sessionId);
        if (session) {
            session.handoffCount++;
            session.personaId = toAgent;
        }
        if (error) {
            this.logger.warn({ sessionId, fromAgent, toAgent, error }, 'Handoff failed');
        }
        else {
            diag.handoff('Handoff recorded', { sessionId, fromAgent, toAgent, durationMs });
        }
    }
    // ============================================================================
    // DATA INTEGRITY
    // ============================================================================
    recordValidationError(userId, field, error) {
        this.recordMetric(this.validationErrors, undefined, error);
        this.logger.warn({ userId, field, error }, 'Data validation error');
    }
    recordDataRecovery(userId, recoveredFields, durationMs) {
        this.recordMetric(this.dataRecoveries, durationMs);
        this.logger.info({ userId, recoveredFields, durationMs }, 'Data recovered');
    }
    // ============================================================================
    // HELPERS
    // ============================================================================
    findSessionByUser(userId) {
        for (const session of this.activeSessions.values()) {
            if (session.userId === userId) {
                return session;
            }
        }
        return undefined;
    }
    // ============================================================================
    // SNAPSHOT & REPORTING
    // ============================================================================
    getSnapshot() {
        const now = new Date();
        return {
            timestamp: now,
            uptime: now.getTime() - this.startTime.getTime(),
            profileLoads: { ...this.profileLoads },
            profileSaves: { ...this.profileSaves },
            profileUpdates: { ...this.profileUpdates },
            intelligenceExports: { ...this.intelligenceExports },
            intelligenceImports: { ...this.intelligenceImports },
            sessionsStarted: { ...this.sessionsStarted },
            sessionsEnded: { ...this.sessionsEnded },
            autoSaves: { ...this.autoSaves },
            handoffs: { ...this.handoffs },
            validationErrors: { ...this.validationErrors },
            dataRecoveries: { ...this.dataRecoveries },
            activeSessions: this.activeSessions.size,
            currentSessions: Array.from(this.activeSessions.values()).map((s) => ({ ...s })),
        };
    }
    /**
     * Get a summary report suitable for logging
     */
    getSummaryReport() {
        const snapshot = this.getSnapshot();
        const uptimeHours = Math.round((snapshot.uptime / 3600000) * 10) / 10;
        return {
            uptimeHours,
            activeSessions: snapshot.activeSessions,
            profiles: {
                loads: snapshot.profileLoads.count,
                saves: snapshot.profileSaves.count,
                updates: snapshot.profileUpdates.count,
                loadErrors: snapshot.profileLoads.errors,
                saveErrors: snapshot.profileSaves.errors,
                avgLoadMs: snapshot.profileLoads.count > 0
                    ? Math.round(snapshot.profileLoads.totalDurationMs / snapshot.profileLoads.count)
                    : 0,
                avgSaveMs: snapshot.profileSaves.count > 0
                    ? Math.round(snapshot.profileSaves.totalDurationMs / snapshot.profileSaves.count)
                    : 0,
            },
            intelligence: {
                exports: snapshot.intelligenceExports.count,
                imports: snapshot.intelligenceImports.count,
                exportErrors: snapshot.intelligenceExports.errors,
                importErrors: snapshot.intelligenceImports.errors,
            },
            sessions: {
                started: snapshot.sessionsStarted.count,
                ended: snapshot.sessionsEnded.count,
                autoSaves: snapshot.autoSaves.count,
                autoSaveErrors: snapshot.autoSaves.errors,
            },
            handoffs: {
                total: snapshot.handoffs.count,
                errors: snapshot.handoffs.errors,
                avgDurationMs: snapshot.handoffs.count > 0
                    ? Math.round(snapshot.handoffs.totalDurationMs / snapshot.handoffs.count)
                    : 0,
            },
            dataIntegrity: {
                validationErrors: snapshot.validationErrors.count,
                recoveries: snapshot.dataRecoveries.count,
            },
        };
    }
    /**
     * Log current metrics summary
     */
    logSummary() {
        const report = this.getSummaryReport();
        this.logger.info(report, 'Persistence metrics summary');
        diag.perf('📊 Persistence Metrics', report);
    }
    /**
     * Reset all metrics (useful for testing)
     */
    reset() {
        this.profileLoads = this.createMetricValue();
        this.profileSaves = this.createMetricValue();
        this.profileUpdates = this.createMetricValue();
        this.intelligenceExports = this.createMetricValue();
        this.intelligenceImports = this.createMetricValue();
        this.sessionsStarted = this.createMetricValue();
        this.sessionsEnded = this.createMetricValue();
        this.autoSaves = this.createMetricValue();
        this.handoffs = this.createMetricValue();
        this.validationErrors = this.createMetricValue();
        this.dataRecoveries = this.createMetricValue();
        this.activeSessions.clear();
        this.startTime = new Date();
        diag.memory('Persistence metrics reset');
    }
}
// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
export const persistenceMetrics = new PersistenceMetricsTracker();
// ============================================================================
// TIMING HELPERS
// ============================================================================
/**
 * Helper to time an operation and record its metrics
 */
export async function withMetrics(operation, fn, onComplete) {
    const start = Date.now();
    try {
        const result = await fn();
        onComplete(Date.now() - start);
        return result;
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        onComplete(Date.now() - start, errorMsg);
        throw error;
    }
}
/**
 * Helper for synchronous operations
 */
export function withMetricsSync(operation, fn, onComplete) {
    const start = Date.now();
    try {
        const result = fn();
        onComplete(Date.now() - start);
        return result;
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        onComplete(Date.now() - start, errorMsg);
        throw error;
    }
}
//# sourceMappingURL=persistence-metrics.js.map