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
  endDate: Date
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
          | 'google'
          | 'ferni'
          | 'outlook'
          | 'apple',
        emotionalContext: generateEventEmotionalContext(event.title),
      });
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Could not load calendar events');
  }

  return events;
}

/**
 * Generate emotional context for an event based on its title/content
 */
function generateEventEmotionalContext(
  title: string
): { persona: string; insight: string } | undefined {
  const lowerTitle = title.toLowerCase();

  // Family/relationship events
  if (
    lowerTitle.includes('dinner') ||
    lowerTitle.includes('family') ||
    lowerTitle.includes('partner') ||
    lowerTitle.includes('date')
  ) {
    return { persona: 'ALEX NOTES', insight: "Your partner loves when you're fully present" };
  }

  // Work meetings
  if (
    lowerTitle.includes('meeting') ||
    lowerTitle.includes('sync') ||
    lowerTitle.includes('1:1') ||
    lowerTitle.includes('standup')
  ) {
    return { persona: 'JORDAN SUGGESTS', insight: 'Set a clear intention before joining' };
  }

  // Health/wellness
  if (
    lowerTitle.includes('doctor') ||
    lowerTitle.includes('therapy') ||
    lowerTitle.includes('gym') ||
    lowerTitle.includes('yoga') ||
    lowerTitle.includes('workout')
  ) {
    return { persona: 'MAYA NOTICES', insight: 'Taking care of yourself first' };
  }

  // Creative/learning
  if (
    lowerTitle.includes('class') ||
    lowerTitle.includes('workshop') ||
    lowerTitle.includes('lesson') ||
    lowerTitle.includes('course')
  ) {
    return { persona: 'NAYAN REFLECTS', insight: 'Growth happens in the stretching' };
  }

  // Social events
  if (
    lowerTitle.includes('party') ||
    lowerTitle.includes('celebration') ||
    lowerTitle.includes('birthday')
  ) {
    return { persona: 'FERNI', insight: 'Connections nourish the soul' };
  }

  return undefined;
}

/**
 * Load habits for a user
 */
async function loadHabits(userId: string): Promise<PracticeHabit[]> {
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
        name: data.name || data.title || 'Untitled habit',
        completedToday: (data.completedDates || []).includes(today),
        streak: data.streak || 0,
        insight: generateHabitInsight(data),
        insightPersona: 'MAYA TRACKS',
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
  endDate: Date
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
          text: data.text || data.message || data.title || 'Reminder',
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
 * Generate insight for a habit based on streak/completion patterns
 */
function generateHabitInsight(habitData: Record<string, unknown>): string | undefined {
  const streak = (habitData.streak as number) || 0;
  const completedDates = (habitData.completedDates as string[]) || [];

  if (streak >= 7) {
    return `${streak} days in a row!`;
  }

  if (streak >= 3) {
    return `${streak} days strong`;
  }

  if (completedDates.length > 0) {
    return 'Building momentum';
  }

  return undefined;
}

/**
 * Load tasks/intentions for a user
 */
async function loadIntentions(userId: string): Promise<PracticeTask[]> {
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
        text: data.title || data.text || 'Untitled task',
        completed: data.completed || false,
        priority: data.priority,
        dueDate: data.dueDate,
        insight: generateTaskInsight(data),
        insightPersona: getTaskInsightPersona(data),
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
          insight: data.streak ? `${data.streak} day streak` : undefined,
          insightPersona: 'MAYA TRACKS',
        });
      }
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Could not load intentions');
  }

  // Add default intentions if none found (better UX than empty state)
  if (intentions.length === 0) {
    intentions.push(
      { id: 'default_1', text: 'Start with intention', completed: false },
      { id: 'default_2', text: 'One thing at a time', completed: false },
      {
        id: 'default_3',
        text: 'End the day with gratitude',
        completed: false,
        insight: 'This has helped your mood',
        insightPersona: 'PETER FOUND',
      }
    );
  }

  return intentions;
}

/**
 * Generate insight for a task
 */
function generateTaskInsight(taskData: Record<string, unknown>): string | undefined {
  const priority = taskData.priority as string;
  const dueDate = taskData.dueDate as string;

  if (dueDate) {
    const due = new Date(dueDate);
    const today = new Date();
    const daysUntil = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntil <= 0) return 'Due today';
    if (daysUntil === 1) return 'Due tomorrow';
    if (daysUntil <= 3) return `Due in ${daysUntil} days`;
  }

  if (priority === 'high') return 'High priority';

  return undefined;
}

/**
 * Get the persona for a task insight
 */
