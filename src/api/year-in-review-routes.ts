/**
 * Year in Review API Routes
 *
 * Serves data for the "Your Year with Ferni" visualization.
 * Aggregates conversation history, emotional journey, milestones, and dreams.
 *
 * @module api/year-in-review-routes
 */

import type { DocumentData } from '@google-cloud/firestore';
import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { cleanForFirestore } from '../utils/firestore-utils.js';
import { requireAuth } from './auth-middleware.js';
import { sendJSON, sendError } from './helpers.js';
import {
  averageConversationsPerWeek,
  tenureOf,
  type ConversationTenure,
} from './year-in-review-stats.js';

const log = createLogger({ module: 'YearInReviewRoutes' });

// ============================================================================
// TYPES (matches frontend apps/web/src/ui/your-year-with-ferni.ui.ts)
// ============================================================================

interface DayData {
  date: string;
  count: number;
  dominantEmotion?: string;
}

interface EmotionalMoment {
  date: string;
  emotion: string;
  context?: string;
  intensity: number;
}

/** A teammate on this person's team (TEAM_BY_NEED: the whole team, nobody "unlocked"). */
interface TeamUnlock {
  personaId: string;
  personaName: string;
  primaryColor: string;
}

interface DreamProgress {
  dream: string;
  type: string;
  mentionedAt: string;
  status: 'active' | 'dormant' | 'achieved';
  mentionCount: number;
}

interface CommitmentSummary {
  type: 'intention' | 'promise' | 'decision';
  count: number;
  followedUp: number;
}

interface Milestone {
  date: string;
  type: string;
  description: string;
}

interface TopicSummary {
  topic: string;
  count: number;
  lastDiscussed: string;
}

interface RelationshipGrowth {
  peopleTracked: number;
  newConnections: number;
  deepenedRelationships: number;
}

interface YearStats {
  totalConversations: number;
  totalMinutes?: number; // only when every conversation recorded its duration
  // Always 0, kept for one release so a tab opened before this deploy (which
  // still reads them) doesn't break; the web no longer reads them, and they go
  // in a follow-up.
  longestStreak: 0;
  currentStreak: 0;
  teamMembersUnlocked: 0;
  averageConversationsPerWeek: number;
  mostActiveMonth: string;
  dreamsTracked: number;
  commitmentsKept: number;
}

interface YearData {
  userId: string;
  startDate: string;
  conversationCounts: DayData[];
  emotionalJourney: EmotionalMoment[];
  teamUnlocks: TeamUnlock[];
  dreams: DreamProgress[];
  commitments: CommitmentSummary[];
  milestones: Milestone[];
  topTopics: TopicSummary[];
  relationshipGrowth: RelationshipGrowth;
  stats: YearStats;
}

// ============================================================================
// DATA FETCHING (from Firestore superhuman services)
// ============================================================================

/** YYYY-MM-DD in the user's zone (UTC for none or an unknown zone): the heat map's day. */
function dayKeyIn(ms: number, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC' }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

async function fetchYearData(userId: string, timeZone?: string): Promise<YearData> {
  const now = new Date();
  const yearAgo = new Date(now);
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);

  // Fetch from various superhuman services
  const [conversations, dreams, commitments, relationships] = await Promise.all([
    fetchConversationHistory(userId, yearAgo, timeZone),
    fetchDreams(userId),
    fetchCommitments(userId),
    fetchRelationships(userId),
  ]);

  // Calculate stats
  const stats = calculateStats(conversations, dreams, commitments);

  return {
    userId,
    startDate: yearAgo.toISOString(),
    conversationCounts: conversations.daily,
    emotionalJourney: conversations.emotionalMoments,
    teamUnlocks: wholeTeam(),
    dreams,
    commitments,
    milestones: conversations.milestones,
    topTopics: conversations.topTopics,
    relationshipGrowth: relationships,
    stats,
  };
}

async function fetchConversationHistory(
  userId: string,
  since: Date,
  timeZone?: string
): Promise<
  {
    daily: DayData[];
    emotionalMoments: EmotionalMoment[];
    milestones: Milestone[];
    topTopics: TopicSummary[];
  } & ConversationTenure
