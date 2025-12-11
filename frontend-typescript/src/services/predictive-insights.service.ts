/**
 * Predictive Insights Service (Frontend)
 *
 * Fetches predictive insights from the API and manages local state.
 *
 * @module PredictiveInsightsService
 */

import { createLogger } from '../utils/logger.js';
import { showInsightFromAPI, type InsightType } from '../ui/predictive-insights.ui.js';

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
    const userId = getUserId();
    if (!userId) {
      log.debug('No user ID, skipping fetch');
      return [];
    }

    const response = await fetch('/api/insights/predictions', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-User-ID': userId,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    log.debug({ count: data.insights?.length || 0 }, 'Fetched predictive insights');
    return data.insights || [];
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
    const userId = getUserId();
    if (!userId) return;

    await fetch('/api/insights/dismiss', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-ID': userId,
      },
      body: JSON.stringify({ insightId }),
    });

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
    const userId = getUserId();
    if (!userId) return;

    await fetch('/api/insights/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-ID': userId,
      },
      body: JSON.stringify({ insightId, helpful, accurate, notes }),
    });

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
    const userId = getUserId();
    if (!userId) return null;

    const response = await fetch('/api/insights/summary', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-User-ID': userId,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.summary;
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
// HELPERS
// ============================================================================

function getUserId(): string | null {
  // Try to get from local storage or session
  try {
    const authData = localStorage.getItem('ferni_auth');
    if (authData) {
      const parsed = JSON.parse(authData);
      return parsed.userId || parsed.uid || null;
    }
  } catch {
    // Ignore
  }

  return null;
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
