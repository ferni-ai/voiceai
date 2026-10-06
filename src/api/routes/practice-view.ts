/**
 * Practice View API Routes
 *
 * Comprehensive endpoint for the "What's Ahead" practice view.
 * Combines calendar events, habits, intentions, tasks, and cross-persona insights
 * into a single rich response for the frontend.
 *
 * Routes:
 * - GET /api/practice-view - Full practice view data
 * - GET /api/practice-view/week - Week overview with daily insights
 * - POST /api/practice-view/intentions/:id/complete - Mark intention complete
 * - GET /api/practice-view/patterns - Maya's pattern awareness
 *
 * @module api/routes/practice-view
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { requireUserId, handleCorsPreflightIfNeeded, sendJSON, sendError } from '../helpers.js';
import { rateLimit } from '../auth-middleware.js';
import { localeForRequest, tFor, type SupportedLocale } from '../../i18n/index.js';
import {
  DEFAULT_PATTERN_KEYS,
  attribute,
  generateEventEmotionalContext,
  generateHabitInsight,
  generateTaskInsight,
  getDayInsight,
  getTaskInsightPersona,
  weekdayName,
} from './practice-view-copy.js';

const log = createLogger({ module: 'PracticeViewAPI' });

// ============================================================================
// TYPES - Practice View Data
// ============================================================================

export interface PracticeViewDay {
  date: string;
  dayName: string;
  shortName: string;
  dayNum: number;
  isToday: boolean;
  isWeekend: boolean;
  events: PracticeEvent[];
  tasks: PracticeTask[];
  reminders: PracticeReminder[];
  habits: PracticeHabit[];
  insight: string;
  insightPersona?: string;
}

export interface PracticeEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  location?: string;
  emotionalContext?: {
    persona: string;
    insight: string;
  };
  source: 'google' | 'ferni' | 'outlook' | 'apple';
}

export interface PracticeTask {
  id: string;
  text: string;
  completed: boolean;
  priority?: 'high' | 'medium' | 'low';
  dueDate?: string;
  insight?: string;
  insightPersona?: string;
}

export interface PracticeReminder {
  id: string;
  text: string;
  time: string;
  type: 'birthday' | 'anniversary' | 'appointment' | 'custom';
}

export interface PracticeHabit {
  id: string;
  name: string;
  completedToday: boolean;
  streak: number;
  insight?: string;
  insightPersona?: string;
}

export interface MayaPatternNotice {
  message: string;
  type: 'observation' | 'suggestion' | 'celebration' | 'concern';
  confidence: number;
  relatedDays?: string[];
}

export interface PracticePrediction {
  id: string;
  prediction: string;
  confidence: 'high' | 'medium' | 'low' | 'very_high';
  basedOn: string;
  suggestedIntervention: string;
  interventionTone: 'proactive' | 'gentle' | 'supportive' | 'protective';
  timing: 'now' | 'tomorrow' | 'this_week';
}

export interface PracticeOutreach {
  id: string;
  type: 'thinking_of_you' | 'check_in' | 'celebration' | 'reminder';
  message: string;
  scheduledFor?: string;
  persona: string;
}

export interface CrossPersonaInsight {
  persona: 'ferni' | 'maya' | 'peter' | 'alex' | 'jordan' | 'nayan';
  type: 'notice' | 'suggest' | 'celebrate' | 'warn';
  message: string;
  context?: string;
}

export interface PracticeViewStats {
  followThroughPercent: number;
  habitsCompletedThisWeek: number;
  momentumTrend: 'rising' | 'steady' | 'building' | 'declining';
  streak: number;
}

export interface PracticeViewResponse {
  success: boolean;
  orchestratingPersona: string; // Jordan
  week: PracticeViewDay[];
  todayEvents: PracticeEvent[];
  intentions: PracticeTask[];
  mayaNotices: MayaPatternNotice | null;
  crossPersonaInsights: CrossPersonaInsight[];
  predictions: PracticePrediction[];
  pendingOutreach: PracticeOutreach[];
  stats: PracticeViewStats;
  lastUpdated: string;
}

// ============================================================================
// DATA LOADERS
// ============================================================================

/**
 * Load calendar events for a user (from all connected providers + Ferni Calendar)
 */
