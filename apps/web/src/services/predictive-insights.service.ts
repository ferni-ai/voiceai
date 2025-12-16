/**
 * Predictive Insights Service (Frontend)
 *
 * Fetches predictive insights from the API and manages local state.
 *
 * @module PredictiveInsightsService
 */

import { showInsightFromAPI, type InsightType } from '../ui/predictive-insights.ui.js';
import { createLogger } from '../utils/logger.js';
import { apiGet, apiPost } from '../utils/api.js';

const log = createLogger('PredictiveInsightsService');

// ============================================================================
// TYPES
// ============================================================================

export interface PredictiveInsightData {
  id: string;
  type: InsightType;
  title: string;
  message: string;
  suggestion?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  confidence?: number;
  validUntil?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface InsightsSummary {
  totalInsights: number;
  byType: Record<string, number>;
  byPriority: {
    urgent: number;
    high: number;
    medium: number;
    low: number;
  };
  topPriority: PredictiveInsightData | null;
}

// ============================================================================
// STATE
// ============================================================================

let pollingInterval: ReturnType<typeof setInterval> | null = null;
const shownInsightIds = new Set<string>();

// ============================================================================
// API CALLS
// ============================================================================

/**
 * Fetch predictive insights from the API
 */
export async function fetchPredictiveInsights(): Promise<PredictiveInsightData[]> {
  try {
    const response = await apiGet<{ insights?: PredictiveInsightData[] }>('/api/insights/predictions');

    if (!response.ok || !response.data) {
      return [];
    }

    log.debug({ count: response.data.insights?.length || 0 }, 'Fetched predictive insights');
    return response.data.insights || [];
  } catch (error) {
    log.warn({ error }, 'Failed to fetch predictive insights');
    return [];
  }
}

/**
 * Dismiss an insight (won't show again)
 */
export async function dismissInsight(insightId: string): Promise<void> {
  try {
    await apiPost('/api/insights/dismiss', { insightId });
    shownInsightIds.add(insightId);
    log.debug({ insightId }, 'Dismissed insight');
  } catch (error) {
    log.warn({ error, insightId }, 'Failed to dismiss insight');
  }
}

/**
 * Provide feedback on an insight
 */
export async function provideFeedback(
  insightId: string,
  helpful: boolean,
  accurate: boolean,
  notes?: string
): Promise<void> {
  try {
    await apiPost('/api/insights/feedback', { insightId, helpful, accurate, notes });
    log.debug({ insightId, helpful, accurate }, 'Provided insight feedback');
  } catch (error) {
    log.warn({ error, insightId }, 'Failed to provide feedback');
  }
}

/**
 * Get insights summary
 */
export async function getInsightsSummary(): Promise<InsightsSummary | null> {
  try {
    const response = await apiGet<{ summary?: InsightsSummary }>('/api/insights/summary');

    if (!response.ok || !response.data) {
      return null;
    }

    return response.data.summary || null;
  } catch (error) {
    log.warn({ error }, 'Failed to get insights summary');
    return null;
  }
}

// ============================================================================
// DISPLAY
// ============================================================================

/**
 * Fetch and display new insights
 */
export async function checkAndDisplayInsights(): Promise<number> {
  const insights = await fetchPredictiveInsights();

  let displayed = 0;
  for (const insight of insights) {
    // Skip already shown
    if (shownInsightIds.has(insight.id)) {
      continue;
    }

    // Skip low priority unless very confident
    if (insight.priority === 'low' && (insight.confidence || 0) < 0.8) {
      continue;
    }

    // Check if still valid
    if (insight.validUntil && new Date(insight.validUntil) < new Date()) {
      continue;
    }

    // Show it
    showInsightFromAPI(insight);
    shownInsightIds.add(insight.id);
    displayed++;

    // Limit how many we show at once
    if (displayed >= 2) break;
  }

  return displayed;
}

// ============================================================================
// POLLING
// ============================================================================

/**
 * Start polling for insights
 */
export function startInsightsPolling(intervalMs: number = 5 * 60 * 1000): void {
  if (pollingInterval) {
    stopInsightsPolling();
  }

  // Initial check
  checkAndDisplayInsights();

  // Set up polling
  pollingInterval = setInterval(() => {
    checkAndDisplayInsights();
  }, intervalMs);

  log.info({ intervalMs }, 'Started insights polling');
}

/**
 * Stop polling for insights
 */
export function stopInsightsPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    log.info('Stopped insights polling');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  fetchPredictiveInsights,
  dismissInsight,
  provideFeedback,
  getInsightsSummary,
  checkAndDisplayInsights,
  startInsightsPolling,
  stopInsightsPolling,
};
