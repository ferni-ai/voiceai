/**
 * Insights Broadcast Service
 *
 * Real-time broadcast of cross-persona insights to connected clients.
 * Similar to CognitiveBroadcast but focused on team intelligence.
 *
 * Provides:
 * - Real-time notification when new high-priority insights are detected
 * - WebSocket streaming to connected frontend clients
 * - Background scanning and detection of new patterns
 *
 * @module services/insights-broadcast
 */

import { EventEmitter } from 'events';
import { createLogger } from '../utils/safe-logger.js';
import {
  scanForCrossPersonaInsights,
  getProactiveInsights,
  type CrossPersonaInsight,
} from './cross-persona-insights.js';

const log = createLogger({ module: 'InsightsBroadcast' });

// ============================================================================
// TYPES
// ============================================================================

export interface InsightBroadcastEvent {
  type: 'new_insight' | 'insight_batch' | 'scan_complete' | 'heartbeat';
  userId: string;
  insights?: CrossPersonaInsight[];
  insight?: CrossPersonaInsight;
  timestamp: number;
  scanDuration?: number;
}

export type InsightBroadcastListener = (event: InsightBroadcastEvent) => void;

// ============================================================================
// INSIGHTS BROADCAST CLASS
// ============================================================================

class InsightsBroadcast extends EventEmitter {
  private userLastScan = new Map<string, number>();
  private userKnownInsights = new Map<string, Set<string>>(); // userId -> Set of known insight IDs
  private scanIntervals = new Map<string, NodeJS.Timeout>();
  private readonly scanIntervalMs = 5 * 60 * 1000; // 5 minutes
  private readonly minScanGapMs = 60 * 1000; // 1 minute minimum between scans

  constructor() {
    super();
    log.info('InsightsBroadcast service initialized');
  }

  /**
   * Subscribe to insight broadcasts
   */
  subscribe(listener: InsightBroadcastListener): () => void {
    this.on('broadcast', listener);
    return () => this.off('broadcast', listener);
  }

  /**
   * Start real-time monitoring for a user
   */
  startMonitoring(userId: string): void {
    if (this.scanIntervals.has(userId)) {
      log.debug({ userId }, 'Already monitoring user');
      return;
    }

    log.info({ userId }, 'Starting insight monitoring');

    // Initialize known insights
    this.userKnownInsights.set(userId, new Set());

    // Do an initial scan
    void this.scanUserInsights(userId);

    // Set up periodic scanning
    const interval = setInterval(() => {
      void this.scanUserInsights(userId);
    }, this.scanIntervalMs);

    this.scanIntervals.set(userId, interval);
  }

  /**
   * Stop real-time monitoring for a user
   */
  stopMonitoring(userId: string): void {
    const interval = this.scanIntervals.get(userId);
    if (interval) {
      clearInterval(interval);
      this.scanIntervals.delete(userId);
      this.userKnownInsights.delete(userId);
      this.userLastScan.delete(userId);
      log.info({ userId }, 'Stopped insight monitoring');
    }
  }

  /**
   * Manually trigger a scan for a user
   */
  async triggerScan(userId: string): Promise<CrossPersonaInsight[]> {
    const lastScan = this.userLastScan.get(userId);
    const now = Date.now();

    // Throttle scans
    if (lastScan !== undefined && now - lastScan < this.minScanGapMs) {
      log.debug({ userId, lastScan, now }, 'Scan throttled');
      return getProactiveInsights(userId);
    }

    return this.scanUserInsights(userId);
  }

  /**
   * Internal: Scan for new insights and broadcast if found
   */
  private async scanUserInsights(userId: string): Promise<CrossPersonaInsight[]> {
    const startTime = Date.now();

    try {
      // Run the cross-persona insight scan
      await scanForCrossPersonaInsights(userId);

      // Get current proactive insights
      const currentInsights = getProactiveInsights(userId);
      const knownInsights = this.userKnownInsights.get(userId) || new Set();

      // Find new insights
      const newInsights = currentInsights.filter((i) => !knownInsights.has(i.id));

      // Update known insights
      currentInsights.forEach((i) => knownInsights.add(i.id));
      this.userKnownInsights.set(userId, knownInsights);
      this.userLastScan.set(userId, Date.now());

      const scanDuration = Date.now() - startTime;

      // Broadcast new high-priority insights individually
      for (const insight of newInsights) {
        if (insight.priority === 'high' || insight.priority === 'critical') {
          this.broadcast({
            type: 'new_insight',
            userId,
            insight,
            timestamp: Date.now(),
          });
        }
      }

      // Broadcast scan completion with all new insights
      if (newInsights.length > 0) {
        this.broadcast({
          type: 'insight_batch',
          userId,
          insights: newInsights,
          timestamp: Date.now(),
          scanDuration,
        });
      }

      log.debug(
        { userId, total: currentInsights.length, new: newInsights.length, scanDuration },
        'Insight scan complete'
      );

      return currentInsights;
    } catch (error) {
      log.error({ error, userId }, 'Error scanning insights');
      return [];
    }
  }

  /**
   * Emit a broadcast event
   */
  private broadcast(event: InsightBroadcastEvent): void {
    this.emit('broadcast', event);
  }

  /**
   * Notify about a new insight (called by cross-persona-insights when insights are recorded)
   */
  notifyNewInsight(userId: string, insight: CrossPersonaInsight): void {
    const knownInsights = this.userKnownInsights.get(userId);
    if (knownInsights) {
      knownInsights.add(insight.id);
    }

    // Only broadcast high-priority insights immediately
    if (insight.priority === 'high' || insight.priority === 'critical') {
      this.broadcast({
        type: 'new_insight',
        userId,
        insight,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Publish an insight to connected WebSocket clients
   * Alias for notifyNewInsight for use by cross-persona-insights
   */
  publishInsight(userId: string, insight: CrossPersonaInsight): void {
    log.debug({ userId, insightId: insight.id, priority: insight.priority }, '🔔 Broadcasting insight');
    this.notifyNewInsight(userId, insight);
  }

  /**
   * Get monitoring status for a user
   */
  isMonitoring(userId: string): boolean {
    return this.scanIntervals.has(userId);
  }

  /**
   * Shutdown all monitoring
   */
  shutdown(): void {
    for (const [userId, interval] of this.scanIntervals) {
      clearInterval(interval);
      log.debug({ userId }, 'Stopped monitoring on shutdown');
    }
    this.scanIntervals.clear();
    this.userKnownInsights.clear();
    this.userLastScan.clear();
    this.removeAllListeners();
    log.info('InsightsBroadcast shutdown complete');
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

export const insightsBroadcast = new InsightsBroadcast();

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export function startInsightMonitoring(userId: string): void {
  insightsBroadcast.startMonitoring(userId);
}

export function stopInsightMonitoring(userId: string): void {
  insightsBroadcast.stopMonitoring(userId);
}

export async function triggerInsightScan(userId: string): Promise<CrossPersonaInsight[]> {
  return insightsBroadcast.triggerScan(userId);
}

export function subscribeToInsights(listener: InsightBroadcastListener): () => void {
  return insightsBroadcast.subscribe(listener);
}
