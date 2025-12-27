/**
 * Year in Review API Routes
 *
 * Serves data for the "Your Year with Ferni" visualization.
 * Aggregates conversation history, emotional journey, milestones, and dreams.
 *
 * @module api/year-in-review-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { cleanForFirestore } from '../utils/firestore-utils.js';
import { sendJSON, sendError } from './helpers.js';

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

interface TeamUnlock {
  personaId: string;
  personaName: string;
  unlockedAt: string;
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
  totalMinutes: number;
  longestStreak: number;
  currentStreak: number;
  averageConversationsPerWeek: number;
  mostActiveMonth: string;
  teamMembersUnlocked: number;
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

async function fetchYearData(userId: string): Promise<YearData> {
  const now = new Date();
  const yearAgo = new Date(now);
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);

  // Fetch from various superhuman services
  const [conversations, dreams, commitments, relationships, teamStatus] = await Promise.all([
    fetchConversationHistory(userId, yearAgo),
    fetchDreams(userId),
    fetchCommitments(userId),
    fetchRelationships(userId),
    fetchTeamUnlocks(userId),
  ]);

  // Calculate stats
  const stats = calculateStats(conversations, dreams, commitments, teamStatus);

  return {
    userId,
    startDate: yearAgo.toISOString(),
    conversationCounts: conversations.daily,
    emotionalJourney: conversations.emotionalMoments,
    teamUnlocks: teamStatus,
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
  since: Date
): Promise<{
  daily: DayData[];
  emotionalMoments: EmotionalMoment[];
  milestones: Milestone[];
  topTopics: TopicSummary[];
}> {
  try {
    const { getFirestoreDb } = await import('../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) {
      return {
        daily: [],
        emotionalMoments: [],
        milestones: [],
        topTopics: [],
      };
    }

    // Fetch conversation summaries
    const convRef = db.collection('bogle_users').doc(userId).collection('conversation_summaries');

    const snapshot = await convRef
      .where('timestamp', '>=', since.getTime())
      .orderBy('timestamp', 'asc')
      .get();

    // Aggregate by day
    const dailyMap = new Map<string, DayData>();
    const emotionalMoments: EmotionalMoment[] = [];
    const topicCounts = new Map<string, { count: number; lastDiscussed: Date }>();
    const milestones: Milestone[] = [];

    let totalConversations = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const date = new Date(data.timestamp);
      const dateKey = date.toISOString().split('T')[0];

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
    };
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to fetch conversation history');
    return {
      daily: [],
      emotionalMoments: [],
      milestones: [],
      topTopics: [],
    };
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

async function fetchTeamUnlocks(userId: string): Promise<TeamUnlock[]> {
  try {
    const { getTeamUnlockState } = await import('../services/team-unlocks.js');
    const { getDefaultStore } = await import('../memory/in-memory-store.js');
    const store = getDefaultStore();
    const profile = await store.getProfile(userId);
    const state = getTeamUnlockState(profile);

    const PERSONA_COLORS: Record<string, string> = {
      ferni: '#4a6741',
      maya: '#a67a6a',
      peter: '#3a6b73',
      alex: '#5a6b8a',
      jordan: '#c4856a',
      nayan: '#b8956a',
    };

    return state.unlockedMembers.map((memberId) => ({
      personaId: memberId,
      personaName: memberId.charAt(0).toUpperCase() + memberId.slice(1),
      unlockedAt: new Date().toISOString(), // Approximate
      primaryColor: PERSONA_COLORS[memberId] || '#4a6741',
    }));
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to fetch team unlocks');
    return [
      {
        personaId: 'ferni',
        personaName: 'Ferni',
        unlockedAt: new Date().toISOString(),
        primaryColor: '#4a6741',
      },
    ];
  }
}

function calculateStats(
  conversations: { daily: DayData[]; milestones: Milestone[] },
  dreams: DreamProgress[],
  commitments: CommitmentSummary[],
  teamUnlocks: TeamUnlock[]
): YearStats {
  // Total conversations
  const totalConversations = conversations.daily.reduce((sum, d) => sum + d.count, 0);

  // Streak calculation
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;
  const sortedDays = [...conversations.daily].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const today = new Date().toISOString().split('T')[0];
  for (let i = 0; i < sortedDays.length; i++) {
    const day = sortedDays[i];
    const expectedDate = new Date();
    expectedDate.setDate(expectedDate.getDate() - i);
    const expectedDateStr = expectedDate.toISOString().split('T')[0];

    if (day.date === expectedDateStr) {
      tempStreak++;
      if (i === 0 || day.date === today) currentStreak = tempStreak;
    } else {
      if (tempStreak > longestStreak) longestStreak = tempStreak;
      tempStreak = 0;
    }
  }
  if (tempStreak > longestStreak) longestStreak = tempStreak;

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
    totalMinutes: totalConversations * 8, // Estimate 8 min avg
    longestStreak,
    currentStreak,
    averageConversationsPerWeek: totalConversations / 52,
    mostActiveMonth,
    teamMembersUnlocked: teamUnlocks.length,
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
    const userId = userMatch[1];

    try {
      log.info({ userId }, 'Fetching year in review data');
      const data = await fetchYearData(userId);
      sendJSON(res, data);
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to fetch year in review');
      sendError(res, 'Failed to fetch year in review data', 500);
    }

    return true;
  }

  return false;
}
