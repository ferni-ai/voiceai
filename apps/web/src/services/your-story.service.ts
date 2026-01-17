/**
 * Your Story Dashboard Service
 *
 * Fetches data from /api/your-story/full and transforms it into
 * the YourStoryData format for the dashboard visualizations.
 *
 * Handles:
 * - Firebase auth token injection
 * - Dev mode bypass for testing
 * - Error handling with graceful fallback
 * - Data transformation from API to visualization format
 *
 * @module services/your-story
 */

import { createLogger } from '../utils/logger.js';
import { apiGet } from '../utils/api.js';
import {
  type YourStoryData,
  createDemoStoryData,
} from '../ui/visualizations/index.js';

/**
 * Get the current user ID from localStorage.
 * This is consistent with how other services get the user ID.
 */
function getCurrentUserId(): string | null {
  return localStorage.getItem('ferni_user_id');
}

const log = createLogger('YourStoryService');

// ============================================================================
// TYPES
// ============================================================================

interface ApiStoryResponse {
  success: boolean;
  data: {
    header: {
      greeting: string;
      tagline: string;
      daysTogether: number;
      totalConversations: number;
      currentStreak: number;
      longestStreak: number;
    };
    relationship: {
      stage: string;
      stageLabel: string;
      progress: number;
      nextStage: string | null;
      tagline: string;
    };
    energy: {
      overall: number;
      label: string;
      emotional: { score: number; label: string };
      mental: { score: number; label: string };
      physical: { score: number; label: string };
      trend: string;
      recommendation: string;
    };
    moodCalendar: {
      month: number;
      year: number;
      days: Array<{
        date: string;
        dayOfMonth: number;
        mood: string;
        intensity: number;
      }>;
      summary: {
        calmDays: number;
        dominantMood: string;
        trend: string;
      };
    };
    growth: {
      overallScore: number;
      dimensions: Array<{ name: string; score: number; trend: string }>;
      strongest: string;
      growthEdge: string;
      narrative: string;
    };
    lifeChapters: Array<{
      title: string;
      year: number;
      isCurrent: boolean;
      theme?: string;
      progress?: number;
    }>;
    recoveryPath: {
      currentPhase: string;
      phaseLabel: string;
      progress: number;
      emotionalIntensity: number;
      phases: Array<{ id: string; name: string; status: string }>;
    };
    yourWorld: {
      totalConnections: number;
      activeConnections: number;
      needsAttention: number;
      categories: Array<{ name: string; count: number }>;
      topConnections: Array<{
        id?: string;
        name?: string;
        relationship?: string;
        strength?: number;
        lastMentioned?: string;
        sentiment?: string;
      }>;
    };
    openLoops: {
      total: number;
      closedThisWeek: number;
      byPriority: { high: number; medium: number; low: number };
      items: Array<{
        id?: string;
        text?: string;
        priority?: string;
        createdAt?: string;
      }>;
    };
    prediction: {
      metric: string;
      currentValue: number;
      predictedValue: number;
      changePercent: number;
      confidence: number;
      trackRecord: number;
      timeframe: string;
      range: {
        conservative: number;
        expected: number;
        optimistic: number;
      };
      insight: string;
      alsoTracking: Array<{ metric: string; trend: string }>;
    };
    lastUpdated: string;
  };
}

// ============================================================================
// DATA FETCHING
// ============================================================================

/**
 * Fetch the user's story data from the API.
 *
 * @returns YourStoryData for the dashboard, or demo data on error
 */
export async function fetchYourStory(): Promise<YourStoryData> {
  const userId = getCurrentUserId();
  if (!userId) {
    log.warn('No user ID, returning demo data');
    return createDemoStoryData('demo-user');
  }

  try {
    log.debug({ userId }, 'Fetching Your Story data');

    const response = await apiGet<ApiStoryResponse>('/api/your-story/full');

    if (!response.ok || !response.data?.success) {
      log.warn({ error: response.error }, 'API error, using demo data');
      return createDemoStoryData(userId);
    }

    return transformApiResponse(response.data.data, userId);
  } catch (error) {
    log.error({ error, userId }, 'Failed to fetch Your Story');
    return createDemoStoryData(userId);
  }
}

