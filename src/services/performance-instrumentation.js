/**
 * Performance Instrumentation Service
 *
 * Tracks memory usage, startup timings, and tool loading metrics.
 * Use this to understand the runtime footprint of the voice agent.
 *
 * USAGE:
 *   import { perfInstrumentation } from './performance-instrumentation.js';
 *
 *   // Track a phase
 *   perfInstrumentation.startPhase('tool-init');
 *   await initializeTools();
 *   perfInstrumentation.endPhase('tool-init');
 *
 *   // Snapshot memory
 *   perfInstrumentation.snapshotMemory('after-tool-init');
 *
 *   // Get report
 *   const report = perfInstrumentation.getReport();
 */
import { getLogger } from '../utils/safe-logger.js';
import { registerInterval, clearNamedInterval, hasInterval } from '../utils/interval-manager.js';
const log = getLogger();
/** Interval name for performance instrumentation checks */
const PERF_INSTRUMENTATION_INTERVAL = 'perf-instrumentation-check';
const DEFAULT_ALERT_CONFIG = {
    warningThresholdMB: 1024, // 1 GB
    criticalThresholdMB: 1536, // 1.5 GB
    checkIntervalMs: 30000, // 30 seconds
    enableAutoCheck: true,
};
// ============================================================================
// PERFORMANCE INSTRUMENTATION CLASS
// ============================================================================
export class PerformanceInstrumentation {
    startupTime;
    memorySnapshots = [];
    peakMemory = null;
    phases = new Map();
    completedPhases = [];
    toolLoadMetrics = [];
    lazyLoadedDomains = 0;
    eagerLoadedDomains = 0;
    // Memory alert state
    alertConfig = { ...DEFAULT_ALERT_CONFIG };
    memoryAlerts = [];
    // Bounds to prevent unbounded memory growth in long-running processes
    static MAX_MEMORY_SNAPSHOTS = 1000;
    static MAX_COMPLETED_PHASES = 500;
    static MAX_TOOL_LOAD_METRICS = 200;
    static MAX_MEMORY_ALERTS = 100;
    lastAlertLevel = 'none';
    constructor() {
        this.startupTime = new Date();
        // Take initial memory snapshot
        this.snapshotMemory('startup');
    }
    // ==========================================================================
    // MEMORY TRACKING
    // ==========================================================================
    /**
     * Take a memory snapshot with a label
     */
    snapshotMemory(label) {
        const memUsage = process.memoryUsage();
        const snapshot = {
            timestamp: new Date(),
            label,
            heapUsedMB: Math.round((memUsage.heapUsed / 1024 / 1024) * 100) / 100,
            heapTotalMB: Math.round((memUsage.heapTotal / 1024 / 1024) * 100) / 100,
            rssMB: Math.round((memUsage.rss / 1024 / 1024) * 100) / 100,
            externalMB: Math.round((memUsage.external / 1024 / 1024) * 100) / 100,
            arrayBuffersMB: Math.round((memUsage.arrayBuffers / 1024 / 1024) * 100) / 100,
        };
        this.memorySnapshots.push(snapshot);
        // Evict oldest snapshots to prevent unbounded growth
        if (this.memorySnapshots.length > PerformanceInstrumentation.MAX_MEMORY_SNAPSHOTS) {
            this.memorySnapshots.shift();
        }
        // Update peak if this is higher
        if (!this.peakMemory || snapshot.heapUsedMB > this.peakMemory.heapUsedMB) {
            this.peakMemory = snapshot;
        }
        log.debug({
            label,
            heapUsedMB: snapshot.heapUsedMB,
            rssMB: snapshot.rssMB,
        }, '📊 Memory snapshot');
        return snapshot;
    }
    /**
     * Get current memory usage
     */
    getCurrentMemory() {
        return this.snapshotMemory('current');
    }
    // ==========================================================================
    // PHASE TRACKING
    // ==========================================================================
    /**
     * Start timing a phase
     */
    startPhase(name, metadata) {
        const phase = {
            name,
            startTime: Date.now(),
            metadata,
        };
        this.phases.set(name, phase);
        log.debug({ phase: name }, '⏱️ Phase started');
    }
    /**
     * End timing a phase
     */
    endPhase(name, additionalMetadata) {
        const phase = this.phases.get(name);
        if (!phase) {
            log.warn({ phase: name }, 'Attempted to end unknown phase');
            return 0;
        }
        phase.endTime = Date.now();
        phase.durationMs = phase.endTime - phase.startTime;
        if (additionalMetadata) {
            phase.metadata = { ...phase.metadata, ...additionalMetadata };
        }
        this.completedPhases.push(phase);
        // Evict oldest phases to prevent unbounded growth
        if (this.completedPhases.length > PerformanceInstrumentation.MAX_COMPLETED_PHASES) {
            this.completedPhases.shift();
        }
        this.phases.delete(name);
        log.debug({
            phase: name,
            durationMs: phase.durationMs,
        }, '⏱️ Phase completed');
        return phase.durationMs;
    }
    /**
     * Wrap an async function with phase timing
     */
    async timePhase(name, fn, metadata) {
        this.startPhase(name, metadata);
        try {
            const result = await fn();
            this.endPhase(name, { success: true });
            return result;
        }
        catch (error) {
            this.endPhase(name, { success: false, error: String(error) });
            throw error;
        }
    }
    // ==========================================================================
    // TOOL LOADING METRICS
    // ==========================================================================
    /**
     * Record tool domain loading metrics
     */
    recordToolLoad(domain, toolCount, loadTimeMs, isLazy) {
        this.toolLoadMetrics.push({
            domain,
            toolCount,
            loadTimeMs,
            loadedAt: new Date(),
        });
        // Evict oldest metrics to prevent unbounded growth
        if (this.toolLoadMetrics.length > PerformanceInstrumentation.MAX_TOOL_LOAD_METRICS) {
            this.toolLoadMetrics.shift();
        }
        if (isLazy) {
            this.lazyLoadedDomains++;
        }
        else {
            this.eagerLoadedDomains++;
        }
        log.debug({
            domain,
            toolCount,
            loadTimeMs,
            isLazy,
        }, '🔧 Tool domain loaded');
    }
    // ==========================================================================
    // REPORTING
    // ==========================================================================
    /**
     * Get a comprehensive performance report
     */
    getReport() {
        const currentMemory = this.getCurrentMemory();
        const startupMemory = this.memorySnapshots[0] || currentMemory;
        // Calculate tool loading totals
        const totalTools = this.toolLoadMetrics.reduce((sum, m) => sum + m.toolCount, 0);
        const totalLoadTimeMs = this.toolLoadMetrics.reduce((sum, m) => sum + m.loadTimeMs, 0);
        // Find slowest phases
        const slowestPhases = [...this.completedPhases]
            .sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0))
            .slice(0, 5)
            .map((p) => ({ name: p.name, durationMs: p.durationMs || 0 }));
        // Build critical path (phases that took > 100ms)
        const criticalPath = this.completedPhases
            .filter((p) => (p.durationMs || 0) > 100)
            .map((p) => `${p.name} (${p.durationMs}ms)`);
        return {
            startupTime: this.startupTime,
            currentTime: new Date(),
            uptimeMs: Date.now() - this.startupTime.getTime(),
            memory: {
                current: currentMemory,
                peak: this.peakMemory || currentMemory,
                snapshots: this.memorySnapshots,
            },
            phases: this.completedPhases,
            toolLoading: {
                totalDomains: this.toolLoadMetrics.length,
                totalTools,
                totalLoadTimeMs,
                byDomain: this.toolLoadMetrics,
                lazyLoaded: this.lazyLoadedDomains,
                eagerLoaded: this.eagerLoadedDomains,
            },
            summary: {
                criticalPath,
                slowestPhases,
                memoryDeltaMB: Math.round((currentMemory.heapUsedMB - startupMemory.heapUsedMB) * 100) / 100,
            },
        };
    }
    /**
     * Get a concise summary for logging
     */
    getSummary() {
        const current = this.getCurrentMemory();
        return {
            uptimeMin: Math.round(((Date.now() - this.startupTime.getTime()) / 60000) * 10) / 10,
            heapUsedMB: current.heapUsedMB,
            peakHeapMB: this.peakMemory?.heapUsedMB || current.heapUsedMB,
            toolsLoaded: this.toolLoadMetrics.reduce((sum, m) => sum + m.toolCount, 0),
            domainsLoaded: this.toolLoadMetrics.length,
            lazyLoadedDomains: this.lazyLoadedDomains,
        };
    }
    /**
     * Log a performance summary
     */
    logSummary() {
        const summary = this.getSummary();
        log.info(summary, '📊 Performance summary');
    }
    // ==========================================================================
    // MEMORY ALERTS
    // ==========================================================================
    /**
     * Configure memory alert thresholds
     */
    configureAlerts(config) {
        this.alertConfig = { ...this.alertConfig, ...config };
        log.info({
            warningMB: this.alertConfig.warningThresholdMB,
            criticalMB: this.alertConfig.criticalThresholdMB,
            autoCheck: this.alertConfig.enableAutoCheck,
        }, '⚙️ Memory alert thresholds configured');
    }
    /**
     * Start automatic memory monitoring
     */
    startAutoMonitoring() {
        if (hasInterval(PERF_INSTRUMENTATION_INTERVAL)) {
            return; // Already running
        }
        registerInterval(PERF_INSTRUMENTATION_INTERVAL, () => {
            this.checkMemoryThresholds();
        }, this.alertConfig.checkIntervalMs);
        log.info({ intervalMs: this.alertConfig.checkIntervalMs }, '🔍 Automatic memory monitoring started');
    }
    /**
     * Stop automatic memory monitoring
     */
    stopAutoMonitoring() {
        clearNamedInterval(PERF_INSTRUMENTATION_INTERVAL);
        log.info('⏹️ Automatic memory monitoring stopped');
    }
    /**
     * Check memory against thresholds and create alerts if needed
     */
    checkMemoryThresholds() {
        const current = this.getCurrentMemory();
        const { heapUsedMB } = current;
        // Check critical first
        if (heapUsedMB >= this.alertConfig.criticalThresholdMB) {
            if (this.lastAlertLevel !== 'critical') {
                const alert = this.createAlert('critical', heapUsedMB, this.alertConfig.criticalThresholdMB);
                this.lastAlertLevel = 'critical';
                return alert;
            }
        }
        else if (heapUsedMB >= this.alertConfig.warningThresholdMB) {
            if (this.lastAlertLevel === 'none') {
                const alert = this.createAlert('warning', heapUsedMB, this.alertConfig.warningThresholdMB);
                this.lastAlertLevel = 'warning';
                return alert;
            }
        }
        else {
            // Memory is below thresholds, reset alert level
            if (this.lastAlertLevel !== 'none') {
                log.info({ heapUsedMB, thresholdMB: this.alertConfig.warningThresholdMB }, '✅ Memory returned below warning threshold');
                this.lastAlertLevel = 'none';
            }
        }
        return null;
    }
    /**
     * Create and log a memory alert
     */
    createAlert(level, heapUsedMB, thresholdMB) {
        const alert = {
            id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            level,
            heapUsedMB,
            thresholdMB,
            message: `Memory ${level}: ${heapUsedMB.toFixed(1)}MB exceeds ${thresholdMB}MB threshold`,
            timestamp: new Date(),
            acknowledged: false,
        };
        this.memoryAlerts.push(alert);
        // Keep only last N alerts to prevent unbounded growth
        if (this.memoryAlerts.length > PerformanceInstrumentation.MAX_MEMORY_ALERTS) {
            this.memoryAlerts = this.memoryAlerts.slice(-PerformanceInstrumentation.MAX_MEMORY_ALERTS);
        }
        // Log the alert
        if (level === 'critical') {
            log.error({
                alertId: alert.id,
                heapUsedMB,
                thresholdMB,
                rssMB: this.getCurrentMemory().rssMB,
            }, '🚨 CRITICAL: Memory threshold exceeded!');
        }
        else {
            log.warn({
                alertId: alert.id,
                heapUsedMB,
                thresholdMB,
            }, '⚠️ WARNING: Memory threshold exceeded');
        }
        return alert;
    }
    /**
     * Get all memory alerts
     */
    getAlerts() {
        return [...this.memoryAlerts];
    }
    /**
     * Get active (unacknowledged) alerts
     */
    getActiveAlerts() {
        return this.memoryAlerts.filter((a) => !a.acknowledged);
    }
    /**
     * Acknowledge an alert
     */
    acknowledgeAlert(alertId) {
        const alert = this.memoryAlerts.find((a) => a.id === alertId);
        if (alert) {
            alert.acknowledged = true;
            log.info({ alertId }, '✓ Alert acknowledged');
            return true;
        }
        return false;
    }
    /**
     * Clear all alerts
     */
    clearAlerts() {
        this.memoryAlerts = [];
        this.lastAlertLevel = 'none';
        log.info('🧹 All alerts cleared');
    }
    /**
     * Get current alert configuration
     */
    getAlertConfig() {
        return { ...this.alertConfig };
    }
    /**
     * Reset all metrics (for testing)
     */
    reset() {
        this.startupTime = new Date();
        this.memorySnapshots = [];
        this.peakMemory = null;
        this.phases.clear();
        this.completedPhases = [];
        this.toolLoadMetrics = [];
        this.lazyLoadedDomains = 0;
        this.eagerLoadedDomains = 0;
        this.memoryAlerts = [];
        this.lastAlertLevel = 'none';
        this.stopAutoMonitoring();
        this.snapshotMemory('reset');
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
export const perfInstrumentation = new PerformanceInstrumentation();
export default perfInstrumentation;
//# sourceMappingURL=performance-instrumentation.js.map