/**
 * Your Story Dashboard Service
 *
 * Fetches data from /api/your-story/full and transforms it into
 * the YourStoryData format for the dashboard visualizations.
 *
 * Handles:
 * - Firebase auth token injection
 * - Dev mode bypass for testing
 * - Honest empty / error results (never demo data)
 * - Data transformation from API to visualization format
 *
 * @module services/your-story
 */

import { createLogger } from '../utils/logger.js';
import { apiGet } from '../utils/api.js';
import type { YourStoryData } from '../ui/visualizations/index.js';
import {
  toEmotionalArcs,
  toLifeTimeline,
  toMoodCalendar,
  toOpenLoops,
  toPredictions,
  toRelationshipNetwork,
  type ApiEmotionalArc,
  type ApiLifeChapter,
  type ApiMoodCalendar,
  type ApiOpenLoops,
  type ApiPrediction,
  type ApiYourWorld,
} from './your-story-sections.js';

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
    /** null when the user has no energy readings */
    energy: {
      overall: number;
      label: string;
      trend: string;
      recommendation: string | null;
    } | null;
    /** The sections below are null ([] for chapters) when the user has no such data */
    moodCalendar: ApiMoodCalendar | null;
    lifeChapters: ApiLifeChapter[];
    emotionalArc: ApiEmotionalArc | null;
    yourWorld: ApiYourWorld | null;
    openLoops: ApiOpenLoops | null;
    /** null without enough real energy readings for a forecast */
    prediction: ApiPrediction | null;
    lastUpdated: string;
  };
}

// ============================================================================
// DATA FETCHING
// ============================================================================

/**
 * Outcome of loading the user's story. Never demo data: the caller decides
 * what an empty or failed load looks like, so made-up numbers can't pass as
 * the user's own.
 */
export type YourStoryResult =
  | { status: 'ok'; data: YourStoryData }
  | { status: 'empty' }
  | { status: 'error' };

/**
 * Fetch the user's story data from the API.
 */
export async function fetchYourStory(): Promise<YourStoryResult> {
  const userId = getCurrentUserId();
  if (!userId) {
    log.debug('No user ID yet, nothing to show');
    return { status: 'empty' };
  }

  try {
    log.debug({ userId }, 'Fetching Your Story data');

    const response = await apiGet<ApiStoryResponse>('/api/your-story/full');

    if (!response.ok || !response.data?.success) {
      log.warn({ error: response.error }, 'Your Story API error');
      return { status: 'error' };
    }

    const data = transformApiResponse(response.data.data, userId);
    const hasStory = data.analytics.conversations > 0 || data.analytics.daysTogether > 0;
    return hasStory ? { status: 'ok', data } : { status: 'empty' };
  } catch (error) {
    log.error({ error, userId }, 'Failed to fetch Your Story');
    return { status: 'error' };
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
      data: {
        header: ApiStoryResponse['data']['header'];
        relationship: ApiStoryResponse['data']['relationship'];
      };
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
 */
function transformApiResponse(api: ApiStoryResponse['data'], userId: string): YourStoryData {
  return {
    userId,
    timestamp: api.lastUpdated || new Date().toISOString(),

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

    // Energy ring: one real overall score; none at all without readings
    energyRings: api.energy
      ? {
          overall: api.energy.overall,
          label: api.energy.label,
          recommendation: api.energy.recommendation ?? undefined,
        }
      : undefined,

    // Each section is the server's real data in the component's shape, or
    // undefined (no frame). No growth radar: nothing measures growth per dimension.
    moodCalendar: toMoodCalendar(api.moodCalendar),
    burnoutGauge: undefined, // needs emotional/mental/physical factors no reading measures
    lifeTimeline: toLifeTimeline(api.lifeChapters),
    emotionalArcs: toEmotionalArcs(api.emotionalArc),
    relationshipNetwork: toRelationshipNetwork(api.yourWorld),
    openLoops: toOpenLoops(api.openLoops),
    // Forecast from real energy readings, or nothing
    predictions: toPredictions(api.prediction),
  };
}
