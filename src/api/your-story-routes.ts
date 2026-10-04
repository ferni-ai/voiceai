/**
 * Your Story Dashboard API Routes
 *
 * Unified API that aggregates all user data for the immersive "Your Story" visualization.
 * Powers the dashboard showing:
 * - Story so far (days together, conversations, streak)
 * - Relationship stage & milestones
 * - Energy/Capacity levels
 * - Mood calendar, life chapters, emotional arc, your world, open loops
 *   (your-story-sections.ts) and the energy forecast (your-story-prediction.ts),
 *   each built only from persisted data and null when there is none
 *
 * GET /api/your-story/full - Complete dashboard data
 * GET /api/your-story/summary - Quick summary for header
 * GET /api/your-story/section/:section - Individual section data
 *
 * @module api/your-story-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAuth, type AuthContext } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded, sendJSON, sendError } from './helpers.js';
import { fetchPrediction, type PredictionData } from './your-story-prediction.js';
import {
  fetchEmotionalArc,
  fetchLifeChapters,
  fetchMoodCalendar,
  fetchOpenLoops,
  fetchYourWorld,
  type EmotionalArcSummary,
  type LifeChapter,
  type MoodCalendarData,
  type OpenLoopsData,
  type YourWorld,
} from './your-story-sections.js';

const log = createLogger({ module: 'YourStoryAPI' });

// ============================================================================
// TYPES
// ============================================================================

export interface StoryHeader {
  greeting: string;
  tagline: string;
  daysTogether: number;
  totalConversations: number;
  /** null: no per-day conversation history is persisted to compute one */
  currentStreak: number | null;
  longestStreak: number | null;
}

export interface RelationshipProgress {
  stage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
  stageLabel: string;
  progress: number; // 0-100 progress to next stage
  nextStage: string | null;
  tagline: string;
  milestones: Array<{
    id: string;
    title: string;
    completed: boolean;
    completedAt?: string;
  }>;
}

export interface EnergyLevels {
  overall: number; // 0-100, average of the last 7 days of energy readings
  label: string; // e.g., "Balanced", from the overall score
  trend: 'improving' | 'stable' | 'declining' | 'recovering';
  recommendation: string | null;
}

export interface YourStoryData {
  header: StoryHeader;
  relationship: RelationshipProgress;
  /** null when the user has no energy readings */
  energy: EnergyLevels | null;
  /** Sections below are null ([] for chapters) when the user has no such data */
  moodCalendar: MoodCalendarData | null;
  lifeChapters: LifeChapter[];
  emotionalArc: EmotionalArcSummary | null;
  yourWorld: YourWorld | null;
  openLoops: OpenLoopsData | null;
  /** null without enough real energy readings for a forecast */
  prediction: PredictionData | null;
  lastUpdated: string;
}

// ============================================================================
// DATA FETCHERS
// ============================================================================

/** One shared lazy import: the header and the relationship section both read the arc. */
let arcStorageModule: Promise<
  typeof import('../intelligence/context-builders/relationship/arc/storage.js')
> | null = null;
const arcStorage = () =>
  (arcStorageModule ??= import('../intelligence/context-builders/relationship/arc/storage.js'));

/**
 * Header counts from the relationship arc the voice agent saves at the end of
 * every conversation (bogle_users/{uid}/relationship_arc/data, incremented by
 * cleanup-handler's incrementSessionStats). The personal-journey rhythm stats
 * live in the voice agent's memory, so read here they were always 0.
 * Days together counts the first day as day 1. No per-day history is saved,
 * so no streak is claimed.
 */
