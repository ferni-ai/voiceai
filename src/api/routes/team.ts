/**
 * Team Routes
 *
 * GET /api/huddles - Get team huddles
 * POST /api/huddles/start - Start a new team huddle
 * GET /api/huddles/:id - Get specific huddle
 * GET /api/huddles/:id/participants - Get huddle participants
 * POST /api/huddles/:id/complete - Complete a huddle
 *
 * Wired to TeamEngagementService for persistence and rich persona responses.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { requireUserId, sendJSON, sendJSONCached } from '../helpers.js';
import type { AnyRecord } from './types.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import {
  getTeamEngagementService,
  TEAM_HUDDLE_SCRIPTS,
} from '../../services/engagement/team-engagement.js';

const log = createLogger({ module: 'TeamAPI' });

// ============================================================================
// PERSONA CONFIG - Using canonical IDs matching the rest of the system
// ============================================================================

const PERSONAS = [
  { id: 'ferni', name: 'Ferni', specialty: 'Life coaching, overall guidance', initials: 'F' },
  {
    id: 'maya-santos',
    name: 'Maya Santos',
    specialty: 'Habits, routines, consistency',
    initials: 'MS',
  },
  { id: 'peter-john', name: 'Peter John', specialty: 'Research, patterns, data', initials: 'PJ' },
  { id: 'alex-chen', name: 'Alex Chen', specialty: 'Communication, productivity', initials: 'AC' },
  {
    id: 'jordan-taylor',
    name: 'Jordan Taylor',
    specialty: 'Planning, events, milestones',
    initials: 'JT',
  },
  {
    id: 'nayan-patel',
    name: 'Nayan Patel',
    specialty: 'Mindfulness, meditation, wisdom',
    initials: 'NP',
  },
];

// Persona colors from design system
const PERSONA_COLORS: Record<string, string> = {
  ferni: 'var(--persona-ferni-primary, #4a6741)',
  'maya-santos': 'var(--persona-maya-primary, #a67a6a)',
  'peter-john': 'var(--persona-peter-primary, #3a6b73)',
  'alex-chen': 'var(--persona-alex-primary, #5a6b8a)',
  'jordan-taylor': 'var(--persona-jordan-primary, #c4856a)',
  'nayan-patel': 'var(--persona-nayan-primary, #b8956a)',
};

// ============================================================================
// HUDDLE STORAGE - Using Firestore via TeamEngagementService
// Also keep local cache for active session
// ============================================================================

interface TeamHuddle {
  id: string;
  userId: string;
  topic: string;
  participants: string[];
  status: 'active' | 'completed' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  recommendations: string[];
  transcript?: string;
  // UI-compatible fields
  title: string;
  intro: string;
  outro: string;
  participantDetails: Array<{
    personaId: string;
    name: string;
    initials: string;
    comment: string;
    avatarColor: string;
  }>;
}

// Local cache for active huddles (also persisted via TeamEngagementService)
const activeHuddles = new Map<string, TeamHuddle>();

// ============================================================================
// TOPIC-BASED PARTICIPANT SELECTION
// ============================================================================

function selectParticipants(topic: string): string[] {
  const topicLower = topic.toLowerCase();

  // Always include Ferni as the facilitator
  const participants = ['ferni'];

  // Add relevant specialists based on topic keywords
  if (
    topicLower.includes('habit') ||
    topicLower.includes('routine') ||
    topicLower.includes('consistency') ||
    topicLower.includes('tiny') ||
    topicLower.includes('compound')
  ) {
    participants.push('maya-santos');
  }
  if (
    topicLower.includes('research') ||
    topicLower.includes('data') ||
    topicLower.includes('analyze') ||
    topicLower.includes('pattern') ||
    topicLower.includes('invest')
  ) {
    participants.push('peter-john');
  }
  if (
    topicLower.includes('relationship') ||
    topicLower.includes('communicate') ||
    topicLower.includes('talk') ||
    topicLower.includes('email') ||
    topicLower.includes('productivity')
  ) {
    participants.push('alex-chen');
  }
  if (
    topicLower.includes('plan') ||
    topicLower.includes('event') ||
    topicLower.includes('organize') ||
    topicLower.includes('milestone') ||
    topicLower.includes('goal')
  ) {
    participants.push('jordan-taylor');
  }
  if (
    topicLower.includes('stress') ||
    topicLower.includes('calm') ||
    topicLower.includes('meditat') ||
    topicLower.includes('anxious') ||
    topicLower.includes('mindful') ||
    topicLower.includes('peace')
  ) {
    participants.push('nayan-patel');
  }

  // If only Ferni selected, add 2 more based on general utility
  if (participants.length === 1) {
    participants.push('maya-santos', 'peter-john');
  }

  // Limit to 3-4 participants for manageable discussions
  return participants.slice(0, 4);
}

// ============================================================================
// USER ENGAGEMENT DATA FOR PERSONALIZED COMMENTS
// ============================================================================

interface UserEngagementInsights {
  // Habit tracking
  streaks: Array<{
    ritualName: string;
    currentStreak: number;
    longestStreak: number;
    isPersonalBest: boolean;
    lastCompletedAt: string | null;
  }>;
  activeStreakCount: number;
  longestOverallStreak: number;
  totalRitualDays: number;

  // Mood patterns (includes all EmotionalWeather types)
  recentMood:
    | 'sunny'
    | 'partly-cloudy'
    | 'cloudy'
    | 'rainy'
    | 'stormy'
    | 'foggy'
    | 'rainbow'
    | null;
  moodTrend: 'improving' | 'stable' | 'declining' | 'unknown';
  averageEnergy: 'high' | 'medium' | 'low' | null;

  // Engagement
  totalConversations: number;
  daysSinceFirstConversation: number;
  conversationsThisWeek: number;

  // Time patterns
  mostActiveDay: string | null;
  preferredTime: 'morning' | 'afternoon' | 'evening' | null;
}

/**
 * Fetch user engagement data for generating personalized comments
 */
