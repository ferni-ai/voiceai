/**
 * Memory Monitor Service
 *
 * Comprehensive memory and cache monitoring with:
 * - Real-time heap usage tracking
 * - Per-service cache statistics
 * - Memory pressure detection and alerts
 * - Automatic emergency cleanup
 * - Prometheus-compatible metrics export
 *
 * @module services/memory-monitor
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'MemoryMonitor' });

// ============================================================================
// TYPES
// ============================================================================

export interface MemoryMetrics {
  timestamp: Date;
  heap: {
    usedMB: number;
    totalMB: number;
    percentUsed: number;
    external: number;
    arrayBuffers: number;
  };
  rss: number;
  caches: Array<{
    name: string;
    users: number;
    entries: number;
    sizeEstimate?: number;
  }>;
  sessions: {
    active: number;
    totalTracked: number;
  };
  pressure: {
    level: 'normal' | 'elevated' | 'high' | 'critical';
    shouldCleanup: boolean;
    lastCleanup: Date | null;
  };
}

export interface MemoryAlert {
  level: 'warning' | 'critical';
  message: string;
  heapUsedMB: number;
  heapPercentUsed: number;
  timestamp: Date;
}

export interface MemoryMonitorConfig {
  /** Check interval in ms */
  checkIntervalMs: number;
  /** Warning threshold (percent of heap) */
  warningThreshold: number;
  /** Critical threshold (percent of heap) */
  criticalThreshold: number;
  /** Auto-cleanup threshold (percent of heap) */
  autoCleanupThreshold: number;
  /** Enable auto-cleanup */
  autoCleanup: boolean;
  /** Alert callback */
  onAlert?: (alert: MemoryAlert) => void;
}

// ============================================================================
// MEMORY MONITOR IMPLEMENTATION
// ============================================================================

export class MemoryMonitor {
  private config: MemoryMonitorConfig;
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  private lastCleanup: Date | null = null;
  private alertHistory: MemoryAlert[] = [];
  private metricsHistory: MemoryMetrics[] = [];
  private maxHistoryLength = 100;
  private cleanupInProgress = false;

  constructor(config?: Partial<MemoryMonitorConfig>) {
    this.config = {
      checkIntervalMs: config?.checkIntervalMs ?? 30000, // 30 seconds
      warningThreshold: config?.warningThreshold ?? 70,
      criticalThreshold: config?.criticalThreshold ?? 85,
      autoCleanupThreshold: config?.autoCleanupThreshold ?? 80,
      autoCleanup: config?.autoCleanup ?? true,
      onAlert: config?.onAlert,
    };
  }