async function loadCalendarEvents(
  userId: string,
  startDate: Date,
  endDate: Date,
  locale: SupportedLocale
): Promise<PracticeEvent[]> {
  const events: PracticeEvent[] = [];

  try {
    // Try to load from calendar service
    const { getEvents } = await import('../../services/calendar/index.js');
    const calendarEvents = await getEvents(userId, startDate, endDate);

    for (const event of calendarEvents) {
      events.push({
        id: event.id,
        title: event.title,
        startTime:
          event.startTime instanceof Date ? event.startTime.toISOString() : String(event.startTime),
        endTime:
          event.endTime instanceof Date ? event.endTime.toISOString() : String(event.endTime),
        location: event.location,
        source: ((event as { source?: string }).source || 'ferni') as
          'google' | 'ferni' | 'outlook' | 'apple',
        emotionalContext: generateEventEmotionalContext(event.title, locale),
      });
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Could not load calendar events');
  }

  return events;
}

/**
 * Load habits for a user
 */
async function loadHabits(userId: string, locale: SupportedLocale): Promise<PracticeHabit[]> {
  const habits: PracticeHabit[] = [];

  try {
    const { Firestore } = await import('@google-cloud/firestore');
    const db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });

    const snapshot = await db.collection('bogle_users').doc(userId).collection('habits').get();
    const today = new Date().toISOString().split('T')[0];

    for (const doc of snapshot.docs) {
      const data = doc.data();
      habits.push({
        id: doc.id,
        name: data.name || data.title || tFor(locale, 'practiceView.habit.untitled'),
        completedToday: (data.completedDates || []).includes(today),
        streak: data.streak || 0,
        insight: generateHabitInsight(data, locale),
        insightPersona: attribute(locale, 'maya', 'tracks'),
      });
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Could not load habits');
  }

  return habits;
}

/**
 * Load reminders for a user for a given date range
 */
async function loadReminders(
  userId: string,
  startDate: Date,
  endDate: Date,
  locale: SupportedLocale
): Promise<Map<string, PracticeReminder[]>> {
  const remindersByDate = new Map<string, PracticeReminder[]>();

  try {
    const { Firestore } = await import('@google-cloud/firestore');
    const db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('reminders')
      .where('time', '>=', startDate.toISOString())
      .where('time', '<=', endDate.toISOString())
      .orderBy('time', 'asc')
      .get();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const reminderTime = data.time?.toDate?.()?.toISOString?.() || data.time;
      const dateStr = reminderTime ? new Date(reminderTime).toISOString().split('T')[0] : '';

      if (dateStr) {
        const reminder: PracticeReminder = {
          id: doc.id,
          text:
            data.text ||
            data.message ||
            data.title ||
            tFor(locale, 'practiceView.reminder.fallback'),
          time: reminderTime,
          type: data.type || 'custom',
        };

        const existing = remindersByDate.get(dateStr) || [];
        existing.push(reminder);
        remindersByDate.set(dateStr, existing);
      }
    }

    log.debug({ userId, count: snapshot.docs.length }, 'Loaded reminders');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Could not load reminders');
  }

  return remindersByDate;
}

/**
 * Load tasks/intentions for a user
 */
async function loadIntentions(userId: string, locale: SupportedLocale): Promise<PracticeTask[]> {
  const intentions: PracticeTask[] = [];

  try {
    const { Firestore } = await import('@google-cloud/firestore');
    const db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });

    // Load from tasks collection
    const tasksSnapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('tasks')
      .where('completed', '==', false)
      .limit(10)
      .get();

    for (const doc of tasksSnapshot.docs) {
      const data = doc.data();
      intentions.push({
        id: doc.id,
        text: data.title || data.text || tFor(locale, 'practiceView.task.untitled'),
        completed: data.completed || false,
        priority: data.priority,
        dueDate: data.dueDate,
        insight: generateTaskInsight(data, locale),
        insightPersona: getTaskInsightPersona(data, locale),
      });
    }

    // Also load today's practice intentions
    const practicesSnapshot = await db
      .collection('users')
      .doc(userId)
      .collection('practices')
      .limit(5)
      .get();

    for (const doc of practicesSnapshot.docs) {
      const data = doc.data();
      if (data.name && !data.completedToday) {
        intentions.push({
          id: `practice_${doc.id}`,
          text: data.name,
          completed: false,
          insight: data.streak
            ? tFor(locale, 'practiceView.practice.streak', { streak: data.streak })
            : undefined,
          insightPersona: attribute(locale, 'maya', 'tracks'),
        });
      }
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Could not load intentions');
  }

  // Add default intentions if none found (better UX than empty state)
  if (intentions.length === 0) {
    intentions.push(
      {
        id: 'default_1',
        text: tFor(locale, 'practiceView.defaultIntention.start'),
        completed: false,
      },
      {
        id: 'default_2',
        text: tFor(locale, 'practiceView.defaultIntention.oneThing'),
        completed: false,
      },
      {
        id: 'default_3',
        text: tFor(locale, 'practiceView.defaultIntention.gratitude'),
        completed: false,
        insight: tFor(locale, 'practiceView.defaultIntention.gratitudeInsight'),
        insightPersona: attribute(locale, 'peter', 'found'),
      }
    );
  }

  return intentions;
}