async function getUserEngagementInsights(userId: string): Promise<UserEngagementInsights> {
  const defaultInsights: UserEngagementInsights = {
    streaks: [],
    activeStreakCount: 0,
    longestOverallStreak: 0,
    totalRitualDays: 0,
    recentMood: null,
    moodTrend: 'unknown',
    averageEnergy: null,
    totalConversations: 0,
    daysSinceFirstConversation: 0,
    conversationsThisWeek: 0,
    mostActiveDay: null,
    preferredTime: null,
  };

  try {
    const { getEngagementStore } = await import('../../services/engagement/engagement-store.js');
    const store = await getEngagementStore();

    // Get profile and streaks
    const profile = await store.getProfile(userId);
    const streaks = await store.getAllStreaks(userId);
    const weatherHistory = await store.getWeatherHistory(userId, 14);

    // Process streaks
    const processedStreaks = streaks.map((s) => ({
      ritualName: getRitualDisplayName(s.ritualId),
      currentStreak: s.currentStreak,
      longestStreak: s.longestStreak,
      isPersonalBest: s.currentStreak >= s.longestStreak && s.currentStreak > 0,
      lastCompletedAt: s.lastCompletedAt,
    }));

    // Calculate mood trend from weather history
    let moodTrend: UserEngagementInsights['moodTrend'] = 'unknown';
    let recentMood: UserEngagementInsights['recentMood'] = null;
    let averageEnergy: UserEngagementInsights['averageEnergy'] = null;

    if (weatherHistory.length > 0) {
      recentMood = weatherHistory[0]?.weather?.primary || null;

      // Calculate mood trend (last 7 days vs previous 7)
      const moodValues: Record<string, number> = {
        sunny: 5,
        'partly-cloudy': 4,
        cloudy: 3,
        rainy: 2,
        stormy: 1,
      };

      const recentWeather = weatherHistory.slice(0, 7);
      const olderWeather = weatherHistory.slice(7, 14);

      if (recentWeather.length >= 3 && olderWeather.length >= 3) {
        const recentAvg =
          recentWeather.reduce((sum, w) => sum + (moodValues[w.weather.primary] || 3), 0) /
          recentWeather.length;
        const olderAvg =
          olderWeather.reduce((sum, w) => sum + (moodValues[w.weather.primary] || 3), 0) /
          olderWeather.length;

        if (recentAvg > olderAvg + 0.5) moodTrend = 'improving';
        else if (recentAvg < olderAvg - 0.5) moodTrend = 'declining';
        else moodTrend = 'stable';
      }

      // Calculate average energy
      const energyValues: Record<string, number> = { high: 3, medium: 2, low: 1 };
      const energySum = recentWeather.reduce(
        (sum, w) => sum + (energyValues[w.weather.energy] || 2),
        0
      );
      const energyAvg = energySum / recentWeather.length;
      if (energyAvg >= 2.5) averageEnergy = 'high';
      else if (energyAvg >= 1.5) averageEnergy = 'medium';
      else averageEnergy = 'low';
    }

    // Calculate days since first conversation
    const createdAt = profile.createdAt ? new Date(profile.createdAt) : new Date();
    const daysSinceFirst = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

    // Calculate most active day from session/weather history
    const mostActiveDay = await calculateMostActiveDay(userId, weatherHistory);

    return {
      streaks: processedStreaks,
      activeStreakCount: streaks.filter((s) => s.currentStreak > 0).length,
      longestOverallStreak: profile.longestOverallStreak || 0,
      totalRitualDays: profile.totalRitualDays || 0,
      recentMood,
      moodTrend,
      averageEnergy,
      totalConversations: profile.stats?.totalSkyChecks || 0,
      daysSinceFirstConversation: daysSinceFirst,
      conversationsThisWeek: weatherHistory.length,
      mostActiveDay,
      preferredTime: profile.preferences?.preferredTime || null,
    };
  } catch (err) {
    log.warn({ error: err, userId }, 'Failed to fetch engagement insights, using defaults');
    return defaultInsights;
  }
}