> {
  try {
    const { getFirestoreDb } = await import('../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) throw new Error('Firestore unavailable'); // an empty year would be a lie

    // Calls save their summary to bogle_users/{uid}/summaries (end-session → saveSummary), with
    // an ISO timestamp. This read conversation_summaries, which nothing live writes.
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('summaries')
      .where('timestamp', '>=', since.toISOString())
      .orderBy('timestamp', 'asc')
      .select('timestamp', 'duration', 'mainTopics')
      .get();
    const summaries = snapshot.docs.map((d): DocumentData => {
      const data = d.data();
      return { ...data, timestamp: Date.parse(String(data.timestamp)), topics: data.mainTopics };
    });

    // Aggregate by day
    const dailyMap = new Map<string, DayData>();
    const emotionalMoments: EmotionalMoment[] = [];
    const topicCounts = new Map<string, { count: number; lastDiscussed: Date }>();
    const milestones: Milestone[] = [];

    let totalConversations = 0;

    for (const data of summaries) {
      const date = new Date(data.timestamp);
      const dateKey = dayKeyIn(date.getTime(), timeZone);

      // Daily count
      const existing = dailyMap.get(dateKey);
      if (existing) {
        existing.count++;
      } else {
        dailyMap.set(cleanForFirestore(dateKey), {
          date: dateKey,
          count: 1,
          dominantEmotion: data.dominantEmotion,
        });
      }

      totalConversations++;

      // Track emotional moments (significant emotions)
      if (data.emotionalIntensity > 0.7) {
        emotionalMoments.push({
          date: date.toISOString(),
          emotion: data.dominantEmotion || 'reflective',
          context: data.topic,
          intensity: data.emotionalIntensity,
        });
      }

      // Track topics
      if (data.topics) {
        for (const topic of data.topics) {
          const topicData = topicCounts.get(topic) || { count: 0, lastDiscussed: date };
          topicData.count++;
          if (date > topicData.lastDiscussed) topicData.lastDiscussed = date;
          topicCounts.set(topic, topicData);
        }
      }

      // Check for conversation milestones
      if (totalConversations === 50) {
        milestones.push({
          date: date.toISOString(),
          type: 'conversation',
          description: '50 conversations',
        });
      } else if (totalConversations === 100) {
        milestones.push({
          date: date.toISOString(),
          type: 'conversation',
          description: '100 conversations',
        });
      }
    }

    // Convert maps to arrays
    const daily = Array.from(dailyMap.values());
    const topTopics = Array.from(topicCounts.entries())
      .map(([topic, data]) => ({
        topic,
        count: data.count,
        lastDiscussed: data.lastDiscussed.toISOString(),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      daily,
      emotionalMoments: emotionalMoments.slice(0, 10), // Top 10 moments
      milestones,
      topTopics,
      ...tenureOf(summaries),
    };
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to fetch conversation history');
    throw error; // the route answers 500 and the panel says so, not "no conversations yet"
  }
}

async function fetchDreams(userId: string): Promise<DreamProgress[]> {
  try {
    const { loadUserDreams } = await import('../services/superhuman/dream-keeper.js');
    const dreams = await loadUserDreams(userId);

    return dreams.map((d) => ({
      dream: d.title || d.statement,
      type: d.type,
      mentionedAt: new Date(d.firstMentioned).toISOString(),
      status: d.status === 'achieved' ? 'achieved' : d.status === 'dormant' ? 'dormant' : 'active',
      mentionCount: d.mentionCount,
    }));
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to fetch dreams');
    return [];
  }
}

async function fetchCommitments(userId: string): Promise<CommitmentSummary[]> {
  try {
    const { loadUserCommitments } = await import('../services/superhuman/commitment-keeper.js');
    const commitments = await loadUserCommitments(userId);

    // Aggregate by type
    const byType = new Map<string, { count: number; followedUp: number }>();

    for (const c of commitments) {
      const type =
        c.type === 'intention' || c.type === 'promise' || c.type === 'decision'
          ? c.type
          : 'intention';
      const existing = byType.get(type) || { count: 0, followedUp: 0 };
      existing.count++;
      if (c.status === 'completed') existing.followedUp++;
      byType.set(type, existing);
    }

    return Array.from(byType.entries()).map(([type, data]) => ({
      type: type as 'intention' | 'promise' | 'decision',
      count: data.count,
      followedUp: data.followedUp,
    }));
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to fetch commitments');
    return [];
  }
}

async function fetchRelationships(userId: string): Promise<RelationshipGrowth> {
  try {
    const { loadNetwork } = await import('../services/superhuman/relationship-network.js');
    const relationships = await loadNetwork(userId);

    const yearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
    const newConnections = relationships.filter((r) => r.firstMentioned > yearAgo).length;
    // Count relationships with significant engagement
    const deepened = relationships.filter((r) => r.mentionCount > 3).length;

    return {
      peopleTracked: relationships.length,
      newConnections,
      deepenedRelationships: deepened,
    };
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to fetch relationships');
    return {
      peopleTracked: 0,
      newConnections: 0,
      deepenedRelationships: 0,
    };
  }
}

/**
 * The whole team, always: TEAM_BY_NEED (Seth, 2026-10-11) puts everyone on the
 * team from the first call, as Meet Your Team shows, whatever this server's flag.
 */
const TEAM: readonly TeamUnlock[] = [
  { personaId: 'ferni', personaName: 'Ferni', primaryColor: '#4a6741' },
  { personaId: 'maya-santos', personaName: 'Maya', primaryColor: '#a67a6a' },
  { personaId: 'peter-john', personaName: 'Peter', primaryColor: '#3a6b73' },
  { personaId: 'alex-chen', personaName: 'Alex', primaryColor: '#5a6b8a' },
  { personaId: 'jordan-taylor', personaName: 'Jordan', primaryColor: '#c4856a' },
  { personaId: 'nayan-patel', personaName: 'Nayan', primaryColor: '#b8956a' },
];

function wholeTeam(): TeamUnlock[] {
  return TEAM.map((member) => ({ ...member }));
}

function calculateStats(
  conversations: { daily: DayData[]; milestones: Milestone[] } & ConversationTenure,
  dreams: DreamProgress[],
  commitments: CommitmentSummary[]
): YearStats {
  // Total conversations
  const totalConversations = conversations.daily.reduce((sum, d) => sum + d.count, 0);

  // No streaks (Seth, 2026-10-11 TEAM_BY_NEED / 2026-10-17): showing up is never tallied.

  // Most active month
  const monthCounts = new Map<string, number>();
  for (const day of conversations.daily) {
    const month = day.date.slice(0, 7); // YYYY-MM
    monthCounts.set(month, (monthCounts.get(month) || 0) + day.count);
  }
  let mostActiveMonth = 'Unknown';
  let maxCount = 0;
  monthCounts.forEach((count, month) => {
    if (count > maxCount) {
      maxCount = count;
      const monthDate = new Date(`${month}-01`);
      mostActiveMonth = monthDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    }
  });

  // Commitments kept
  const commitmentsKept = commitments.reduce((sum, c) => sum + c.followedUp, 0);

  return {
    totalConversations,
    totalMinutes: conversations.minutes,
    longestStreak: 0,
    currentStreak: 0,
    teamMembersUnlocked: 0,
    averageConversationsPerWeek: averageConversationsPerWeek(totalConversations, conversations),
    mostActiveMonth,
    dreamsTracked: dreams.length,
    commitmentsKept,
  };
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleYearInReviewRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: { pathname: string; query: Record<string, string | string[] | undefined> }
): Promise<boolean> {
  const { pathname } = parsedUrl;
  const { method } = req;

  // GET /api/year-in-review/:userId
  const userMatch = pathname.match(/^\/api\/year-in-review\/([^/]+)$/);
  if (method === 'GET' && userMatch) {
    // A year in review holds the person's commitments, dreams and conversation stats.
    // It used to answer anyone for any id in the URL; only the person (or an admin) may read it.
    const auth = await requireAuth(req, res);
    if (!auth) return true;
    const userId = userMatch[1] ?? '';
    if (userId !== auth.userId && !auth.isAdmin) {
      sendError(res, "That isn't yours to see.", 403);
      return true;
    }

    try {
      log.info({ userId }, 'Fetching year in review data');
      const tz = typeof parsedUrl.query.tz === 'string' ? parsedUrl.query.tz : undefined;
      const data = await fetchYearData(userId, tz); // days in the caller's zone, not UTC
      sendJSON(res, data);
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to fetch year in review');
      sendError(res, 'Failed to fetch year in review data', 500);
    }

    return true;
  }

  return false;
}
