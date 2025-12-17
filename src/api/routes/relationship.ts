/**
 * Relationship Progress Routes
 *
 * GET /api/relationship/progress - Get relationship progress
 * POST /api/relationship/progress - Sync relationship progress from frontend
 *
 * UNIFIED DATA MODEL:
 * Uses the same stage names as frontend: first-meeting, getting-started,
 * building-trust, established, deep-partnership
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { parseBody, requireUserId, sendJSON, sendJSONCached } from '../helpers.js';
import type { AnyRecord } from './types.js';

const log = createLogger({ module: 'RelationshipAPI' });

// ============================================================================
// UNIFIED STAGE SYSTEM (matches frontend/src/services/relationship-stage.service.ts)
// ============================================================================

type RelationshipStage =
  | 'first-meeting'
  | 'getting-started'
  | 'building-trust'
  | 'established'
  | 'deep-partnership';

const STAGE_THRESHOLDS: Record<
  RelationshipStage,
  { minConversations: number; minDays: number; minStreak: number }
> = {
  'first-meeting': { minConversations: 0, minDays: 0, minStreak: 0 },
  'getting-started': { minConversations: 10, minDays: 0, minStreak: 0 },
  'building-trust': { minConversations: 15, minDays: 5, minStreak: 3 },
  established: { minConversations: 30, minDays: 21, minStreak: 7 },
  'deep-partnership': { minConversations: 60, minDays: 45, minStreak: 14 },
};

const STAGE_ORDER: RelationshipStage[] = [
  'first-meeting',
  'getting-started',
  'building-trust',
  'established',
  'deep-partnership',
];

/**
 * Calculate the current relationship stage based on metrics
 */
function calculateStage(metrics: {
  totalConversations: number;
  daysSinceFirstMeeting: number;
  currentStreak: number;
  longestStreak: number;
}): RelationshipStage {
  // Check stages from highest to lowest
  for (let i = STAGE_ORDER.length - 1; i >= 0; i--) {
    const stage = STAGE_ORDER[i];
    const threshold = STAGE_THRESHOLDS[stage];

    const meetsConversations = metrics.totalConversations >= threshold.minConversations;
    const meetsDays = metrics.daysSinceFirstMeeting >= threshold.minDays;
    const meetsStreak =
      Math.max(metrics.currentStreak, metrics.longestStreak) >= threshold.minStreak;

    if (meetsConversations && meetsDays && meetsStreak) {
      return stage;
    }
  }

  return 'first-meeting';
}

/**
 * Calculate progress toward the next stage
 */
function calculateProgress(
  currentStage: RelationshipStage,
  metrics: {
    totalConversations: number;
    daysSinceFirstMeeting: number;
    currentStreak: number;
    longestStreak: number;
  }
): { nextStage: RelationshipStage | null; progress: number; requirement: string } {
  const currentIndex = STAGE_ORDER.indexOf(currentStage);

  if (currentIndex >= STAGE_ORDER.length - 1) {
    return { nextStage: null, progress: 1, requirement: "You've reached the deepest level!" };
  }

  const nextStage = STAGE_ORDER[currentIndex + 1];
  const threshold = STAGE_THRESHOLDS[nextStage];

  // Calculate progress as average of all requirements
  const convProgress = Math.min(1, metrics.totalConversations / threshold.minConversations);
  const daysProgress = Math.min(1, metrics.daysSinceFirstMeeting / threshold.minDays);
  const streakProgress = Math.min(
    1,
    Math.max(metrics.currentStreak, metrics.longestStreak) / threshold.minStreak
  );

  const progress = (convProgress + daysProgress + streakProgress) / 3;

  // Build requirement message
  const remaining: string[] = [];
  if (metrics.totalConversations < threshold.minConversations) {
    remaining.push(
      `${threshold.minConversations - metrics.totalConversations} more conversations`
    );
  }
  if (metrics.daysSinceFirstMeeting < threshold.minDays) {
    remaining.push(`${threshold.minDays - metrics.daysSinceFirstMeeting} more days together`);
  }
  if (Math.max(metrics.currentStreak, metrics.longestStreak) < threshold.minStreak) {
    remaining.push(`a ${threshold.minStreak}-day streak`);
  }

  return {
    nextStage,
    progress,
    requirement: remaining.length > 0 ? `Need: ${remaining.join(', ')}` : 'Almost there!',
  };
}

/**
 * GET /api/relationship/progress - Get relationship progress
 */
