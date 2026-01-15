/**
 * Visual Storytelling API Routes
 *
 * Provides data for the frontend visual storytelling features:
 * - Circadian sync (user's sleep patterns)
 * - Relationship warmth (stage progression, metrics)
 * - Teaser thresholds (conversation counts)
 * - Milestone scrapbook data
 * - Team unlock progress
 *
 * These routes power the "Better Than Human" ambient experience features.
 *
 * @module api/visual-storytelling-routes
 */

import type http from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { validateAuth, sendSuccess, sendError, parseRequestBody } from './helpers.js';

const log = createLogger({ module: 'visual-storytelling-routes' });

// ============================================================================
// TYPES
// ============================================================================

export interface SleepPatternData {
  wakeTime: number; // 24h format (e.g., 7.5 = 7:30 AM)
  sleepTime: number; // 24h format (e.g., 23 = 11:00 PM)
  isNightOwl: boolean;
  isEarlyBird: boolean;
  timezone?: string;
}

export interface RelationshipMetrics {
  stage: string;
  stageIndex: number; // 0-4
  progressPercent: number;
  daysTogether: number;
  conversationCount: number;
  currentStreak: number;
  longestStreak: number;
  warmthConfig: {
    colorTemperature: number;
    animationMultiplier: number;
    glowIntensity: number;
    uiRichness: number;
  };
}

export interface TeaserEligibility {
  history: boolean;
  goals: boolean;
  team: boolean;
  patterns: boolean;
  wellbeing: boolean;
}

export interface MilestoneData {
  id: string;
  type: string;
  title: string;
  emoji: string;
  celebratedAt: string | null;
  personaId: string;
  progressPercent: number;
}

export interface TeamMemberProgress {
  personaId: string;
  name: string;
  isUnlocked: boolean;
  progressPercent: number;
  unlockThreshold: number;
}

export interface VisualStorytellingData {
  sleepPattern: SleepPatternData | null;
  relationship: RelationshipMetrics;
  teaserEligibility: TeaserEligibility;
  milestones: MilestoneData[];
  teamProgress: TeamMemberProgress[];
  lastUpdated: string;
}

// ============================================================================
// STORAGE KEYS (Firestore collections)
// ============================================================================

const COLLECTIONS = {
  sleepPatterns: 'user_sleep_patterns',
  milestones: 'user_milestones',
};

// ============================================================================
// TEASER THRESHOLDS
// ============================================================================

const TEASER_THRESHOLDS = {
  history: 3, // Need 3 conversations for history
  goals: 5, // Need 5 conversations for goals
  team: 2, // Need 2 conversations to show team teasers
  patterns: 10, // Need 10 conversations for pattern analysis
  wellbeing: 7, // Need 7 days for wellbeing tracking
};

// ============================================================================
// TEAM UNLOCK THRESHOLDS
// ============================================================================

const TEAM_UNLOCKS = {
  ferni: { threshold: 0, name: 'Ferni' },
  maya: { threshold: 5, name: 'Maya' },
  alex: { threshold: 10, name: 'Alex' },
  jordan: { threshold: 20, name: 'Jordan' },
  peter: { threshold: 15, name: 'Peter' },
  nayan: { threshold: 30, name: 'Nayan' },
};

// ============================================================================
// WARMTH CONFIGS BY STAGE
// ============================================================================

const WARMTH_BY_STAGE: Record<string, RelationshipMetrics['warmthConfig']> = {
  'first-meeting': {
    colorTemperature: 0,
    animationMultiplier: 1.0,
    glowIntensity: 0.3,
    uiRichness: 0.2,
  },
  'getting-started': {
    colorTemperature: 0.1,
    animationMultiplier: 1.0,
    glowIntensity: 0.4,
    uiRichness: 0.4,
  },
  'building-trust': {
    colorTemperature: 0.2,
    animationMultiplier: 0.95,
    glowIntensity: 0.55,
    uiRichness: 0.6,
  },
  established: {
    colorTemperature: 0.35,
    animationMultiplier: 0.9,
    glowIntensity: 0.7,
    uiRichness: 0.8,
  },
  'deep-partnership': {
    colorTemperature: 0.5,
    animationMultiplier: 0.85,
    glowIntensity: 0.85,
    uiRichness: 1.0,
  },
};

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleVisualStorytellingRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string
): Promise<boolean> {
  // GET /api/visual-storytelling/:userId - Get all visual storytelling data
  const mainMatch = pathname.match(/^\/api\/visual-storytelling\/([^/]+)$/);
  if (mainMatch && req.method === 'GET') {
    const userId = decodeURIComponent(mainMatch[1]);
    return handleGetVisualStorytellingData(req, res, userId);
  }

  // PUT /api/visual-storytelling/:userId/sleep-pattern - Update sleep pattern
  const sleepMatch = pathname.match(/^\/api\/visual-storytelling\/([^/]+)\/sleep-pattern$/);
  if (sleepMatch && req.method === 'PUT') {
    const userId = decodeURIComponent(sleepMatch[1]);
    return handleUpdateSleepPattern(req, res, userId);
  }

  // POST /api/visual-storytelling/:userId/milestone/:milestoneId/celebrate
  const celebrateMatch = pathname.match(
    /^\/api\/visual-storytelling\/([^/]+)\/milestone\/([^/]+)\/celebrate$/
  );
  if (celebrateMatch && req.method === 'POST') {
    const userId = decodeURIComponent(celebrateMatch[1]);
    const milestoneId = decodeURIComponent(celebrateMatch[2]);
    return handleCelebrateMilestone(req, res, userId, milestoneId);
  }

  // GET /api/visual-storytelling/:userId/infer-sleep - Infer sleep pattern from usage
  const inferMatch = pathname.match(/^\/api\/visual-storytelling\/([^/]+)\/infer-sleep$/);
  if (inferMatch && req.method === 'GET') {
    const userId = decodeURIComponent(inferMatch[1]);
    return handleInferSleepPattern(req, res, userId);
  }

  return false;
}