/**
 * Fetch just the header/summary data (lighter weight).
 */
export async function fetchYourStorySummary(): Promise<{
  daysTogether: number;
  conversations: number;
  streak: number;
  stage: string;
}> {
  const userId = getCurrentUserId();
  if (!userId) {
    return { daysTogether: 0, conversations: 0, streak: 0, stage: 'First Meeting' };
  }

  try {
    const response = await apiGet<{
      success: boolean;
      data: { header: ApiStoryResponse['data']['header']; relationship: ApiStoryResponse['data']['relationship'] };
    }>('/api/your-story/summary');

    if (!response.ok || !response.data?.success) {
      return { daysTogether: 0, conversations: 0, streak: 0, stage: 'First Meeting' };
    }

    const { header, relationship } = response.data.data;
    return {
      daysTogether: header.daysTogether,
      conversations: header.totalConversations,
      streak: header.currentStreak,
      stage: relationship.stageLabel,
    };
  } catch {
    return { daysTogether: 0, conversations: 0, streak: 0, stage: 'First Meeting' };
  }
}

// ============================================================================
// DATA TRANSFORMATION
// ============================================================================

/**
 * Transform API response into YourStoryData format for visualizations.
 *
 * NOTE: Uses type assertion as the API response schema evolved separately
 * from the visualization types. A future refactor should align these.
 */