export async function handleGetRelationshipProgress(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const { getEngagementStore } = await import('../../services/engagement-store.js');
    const { getConversationHistoryService } = await import(
      '../../services/conversation-history.js'
    );

    const store = await getEngagementStore();
    const historyService = getConversationHistoryService();

    const profile = (await store.getProfile(userId)) as unknown as AnyRecord;
    const history = await historyService.getHistory(userId, 100);

    // Extract metrics from backend data
    const totalConversations = history.totalSessions || 0;
    const firstMeetingDate = (profile.firstMeetingDate as string) || profile.createdAt;
    const daysSinceFirstMeeting = firstMeetingDate
      ? Math.floor((Date.now() - new Date(firstMeetingDate).getTime()) / (24 * 60 * 60 * 1000))
      : 0;
    const currentStreak = (profile.currentStreak as number) || 0;
    const longestStreak = (profile.longestStreak as number) || currentStreak;
    const lastUpdated =
      (profile.lastSyncedAt as string) ||
      (profile.lastEngagementAt as string) ||
      new Date().toISOString();

    const metrics = {
      totalConversations,
      daysSinceFirstMeeting,
      currentStreak,
      longestStreak,
    };

    // Calculate stage and progress using unified logic
    const stage = calculateStage(metrics);
    const progressInfo = calculateProgress(stage, metrics);

    sendJSONCached(
      res,
      {
        // Core stage info
        stage,
        stageNumber: STAGE_ORDER.indexOf(stage) + 1,

        // Progress toward next stage
        nextStage: progressInfo.nextStage,
        progress: Math.round(progressInfo.progress * 100),
        requirement: progressInfo.requirement,

        // Full metrics for frontend sync
        metrics: {
          totalConversations,
          daysSinceFirstMeeting,
          currentStreak,
          longestStreak,
          milestonesReached: (profile.milestonesReached as number) || 0,
          insightsShared: (profile.insightsShared as number) || 0,
          lastConversation: profile.lastEngagementAt || null,
        },

        // Sync metadata
        firstMeetingDate: firstMeetingDate || new Date().toISOString(),
        lastUpdated,
      },
      60
    );
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get relationship progress');
    sendJSON(
      res,
      {
        error: 'Failed to get progress',
        stage: 'first-meeting',
        stageNumber: 1,
        progress: 0,
        metrics: {
          totalConversations: 0,
          daysSinceFirstMeeting: 0,
          currentStreak: 0,
          longestStreak: 0,
        },
      },
      500
    );
  }
}

/**
 * POST /api/relationship/progress - Sync relationship progress from frontend
 *
 * Accepts relationship data from frontend for cross-device sync.
 * Primary data store is frontend localStorage; this is supplementary persistence.
 *
 * UNIFIED DATA MODEL: Uses same stage names as frontend.
 */
interface RelationshipProgressPayload {
  userId?: string;
  stage?: RelationshipStage;
  metrics?: {
    totalConversations?: number;
    daysSinceFirstMeeting?: number;
    currentStreak?: number;
    longestStreak?: number;
    milestonesReached?: number;
    insightsShared?: number;
    lastConversation?: number | null;
  };
  firstMeetingDate?: string;
  memoriesCount?: number;
  lastUpdated?: string;
}

export async function handlePostRelationshipProgress(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const body = await parseBody<RelationshipProgressPayload>(req);

    // Validate stage if provided
    if (body.stage && !STAGE_ORDER.includes(body.stage)) {
      log.warn({ userId, stage: body.stage }, 'Invalid stage in sync request');
      sendJSON(res, { error: 'Invalid stage value', success: false }, 400);
      return;
    }

    const { getEngagementStore } = await import('../../services/engagement-store.js');
    const store = await getEngagementStore();

    // Get existing profile and merge with incoming data
    const existingProfile = await store.getProfile(userId);
    const existingData = existingProfile as unknown as AnyRecord;

    const now = new Date().toISOString();

    // Create merged profile with relationship data as additional fields
    // Firestore's saveProfile uses merge: true, so extra fields are preserved
    const mergedProfile = {
      ...existingProfile,
      // Preserve relationship-specific fields (not in base EngagementProfile type)
      relationshipStage: body.stage || existingData.relationshipStage,
      firstMeetingDate: body.firstMeetingDate || existingData.firstMeetingDate,
      // Store individual metric fields for easier querying
      currentStreak: body.metrics?.currentStreak ?? existingData.currentStreak,
      longestStreak: body.metrics?.longestStreak ?? existingData.longestStreak,
      milestonesReached: body.metrics?.milestonesReached ?? existingData.milestonesReached,
      insightsShared: body.metrics?.insightsShared ?? existingData.insightsShared,
      // Full metrics object for complete sync
      relationshipMetrics: body.metrics || existingData.relationshipMetrics,
      memoriesCount: body.memoriesCount ?? existingData.memoriesCount,
      lastSyncedAt: now,
    };

    // saveProfile uses merge: true, so extra fields are preserved
    await store.saveProfile(mergedProfile);

    log.debug({ userId, stage: body.stage }, 'Relationship progress synced');

    sendJSON(res, {
      success: true,
      synced: true,
      lastUpdated: now,
    });
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to sync relationship progress');
    sendJSON(
      res,
      {
        error: 'Failed to sync progress',
        success: false,
      },
      500
    );
  }
}

/**
 * Route handler for relationship endpoints
 */
export async function handleRelationshipRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  if (pathname === '/api/relationship/progress') {
    if (req.method === 'GET') {
      await handleGetRelationshipProgress(req, res, parsedUrl);
      return true;
    }
    if (req.method === 'POST') {
      await handlePostRelationshipProgress(req, res, parsedUrl);
      return true;
    }
  }
  return false;
}