// Team analytics cache (1 hour TTL)
const teamAnalyticsCache = new Map<string, { data: string | null; timestamp: number }>();
const TEAM_ANALYTICS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Calculate the most active day of the week from session data
 * @returns Day name (e.g., "Monday", "Tuesday") or null if insufficient data
 */
async function calculateMostActiveDay(
  userId: string,
  weatherHistory: Array<{ date?: string; weather: { primary: string; energy: string } }>
): Promise<string | null> {
  // Check cache first
  const cacheKey = `mostActiveDay:${userId}`;
  const cached = teamAnalyticsCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < TEAM_ANALYTICS_CACHE_TTL_MS) {
    return cached.data;
  }
  try {
    // Count sessions by day of week
    const dayCount: Record<string, number> = {
      Sunday: 0,
      Monday: 0,
      Tuesday: 0,
      Wednesday: 0,
      Thursday: 0,
      Friday: 0,
      Saturday: 0,
    };

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Count from weather history (recent data)
    for (const entry of weatherHistory) {
      if (entry.date) {
        const date = new Date(entry.date);
        const dayName = dayNames[date.getDay()];
        dayCount[dayName]++;
      }
    }

    // Try to get more session data from Firestore for better accuracy
    try {
      const { getConversationHistoryService } = await import(
        '../../services/stores/conversation-history.js'
      );
      const historyService = getConversationHistoryService();
      const history = await historyService.getHistory(userId, 30);

      if (history?.sessions) {
        for (const session of history.sessions) {
          if (session.date) {
            const date = new Date(session.date);
            const dayName = dayNames[date.getDay()];
            dayCount[dayName]++;
          }
        }
      }
    } catch {
      // Silently continue with weather data only
    }

    // Find the most active day
    let maxCount = 0;
    let mostActiveDay: string | null = null;

    for (const [day, count] of Object.entries(dayCount)) {
      if (count > maxCount) {
        maxCount = count;
        mostActiveDay = day;
      }
    }

    // Only return if we have meaningful data (at least 3 sessions on that day)
    const result = maxCount >= 3 ? mostActiveDay : null;

    // Cache the result
    teamAnalyticsCache.set(cacheKey, { data: result, timestamp: Date.now() });

    // Cleanup old cache entries periodically
    if (teamAnalyticsCache.size > 500) {
      const now = Date.now();
      for (const [key, value] of teamAnalyticsCache.entries()) {
        if (now - value.timestamp > TEAM_ANALYTICS_CACHE_TTL_MS) {
          teamAnalyticsCache.delete(key);
        }
      }
    }

    return result;
  } catch (err) {
    log.debug({ error: err, userId }, 'Could not calculate most active day');
    return null;
  }
}

/**
 * Get display name for a ritual ID
 */
function getRitualDisplayName(ritualId: string): string {
  const names: Record<string, string> = {
    'ferni-sky-check': 'Morning Sky Check',
    'maya-habit-heartbeat': 'Habit Heartbeat',
    'alex-inbox-pulse': 'Inbox Pulse',
    'jordan-todays-chapter': "Today's Chapter",
    'nayan-morning-stillness': 'Morning Stillness',
    'peter-pattern-pulse': 'Pattern Pulse',
  };
  return names[ritualId] || ritualId;
}

