/**
 * Practice-Calendar Routes
 *
 * API endpoints for calendar-integrated practices:
 * - GET /api/practices/time-suggestions - Smart time slot suggestions
 * - POST /api/practices/schedule - Create practice with calendar events
 * - DELETE /api/practices/:id/calendar - Remove calendar events
 * - GET /api/practices/briefings - Upcoming practice briefings
 * - GET /api/practices/pattern-suggestions - Pattern-based practice ideas
 *
 * @module api/routes/practice-calendar
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { requireUserId, sendJSON, sendError, parseBody } from '../helpers.js';

const log = createLogger({ module: 'PracticeCalendarAPI' });

// ============================================================================
// TYPES
// ============================================================================

interface TimeSuggestionsRequest {
  durationMinutes: number;
  preferredTime: 'morning' | 'afternoon' | 'evening' | 'anytime';
  frequency: 'daily' | 'weekday' | 'weekend' | 'weekly';
}

interface SchedulePracticeRequest {
  id?: string;
  name: string;
  description?: string;
  durationMinutes: number;
  frequency: 'daily' | 'weekday' | 'weekend' | 'weekly';
  preferredTime: 'morning' | 'afternoon' | 'evening' | 'anytime';
  scheduleInCalendar: boolean;
  specificTime?: { hour: number; minute: number };
  reminderMinutes?: number[];
  personaId?: string;
}

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * GET /api/practices/time-suggestions
 *
 * Returns smart time slot suggestions based on calendar free time.
 */
export async function handleTimeSuggestions(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const durationMinutes = parseInt(parsedUrl.searchParams.get('durationMinutes') || '5', 10);
    const preferredTime = parsedUrl.searchParams.get('preferredTime') || 'morning';
    const frequency = parsedUrl.searchParams.get('frequency') || 'daily';

    // Validate
    if (durationMinutes < 1 || durationMinutes > 120) {
      sendError(res, 'Duration must be between 1 and 120 minutes', 400);
      return;
    }

    const { suggestPracticeTimes } = await import('../../services/calendar/practice-calendar.js');

    const suggestions = await suggestPracticeTimes(userId, {
      durationMinutes,
      preferredTime: preferredTime as 'morning' | 'afternoon' | 'evening' | 'anytime',
      frequency: frequency as 'daily' | 'weekday' | 'weekend' | 'weekly',
    });

    sendJSON(res, {
      success: true,
      suggestions: suggestions.map((s) => ({
        time: s.time.toISOString(),
        hour: s.time.getHours(),
        minute: s.time.getMinutes(),
        dayOfWeek: s.time.toLocaleDateString('en-US', { weekday: 'long' }),
        confidence: s.confidence,
        reasoning: s.reasoning,
        freeMinutes: s.slot.durationMinutes,
      })),
    });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get time suggestions');
    sendError(res, 'Could not get time suggestions', 500);
  }
}

/**
 * POST /api/practices/schedule
 *
 * Creates a practice with optional calendar events.
 */
