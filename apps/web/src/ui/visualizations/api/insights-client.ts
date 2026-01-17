// TODO: Fix type errors - API response indexing
/**
 * Insights API Client
 *
 * Fetches visualization data from the backend API and provides
 * type-safe access to superhuman insights.
 *
 * @module visualizations/api/insights-client
 */

import type {
  VisualizationApiResponse,
  MoodCalendarData,
  BurnoutGaugeData,
  LifeTimelineData,
  MoodType,
  MoodEntry,
} from '../types.js';
import { fetchVisualizationData, type FirestoreFetcherOptions } from './firestore-fetcher.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Raw API response from /api/insights/:userId
 */
interface RawInsightsResponse {
  presence?: {
    weather: 'sunny' | 'partly-cloudy' | 'cloudy' | 'rainy' | 'stormy' | 'foggy' | 'rainbow';
    energy: 'high' | 'medium' | 'low';
    note?: string;
  };
  noticing?: Array<{
    type: 'pattern' | 'growth' | 'concern' | 'celebration' | 'memory';
    insight: string;
    evidence?: string;
    personaId?: string;
  }>;
  chapter?: {
    title: string;
    type: 'struggle' | 'growth' | 'triumph' | 'transition' | 'discovery';
    duration?: string;
    arcSummary?: string;
  };
  holding?: {
    commitments?: Array<{ text: string; daysAgo: number }>;
    dreams?: Array<{ dream: string; status: 'active' | 'dormant' }>;
    upcomingDates?: Array<{ name: string; daysUntil: number }>;
  };
  growth?: {
    message: string;
    details?: string;
  };
  relationship?: {
    daysTogether: number;
    conversations: number;
    milestone?: string;
  };
}

/**
 * Fetch options for the insights client.
 */
export interface InsightsClientOptions {
  /** Base URL for API (defaults to current origin) */
  baseUrl?: string;
  /** Request timeout in ms (defaults to 10000) */
  timeout?: number;
  /** Custom fetch function (for testing) */
  fetchFn?: typeof fetch;
}

/**
 * Result of fetching insights.
 */
export type InsightsResult =
  | { ok: true; data: VisualizationApiResponse }
  | { ok: false; error: string };

// ============================================================================
// CLIENT
// ============================================================================

/**
 * Create an insights API client.
 *
 * @example
 * ```typescript
 * const client = createInsightsClient();
 * const result = await client.fetchInsights('user123');
 *
 * if (result.ok) {
 *   const { moodCalendar, burnoutGauge } = result.data;
 * }
 * ```
 */