// ============================================================================
// PERSONA-SPECIFIC COMMENTS - DATA-DRIVEN
// ============================================================================

/**
 * Generate a personalized comment based on real user data
 * Falls back to static templates if no relevant data exists
 */
async function getPersonaComment(
  personaId: string,
  topic: string,
  userId: string
): Promise<string> {
  // Fetch user engagement data
  const insights = await getUserEngagementInsights(userId);

  // Try to generate a data-driven comment first
  const dataComment = generateDataDrivenComment(personaId, insights, topic);
  if (dataComment) {
    return dataComment;
  }

  // Fall back to static templates
  return getStaticPersonaComment(personaId, topic);
}

/**
 * Generate a comment based on actual user data
 */
function generateDataDrivenComment(
  personaId: string,
  insights: UserEngagementInsights,
  _topic: string
): string | null {
  // Ferni - General life coaching insights
  if (personaId === 'ferni') {
    if (insights.daysSinceFirstConversation > 30 && insights.totalConversations > 10) {
      return "I've been watching your journey. The person I'm talking to now has grown since we started.";
    }
    if (insights.moodTrend === 'improving') {
      return "I've noticed your energy shifting lately. Something's clicking for you.";
    }
    if (insights.moodTrend === 'declining' && insights.activeStreakCount > 0) {
      return "It's been a heavier stretch, but you're still showing up. That matters.";
    }
    if (insights.totalConversations < 5) {
      return "We're still getting to know each other, but I like what I'm seeing.";
    }
  }

  // Maya - Habits and routines
  if (personaId === 'maya-santos') {
    // Find the best active streak
    const bestStreak = insights.streaks.find((s) => s.currentStreak > 0);
    if (bestStreak && bestStreak.currentStreak >= 7) {
      return `${bestStreak.currentStreak} days on your ${bestStreak.ritualName}. That's not luck—that's you building something real.`;
    }
    if (bestStreak && bestStreak.isPersonalBest) {
      return `Personal best on your ${bestStreak.ritualName}! Compound and Interest are proud of you.`;
    }
    if (insights.activeStreakCount >= 2) {
      return `${insights.activeStreakCount} active streaks right now. You're building momentum.`;
    }
    if (insights.activeStreakCount === 0 && insights.totalRitualDays > 0) {
      return "Streaks come and go—what matters is that you've shown up before. Ready to rebuild?";
    }
  }

  // Peter John - Data patterns
  if (personaId === 'peter-john') {
    if (insights.moodTrend !== 'unknown' && insights.conversationsThisWeek >= 3) {
      if (insights.moodTrend === 'improving') {
        return "The data shows an upward trend in your energy this week. Something's working.";
      }
      if (insights.moodTrend === 'stable') {
        return 'Your patterns are remarkably consistent lately. That stability is valuable.';
      }
    }
    if (insights.preferredTime) {
      const timeLabel =
        insights.preferredTime === 'morning'
          ? 'morning'
          : insights.preferredTime === 'afternoon'
            ? 'afternoon'
            : 'evening';
      return `The data suggests you do your best work in the ${timeLabel}. Protect that time.`;
    }
    if (insights.longestOverallStreak >= 14) {
      return `Your longest streak was ${insights.longestOverallStreak} days. The data says you have that consistency in you.`;
    }
  }

  // Alex - Communication and productivity
  if (personaId === 'alex-chen') {
    if (insights.conversationsThisWeek >= 5) {
      return "You've been checking in consistently this week. That level of engagement drives results.";
    }
    if (insights.averageEnergy === 'high') {
      return 'Your energy levels have been high. Channel that into your priorities.';
    }
    if (insights.averageEnergy === 'low') {
      return "Energy's been lower lately. Sometimes that means it's time to protect your boundaries.";
    }
  }

  // Jordan - Milestones and life arcs
  if (personaId === 'jordan-taylor') {
    if (insights.daysSinceFirstConversation >= 30) {
      const months = Math.floor(insights.daysSinceFirstConversation / 30);
      return `${months} month${months > 1 ? 's' : ''} on this journey. That's a chapter worth acknowledging.`;
    }
    if (insights.totalRitualDays >= 21) {
      return `${insights.totalRitualDays} days of showing up. You're writing a growth chapter.`;
    }
    const personalBestStreak = insights.streaks.find(
      (s) => s.isPersonalBest && s.currentStreak > 3
    );
    if (personalBestStreak) {
      return `New personal best coming up! That's milestone territory.`;
    }
  }

  // Nayan - Mindfulness and wisdom
  if (personaId === 'nayan-patel') {
    if (insights.moodTrend === 'declining') {
      return "The heaviness you're feeling—are you sitting with it, or running from it?";
    }
    if (insights.recentMood === 'stormy' || insights.recentMood === 'rainy') {
      return 'Difficult weather passes. The stillness is always there underneath.';
    }
    if (insights.activeStreakCount >= 2) {
      return "Consistency is a form of presence. You're showing up for yourself.";
    }
  }

  // No data-driven comment available
  return null;
}