/**
 * Generate Maya's pattern notice based on user data
 */
async function generateMayaPatternNotice(
  userId: string,
  weekData: PracticeViewDay[],
  locale: SupportedLocale
): Promise<MayaPatternNotice | null> {
  try {
    // Count events across the week
    const totalEvents = weekData.reduce((sum, day) => sum + day.events.length, 0);
    const busiestDay = weekData.reduce(
      (max, day) => (day.events.length > (max?.events.length || 0) ? day : max),
      weekData[0]
    );
    const lightestDay = weekData.reduce(
      (min, day) => (day.events.length < (min?.events.length || 99) ? day : min),
      weekData[0]
    );

    // High meeting load
    if (totalEvents > 15) {
      return {
        message: tFor(locale, 'practiceView.pattern.busyWeek'),
        type: 'observation',
        confidence: 0.85,
      };
    }

    // Heavy single day
    if (busiestDay && busiestDay.events.length > 5) {
      return {
        message: lightestDay
          ? tFor(locale, 'practiceView.pattern.packedDay', {
              day: busiestDay.dayName,
              otherDay: lightestDay.dayName,
            })
          : tFor(locale, 'practiceView.pattern.packedDayNoAlternative', {
              day: busiestDay.dayName,
            }),
        type: 'suggestion',
        confidence: 0.8,
        relatedDays: [busiestDay.date],
      };
    }

    // Try to get patterns from superhuman services
    const { buildSemanticIntelligenceContext } =
      await import('../../services/superhuman/semantic-intelligence/index.js');
    const semanticCtx = await buildSemanticIntelligenceContext(userId, {});

    if (semanticCtx?.activeCorrelations?.length) {
      return {
        message:
          semanticCtx.activeCorrelations[0] || tFor(locale, 'practiceView.pattern.morningStart'),
        type: 'observation',
        confidence: 0.75,
      };
    }

    // Default patterns
    return {
      message: tFor(
        locale,
        DEFAULT_PATTERN_KEYS[Math.floor(Math.random() * DEFAULT_PATTERN_KEYS.length)]
      ),
      type: 'observation',
      confidence: 0.6,
    };
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Could not generate Maya pattern notice');
    return null;
  }
}

/**
 * Generate cross-persona insights from superhuman services
 */
async function generateCrossPersonaInsights(userId: string): Promise<CrossPersonaInsight[]> {
  const insights: CrossPersonaInsight[] = [];

  try {
    const { buildSuperhumanContext } = await import('../../services/superhuman/index.js');
    const superhumanCtx = await buildSuperhumanContext(userId, {});

    // Commitment Keeper (Ferni)
    if (superhumanCtx.commitments) {
      insights.push({
        persona: 'ferni',
        type: 'notice',
        message: superhumanCtx.commitments.substring(0, 200),
      });
    }

    // Capacity Guardian (Maya)
    if (superhumanCtx.capacity) {
      insights.push({
        persona: 'maya',
        type: 'notice',
        message: superhumanCtx.capacity.substring(0, 200),
      });
    }

    // Dream Keeper (Nayan)
    if (superhumanCtx.dreams) {
      insights.push({
        persona: 'nayan',
        type: 'notice',
        message: superhumanCtx.dreams.substring(0, 200),
      });
    }

    // Relationship milestones (Jordan)
    if (superhumanCtx.milestones) {
      insights.push({
        persona: 'jordan',
        type: 'celebrate',
        message: superhumanCtx.milestones.substring(0, 200),
      });
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Could not generate cross-persona insights');
  }

  return insights;
}

/**
 * Load predictions from the predictive coaching service
 */
async function loadPredictions(userId: string): Promise<PracticePrediction[]> {
  const predictions: PracticePrediction[] = [];

  try {
    const { generatePredictions } =
      await import('../../services/superhuman/predictive-coaching.js');
    const rawPredictions = await generatePredictions(userId);

    for (const pred of rawPredictions) {
      predictions.push({
        id: pred.id,
        prediction: pred.prediction,
        confidence: pred.confidence,
        basedOn: pred.basedOn,
        suggestedIntervention: pred.suggestedIntervention,
        interventionTone: pred.interventionTone,
        timing:
          pred.predictedFor <= Date.now()
            ? 'now'
            : pred.predictedFor <= Date.now() + 24 * 60 * 60 * 1000
              ? 'tomorrow'
              : 'this_week',
      });
    }

    log.debug({ userId, count: predictions.length }, 'Loaded predictions');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Could not load predictions');
  }

  return predictions;
}

/**
 * Load pending outreach for the user
 */
async function loadPendingOutreach(userId: string): Promise<PracticeOutreach[]> {
  const outreach: PracticeOutreach[] = [];

  try {
    const { Firestore } = await import('@google-cloud/firestore');
    const db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });

    // Load pending outreach from Firestore
    const snapshot = await db
      .collection('outreach')
      .where('userId', '==', userId)
      .where('status', '==', 'pending')
      .orderBy('scheduledFor', 'asc')
      .limit(5)
      .get();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      outreach.push({
        id: doc.id,
        type: data.type || 'check_in',
        message: data.message || '',
        scheduledFor: data.scheduledFor?.toDate?.()?.toISOString?.() || data.scheduledFor,
        persona: data.personaId || 'ferni',
      });
    }

    log.debug({ userId, count: outreach.length }, 'Loaded pending outreach');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Could not load pending outreach');
  }

  return outreach;
}

