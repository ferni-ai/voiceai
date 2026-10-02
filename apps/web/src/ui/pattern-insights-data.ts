/**
 * Pattern insights - types, cache constants and default data. Extracted from pattern-insights.ui.ts.
 */

export interface PatternInsight {
  id: string;
  type: 'timing' | 'mood' | 'frequency' | 'topic' | 'growth';
  title: string;
  description: string;
  icon: string;
  trend?: 'up' | 'down' | 'stable';
  value?: string;
}

export interface PatternInsightsResponse {
  insights: PatternInsight[];
  lastUpdated: string;
}

export const STORAGE_KEY = 'ferni_pattern_insights_cache';

export const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

export function cacheInsights(data: PatternInsightsResponse): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        insights: data.insights,
        timestamp: Date.now(),
      })
    );
  } catch {
    // Ignore cache errors
  }
}

export function getDefaultInsights(): PatternInsight[] {
  return [
    {
      id: 'welcome',
      type: 'growth',
      title: "I'm learning your rhythms",
      description:
        "After a few more conversations, I'll show you patterns that might surprise you.",
      icon: '', // Will use SVG icon from getPatternInsightIcon
    },
  ];
}