/**
 * Get a static comment from templates (fallback)
 */
function getStaticPersonaComment(personaId: string, topic: string): string {
  const scripts = TEAM_HUDDLE_SCRIPTS.personaComments;
  const personaScripts = scripts[personaId as keyof typeof scripts] as
    | Record<string, string[]>
    | undefined;

  if (!personaScripts) {
    return "I'm glad to be part of this discussion.";
  }

  // Try to find topic-relevant category
  const topicLower = topic.toLowerCase();
  let commentPool: string[] = [];

  // Use type-safe property access with Record
  if (personaId === 'ferni') {
    commentPool = personaScripts['progress'] || [];
  } else if (personaId === 'maya-santos') {
    if (topicLower.includes('habit') || topicLower.includes('routine')) {
      commentPool = personaScripts['habits'] || [];
    } else {
      commentPool = personaScripts['encouragement'] || personaScripts['habits'] || [];
    }
  } else if (personaId === 'alex-chen') {
    if (topicLower.includes('product') || topicLower.includes('work')) {
      commentPool = personaScripts['productivity'] || [];
    } else {
      commentPool = personaScripts['suggestion'] || personaScripts['productivity'] || [];
    }
  } else if (personaId === 'jordan-taylor') {
    if (topicLower.includes('milestone') || topicLower.includes('goal')) {
      commentPool = personaScripts['milestones'] || [];
    } else {
      commentPool = personaScripts['future'] || personaScripts['milestones'] || [];
    }
  } else if (personaId === 'nayan-patel') {
    if (topicLower.includes('stress') || topicLower.includes('anxious')) {
      commentPool = personaScripts['challenge'] || [];
    } else {
      commentPool = personaScripts['wisdom'] || personaScripts['challenge'] || [];
    }
  } else if (personaId === 'peter-john') {
    if (topicLower.includes('pattern') || topicLower.includes('data')) {
      commentPool = personaScripts['patterns'] || [];
    } else {
      commentPool = personaScripts['insight'] || personaScripts['patterns'] || [];
    }
  }

  if (commentPool.length === 0) {
    // Fallback to any available comments
    const allComments = Object.values(personaScripts)
      .flat()
      .filter((c): c is string => typeof c === 'string');
    commentPool = allComments;
  }

  if (commentPool.length === 0) {
    return "I'm glad to be part of this discussion.";
  }

  return commentPool[Math.floor(Math.random() * commentPool.length)];
}

// ============================================================================
// RECOMMENDATION GENERATION
// ============================================================================

