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
// STATE & CACHE
// ============================================================================

let pollingInterval: ReturnType<typeof setInterval> | null = null;
const shownInsightIds = new Set<string>();

/** Cache for insights to avoid redundant API calls */
let insightsCache: PredictiveInsightData[] | null = null;
let insightsCacheTime = 0;
const INSIGHTS_CACHE_TTL_MS = 60 * 1000; // 1 minute

/** Cache for insights summary */
let summaryCache: InsightsSummary | null = null;
let summaryCacheTime = 0;
const SUMMARY_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

/** Whether a fetch is already in progress (deduplication) */
let fetchInProgress: Promise<PredictiveInsightData[]> | null = null;

// ============================================================================
// API CALLS
// ============================================================================

/**
 * Fetch predictive insights from the API (with caching)
 */
export async function fetchPredictiveInsights(forceRefresh = false): Promise<PredictiveInsightData[]> {
  const now = Date.now();

  // Return cached result if still valid
  if (!forceRefresh && insightsCache && now - insightsCacheTime < INSIGHTS_CACHE_TTL_MS) {
    return insightsCache;
  }

  // Dedupe concurrent requests
  if (fetchInProgress) {
    return fetchInProgress;
  }

  fetchInProgress = (async () => {
    try {
      const response = await apiGet<{ insights?: PredictiveInsightData[] }>('/api/insights/predictions');

      if (!response.ok || !response.data) {
        return insightsCache || []; // Return stale cache on error
      }

      // Update cache
      insightsCache = response.data.insights || [];
      insightsCacheTime = now;

      log.debug({ count: insightsCache.length }, 'Fetched predictive insights');
      return insightsCache;
    } catch (error) {
      log.warn({ error }, 'Failed to fetch predictive insights');
      return insightsCache || []; // Return stale cache on error
    } finally {
      fetchInProgress = null;
    }
  })();

  return fetchInProgress;
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
 * Get insights summary (with caching)
 */
export async function getInsightsSummary(forceRefresh = false): Promise<InsightsSummary | null> {
  const now = Date.now();

  // Return cached result if still valid
  if (!forceRefresh && summaryCache && now - summaryCacheTime < SUMMARY_CACHE_TTL_MS) {
    return summaryCache;
  }

  try {
    const response = await apiGet<{ summary?: InsightsSummary }>('/api/insights/summary');

    if (!response.ok || !response.data) {
      return summaryCache; // Return stale cache on error
    }

    // Update cache
    summaryCache = response.data.summary || null;
    summaryCacheTime = now;

    return summaryCache;
  } catch (error) {
    log.warn({ error }, 'Failed to get insights summary');
    return summaryCache; // Return stale cache on error
  }
}

/**
 * Clear insights cache (useful when user takes action that invalidates data)
 */
export function clearInsightsCache(): void {
  insightsCache = null;
  insightsCacheTime = 0;
  summaryCache = null;
  summaryCacheTime = 0;
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