/**
 * Calculate practice stats
 */
async function calculatePracticeStats(
  userId: string,
  habits: PracticeHabit[],
  intentions: PracticeTask[]
): Promise<PracticeViewStats> {
  // Calculate follow-through from completed intentions
  const completedIntentions = intentions.filter((i) => i.completed).length;
  const totalIntentions = intentions.length || 1;
  const followThroughPercent = Math.round((completedIntentions / totalIntentions) * 100);

  // Count habits completed this week
  const habitsCompletedThisWeek = habits.filter((h) => h.completedToday).length;

  // Calculate momentum trend
  let momentumTrend: 'rising' | 'steady' | 'building' | 'declining' = 'steady';
  const avgStreak = habits.reduce((sum, h) => sum + h.streak, 0) / (habits.length || 1);

  if (avgStreak > 5) momentumTrend = 'rising';
  else if (avgStreak > 2) momentumTrend = 'building';
  else if (followThroughPercent < 30) momentumTrend = 'declining';

  // Get max streak
  const maxStreak = habits.reduce((max, h) => Math.max(max, h.streak), 0);

  return {
    followThroughPercent,
    habitsCompletedThisWeek,
    momentumTrend,
    streak: maxStreak,
  };
}

/**
 * Build the full week data structure
 */
async function buildWeekData(
  locale: SupportedLocale,
  events: PracticeEvent[],
  habits: PracticeHabit[],
  remindersByDate: Map<string, PracticeReminder[]>
): Promise<PracticeViewDay[]> {
  const days: PracticeViewDay[] = [];

  // Get start of week (Sunday)
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  for (let i = 0; i < 7; i++) {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    const isToday = date.toDateString() === today.toDateString();
    const dayOfWeek = date.getDay();

    // Filter events for this day
    const dayEvents = events.filter((e) => {
      const eventDate = new Date(e.startTime).toISOString().split('T')[0];
      return eventDate === dateStr;
    });

    // Get insight for the day
    const { insight, persona } = getDayInsight(date, isToday, locale);

    days.push({
      date: dateStr,
      dayName: weekdayName(locale, date, 'long'),
      shortName: weekdayName(locale, date, 'short'),
      dayNum: date.getDate(),
      isToday,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      events: dayEvents,
      tasks: [], // Tasks are shown in intentions section, not per-day
      reminders: remindersByDate.get(dateStr) || [],
      habits: isToday ? habits : [], // Only show habits for today
      insight,
      insightPersona: persona,
    });
  }

  return days;
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

/**
 * GET /api/practice-view
 *
 * Returns the full practice view data including calendar, habits, intentions,
 * patterns, and cross-persona insights.
 */
export async function handleGetPracticeView(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;
  const locale = await localeForRequest(req.headers['accept-language']);

  try {
    log.info({ userId }, 'Loading practice view data');

    // Calculate date range (current week)
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    // Load all data in parallel for optimal performance
    const [events, habits, intentions, remindersByDate] = await Promise.all([
      loadCalendarEvents(userId, startOfWeek, endOfWeek, locale),
      loadHabits(userId, locale),
      loadIntentions(userId, locale),
      loadReminders(userId, startOfWeek, endOfWeek, locale),
    ]);

    // Build week data
    const weekData = await buildWeekData(locale, events, habits, remindersByDate);

    // Get today's events
    const todayStr = today.toISOString().split('T')[0];
    const todayEvents = events.filter(
      (e) => new Date(e.startTime).toISOString().split('T')[0] === todayStr
    );

    // Generate insights, patterns, predictions, and outreach in parallel
    const [mayaNotices, crossPersonaInsights, stats, predictions, pendingOutreach] =
      await Promise.all([
        generateMayaPatternNotice(userId, weekData, locale),
        generateCrossPersonaInsights(userId),
        calculatePracticeStats(userId, habits, intentions),
        loadPredictions(userId),
        loadPendingOutreach(userId),
      ]);

    const response: PracticeViewResponse = {
      success: true,
      orchestratingPersona: 'jordan',
      week: weekData,
      todayEvents,
      intentions,
      mayaNotices,
      crossPersonaInsights,
      predictions,
      pendingOutreach,
      stats,
      lastUpdated: new Date().toISOString(),
    };

    sendJSON(res, response);
    log.info(
      {
        userId,
        eventsCount: events.length,
        habitsCount: habits.length,
        predictionsCount: predictions.length,
        outreachCount: pendingOutreach.length,
      },
      'Practice view loaded'
    );
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to load practice view');
    sendError(res, tFor(locale, 'practiceView.errors.loadFailed'), 500);
  }
}

/**
 * POST /api/practice-view/intentions/:id/complete
 *
 * Mark an intention/task as complete
 */
export async function handleCompleteIntention(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  intentionId: string
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;
  const locale = await localeForRequest(req.headers['accept-language']);

  try {
    const { Firestore } = await import('@google-cloud/firestore');
    const db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });

    // Handle practice completions
    if (intentionId.startsWith('practice_')) {
      const practiceId = intentionId.replace('practice_', '');
      const { FieldValue } = await import('@google-cloud/firestore');
      await db
        .collection('users')
        .doc(userId)
        .collection('practices')
        .doc(practiceId)
        .update({
          completedToday: true,
          lastCompletedAt: new Date().toISOString(),
          streak: FieldValue.increment(1),
        });
    } else {
      // Handle task completions
      await db.collection('bogle_users').doc(userId).collection('tasks').doc(intentionId).update({
        completed: true,
        completedAt: new Date().toISOString(),
      });
    }

    sendJSON(res, { success: true, intentionId });
    log.info({ userId, intentionId }, 'Intention completed');
  } catch (error) {
    log.error({ error: String(error), userId, intentionId }, 'Failed to complete intention');
    sendError(res, tFor(locale, 'practiceView.errors.completeFailed'), 500);
  }
}

