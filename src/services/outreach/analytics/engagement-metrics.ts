/**
 * Engagement Metrics
 *
 * Extracted from decision-engine.ts. Tracks and analyzes outreach history:
 * - Decision history per user
 * - Analytics aggregation by channel and trigger type
 * - Firestore persistence for history
 * - History pruning
 *
 * @module EngagementMetrics
 */

import { getLogger } from '../../../utils/safe-logger.js';
import {
  loadHistory,
  saveToHistory,
  deleteTrigger,
  updateTriggerStatus,
} from '../firestore-persistence.js';
import type { OutreachDecision } from '../decision-engine-types.js';
import type { OutreachChannel } from '../engagement/personalization-engine.js';

const log = getLogger().child({ service: 'engagement-metrics' });

// ============================================================================
// STORAGE
// ============================================================================

const outreachHistory = new Map<string, OutreachDecision[]>();

// ============================================================================
// HISTORY RECORDING
// ============================================================================

/**
 * Record an outreach decision in history and persist to Firestore.
 */
export function recordDecision(userId: string, decision: OutreachDecision): void {
  const history = outreachHistory.get(userId) || [];
  history.push(decision);

  // Keep last 100 decisions per user
  if (history.length > 100) {
    history.shift();
  }

  outreachHistory.set(userId, history);

  // Persist to Firestore
  saveToHistory(userId, decision).catch((err) => {
    log.debug({ err, userId }, 'Failed to persist decision to history (non-fatal)');
  });

  // Remove processed trigger from Firestore
  if (decision.decision === 'send' || decision.decision === 'skip') {
    deleteTrigger(decision.trigger.id).catch((err) => {
      log.debug({ err, triggerId: decision.trigger.id }, 'Failed to delete trigger (non-fatal)');
    });
  } else if (decision.decision === 'defer') {
    updateTriggerStatus(decision.trigger.id, 'pending', decision.deferUntil).catch((err) => {
      log.debug({ err, triggerId: decision.trigger.id }, 'Failed to update trigger (non-fatal)');
    });
  }
}

// ============================================================================
// HISTORY QUERIES
// ============================================================================

/**
 * Get outreach history for a user (sync - uses cache)
 */
export function getOutreachHistory(userId: string, limit = 20): OutreachDecision[] {
  const history = outreachHistory.get(userId) || [];
  return history.slice(-limit);
}

/**
 * Load outreach history from Firestore (async)
 */
export async function loadOutreachHistoryFromFirestore(
  userId: string,
  limit = 50
): Promise<OutreachDecision[]> {
  const history = await loadHistory(userId, limit);
  if (history.length > 0) {
    outreachHistory.set(userId, history);
  }
  return history;
}

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * Get analytics for outreach effectiveness
 */
export function getAnalytics(userId: string): {
  totalSent: number;
  totalSkipped: number;
  totalDeferred: number;
  byChannel: Record<OutreachChannel, number>;
  byTrigger: Record<string, number>;
} {
  const history = outreachHistory.get(userId) || [];

  const analytics = {
    totalSent: 0,
    totalSkipped: 0,
    totalDeferred: 0,
    byChannel: {} as Record<OutreachChannel, number>,
    byTrigger: {} as Record<string, number>,
  };

  for (const decision of history) {
    if (decision.decision === 'send') {
      analytics.totalSent++;
      if (decision.channel) {
        analytics.byChannel[decision.channel] = (analytics.byChannel[decision.channel] || 0) + 1;
      }
    } else if (decision.decision === 'skip') {
      analytics.totalSkipped++;
    } else if (decision.decision === 'defer') {
      analytics.totalDeferred++;
    }

    const triggerType = decision.trigger.type;
    analytics.byTrigger[triggerType] = (analytics.byTrigger[triggerType] || 0) + 1;
  }

  return analytics;
}

// ============================================================================
// MAINTENANCE
// ============================================================================

/**
 * Prune history older than a cutoff date
 */
export function pruneHistory(userId: string, cutoffDate: Date): number {
  const history = outreachHistory.get(userId) || [];
  const cutoffTime = cutoffDate.getTime();
  const filtered = history.filter((d) => new Date(d.decidedAt).getTime() > cutoffTime);
  const pruned = history.length - filtered.length;
  outreachHistory.set(userId, filtered);
  return pruned;
}

/**
 * Clear history for a user
 */
export function clearHistory(userId: string): void {
  outreachHistory.delete(userId);
}