export function createInsightsClient(options: InsightsClientOptions = {}) {
  const baseUrl = options.baseUrl ?? '';
  const timeout = options.timeout ?? 10000;
  const fetchFn = options.fetchFn ?? fetch;

  /**
   * Fetch insights for a user.
   */
  async function fetchInsights(userId: string): Promise<InsightsResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetchFn(`${baseUrl}/api/insights/${encodeURIComponent(userId)}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return { ok: false, error: `API error: ${response.status}` };
      }

      const raw: RawInsightsResponse = await response.json();
      const transformed = transformToVisualizationData(raw, userId);

      return { ok: true, data: transformed };
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof Error && err.name === 'AbortError') {
        return { ok: false, error: 'Request timed out' };
      }

      return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  /**
   * Fetch mock/demo data for testing visualizations.
   */
  function getMockData(): VisualizationApiResponse {
    return createMockVisualizationData('demo-user');
  }

  /**
   * Fetch real user data directly from Firestore.
   *
   * This bypasses the API and fetches data directly from Firestore
   * collections, providing access to all superhuman insights.
   *
   * @example
   * ```typescript
   * const result = await client.fetchFromFirestore('user123');
   * if (result.ok) {
   *   const { moodCalendar, energyRings, openLoops } = result.data;
   * }
   * ```
   */
  async function fetchFromFirestore(
    userId: string,
    firestoreOptions?: FirestoreFetcherOptions
  ): Promise<InsightsResult> {
    try {
      const data = await fetchVisualizationData(userId, firestoreOptions);
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to fetch from Firestore',
      };
    }
  }

  return {
    fetchInsights,
    fetchFromFirestore,
    getMockData,
  };
}

// ============================================================================
// TRANSFORMERS
// ============================================================================

/**
 * Transform raw API response to visualization data.
 */
function transformToVisualizationData(
  raw: RawInsightsResponse,
  userId: string
): VisualizationApiResponse {
  const now = new Date().toISOString();

  return {
    userId,
    timestamp: now,
    moodCalendar: transformToMoodCalendar(raw),
    burnoutGauge: transformToBurnoutGauge(raw),
    lifeTimeline: transformToLifeTimeline(raw),
  };
}

/**
 * Transform presence/energy data to mood calendar.
 */
function transformToMoodCalendar(raw: RawInsightsResponse): MoodCalendarData | undefined {
  if (!raw.presence) return undefined;

  // Map weather to dominant mood
  const weatherToMood: Record<string, MoodType> = {
    sunny: 'joyful',
    'partly-cloudy': 'calm',
    cloudy: 'reflective',
    rainy: 'tired',
    stormy: 'stressed',
    foggy: 'uncertain',
    rainbow: 'peaceful',
  };

  const dominantMood = weatherToMood[raw.presence.weather] || 'calm';

  // Generate sample entries for the past week
  const entries = generateWeekEntries(dominantMood);

  return {
    entries,
    summary: {
      dominantMood,
      calmDays: entries.filter(e => e.mood === 'calm').length,
      trend: raw.presence.energy === 'high' ? 'improving' : raw.presence.energy === 'low' ? 'declining' : 'stable',
    },
    period: 'week',
  };
}

/**
 * Transform presence data to burnout gauge.
 */
function transformToBurnoutGauge(raw: RawInsightsResponse): BurnoutGaugeData | undefined {
  if (!raw.presence) return undefined;

  // Map energy level to capacity
  const energyToCapacity: Record<string, number> = {
    high: 85,
    medium: 60,
    low: 35,
  };

  const capacity = energyToCapacity[raw.presence.energy] || 60;

  // Determine status from capacity
  const status =
    capacity >= 80 ? 'thriving' :
    capacity >= 60 ? 'balanced' :
    capacity >= 40 ? 'stretched' :
    capacity >= 20 ? 'depleted' :
    'critical';

  return {
    capacity,
    trend: raw.presence.energy === 'high' ? 'recovering' : raw.presence.energy === 'low' ? 'declining' : 'stable',
    status,
    factors: {
      emotional: Math.round(capacity * 0.9),
      mental: Math.round(capacity * 0.85),
      physical: Math.round(capacity * 0.8),
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Transform chapter data to life timeline.
 */
function transformToLifeTimeline(raw: RawInsightsResponse): LifeTimelineData | undefined {
  if (!raw.chapter) return undefined;

  // Map chapter type
  const typeMap: Record<string, 'growth' | 'challenge' | 'transition' | 'celebration' | 'reflection'> = {
    struggle: 'challenge',
    growth: 'growth',
    triumph: 'celebration',
    transition: 'transition',
    discovery: 'reflection',
  };

  const currentChapter = {
    id: 'current',
    title: raw.chapter.title,
    type: typeMap[raw.chapter.type] || 'growth',
    startDate: new Date().toISOString(),
    isActive: true,
    progress: 0.6,
    summary: raw.chapter.arcSummary,
  };

  // Generate sample past chapters
  const pastChapters = generatePastChapters(3);

  return {
    chapters: [...pastChapters, currentChapter],
    currentChapter,
    totalChapters: pastChapters.length + 1,
    narrativeSummary: raw.chapter.arcSummary,
  };
}

// ============================================================================
// MOCK DATA GENERATORS
// ============================================================================

/**
 * Generate week of mood entries.
 */
function generateWeekEntries(dominantMood: MoodType): MoodEntry[] {
  const moods: MoodType[] = ['calm', 'joyful', 'anxious', 'tired', 'focused', 'reflective'];
  const entries: MoodEntry[] = [];
  const today = new Date();

  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);

    entries.push({
      date: date.toISOString().split('T')[0] ?? '',
      mood: i === 0 ? dominantMood : (moods[Math.floor(Math.random() * moods.length)] ?? 'calm'),
      intensity: 0.5 + Math.random() * 0.5,
    });
  }

  return entries;
}

/**
 * Generate past chapters.
 */
function generatePastChapters(count: number) {
  const chapterTemplates = [
    { title: 'Foundation', type: 'growth' as const },
    { title: 'Discovery', type: 'transition' as const },
    { title: 'Transformation', type: 'challenge' as const },
    { title: 'Integration', type: 'reflection' as const },
    { title: 'Expansion', type: 'growth' as const },
  ];

  const chapters = [];
  const today = new Date();

  for (let i = 0; i < count; i++) {
    const startDate = new Date(today);
    startDate.setFullYear(startDate.getFullYear() - (count - i));

    const template = chapterTemplates[i % chapterTemplates.length];
    if (template) {
      chapters.push({
        id: `chapter-${i}`,
        title: template.title,
        type: template.type,
        startDate: startDate.toISOString(),
        isActive: false,
        progress: 1,
      });
    }
  }

  return chapters;
}

/**
 * Create complete mock visualization data for demos/testing.
 */
function createMockVisualizationData(userId: string): VisualizationApiResponse {
  const now = new Date().toISOString();

  return {
    userId,
    timestamp: now,
    moodCalendar: {
      entries: generateWeekEntries('calm'),
      summary: {
        dominantMood: 'calm',
        calmDays: 5,
        trend: 'stable',
      },
      period: 'week',
    },
    burnoutGauge: {
      capacity: 65,
      trend: 'stable',
      status: 'balanced',
      factors: {
        emotional: 70,
        mental: 60,
        physical: 65,
      },
      updatedAt: now,
    },
    lifeTimeline: {
      chapters: [
        ...generatePastChapters(3),
        {
          id: 'current',
          title: 'Intentional Growth',
          type: 'growth',
          startDate: now,
          isActive: true,
          progress: 0.6,
          summary: "You're in a season of deliberate choices.",
        },
      ],
      currentChapter: {
        id: 'current',
        title: 'Intentional Growth',
        type: 'growth',
        startDate: now,
        isActive: true,
        progress: 0.6,
        summary: "You're in a season of deliberate choices.",
      },
      totalChapters: 4,
      narrativeSummary: "From 'I should' → 'I choose'",
    },
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export { createMockVisualizationData };
