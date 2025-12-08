/**
 * Wellbeing Tracking Index
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Continuous wellbeing tracking through natural conversation.
 * This isn't a clinical assessment—it's a friend noticing how you're doing.
 *
 * @module WellbeingTracking
 */

// ============================================================================
// TYPES
// ============================================================================

export type {
  WellbeingDimensions,
  WellbeingDimension,
  WellbeingSnapshot,
  WellbeingSignal,
  WellbeingProfile,
  WellbeingTrend,
  TemporalPattern,
  TriggerPattern,
  WellbeingAlert,
  AlertType,
  AlertRecommendation,
  AssessmentOpportunity,
  AssessmentPattern,
  WellbeingDashboardData,
  DimensionCard,
  CalendarDay,
  WellbeingAchievement,
  TherapyReport,
  WellbeingTrackingConfig,
} from './types.js';

export {
  ALL_DIMENSIONS,
  DEFAULT_CONFIG,
} from './types.js';

// ============================================================================
// TRACKER
// ============================================================================

export {
  // Signal detection
  detectWellbeingSignals,

  // Snapshot recording
  recordSnapshot,

  // Profile access
  getWellbeingProfile,
  getRecentSnapshots,

  // Alerts
  getActiveAlerts,
  acknowledgeAlert,
  resolveAlert,

  // Summary
  getWellbeingSummary,

  // Types
  type WellbeingSummary,
} from './tracker.js';

// ============================================================================
// UNIFIED API
// ============================================================================

import {
  detectWellbeingSignals,
  recordSnapshot,
  getWellbeingProfile,
  getActiveAlerts,
  getWellbeingSummary,
} from './tracker.js';
import type { WellbeingSnapshot, WellbeingAlert, WellbeingSignal } from './types.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'WellbeingTracking' });

/**
 * Process a conversation turn for wellbeing signals.
 * This is the main entry point for integrating with the context pipeline.
 */
export function processForWellbeing(
  userId: string,
  userMessage: string,
  context?: {
    topic?: string;
    emotion?: string;
    emotionIntensity?: number;
    turnCount?: number;
  }
): WellbeingProcessResult {
  // Detect signals from the message
  const signals = detectWellbeingSignals(userMessage, context);

  // Record if we found signals
  let snapshot: WellbeingSnapshot | null = null;
  if (signals.length > 0) {
    snapshot = recordSnapshot(userId, signals, 'detected', {
      topic: context?.topic,
      emotion: context?.emotion,
      turnCount: context?.turnCount,
    });
  }

  // Get current alerts
  const alerts = getActiveAlerts(userId);

  // Get summary
  const summary = getWellbeingSummary(userId);

  // Build context for LLM if needed
  const llmContext = buildWellbeingLLMContext(userId, alerts, summary);

  return {
    signals,
    snapshot,
    alerts,
    summary,
    llmContext,
  };
}

/**
 * Build LLM context based on wellbeing state.
 */
function buildWellbeingLLMContext(
  userId: string,
  alerts: WellbeingAlert[],
  summary: ReturnType<typeof getWellbeingSummary>
): string | null {
  const parts: string[] = [];

  // Active alerts
  const urgentAlerts = alerts.filter((a) => a.severity === 'urgent');
  const concernAlerts = alerts.filter((a) => a.severity === 'concern');

  if (urgentAlerts.length > 0) {
    parts.push('[⚠️ WELLBEING ALERT - URGENT]');
    for (const alert of urgentAlerts) {
      parts.push(`• ${alert.message}`);
      const ferniRecs = alert.recommendations.filter((r) => r.target === 'ferni');
      for (const rec of ferniRecs) {
        parts.push(`  → ${rec.action}`);
      }
    }
    parts.push('');
  }

  if (concernAlerts.length > 0) {
    parts.push('[📊 WELLBEING CONCERN]');
    for (const alert of concernAlerts) {
      parts.push(`• ${alert.message}`);
    }
    parts.push('');
  }

  // Trend context
  if (summary && summary.trend === 'declining') {
    parts.push('[📉 WELLBEING TREND]');
    parts.push('This user\'s wellbeing has been declining. Be extra warm and supportive.');
    parts.push('');
  }

  // Insights
  if (summary && summary.keyInsights.length > 0) {
    parts.push('[💡 WELLBEING INSIGHTS]');
    for (const insight of summary.keyInsights) {
      parts.push(`• ${insight}`);
    }
  }

  return parts.length > 0 ? parts.join('\n') : null;
}

export interface WellbeingProcessResult {
  signals: WellbeingSignal[];
  snapshot: WellbeingSnapshot | null;
  alerts: WellbeingAlert[];
  summary: ReturnType<typeof getWellbeingSummary>;
  llmContext: string | null;
}