// ============================================================================
// GET /api/visual-storytelling/:userId
// ============================================================================

async function handleGetVisualStorytellingData(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  userId: string
): Promise<boolean> {
  const auth = await validateAuth(req, res);
  if (!auth) return true;

  try {
    // Get user's session/relationship data
    const { getFirestore } = await import('../memory/firestore-factory.js');
    const db = getFirestore();
    if (!db) {
      sendError(res, 'Database not available', 503);
      return true;
    }

    // Fetch sleep pattern
    let sleepPattern: SleepPatternData | null = null;
    try {
      const sleepDoc = await db.collection(COLLECTIONS.sleepPatterns).doc(userId).get();
      if (sleepDoc.exists) {
        sleepPattern = sleepDoc.data() as SleepPatternData;
      }
    } catch {
      // Sleep pattern not found
    }

    // Fetch relationship metrics from profile
    const { getFirestoreStore } = await import('../memory/firestore-store.js');
    const store = getFirestoreStore();
    const profile = await store.getProfile(userId);

    // Get stats from profile metadata
    const profileData = profile as unknown as {
      conversationCount?: number;
      currentStreak?: number;
      longestStreak?: number;
      createdAt?: Date;
    };

    // Calculate stage from conversation count
    const conversationCount = profileData?.conversationCount || 0;
    const currentStreak = profileData?.currentStreak || 0;
    const longestStreak = profileData?.longestStreak || 0;
    const firstConversation = profileData?.createdAt;
    const daysTogether = firstConversation
      ? Math.floor((Date.now() - new Date(firstConversation).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // Determine stage from conversation count (progressive thresholds)
    const stage = determineStage(conversationCount);
    const stageIndex = [
      'first-meeting',
      'getting-started',
      'building-trust',
      'established',
      'deep-partnership',
    ].indexOf(stage);
    const progressPercent = calculateStageProgress(conversationCount, stage);

    const relationship: RelationshipMetrics = {
      stage,
      stageIndex,
      progressPercent,
      daysTogether,
      conversationCount,
      currentStreak,
      longestStreak,
      warmthConfig: WARMTH_BY_STAGE[stage] || WARMTH_BY_STAGE['first-meeting'],
    };

    // Calculate teaser eligibility
    const teaserEligibility: TeaserEligibility = {
      history: conversationCount >= TEASER_THRESHOLDS.history,
      goals: conversationCount >= TEASER_THRESHOLDS.goals,
      team: conversationCount >= TEASER_THRESHOLDS.team,
      patterns: conversationCount >= TEASER_THRESHOLDS.patterns,
      wellbeing: daysTogether >= TEASER_THRESHOLDS.wellbeing,
    };

    // Fetch milestones
    const milestones = await getMilestones(db, userId, conversationCount);

    // Calculate team progress
    const teamProgress = calculateTeamProgress(conversationCount);

    const data: VisualStorytellingData = {
      sleepPattern,
      relationship,
      teaserEligibility,
      milestones,
      teamProgress,
      lastUpdated: new Date().toISOString(),
    };

    sendSuccess(res, data);
    log.info({ userId, stage, conversationCount }, 'Visual storytelling data fetched');
    return true;
  } catch (error) {
    log.error({ error, userId }, 'Failed to fetch visual storytelling data');
    sendError(res, 'Failed to fetch visual storytelling data', 500);
    return true;
  }
}

// ============================================================================
// PUT /api/visual-storytelling/:userId/sleep-pattern
// ============================================================================

async function handleUpdateSleepPattern(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  userId: string
): Promise<boolean> {
  const auth = await validateAuth(req, res);
  if (!auth) return true;

  try {
    const body = await parseRequestBody<SleepPatternData>(req);

    // Validate sleep pattern data
    if (typeof body.wakeTime !== 'number' || body.wakeTime < 0 || body.wakeTime >= 24) {
      sendError(res, 'Invalid wakeTime', 400);
      return true;
    }
    if (typeof body.sleepTime !== 'number' || body.sleepTime < 0 || body.sleepTime >= 24) {
      sendError(res, 'Invalid sleepTime', 400);
      return true;
    }

    const { getFirestore } = await import('../memory/firestore-factory.js');
    const db = getFirestore();
    if (!db) {
      sendError(res, 'Database not available', 503);
      return true;
    }

    const sleepPattern: SleepPatternData = {
      wakeTime: body.wakeTime,
      sleepTime: body.sleepTime,
      isNightOwl: body.isNightOwl || false,
      isEarlyBird: body.isEarlyBird || false,
      timezone: body.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    };

    await db.collection(COLLECTIONS.sleepPatterns).doc(userId).set(sleepPattern, { merge: true });

    sendSuccess(res, { sleepPattern, message: 'Sleep pattern updated' });
    log.info({ userId, sleepPattern }, 'Sleep pattern updated');
    return true;
  } catch (error) {
    log.error({ error, userId }, 'Failed to update sleep pattern');
    sendError(res, 'Failed to update sleep pattern', 500);
    return true;
  }
}

// ============================================================================
// POST /api/visual-storytelling/:userId/milestone/:milestoneId/celebrate
// ============================================================================

async function handleCelebrateMilestone(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  userId: string,
  milestoneId: string
): Promise<boolean> {
  const auth = await validateAuth(req, res);
  if (!auth) return true;

  try {
    const { getFirestore } = await import('../memory/firestore-factory.js');
    const db = getFirestore();
    if (!db) {
      sendError(res, 'Database not available', 503);
      return true;
    }

    const milestoneRef = db.collection(COLLECTIONS.milestones).doc(`${userId}_${milestoneId}`);

    await milestoneRef.set(
      {
        userId,
        milestoneId,
        celebratedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    sendSuccess(res, { milestoneId, celebratedAt: new Date().toISOString() });
    log.info({ userId, milestoneId }, 'Milestone celebrated');
    return true;
  } catch (error) {
    log.error({ error, userId, milestoneId }, 'Failed to celebrate milestone');
    sendError(res, 'Failed to celebrate milestone', 500);
    return true;
  }
}

// ============================================================================
// GET /api/visual-storytelling/:userId/infer-sleep
// ============================================================================

async function handleInferSleepPattern(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  userId: string
): Promise<boolean> {
  const auth = await validateAuth(req, res);
  if (!auth) return true;

  try {
    // Get session history to infer sleep patterns
    const { getFirestore } = await import('../memory/firestore-factory.js');
    const db = getFirestore();
    if (!db) {
      sendError(res, 'Database not available', 503);
      return true;
    }

    const sessions = await db
      .collection('sessions')
      .where('userId', '==', userId)
      .orderBy('startTime', 'desc')
      .limit(50)
      .get();

    if (sessions.empty || sessions.size < 5) {
      sendSuccess(res, { inferred: null, reason: 'Not enough sessions to infer pattern' });
      return true;
    }

    const sessionTimes = sessions.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
      const data = doc.data();
      return new Date(data.startTime);
    });

    // Infer patterns
    const hours = sessionTimes.map((d: Date) => d.getHours());

    const morningHours = hours.filter((h: number) => h >= 5 && h < 12);
    const eveningHours = hours.filter((h: number) => h >= 20 || h < 4);
    const lateNightHours = hours.filter((h: number) => h >= 0 && h < 5);

    const avgMorning =
      morningHours.length > 0
        ? morningHours.reduce((a: number, b: number) => a + b, 0) / morningHours.length
        : 7;

    const avgEvening =
      eveningHours.length > 0
        ? eveningHours.reduce((a: number, b: number) => a + (b >= 20 ? b : b + 24), 0) /
          eveningHours.length
        : 23;

    const inferred: SleepPatternData = {
      wakeTime: Math.round(avgMorning),
      sleepTime: Math.round(avgEvening >= 24 ? avgEvening - 24 : avgEvening),
      isNightOwl: lateNightHours.length >= sessionTimes.length * 0.15,
      isEarlyBird: hours.filter((h: number) => h >= 5 && h < 7).length >= sessionTimes.length * 0.2,
    };

    sendSuccess(res, { inferred, sessionCount: sessions.size });
    log.info({ userId, inferred, sessionCount: sessions.size }, 'Sleep pattern inferred');
    return true;
  } catch (error) {
    log.error({ error, userId }, 'Failed to infer sleep pattern');
    sendError(res, 'Failed to infer sleep pattern', 500);
    return true;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function determineStage(conversationCount: number): string {
  if (conversationCount >= 50) return 'deep-partnership';
  if (conversationCount >= 25) return 'established';
  if (conversationCount >= 10) return 'building-trust';
  if (conversationCount >= 3) return 'getting-started';
  return 'first-meeting';
}

function calculateStageProgress(conversationCount: number, stage: string): number {
  const thresholds: Record<string, [number, number]> = {
    'first-meeting': [0, 3],
    'getting-started': [3, 10],
    'building-trust': [10, 25],
    established: [25, 50],
    'deep-partnership': [50, 100],
  };

  const [min, max] = thresholds[stage] || [0, 100];
  return Math.min(100, Math.round(((conversationCount - min) / (max - min)) * 100));
}

function calculateTeamProgress(conversationCount: number): TeamMemberProgress[] {
  return Object.entries(TEAM_UNLOCKS).map(([personaId, config]) => ({
    personaId,
    name: config.name,
    isUnlocked: conversationCount >= config.threshold,
    progressPercent: Math.min(100, Math.round((conversationCount / config.threshold) * 100)),
    unlockThreshold: config.threshold,
  }));
}

async function getMilestones(
  db: FirebaseFirestore.Firestore,
  userId: string,
  conversationCount: number
): Promise<MilestoneData[]> {
  // Defined milestones with their unlock thresholds
  const MILESTONES: Array<
    Omit<MilestoneData, 'celebratedAt' | 'progressPercent'> & { threshold: number }
  > = [
    {
      id: 'first-hello',
      type: 'greeting',
      title: 'First Hello',
      emoji: '👋',
      personaId: 'ferni',
      threshold: 1,
    },
    {
      id: 'opening-up',
      type: 'trust',
      title: 'Opening Up',
      emoji: '💜',
      personaId: 'ferni',
      threshold: 5,
    },
    {
      id: 'meet-maya',
      type: 'team',
      title: 'Met Maya',
      emoji: '🌸',
      personaId: 'maya',
      threshold: 5,
    },
    {
      id: 'first-habit',
      type: 'habit',
      title: 'First Habit',
      emoji: '✨',
      personaId: 'maya',
      threshold: 8,
    },
    {
      id: 'meet-alex',
      type: 'team',
      title: 'Met Alex',
      emoji: '💬',
      personaId: 'alex',
      threshold: 10,
    },
    {
      id: 'week-streak',
      type: 'streak',
      title: 'Week Streak',
      emoji: '🔥',
      personaId: 'ferni',
      threshold: 7,
    },
    {
      id: 'deep-dive',
      type: 'insight',
      title: 'Deep Dive',
      emoji: '🔮',
      personaId: 'peter',
      threshold: 15,
    },
    {
      id: 'meet-peter',
      type: 'team',
      title: 'Met Peter',
      emoji: '📚',
      personaId: 'peter',
      threshold: 15,
    },
    {
      id: 'meet-jordan',
      type: 'team',
      title: 'Met Jordan',
      emoji: '🎯',
      personaId: 'jordan',
      threshold: 20,
    },
    {
      id: 'month-together',
      type: 'time',
      title: 'One Month',
      emoji: '🌙',
      personaId: 'ferni',
      threshold: 30,
    },
    {
      id: 'meet-nayan',
      type: 'team',
      title: 'Met Nayan',
      emoji: '🦉',
      personaId: 'nayan',
      threshold: 30,
    },
    {
      id: 'breakthrough',
      type: 'growth',
      title: 'Breakthrough',
      emoji: '🌟',
      personaId: 'ferni',
      threshold: 50,
    },
  ];

  // Fetch celebrated milestones from Firestore
  const celebratedDocs = await db
    .collection(COLLECTIONS.milestones)
    .where('userId', '==', userId)
    .get();

  const celebratedMap = new Map<string, string>();
  celebratedDocs.forEach((doc) => {
    const data = doc.data();
    if (data.milestoneId && data.celebratedAt) {
      celebratedMap.set(data.milestoneId, data.celebratedAt);
    }
  });

  return MILESTONES.map((m) => ({
    id: m.id,
    type: m.type,
    title: m.title,
    emoji: m.emoji,
    personaId: m.personaId,
    celebratedAt: celebratedMap.get(m.id) || null,
    progressPercent: Math.min(100, Math.round((conversationCount / m.threshold) * 100)),
  }));
}

export default handleVisualStorytellingRoutes;