export async function handleSchedulePractice(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const body = (await parseBody(req)) as SchedulePracticeRequest;

    if (!body.name?.trim()) {
      sendError(res, 'Practice name is required', 400);
      return;
    }

    const practiceId =
      body.id || `practice_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();

    const practice = {
      id: practiceId,
      userId,
      name: body.name.trim(),
      description: body.description?.trim(),
      durationMinutes: body.durationMinutes || 5,
      frequency: body.frequency || 'daily',
      preferredTime: body.preferredTime || 'morning',
      scheduleInCalendar: body.scheduleInCalendar ?? false,
      specificTime: body.specificTime,
      reminderMinutes: body.reminderMinutes || [5],
      streak: 0,
      completedDates: [],
      createdAt: now,
      updatedAt: now,
      personaId: body.personaId,
      calendarEventIds: [] as string[],
    };

    // Create calendar events if requested
    if (practice.scheduleInCalendar) {
      const { createPracticeCalendarEvents } =
        await import('../../services/calendar/practice-calendar.js');
      practice.calendarEventIds = await createPracticeCalendarEvents(userId, practice);
    }

    // Store in Firestore
    await storePractice(userId, practice);

    log.info(
      {
        userId,
        practiceId,
        hasCalendarEvents: practice.calendarEventIds.length > 0,
      },
      'Practice scheduled'
    );

    sendJSON(res, {
      success: true,
      practice: {
        ...practice,
        calendarEventsCreated: practice.calendarEventIds.length,
      },
    });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to schedule practice');
    sendError(res, 'Could not schedule practice', 500);
  }
}

/**
 * DELETE /api/practices/:id/calendar
 *
 * Removes calendar events for a practice (keeps the practice itself).
 */
export async function handleDeletePracticeCalendar(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  practiceId: string
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const practice = await getPractice(userId, practiceId);

    if (!practice) {
      sendError(res, 'Practice not found', 404);
      return;
    }

    if (practice.calendarEventIds?.length) {
      const { deletePracticeCalendarEvents } =
        await import('../../services/calendar/practice-calendar.js');
      await deletePracticeCalendarEvents(userId, practice.calendarEventIds);

      // Update practice
      practice.calendarEventIds = [];
      practice.scheduleInCalendar = false;
      practice.updatedAt = new Date().toISOString();
      await storePractice(userId, practice);
    }

    log.info({ userId, practiceId }, 'Practice calendar events removed');
    sendJSON(res, { success: true, practiceId });
  } catch (error) {
    log.error(
      { error: String(error), userId, practiceId },
      'Failed to delete practice calendar events'
    );
    sendError(res, 'Could not remove calendar events', 500);
  }
}

/**
 * GET /api/practices/briefings
 *
 * Returns pre-practice briefings for upcoming practices.
 */
export async function handlePracticeBriefings(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const windowMinutes = parseInt(parsedUrl.searchParams.get('windowMinutes') || '60', 10);

    const practices = await getAllPractices(userId);

    const { getUpcomingPracticeBriefings } =
      await import('../../services/calendar/practice-calendar.js');

    const briefings = await getUpcomingPracticeBriefings(userId, practices, windowMinutes);

    sendJSON(res, {
      success: true,
      briefings: briefings.map((b) => ({
        practiceId: b.practiceId,
        practiceName: b.practiceName,
        startsAt: b.startsAt.toISOString(),
        minutesUntil: b.minutesUntil,
        greeting: b.briefing.greeting,
        lastSession: b.briefing.lastSession,
        streak: b.briefing.streak,
        encouragement: b.briefing.encouragement,
        prepTips: b.briefing.prepTips,
      })),
    });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get practice briefings');
    sendError(res, 'Could not get practice briefings', 500);
  }
}

/**
 * GET /api/practices/pattern-suggestions
 *
 * Returns practice suggestions based on calendar patterns.
 */
export async function handlePatternSuggestions(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const { suggestPracticesFromPatterns } =
      await import('../../services/calendar/practice-calendar.js');

    const suggestions = await suggestPracticesFromPatterns(userId);

    sendJSON(res, {
      success: true,
      suggestions: suggestions.map((s) => ({
        title: s.title,
        description: s.description,
        suggestedFrequency: s.suggestedFrequency,
        suggestedTime: s.suggestedTime,
        specificTime: s.specificTime,
        durationMinutes: s.durationMinutes,
        reasoning: s.reasoning,
        confidence: s.confidence,
      })),
    });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get pattern suggestions');
    sendError(res, 'Could not get practice suggestions', 500);
  }
}

/**
 * GET /api/practices
 *
 * Returns all practices for the user.
 */
export async function handleGetPractices(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const practices = await getAllPractices(userId);

    sendJSON(res, {
      success: true,
      practices: practices.map((p) => ({
        ...p,
        hasCalendarEvents: (p.calendarEventIds?.length || 0) > 0,
      })),
    });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get practices');
    sendError(res, 'Could not get practices', 500);
  }
}

// ============================================================================
// STORAGE HELPERS
// ============================================================================

import type { CalendarPractice } from '../../services/calendar/practice-calendar.js';

async function storePractice(userId: string, practice: CalendarPractice): Promise<void> {
  try {
    const { Firestore } = await import('@google-cloud/firestore');
    const db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });

    await db.collection('users').doc(userId).collection('practices').doc(practice.id).set(practice);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Firestore not available for practice storage');
    // Could fall back to in-memory cache here
  }
}

async function getPractice(userId: string, practiceId: string): Promise<CalendarPractice | null> {
  try {
    const { Firestore } = await import('@google-cloud/firestore');
    const db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });

    const doc = await db
      .collection('users')
      .doc(userId)
      .collection('practices')
      .doc(practiceId)
      .get();

    if (!doc.exists) return null;
    return doc.data() as CalendarPractice;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Firestore not available for practice fetch');
    return null;
  }
}

async function getAllPractices(userId: string): Promise<CalendarPractice[]> {
  try {
    const { Firestore } = await import('@google-cloud/firestore');
    const db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });

    const snapshot = await db.collection('users').doc(userId).collection('practices').get();

    return snapshot.docs.map((doc) => doc.data() as CalendarPractice);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Firestore not available for practices list');
    return [];
  }
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Route handler for practice-calendar endpoints
 */
export async function handlePracticeCalendarRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // GET /api/practices
  if (pathname === '/api/practices' && req.method === 'GET') {
    await handleGetPractices(req, res, parsedUrl);
    return true;
  }

  // GET /api/practices/time-suggestions
  if (pathname === '/api/practices/time-suggestions' && req.method === 'GET') {
    await handleTimeSuggestions(req, res, parsedUrl);
    return true;
  }

  // POST /api/practices/schedule
  if (pathname === '/api/practices/schedule' && req.method === 'POST') {
    await handleSchedulePractice(req, res, parsedUrl);
    return true;
  }

  // GET /api/practices/briefings
  if (pathname === '/api/practices/briefings' && req.method === 'GET') {
    await handlePracticeBriefings(req, res, parsedUrl);
    return true;
  }

  // GET /api/practices/pattern-suggestions
  if (pathname === '/api/practices/pattern-suggestions' && req.method === 'GET') {
    await handlePatternSuggestions(req, res, parsedUrl);
    return true;
  }

  // DELETE /api/practices/:id/calendar
  const deleteCalendarMatch = pathname.match(/^\/api\/practices\/([^/]+)\/calendar$/);
  if (deleteCalendarMatch && req.method === 'DELETE') {
    await handleDeletePracticeCalendar(req, res, parsedUrl, deleteCalendarMatch[1]);
    return true;
  }

  return false;
}