function transformApiResponse(
  api: ApiStoryResponse['data'],
  userId: string
): YourStoryData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildData = (): any => {
  const now = new Date();

  return {
    userId,
    timestamp: api.lastUpdated || now.toISOString(),

    // Analytics (header stats)
    analytics: {
      daysTogether: api.header.daysTogether,
      conversations: api.header.totalConversations,
      streak: api.header.currentStreak,
    },

    // Relationship stage
    stage: {
      name: api.relationship.stageLabel,
      progress: api.relationship.progress / 100, // API returns 0-100, UI expects 0-1
      tagline: api.relationship.tagline,
    },

    // Milestones (placeholder - add real milestones API later)
    milestones: [],

    // Energy Rings visualization
    energyRings: {
      overall: api.energy.overall,
      dimensions: {
        emotional: api.energy.emotional.score,
        mental: api.energy.mental.score,
        physical: api.energy.physical.score,
        social: 75, // Default - add to API if needed
      },
      trend: 'stable',
      recommendation: api.energy.recommendation,
    },

    // Mood Calendar visualization
    moodCalendar: {
      entries: (api.moodCalendar.days || []).map((e) => ({
        date: e.date,
        mood: mapMoodType(e.mood),
        intensity: e.intensity ?? 0.7,
      })),
      summary: {
        dominantMood: mapMoodType(api.moodCalendar.summary?.dominantMood || 'neutral'),
        averageIntensity: 0.5,
        daysTracked: api.moodCalendar.days?.length ?? 0,
      },
    },

    // Burnout Gauge visualization (inferred from energy data)
    burnoutGauge: {
      currentLevel: 100 - api.energy.overall, // Invert energy to get burnout
      trend: api.energy.trend === 'declining' ? 'increasing' : 'stable',
      warning: api.energy.overall < 40,
      recommendation: api.energy.recommendation,
      factors: [
        { name: 'Emotional Load', contribution: 100 - api.energy.emotional.score },
        { name: 'Mental Load', contribution: 100 - api.energy.mental.score },
        { name: 'Physical Load', contribution: 100 - api.energy.physical.score },
      ],
    },

    // Life Timeline visualization
    lifeTimeline: {
      chapters: api.lifeChapters.map((ch, idx) => ({
        id: `chapter-${idx}`,
        title: ch.title,
        description: ch.theme || '',
        startDate: `${ch.year}-01-01`,
        endDate: ch.isCurrent ? undefined : `${ch.year}-12-31`,
        current: ch.isCurrent,
        theme: 'growth' as const,
      })),
      currentChapter: (() => {
        const current = api.lifeChapters.find((ch) => ch.isCurrent);
        return current
          ? {
              id: `chapter-current`,
              title: current.title,
              description: current.theme || '',
              startDate: `${current.year}-01-01`,
              isCurrent: true,
              theme: current.theme || 'growth',
            }
          : null;
      })(),
    },

    // Growth Radar visualization
    growthRadar: {
      dimensions: (api.growth.dimensions || []).map((d) => ({
        name: d.name,
        value: d.score,
        trend: (d.trend as 'up' | 'stable' | 'down') || 'stable',
      })),
      overallScore: api.growth.overallScore,
      focusArea: api.growth.growthEdge,
      insights: [api.growth.narrative],
    },

    // Emotional Arcs visualization (from recovery path)
    emotionalArcs: {
      phases: (api.recoveryPath.phases || []).map((p) => ({
        name: p.name,
        intensity: p.status === 'current' ? 0.8 : p.status === 'completed' ? 0.3 : 0.2,
        duration: 1,
      })),
      currentPhase: api.recoveryPath.currentPhase,
      narrative: api.recoveryPath.phaseLabel,
    },

    // Relationship Network visualization
    relationshipNetwork: {
      connections: (api.yourWorld.topConnections || []).map((c) => ({
        id: c.id || 'unknown',
        name: c.name || 'Unknown',
        type: (c.relationship as 'family' | 'friend' | 'colleague' | 'acquaintance') || 'friend',
        strength: c.strength || 0.5,
        lastInteraction: c.lastMentioned || now.toISOString(),
        sentiment: (c.sentiment as 'positive' | 'neutral' | 'needs-attention') || 'neutral',
      })),
      activeConnections: api.yourWorld.activeConnections,
      categories: api.yourWorld.categories || [],
    },

    // Open Loops visualization
    openLoops: {
      items: (api.openLoops.items || []).map((l) => ({
        id: l.id || 'unknown',
        type: 'commitment' as const,
        text: l.text || '',
        priority: (l.priority as 'high' | 'medium' | 'low') || 'medium',
        createdAt: l.createdAt || now.toISOString(),
      })),
      totalOpen: api.openLoops.total,
      categories: {
        commitments: api.openLoops.byPriority?.high || 0,
        intentions: api.openLoops.byPriority?.medium || 0,
        followUps: api.openLoops.byPriority?.low || 0,
      },
    },

    // Predictions visualization
    predictions: {
      currentScore: api.prediction.currentValue,
      projectedScore: api.prediction.predictedValue,
      confidence: api.prediction.confidence,
      trackRecord: api.prediction.trackRecord,
      timeframe: api.prediction.timeframe,
      factors: api.prediction.alsoTracking.map((t) => ({
        name: t.metric,
        impact: t.trend === 'up' ? 10 : t.trend === 'down' ? -10 : 0,
      })),
      insight: api.prediction.insight,
      scenarios: api.prediction.range,
    },
  };
  };

  return buildData() as YourStoryData;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Map API mood strings to visualization mood types.
 */
function mapMoodType(
  mood: string
): 'joyful' | 'content' | 'neutral' | 'anxious' | 'sad' | 'energized' | 'tired' {
  const moodMap: Record<string, 'joyful' | 'content' | 'neutral' | 'anxious' | 'sad' | 'energized' | 'tired'> = {
    joyful: 'joyful',
    happy: 'joyful',
    content: 'content',
    calm: 'content',
    neutral: 'neutral',
    okay: 'neutral',
    anxious: 'anxious',
    stressed: 'anxious',
    worried: 'anxious',
    sad: 'sad',
    down: 'sad',
    energized: 'energized',
    excited: 'energized',
    tired: 'tired',
    exhausted: 'tired',
  };
  return moodMap[mood.toLowerCase()] ?? 'neutral';
}

/**
 * Format dimension keys into readable names.
 */
function formatDimensionName(key: string): string {
  const nameMap: Record<string, string> = {
    'self-awareness': 'Self-Awareness',
    'emotional-range': 'Emotional Range',
    boundaries: 'Boundaries',
    connection: 'Connection',
    purpose: 'Purpose',
    resilience: 'Resilience',
    selfAwareness: 'Self-Awareness',
    emotionalRange: 'Emotional Range',
  };
  return nameMap[key] ?? key.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