/**
 * GET /api/practice-view/patterns
 *
 * Returns Maya's pattern awareness data
 */
export async function handleGetPatterns(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;
  const locale = await localeForRequest(req.headers['accept-language']);

  try {
    // Load week data for pattern analysis
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    const [events, remindersByDate] = await Promise.all([
      loadCalendarEvents(userId, startOfWeek, endOfWeek, locale),
      loadReminders(userId, startOfWeek, endOfWeek, locale),
    ]);
    const weekData = await buildWeekData(locale, events, [], remindersByDate);

    const mayaNotices = await generateMayaPatternNotice(userId, weekData, locale);

    sendJSON(res, {
      success: true,
      patterns: mayaNotices ? [mayaNotices] : [],
      persona: 'maya',
    });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get patterns');
    sendError(res, tFor(locale, 'practiceView.errors.patternsFailed'), 500);
  }
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Route handler for practice view endpoints
 */
export async function handlePracticeViewRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Only handle our routes
  if (!pathname.startsWith('/api/practice-view')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Rate limiting
  if (rateLimit(req, res, { maxRequests: 100, windowMs: 60000 })) {
    return true;
  }

  // GET /api/practice-view
  if (pathname === '/api/practice-view' && req.method === 'GET') {
    await handleGetPracticeView(req, res, parsedUrl);
    return true;
  }

  // GET /api/practice-view/patterns
  if (pathname === '/api/practice-view/patterns' && req.method === 'GET') {
    await handleGetPatterns(req, res, parsedUrl);
    return true;
  }

  // POST /api/practice-view/intentions/:id/complete
  const completeMatch = pathname.match(/^\/api\/practice-view\/intentions\/([^/]+)\/complete$/);
  if (completeMatch && req.method === 'POST') {
    await handleCompleteIntention(req, res, parsedUrl, completeMatch[1]);
    return true;
  }

  return false;
}