function getTaskInsightPersona(taskData: Record<string, unknown>): string | undefined {
  const category = taskData.category as string;

  if (category === 'health' || category === 'wellness') return 'MAYA NOTICES';
  if (category === 'work' || category === 'career') return 'JORDAN SUGGESTS';
  if (category === 'relationship' || category === 'family') return 'ALEX NOTES';
  if (category === 'growth' || category === 'learning') return 'NAYAN REFLECTS';
  if (category === 'research' || category === 'finance') return 'PETER FOUND';

  return 'FERNI';
}

/**
 * Generate Maya's pattern notice based on user data
 */
async function generateMayaPatternNotice(
  userId: string,
  weekData: PracticeViewDay[]
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
        message:
          "You've been in a lot of meetings lately. Your best thinking happens in the quiet spaces.",
        type: 'observation',
        confidence: 0.85,
      };
    }

    // Heavy single day
    if (busiestDay && busiestDay.events.length > 5) {
      return {
        message: `${busiestDay.dayName} looks packed. Maybe move something to ${lightestDay?.dayName || 'another day'}?`,
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
          semanticCtx.activeCorrelations[0] ||
          'Your morning starts tend to set the tone for the whole day.',
        type: 'observation',
        confidence: 0.75,
      };
    }

    // Default patterns
    const defaultPatterns = [
      'Your morning starts tend to set the tone for the whole day.',
      'When you block focus time, you accomplish 40% more.',
      'You seem most creative after your walks.',
      'Tuesday evenings have been your most productive.',
    ];

    return {
      message: defaultPatterns[Math.floor(Math.random() * defaultPatterns.length)],
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
 * Get daily insight based on date and context
 */
function getDayInsight(date: Date, isToday: boolean): { insight: string; persona?: string } {
  const dayOfWeek = date.getDay();
  const hour = new Date().getHours();

  // Today gets time-sensitive insights
  if (isToday) {
    if (hour < 12) return { insight: 'Morning intention', persona: 'FERNI' };
    if (hour < 17) return { insight: 'Stay present', persona: 'MAYA' };
    return { insight: 'Reflect & celebrate', persona: 'JORDAN' };
  }

  // New Year's Day
  if (date.getMonth() === 0 && date.getDate() === 1) {
    return { insight: 'New beginning', persona: 'NAYAN' };
  }

  // Weekend
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { insight: 'Recharge', persona: 'MAYA' };
  }

  // Weekday insights
  const weekdayInsights = [
    { insight: 'Rest day', persona: undefined },
    { insight: 'Fresh start', persona: 'JORDAN' },
    { insight: 'Build momentum', persona: 'MAYA' },
    { insight: 'Mid-week check', persona: 'FERNI' },
    { insight: 'Almost there', persona: 'JORDAN' },
    { insight: 'Wind down', persona: 'MAYA' },
    { insight: 'Reflect', persona: 'NAYAN' },
  ];

  return weekdayInsights[dayOfWeek];
}

/**
 * Build the full week data structure
 */
async function buildWeekData(
  userId: string,
  events: PracticeEvent[],
  habits: PracticeHabit[],
  remindersByDate: Map<string, PracticeReminder[]>
): Promise<PracticeViewDay[]> {
  const days: PracticeViewDay[] = [];
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const shortNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
    const { insight, persona } = getDayInsight(date, isToday);

    days.push({
      date: dateStr,
      dayName: dayNames[dayOfWeek],
      shortName: shortNames[dayOfWeek],
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
      loadCalendarEvents(userId, startOfWeek, endOfWeek),
      loadHabits(userId),
      loadIntentions(userId),
      loadReminders(userId, startOfWeek, endOfWeek),
    ]);

    // Build week data
    const weekData = await buildWeekData(userId, events, habits, remindersByDate);

    // Get today's events
    const todayStr = today.toISOString().split('T')[0];
    const todayEvents = events.filter(
      (e) => new Date(e.startTime).toISOString().split('T')[0] === todayStr
    );

    // Generate insights, patterns, predictions, and outreach in parallel
    const [mayaNotices, crossPersonaInsights, stats, predictions, pendingOutreach] =
      await Promise.all([
        generateMayaPatternNotice(userId, weekData),
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
    sendError(res, 'Could not load practice view', 500);
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
    sendError(res, 'Could not complete intention', 500);
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

  try {
    // Load week data for pattern analysis
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    const [events, remindersByDate] = await Promise.all([
      loadCalendarEvents(userId, startOfWeek, endOfWeek),
      loadReminders(userId, startOfWeek, endOfWeek),
    ]);
    const weekData = await buildWeekData(userId, events, [], remindersByDate);

    const mayaNotices = await generateMayaPatternNotice(userId, weekData);

    sendJSON(res, {
      success: true,
      patterns: mayaNotices ? [mayaNotices] : [],
      persona: 'maya',
    });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get patterns');
    sendError(res, 'Could not get patterns', 500);
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