function generateRecommendations(topic: string, participants: string[]): string[] {
  const recommendations: string[] = [];
  const topicLower = topic.toLowerCase();

  // Topic-aware recommendations
  if (participants.includes('ferni')) {
    if (topicLower.includes('stuck') || topicLower.includes('overwhelm')) {
      recommendations.push(
        "Start with the smallest possible step. What's one thing you could do in the next 5 minutes?"
      );
    } else {
      recommendations.push('Consider breaking this down into smaller, actionable steps.');
    }
  }

  if (participants.includes('maya-santos')) {
    if (topicLower.includes('habit')) {
      recommendations.push('Attach this to an existing habit—habit stacking makes it stick.');
    } else {
      recommendations.push('Build this into your daily routine for consistency. Start tiny.');
    }
  }

  if (participants.includes('peter-john')) {
    if (topicLower.includes('pattern')) {
      recommendations.push('Track this for a week. The patterns will reveal themselves.');
    } else {
      recommendations.push("Track your progress with measurable metrics. Data doesn't lie.");
    }
  }

  if (participants.includes('alex-chen')) {
    if (topicLower.includes('communicate') || topicLower.includes('relationship')) {
      recommendations.push(
        'Have the conversation sooner rather than later. Clarity prevents misunderstanding.'
      );
    } else {
      recommendations.push('Communicate your goals with people who can support you.');
    }
  }

  if (participants.includes('jordan-taylor')) {
    if (topicLower.includes('goal') || topicLower.includes('milestone')) {
      recommendations.push('Set a specific date for your milestone. Put it on the calendar now.');
    } else {
      recommendations.push('Create a timeline with specific milestones to celebrate.');
    }
  }

  if (participants.includes('nayan-patel')) {
    if (topicLower.includes('stress') || topicLower.includes('anxious')) {
      recommendations.push(
        'Before acting, pause. Three breaths. The answer often comes in stillness.'
      );
    } else {
      recommendations.push("Remember to check in with how you're feeling along the way.");
    }
  }

  return recommendations;
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

/**
 * GET /api/huddles - Get team huddles
 */
export async function handleGetHuddles(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const { getEngagementStore } = await import('../../services/engagement/engagement-store.js');
    const store = await getEngagementStore();
    const profile = (await store.getProfile(userId)) as unknown as AnyRecord;

    // Get user's recent huddles from local cache
    const userHuddles = Array.from(activeHuddles.values())
      .filter((h) => h.userId === userId)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, 10)
      .map((h) => ({
        id: h.id,
        title: h.title,
        topic: h.topic,
        intro: h.intro,
        outro: h.outro,
        participants: h.participantDetails,
        status: h.status,
        startedAt: h.startedAt.toISOString(),
        completedAt: h.completedAt?.toISOString(),
        recommendations: h.recommendations,
        type: 'weekly' as const,
        scheduledAt: h.startedAt.toISOString(),
      }));

    sendJSONCached(
      res,
      {
        totalHuddles:
          ((profile.stats as AnyRecord)?.teamHuddlesAttended as number) || userHuddles.length,
        lastHuddleAt: profile.lastEngagementAt,
        recentHuddles: userHuddles,
        availablePersonas: PERSONAS,
      },
      60
    );
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get huddles');
    sendJSON(res, { error: 'Failed to get huddles', totalHuddles: 0, recentHuddles: [] }, 500);
  }
}

/**
 * POST /api/huddles/start - Start a new team huddle
 */