async function fetchStoryHeader(userId: string): Promise<StoryHeader> {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const header = {
    greeting,
    tagline: "Here's your story so far",
    currentStreak: null,
    longestStreak: null,
  };
  try {
    const arc = await (await arcStorage()).loadRelationshipArcData(userId);
    const total = arc?.totalSessions ?? 0;
    const daysTogether =
      total > 0 && arc?.firstSessionDate
        ? Math.floor((Date.now() - arc.firstSessionDate) / (24 * 60 * 60 * 1000)) + 1
        : 0;
    return { ...header, daysTogether, totalConversations: total };
  } catch (error) {
    log.warn({ error, userId }, 'Failed to load conversation count for the story header');
    return { ...header, daysTogether: 0, totalConversations: 0 };
  }
}

async function fetchRelationshipProgress(userId: string): Promise<RelationshipProgress> {
  try {
    const { loadRelationshipArcData, getCurrentStage } = await arcStorage();

    const stage = await getCurrentStage(userId);
    const arcData = await loadRelationshipArcData(userId);

    const stageLabels = {
      stranger: 'Just Getting Started',
      acquaintance: 'Getting to Know Each Other',
      friend: 'Building Trust',
      trusted_advisor: 'Deep Partnership',
    };

    const stageTaglines = {
      stranger: 'Every great friendship starts somewhere',
      acquaintance: 'Finding our rhythm together',
      friend: 'Deeper than small talk',
      trusted_advisor: 'In this together',
    };

    const progressToNext: Record<string, number> = {
      stranger: Math.min(100, ((arcData?.totalSessions || 0) / 2) * 100),
      acquaintance: Math.min(100, ((arcData?.totalSessions || 0) / 6) * 100),
      friend: Math.min(100, ((arcData?.totalSessions || 0) / 15) * 100),
      trusted_advisor: 100,
    };

    const milestones = [
      {
        id: 'first_hello',
        title: 'First Hello',
        completed: !!arcData?.firstMeeting,
        completedAt: arcData?.firstMeeting?.timestamp
          ? new Date(arcData.firstMeeting.timestamp).toISOString()
          : undefined,
      },
      {
        id: 'one_week',
        title: 'One Week Together',
        completed: (arcData?.totalSessions || 0) >= 3,
      },
      {
        id: 'deep_dive',
        title: 'Deep Dive',
        completed: (arcData?.vulnerabilityCount || 0) >= 1,
      },
    ];

    return {
      stage,
      stageLabel: stageLabels[stage],
      progress: progressToNext[stage],
      nextStage: stage === 'trusted_advisor' ? null : 'Next stage',
      tagline: stageTaglines[stage],
      milestones,
    };
  } catch (error) {
    log.warn({ error, userId }, 'Failed to fetch relationship progress');
    return {
      stage: 'stranger',
      stageLabel: 'Just Getting Started',
      progress: 0,
      nextStage: 'Getting to Know Each Other',
      tagline: 'Every great friendship starts somewhere',
      milestones: [],
    };
  }
}

/**
 * The user's energy from their real energy readings (last 7 days), or null
 * when there are none. Readings carry one score, so there is one number: no
 * per-dimension split and no default.
 */