  /**
   * Start monitoring
   */
  start(): void {
    if (this.checkTimer) {
      return; // Already running
    }

    log.info({ config: this.config }, '🔍 Memory monitor started');

    // Initial check (fire and forget, errors are logged internally)
    void this.check();

    // Schedule periodic checks
    this.checkTimer = setInterval(() => {
      void this.check();
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
      log.info('Memory monitor stopped');
    }
  }

  /**
   * Get current metrics
   */
  async getMetrics(): Promise<MemoryMetrics> {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
    const percentUsed = (heapUsedMB / heapTotalMB) * 100;

    // Get cache statistics
    const cacheStats = await this.collectCacheStats();

    // Determine pressure level
    const pressure = this.determinePressureLevel(percentUsed);

    const metrics: MemoryMetrics = {
      timestamp: new Date(),
      heap: {
        usedMB: Math.round(heapUsedMB * 100) / 100,
        totalMB: Math.round(heapTotalMB * 100) / 100,
        percentUsed: Math.round(percentUsed * 100) / 100,
        external: Math.round((memUsage.external / 1024 / 1024) * 100) / 100,
        arrayBuffers: Math.round((memUsage.arrayBuffers / 1024 / 1024) * 100) / 100,
      },
      rss: Math.round((memUsage.rss / 1024 / 1024) * 100) / 100,
      caches: cacheStats,
      sessions: await this.getSessionStats(),
      pressure: {
        ...pressure,
        lastCleanup: this.lastCleanup,
      },
    };

    return metrics;
  }

  /**
   * Get metrics history
   */
  getHistory(): MemoryMetrics[] {
    return [...this.metricsHistory];
  }

  /**
   * Get alert history
   */
  getAlerts(): MemoryAlert[] {
    return [...this.alertHistory];
  }

  /**
   * Force a cleanup
   */
  async forceCleanup(): Promise<{ cleaned: number; freedMB: number }> {
    return this.runCleanup('manual');
  }

  /**
   * Export metrics in Prometheus format
   */
  async exportPrometheus(): Promise<string> {
    const metrics = await this.getMetrics();
    const lines: string[] = [];

    // Heap metrics
    lines.push('# HELP ferni_heap_used_bytes Heap memory used in bytes');
    lines.push('# TYPE ferni_heap_used_bytes gauge');
    lines.push(`ferni_heap_used_bytes ${metrics.heap.usedMB * 1024 * 1024}`);

    lines.push('# HELP ferni_heap_total_bytes Total heap memory in bytes');
    lines.push('# TYPE ferni_heap_total_bytes gauge');
    lines.push(`ferni_heap_total_bytes ${metrics.heap.totalMB * 1024 * 1024}`);

    lines.push('# HELP ferni_heap_percent_used Heap memory usage percentage');
    lines.push('# TYPE ferni_heap_percent_used gauge');
    lines.push(`ferni_heap_percent_used ${metrics.heap.percentUsed}`);

    lines.push('# HELP ferni_rss_bytes Resident Set Size in bytes');
    lines.push('# TYPE ferni_rss_bytes gauge');
    lines.push(`ferni_rss_bytes ${metrics.rss * 1024 * 1024}`);

    // Cache metrics
    lines.push('# HELP ferni_cache_entries Number of entries in cache');
    lines.push('# TYPE ferni_cache_entries gauge');
    for (const cache of metrics.caches) {
      lines.push(`ferni_cache_entries{name="${cache.name}"} ${cache.entries}`);
    }

    lines.push('# HELP ferni_cache_users Number of users with cached data');
    lines.push('# TYPE ferni_cache_users gauge');
    for (const cache of metrics.caches) {
      lines.push(`ferni_cache_users{name="${cache.name}"} ${cache.users}`);
    }

    // Session metrics
    lines.push('# HELP ferni_sessions_active Number of active sessions');
    lines.push('# TYPE ferni_sessions_active gauge');
    lines.push(`ferni_sessions_active ${metrics.sessions.active}`);

    // Pressure level (0=normal, 1=elevated, 2=high, 3=critical)
    const pressureLevels = { normal: 0, elevated: 1, high: 2, critical: 3 };
    lines.push('# HELP ferni_memory_pressure Memory pressure level (0-3)');
    lines.push('# TYPE ferni_memory_pressure gauge');
    lines.push(`ferni_memory_pressure ${pressureLevels[metrics.pressure.level]}`);

    return lines.join('\n');
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async check(): Promise<void> {
    try {
      const metrics = await this.getMetrics();

      // Store in history
      this.metricsHistory.push(metrics);
      if (this.metricsHistory.length > this.maxHistoryLength) {
        this.metricsHistory.shift();
      }

      // Check for alerts
      if (metrics.heap.percentUsed >= this.config.criticalThreshold) {
        this.raiseAlert('critical', metrics);
      } else if (metrics.heap.percentUsed >= this.config.warningThreshold) {
        this.raiseAlert('warning', metrics);
      }

      // Auto-cleanup if enabled
      if (this.config.autoCleanup && metrics.pressure.shouldCleanup && !this.cleanupInProgress) {
        log.warn(
          { heapPercent: metrics.heap.percentUsed },
          '⚠️ Memory pressure elevated, triggering auto-cleanup'
        );
        await this.runCleanup('auto');
      }

      // Log periodic status (every 10 checks = ~5 minutes)
      if (this.metricsHistory.length % 10 === 0) {
        log.info(
          {
            heapMB: metrics.heap.usedMB,
            heapPercent: metrics.heap.percentUsed,
            caches: metrics.caches.length,
            sessions: metrics.sessions.active,
            pressure: metrics.pressure.level,
          },
          '📊 Memory status'
        );
      }
    } catch (error) {
      log.error({ error: String(error) }, 'Memory check failed');
    }
  }

  private determinePressureLevel(percentUsed: number): {
    level: 'normal' | 'elevated' | 'high' | 'critical';
    shouldCleanup: boolean;
  } {
    if (percentUsed >= this.config.criticalThreshold) {
      return { level: 'critical', shouldCleanup: true };
    }
    if (percentUsed >= this.config.autoCleanupThreshold) {
      return { level: 'high', shouldCleanup: true };
    }
    if (percentUsed >= this.config.warningThreshold) {
      return { level: 'elevated', shouldCleanup: false };
    }
    return { level: 'normal', shouldCleanup: false };
  }

  private raiseAlert(level: 'warning' | 'critical', metrics: MemoryMetrics): void {
    const alert: MemoryAlert = {
      level,
      message: `Memory ${level}: ${metrics.heap.percentUsed.toFixed(1)}% heap used (${metrics.heap.usedMB.toFixed(0)}MB)`,
      heapUsedMB: metrics.heap.usedMB,
      heapPercentUsed: metrics.heap.percentUsed,
      timestamp: new Date(),
    };

    this.alertHistory.push(alert);
    if (this.alertHistory.length > 50) {
      this.alertHistory.shift();
    }

    log.warn({ alert }, `🚨 Memory ${level} alert`);

    if (this.config.onAlert) {
      try {
        this.config.onAlert(alert);
      } catch (error) {
        log.error({ error: String(error) }, 'Alert callback failed');
      }
    }
  }

  private async runCleanup(
    trigger: 'auto' | 'manual'
  ): Promise<{ cleaned: number; freedMB: number }> {
    if (this.cleanupInProgress) {
      return { cleaned: 0, freedMB: 0 };
    }

    this.cleanupInProgress = true;
    const startHeap = process.memoryUsage().heapUsed;
    let cleaned = 0;

    try {
      log.info({ trigger }, '🧹 Running memory cleanup...');

      // 1. Force garbage collection if available
      if (global.gc) {
        global.gc();
        log.debug('Forced garbage collection');
      }

      // 2. Clear session data manager stale sessions
      try {
        const { getSessionDataManager } = await import('../session-data-manager.js');
        const sdm = getSessionDataManager();
        const evicted = await sdm.evictStaleSessions();
        cleaned += evicted;
      } catch {
        // Session data manager not initialized
      }

      // 3. Clear context builder caches
      try {
        const { clearContextOutputCache } =
          await import('../../intelligence/context-builders/index.js');
        clearContextOutputCache();
        cleaned++;
      } catch {
        // Not loaded
      }

      // 4. Clear topic tracking for old data
      try {
        const { clearAllTopicHistory } = await import('../topic-tracking.js');
        clearAllTopicHistory(); // sync function
        cleaned++;
      } catch {
        // Not loaded or function doesn't exist
      }

      // 5. Prune outreach data
      try {
        const { pruneStaleOutreachData } = await import('../outreach-intelligence.js');
        pruneStaleOutreachData(7 * 24 * 60 * 60 * 1000); // 7 days
        cleaned++;
      } catch {
        // Not loaded
      }

      // 6. Run another GC after cleanup
      if (global.gc) {
        global.gc();
      }

      this.lastCleanup = new Date();

      const endHeap = process.memoryUsage().heapUsed;
      const freedMB = (startHeap - endHeap) / 1024 / 1024;

      log.info(
        {
          trigger,
          cleaned,
          freedMB: Math.round(freedMB * 100) / 100,
          heapAfter: Math.round((endHeap / 1024 / 1024) * 100) / 100,
        },
        '✅ Memory cleanup complete'
      );

      return { cleaned, freedMB: Math.max(0, freedMB) };
    } finally {
      this.cleanupInProgress = false;
    }
  }

  private async collectCacheStats(): Promise<MemoryMetrics['caches']> {
    const stats: MemoryMetrics['caches'] = [];

    // SessionDataManager stats
    try {
      const { getSessionDataManager } = await import('../session-data-manager.js');
      const sdmStats = getSessionDataManager().getStats();
      for (const [name, serviceStats] of Object.entries(sdmStats.services)) {
        stats.push({
          name: `sdm:${name}`,
          users: serviceStats.users,
          entries: serviceStats.entries,
          sizeEstimate: serviceStats.sizeEstimate,
        });
      }
    } catch {
      // Not loaded
    }

    // Session caches
    try {
      const { getAllCacheStats } = await import('../stores/session-cache.js');
      const cacheStats = getAllCacheStats();
      stats.push({
        name: 'session:productivity',
        users: 0,
        entries: cacheStats.productivity.size,
      });
      stats.push({
        name: 'session:context',
        users: 0,
        entries: cacheStats.context.size,
      });
      stats.push({
        name: 'session:userData',
        users: 0,
        entries: cacheStats.userData.size,
      });
    } catch {
      // Not loaded
    }

    // Global session registries
    try {
      const { getGlobalRegistryStats } = await import('../../utils/session-registry.js');
      const registryStats = getGlobalRegistryStats();
      for (const reg of registryStats) {
        stats.push({
          name: `registry:${reg.name}`,
          users: reg.activeCount,
          entries: reg.activeCount,
        });
      }
    } catch {
      // Not loaded
    }

    return stats;
  }

  private async getSessionStats(): Promise<MemoryMetrics['sessions']> {
    try {
      const { getSessionDataManager } = await import('../session-data-manager.js');
      const stats = getSessionDataManager().getStats();
      return {
        active: stats.activeSessions,
        totalTracked: stats.activeSessions,
      };
    } catch {
      return { active: 0, totalTracked: 0 };
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let monitor: MemoryMonitor | null = null;

/**
 * Get the memory monitor singleton
 */
export function getMemoryMonitor(): MemoryMonitor {
  if (!monitor) {
    monitor = new MemoryMonitor();
  }
  return monitor;
}

/**
 * Start memory monitoring
 */
export function startMemoryMonitoring(config?: Partial<MemoryMonitorConfig>): void {
  if (monitor) {
    monitor.stop();
  }
  monitor = new MemoryMonitor(config);
  monitor.start();
}

/**
 * Stop memory monitoring
 */
export function stopMemoryMonitoring(): void {
  if (monitor) {
    monitor.stop();
  }
}

/**
 * Get current memory metrics
 */
export async function getMemoryMetrics(): Promise<MemoryMetrics> {
  return getMemoryMonitor().getMetrics();
}

/**
 * Export Prometheus metrics
 */
export async function exportPrometheusMetrics(): Promise<string> {
  return getMemoryMonitor().exportPrometheus();
}