async function handleStartHuddle(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    // Parse request body
    const body = await new Promise<string>((resolve) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
      });
      req.on('end', () => resolve(data));
    });

    const parsed = JSON.parse(body || '{}');
    const topic = parsed.topic || 'General discussion';
    const type = parsed.type || 'weekly';

    // Select participants based on topic
    const participantIds = selectParticipants(topic);

    // Build participant details with persona-specific comments (data-driven)
    const participantDetails = await Promise.all(
      participantIds.map(async (personaId) => {
        const persona = PERSONAS.find((p) => p.id === personaId);
        return {
          personaId,
          name: persona?.name || personaId,
          initials: persona?.initials || personaId.charAt(0).toUpperCase(),
          comment: await getPersonaComment(personaId, topic, userId),
          avatarColor: PERSONA_COLORS[personaId] || 'var(--persona-ferni-primary)',
        };
      })
    );

    // Get intro/outro from TeamEngagementService scripts
    const scripts = TEAM_HUDDLE_SCRIPTS.weekly;
    const intro = scripts.intro[Math.floor(Math.random() * scripts.intro.length)];
    const outro = scripts.outro[Math.floor(Math.random() * scripts.outro.length)];

    // Create huddle with UI-compatible format
    const huddle: TeamHuddle = {
      id: `huddle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      topic,
      participants: participantIds,
      status: 'active',
      startedAt: new Date(),
      recommendations: [],
      title: type === 'milestone' ? 'Milestone Celebration' : 'Team Check-in',
      intro,
      outro,
      participantDetails,
    };

    // Store in local cache
    activeHuddles.set(huddle.id, huddle);

    // Also record in TeamEngagementService for persistence
    try {
      const teamService = getTeamEngagementService();
      await teamService.generateTeamHuddle(
        userId,
        null,
        type as 'weekly' | 'milestone' | 'special'
      );
    } catch (persistErr) {
      log.warn({ error: persistErr }, 'Failed to persist huddle to TeamEngagementService');
    }

    log.info(
      { userId, huddleId: huddle.id, topic, participants: participantIds },
      'Team huddle started'
    );

    // Return in format compatible with frontend TeamHuddleData
    sendJSON(res, {
      success: true,
      huddle: {
        id: huddle.id,
        title: huddle.title,
        topic: huddle.topic,
        intro: huddle.intro,
        outro: huddle.outro,
        participants: huddle.participantDetails,
        status: huddle.status,
        startedAt: huddle.startedAt.toISOString(),
        type,
        scheduledAt: huddle.startedAt.toISOString(),
      },
      message: `Starting a team huddle with ${participantIds.length} team members to discuss: "${topic}"`,
    });
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to start huddle');
    sendJSON(res, { error: 'Failed to start huddle' }, 500);
  }
}

/**
 * GET /api/huddles/:id - Get specific huddle
 */
async function handleGetHuddle(res: ServerResponse, huddleId: string): Promise<void> {
  const huddle = activeHuddles.get(huddleId);

  if (!huddle) {
    sendJSON(res, { error: 'Huddle not found' }, 404);
    return;
  }

  sendJSON(res, {
    huddle: {
      id: huddle.id,
      title: huddle.title,
      topic: huddle.topic,
      intro: huddle.intro,
      outro: huddle.outro,
      participants: huddle.participantDetails,
      status: huddle.status,
      startedAt: huddle.startedAt.toISOString(),
      completedAt: huddle.completedAt?.toISOString(),
      recommendations: huddle.recommendations,
      type: 'weekly',
      scheduledAt: huddle.startedAt.toISOString(),
    },
  });
}

/**
 * GET /api/huddles/:id/participants - Get huddle participants
 */
async function handleGetParticipants(res: ServerResponse, huddleId: string): Promise<void> {
  const huddle = activeHuddles.get(huddleId);

  if (!huddle) {
    sendJSON(res, { error: 'Huddle not found' }, 404);
    return;
  }

  sendJSON(res, {
    participants: huddle.participantDetails.map((p) => ({
      ...p,
      isActive: true,
    })),
  });
}

/**
 * POST /api/huddles/:id/complete - Complete a huddle
 */
async function handleCompleteHuddle(
  req: IncomingMessage,
  res: ServerResponse,
  huddleId: string
): Promise<void> {
  const huddle = activeHuddles.get(huddleId);

  if (!huddle) {
    sendJSON(res, { error: 'Huddle not found' }, 404);
    return;
  }

  // Generate recommendations based on the topic and participants
  huddle.recommendations = generateRecommendations(huddle.topic, huddle.participants);
  huddle.status = 'completed';
  huddle.completedAt = new Date();

  activeHuddles.set(huddleId, huddle);

  log.info({ huddleId, userId: huddle.userId }, 'Team huddle completed');

  sendJSON(res, {
    success: true,
    huddle: {
      id: huddle.id,
      title: huddle.title,
      topic: huddle.topic,
      status: huddle.status,
      completedAt: huddle.completedAt.toISOString(),
      recommendations: huddle.recommendations,
    },
    message: "Huddle completed! Here are your team's recommendations.",
  });
}

/**
 * Route handler for team endpoints
 */
export async function handleTeamRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // GET /api/huddles
  if (pathname === '/api/huddles' && req.method === 'GET') {
    await handleGetHuddles(req, res, parsedUrl);
    return true;
  }

  // POST /api/huddles/start
  if (pathname === '/api/huddles/start' && req.method === 'POST') {
    await handleStartHuddle(req, res, parsedUrl);
    return true;
  }

  // GET /api/huddles/:id
  const huddleMatch = pathname.match(/^\/api\/huddles\/([^/]+)$/);
  if (huddleMatch && req.method === 'GET') {
    await handleGetHuddle(res, huddleMatch[1]);
    return true;
  }

  // GET /api/huddles/:id/participants
  const participantsMatch = pathname.match(/^\/api\/huddles\/([^/]+)\/participants$/);
  if (participantsMatch && req.method === 'GET') {
    await handleGetParticipants(res, participantsMatch[1]);
    return true;
  }

  // POST /api/huddles/:id/complete
  const completeMatch = pathname.match(/^\/api\/huddles\/([^/]+)\/complete$/);
  if (completeMatch && req.method === 'POST') {
    await handleCompleteHuddle(req, res, completeMatch[1]);
    return true;
  }

  return false;
}
