/**
 * Life Context Broadcast Service
 *
 * Real-time broadcast of cross-domain life context updates to connected clients.
 * Provides WebSocket streaming for Phase 6 Life Context Dashboard.
 *
 * @module services/life-context-broadcast
 */

import { EventEmitter } from 'events';
import { createLogger } from '../utils/safe-logger.js';
import {
  aggregateLifeContext,
  generateSynthesisTriggers,
  type LifeContextSnapshot,
  type SynthesisTrigger,
} from '../intelligence/triggers/index.js';

const log = createLogger({ module: 'LifeContextBroadcast' });

// ============================================================================
// TYPES
// ============================================================================

export interface LifeContextBroadcastEvent {
  type: 'context_update' | 'trigger_alert' | 'scan_complete' | 'heartbeat';
  userId: string;
  snapshot?: LifeContextSnapshot;
  trigger?: SynthesisTrigger;
  triggers?: SynthesisTrigger[];
  timestamp: number;
  scanDuration?: number;
}

export type LifeContextBroadcastListener = (event: LifeContextBroadcastEvent) => void;

// ============================================================================
// LIFE CONTEXT BROADCAST CLASS
// ============================================================================

class LifeContextBroadcast extends EventEmitter {
  private userLastScan = new Map<string, number>();
  private userPreviousSnapshot = new Map<string, LifeContextSnapshot>();
  private scanIntervals = new Map<string, NodeJS.Timeout>();
  private readonly scanIntervalMs = 2 * 60 * 1000; // 2 minutes - more frequent for life context
  private readonly minScanGapMs = 30 * 1000; // 30 seconds minimum between scans

  constructor() {
    super();
    log.info('LifeContextBroadcast service initialized');
  }

  /**
   * Subscribe to life context broadcasts
   */
  subscribe(listener: LifeContextBroadcastListener): () => void {
    this.on('broadcast', listener);
    return () => this.off('broadcast', listener);
  }

  /**
   * Start real-time monitoring for a user
   */
  startMonitoring(userId: string): void {
    if (this.scanIntervals.has(userId)) {
      log.debug({ userId }, 'Already monitoring user life context');
      return;
    }

    log.info({ userId }, 'Starting life context monitoring');

    // Do an initial scan
    void this.scanLifeContext(userId);

    // Set up periodic scanning
    const interval = setInterval(() => {
      void this.scanLifeContext(userId);
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
      this.userPreviousSnapshot.delete(userId);
      this.userLastScan.delete(userId);
      log.info({ userId }, 'Stopped life context monitoring');
    }
  }

  /**
   * Manually trigger a scan for a user
   */
  async triggerScan(userId: string): Promise<LifeContextSnapshot | null> {
    const lastScan = this.userLastScan.get(userId);
    const now = Date.now();

    // Throttle scans
    if (lastScan !== undefined && now - lastScan < this.minScanGapMs) {
      log.debug({ userId, lastScan, now }, 'Life context scan throttled');
      return this.userPreviousSnapshot.get(userId) || null;
    }

    return this.scanLifeContext(userId);
  }

  /**
   * Internal: Scan for life context changes and broadcast updates
   */
  private async scanLifeContext(userId: string): Promise<LifeContextSnapshot | null> {
    const startTime = Date.now();

    try {
      // Aggregate current life context
      const snapshot = await aggregateLifeContext(userId);
      if (!snapshot) {
        log.debug({ userId }, 'No life context data available');
        return null;
      }

      // Generate triggers from the snapshot
      const triggers = generateSynthesisTriggers(snapshot);

      // Get previous snapshot for comparison
      const previousSnapshot = this.userPreviousSnapshot.get(userId);

      // Check if there's a significant change
      const hasSignificantChange = this.hasSignificantChange(previousSnapshot, snapshot);

      // Update cached snapshot
      this.userPreviousSnapshot.set(userId, snapshot);
      this.userLastScan.set(userId, Date.now());

      const scanDuration = Date.now() - startTime;

      // Broadcast significant triggers immediately
      for (const trigger of triggers) {
        if (trigger.priority === 'urgent' || trigger.priority === 'high') {
          this.broadcast({
            type: 'trigger_alert',
            userId,
            trigger,
            timestamp: Date.now(),
          });
        }
      }

      // Broadcast context update if there's a significant change
      if (hasSignificantChange) {
        this.broadcast({
          type: 'context_update',
          userId,
          snapshot,
          triggers,
          timestamp: Date.now(),
          scanDuration,
        });
      }

      // Always broadcast scan completion
      this.broadcast({
        type: 'scan_complete',
        userId,
        snapshot,
        triggers,
        timestamp: Date.now(),
        scanDuration,
      });

      log.debug(
        {
          userId,
          overallLoad: snapshot.overallLoadScore.toFixed(2),
          wellbeing: snapshot.wellbeingScore.toFixed(2),
          triggersCount: triggers.length,
          hasSignificantChange,
          scanDuration,
        },
        'Life context scan complete'
      );

      return snapshot;
    } catch (error) {
      log.error({ error, userId }, 'Error scanning life context');
      return null;
    }
  }

  /**
   * Check if there's a significant change between snapshots
   */
  private hasSignificantChange(
    previous: LifeContextSnapshot | undefined,
    current: LifeContextSnapshot
  ): boolean {
    if (!previous) return true;

    // Check for load change > 10%
    const loadChange = Math.abs(current.overallLoadScore - previous.overallLoadScore);
    if (loadChange > 0.1) return true;

    // Check for wellbeing change > 15%
    const wellbeingChange = Math.abs(current.wellbeingScore - previous.wellbeingScore);
    if (wellbeingChange > 0.15) return true;

    // Check for new high-stress domains
    const prevHighStress = previous.stressIndicators.filter(s => s.stressLevel > 0.7);
    const currHighStress = current.stressIndicators.filter(s => s.stressLevel > 0.7);

    const newHighStressDomains = currHighStress.filter(
      cs => !prevHighStress.some(ps => ps.domain === cs.domain)
    );
    if (newHighStressDomains.length > 0) return true;

    // Check for new patterns
    if (current.patterns.length > previous.patterns.length) return true;

    return false;
  }

  /**
   * Emit a broadcast event
   */
  private broadcast(event: LifeContextBroadcastEvent): void {
    this.emit('broadcast', event);
  }

  /**
   * Get current snapshot for a user (from cache)
   */
  getSnapshot(userId: string): LifeContextSnapshot | undefined {
    return this.userPreviousSnapshot.get(userId);
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
    this.userPreviousSnapshot.clear();
    this.userLastScan.clear();
    this.removeAllListeners();
    log.info('LifeContextBroadcast shutdown complete');
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

export const lifeContextBroadcast = new LifeContextBroadcast();

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export function startLifeContextMonitoring(userId: string): void {
  lifeContextBroadcast.startMonitoring(userId);
}

export function stopLifeContextMonitoring(userId: string): void {
  lifeContextBroadcast.stopMonitoring(userId);
}

export async function triggerLifeContextScan(userId: string): Promise<LifeContextSnapshot | null> {
  return lifeContextBroadcast.triggerScan(userId);
}

export function subscribeToLifeContext(listener: LifeContextBroadcastListener): () => void {
  return lifeContextBroadcast.subscribe(listener);
}

export function getLifeContextSnapshot(userId: string): LifeContextSnapshot | undefined {
  return lifeContextBroadcast.getSnapshot(userId);
}