async function fetchEnergyLevels(userId: string): Promise<EnergyLevels | null> {
  try {
    const { assessBurnoutRisk, loadEnergyHistory } =
      await import('../services/superhuman/capacity-guardian.js');

    const history = await loadEnergyHistory(userId, 7);
    if (history.length === 0) return null;
    const assessment = await assessBurnoutRisk(userId);

    const overall = Math.round(history.reduce((sum, r) => sum + r.energyScore, 0) / history.length);
    const getLabel = (score: number) => {
      if (score >= 80) return 'Thriving';
      if (score >= 70) return 'Balanced';
      if (score >= 60) return 'Good';
      if (score >= 50) return 'Moderate';
      if (score >= 40) return 'Low';
      return 'Depleted';
    };
    const trend =
      assessment.risk === 'low'
        ? 'stable'
        : assessment.risk === 'moderate'
          ? 'recovering'
          : 'declining';

    return {
      overall,
      label: getLabel(overall),
      trend,
      recommendation: assessment.recommendations[0] ?? null,
    };
  } catch (error) {
    log.warn({ error, userId }, 'Failed to fetch energy levels');
    return null;
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function handleYourStoryRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  if (!pathname.startsWith('/api/your-story')) {
    return false;
  }

  // Handle CORS
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Rate limit
  if (rateLimit(req, res, { maxRequests: 60, windowMs: 60000, keyPrefix: 'your-story' })) {
    return true;
  }

  // Require auth
  const auth = (await requireAuth(req, res, { allowDevMode: true })) as AuthContext | null;
  if (!auth) {
    return true;
  }

  const { userId } = auth;

  // ========================================================================
  // GET /api/your-story/full - Complete dashboard data
  // ========================================================================
  if (pathname === '/api/your-story/full' && req.method === 'GET') {
    try {
      log.info({ userId }, '📖 Fetching full story data');

      const [
        header,
        relationship,
        energy,
        moodCalendar,
        lifeChapters,
        emotionalArc,
        yourWorld,
        openLoops,
        prediction,
      ] = await Promise.all([
        fetchStoryHeader(userId),
        fetchRelationshipProgress(userId),
        fetchEnergyLevels(userId),
        fetchMoodCalendar(userId),
        fetchLifeChapters(userId),
        fetchEmotionalArc(userId),
        fetchYourWorld(userId),
        fetchOpenLoops(userId),
        fetchPrediction(userId),
      ]);

      const data: YourStoryData = {
        header,
        relationship,
        energy,
        moodCalendar,
        lifeChapters,
        emotionalArc,
        yourWorld,
        openLoops,
        prediction,
        lastUpdated: new Date().toISOString(),
      };

      sendJSON(res, { success: true, data }, 200);
      return true;
    } catch (error) {
      log.error({ error, userId }, 'Failed to fetch full story data');
      sendError(res, 'Failed to fetch story data', 500);
      return true;
    }
  }

  // ========================================================================
  // GET /api/your-story/summary - Quick header summary
  // ========================================================================
  if (pathname === '/api/your-story/summary' && req.method === 'GET') {
    try {
      const [header, relationship] = await Promise.all([
        fetchStoryHeader(userId),
        fetchRelationshipProgress(userId),
      ]);

      sendJSON(
        res,
        {
          success: true,
          data: { header, relationship },
        },
        200
      );
      return true;
    } catch (error) {
      log.error({ error, userId }, 'Failed to fetch story summary');
      sendError(res, 'Failed to fetch summary', 500);
      return true;
    }
  }

  // ========================================================================
  // GET /api/your-story/section/:section - Individual section
  // ========================================================================
  const sectionMatch = pathname.match(/^\/api\/your-story\/section\/(\w+)$/);
  if (sectionMatch && req.method === 'GET') {
    const section = sectionMatch[1];

    try {
      let data: unknown = null;

      switch (section) {
        case 'header':
          data = await fetchStoryHeader(userId);
          break;
        case 'relationship':
          data = await fetchRelationshipProgress(userId);
          break;
        case 'energy':
          data = await fetchEnergyLevels(userId);
          break;
        case 'mood':
          data = await fetchMoodCalendar(userId);
          break;
        case 'chapters':
          data = await fetchLifeChapters(userId);
          break;
        case 'arc':
          data = await fetchEmotionalArc(userId);
          break;
        case 'world':
          data = await fetchYourWorld(userId);
          break;
        case 'loops':
          data = await fetchOpenLoops(userId);
          break;
        case 'prediction':
          data = await fetchPrediction(userId);
          break;
        default:
          sendError(res, `Unknown section: ${section}`, 404);
          return true;
      }

      sendJSON(res, { success: true, section, data }, 200);
      return true;
    } catch (error) {
      log.error({ error, userId, section }, 'Failed to fetch section');
      sendError(res, `Failed to fetch ${section}`, 500);
      return true;
    }
  }

  return false;
}
