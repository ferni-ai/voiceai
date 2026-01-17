/**
 * Habit Persistence API Routes
 *
 * RESTful endpoints for habit CRUD operations and progress tracking.
 * Stores habits in Firestore with user-scoped access.
 *
 * Routes:
 * - GET /api/habits - List user's habits
 * - POST /api/habits - Create a new habit
 * - GET /api/habits/:id - Get a specific habit
 * - PUT /api/habits/:id - Update a habit
 * - DELETE /api/habits/:id - Delete a habit
 * - POST /api/habits/:id/complete - Mark habit as completed for today
 * - GET /api/habits/:id/history - Get completion history
 */

import admin from 'firebase-admin';
import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { removeUndefined, cleanForFirestore } from '../utils/firestore-utils.js';
import { rateLimit, requireAuth } from './auth-middleware.js';
import {
  getUserId,
  handleCorsPreflightIfNeeded,
  parseBody,
  sendError,
  sendJSON,
} from './helpers.js';

const log = createLogger({ module: 'HabitAPI' });

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

const HABITS_COLLECTION = 'user_habits';
const COMPLETIONS_COLLECTION = 'habit_completions';

function getFirestore(): admin.firestore.Firestore | null {
  try {
    return admin.firestore();
  } catch {
    return null;
  }
}

// ============================================================================
// TYPES
// ============================================================================

interface Habit {
  id: string;
  userId: string;
  name: string;
  description?: string;
  frequency: 'daily' | 'weekly' | 'custom';
  customDays?: number[]; // 0=Sunday, 6=Saturday
  reminderTime?: string; // HH:MM format
  category?: string;
  tinyVersion?: string; // From habit coaching
  glidepathLevel?: number; // 1-5
  currentStreak: number;
  longestStreak: number;
  totalCompletions: number;
  createdAt: string;
  updatedAt: string;
  lastCompletedAt?: string;
  isActive: boolean;
}

interface HabitCompletion {
  habitId: string;
  userId: string;
  completedAt: string;
  date: string; // YYYY-MM-DD
  notes?: string;
  mood?: 'great' | 'good' | 'okay' | 'tough';
}

// ============================================================================
// IN-MEMORY CACHE (with Firestore persistence)
// ============================================================================

// In-memory caches for fast reads
const habitsCache = new Map<string, Habit[]>();
const completionsCache = new Map<string, HabitCompletion[]>();
const loadedUsers = new Set<string>();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateId(): string {
  return `habit_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Load user habits from Firestore into cache
 */
async function loadUserHabits(userId: string): Promise<void> {
  if (loadedUsers.has(userId)) return;

  const db = getFirestore();
  if (!db) {
    loadedUsers.add(userId);
    return;
  }

  try {
    const snapshot = await db.collection(HABITS_COLLECTION).where('userId', '==', userId).get();

    const habits: Habit[] = [];
    snapshot.forEach((doc) => {
      habits.push(doc.data() as Habit);
    });

    habitsCache.set(userId, habits);
    loadedUsers.add(userId);
    log.debug({ userId, count: habits.length }, 'Loaded habits from Firestore');
  } catch (error) {
    log.error({ error, userId }, 'Failed to load habits from Firestore');
    loadedUsers.add(userId); // Mark as loaded to prevent retry loops
  }
}

async function getHabitsCollection(userId: string): Promise<Habit[]> {
  await loadUserHabits(userId);
  return habitsCache.get(userId) ?? [];
}

async function saveHabitsCollection(userId: string, habits: Habit[]): Promise<void> {
  // Update cache
  habitsCache.set(userId, habits);

  // Persist to Firestore
  const db = getFirestore();
  if (!db) return;

  try {
    const batch = db.batch();

    for (const habit of habits) {
      const docRef = db.collection(HABITS_COLLECTION).doc(habit.id);
      batch.set(docRef, removeUndefined(habit));
    }

    await batch.commit();
    log.debug({ userId, count: habits.length }, 'Habits saved to Firestore');
  } catch (error) {
    log.error({ error, userId }, 'Failed to save habits to Firestore');
  }
}

async function getCompletions(habitId: string, userId: string): Promise<HabitCompletion[]> {
  const key = `${userId}:${habitId}`;

  // Check cache first
  if (completionsCache.has(key)) {
    return completionsCache.get(key) ?? [];
  }

  // Load from Firestore
  const db = getFirestore();
  if (!db) return [];

  try {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const snapshot = await db
      .collection(COMPLETIONS_COLLECTION)
      .where('userId', '==', userId)
      .where('habitId', '==', habitId)
      .where('date', '>=', oneYearAgo.toISOString().split('T')[0])
      .orderBy('date', 'desc')
      .limit(365)
      .get();

    const completions: HabitCompletion[] = [];
    snapshot.forEach((doc) => {
      completions.push(doc.data() as HabitCompletion);
    });

    completionsCache.set(key, completions);
    return completions;
  } catch (error) {
    log.error({ error, userId, habitId }, 'Failed to load completions from Firestore');
    return [];
  }
}

async function saveCompletion(completion: HabitCompletion): Promise<void> {
  const key = `${completion.userId}:${completion.habitId}`;

  // Update cache
  const completions = await getCompletions(completion.habitId, completion.userId);
  completions.push(completion);

  // Keep last 365 days in cache
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const filtered = completions.filter((c) => new Date(c.date) >= oneYearAgo);
  completionsCache.set(key, filtered);

  // Persist to Firestore
  const db = getFirestore();
  if (!db) return;

  try {
    const docId = `${completion.habitId}_${completion.date}`;
    await db.collection(COMPLETIONS_COLLECTION).doc(docId).set(cleanForFirestore(completion));
    log.debug(
      { habitId: completion.habitId, date: completion.date },
      'Completion saved to Firestore'
    );
  } catch (error) {
    log.error({ error, completion }, 'Failed to save completion to Firestore');
  }
}

function calculateStreak(completions: HabitCompletion[], frequency: string): number {
  if (completions.length === 0) return 0;

  // Sort by date descending
  const sorted = [...completions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  let streak = 0;
  const today = getTodayDate();
  let expectedDate = today;

  for (const completion of sorted) {
    if (completion.date === expectedDate) {
      streak++;
      // Move to previous day
      const date = new Date(expectedDate);
      date.setDate(date.getDate() - 1);
      expectedDate = date.toISOString().split('T')[0];
    } else if (completion.date < expectedDate) {
      // Gap in streak
      break;
    }
  }

  return streak;
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

async function listHabits(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'userId is required', 401);
    return;
  }

  try {
    const habits = await getHabitsCollection(userId);
    const activeHabits = habits.filter((h) => h.isActive);

    sendJSON(res, {
      habits: activeHabits,
      count: activeHabits.length,
    });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to list habits');
    sendError(res, 'Failed to list habits', 500);
  }
}

async function createHabit(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'userId is required', 401);
    return;
  }

  try {
    const body = await parseBody<{
      name: string;
      description?: string;
      frequency?: 'daily' | 'weekly' | 'custom';
      customDays?: number[];
      reminderTime?: string;
      category?: string;
      tinyVersion?: string;
      glidepathLevel?: number;
    }>(req);

    if (!body.name) {
      sendError(res, 'name is required', 400);
      return;
    }

    const now = new Date().toISOString();
    const habit: Habit = {
      id: generateId(),
      userId,
      name: body.name,
      description: body.description,
      frequency: body.frequency || 'daily',
      customDays: body.customDays,
      reminderTime: body.reminderTime,
      category: body.category,
      tinyVersion: body.tinyVersion,
      glidepathLevel: body.glidepathLevel || 1,
      currentStreak: 0,
      longestStreak: 0,
      totalCompletions: 0,
      createdAt: now,
      updatedAt: now,
      isActive: true,
    };

    const habits = await getHabitsCollection(userId);
    habits.push(habit);
    await saveHabitsCollection(userId, habits);

    log.info({ userId, habitId: habit.id, name: habit.name }, '✅ Habit created');

    sendJSON(res, { habit }, 201);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to create habit');
    sendError(res, 'Failed to create habit', 500);
  }
}

async function getHabit(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  habitId: string
): Promise<void> {
  const userId = getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'userId is required', 401);
    return;
  }

  try {
    const habits = await getHabitsCollection(userId);
    const habit = habits.find((h) => h.id === habitId);

    if (!habit) {
      sendError(res, 'Habit not found', 404);
      return;
    }

    sendJSON(res, { habit });
  } catch (error) {
    log.error({ error: String(error), userId, habitId }, 'Failed to get habit');
    sendError(res, 'Failed to get habit', 500);
  }
}

async function updateHabit(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  habitId: string
): Promise<void> {
  const userId = getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'userId is required', 401);
    return;
  }

  try {
    const body = await parseBody<Partial<Habit>>(req);
    const habits = await getHabitsCollection(userId);
    const index = habits.findIndex((h) => h.id === habitId);

    if (index === -1) {
      sendError(res, 'Habit not found', 404);
      return;
    }

    // Update allowed fields
    const allowedFields: Array<keyof Habit> = [
      'name',
      'description',
      'frequency',
      'customDays',
      'reminderTime',
      'category',
      'tinyVersion',
      'glidepathLevel',
      'isActive',
    ];
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        // Type-safe field update via indexed access
        (habits[index] as unknown as Record<string, unknown>)[field] = body[field];
      }
    }
    habits[index].updatedAt = new Date().toISOString();

    await saveHabitsCollection(userId, habits);

    log.info({ userId, habitId }, '✅ Habit updated');

    sendJSON(res, { habit: habits[index] });
  } catch (error) {
    log.error({ error: String(error), userId, habitId }, 'Failed to update habit');
    sendError(res, 'Failed to update habit', 500);
  }
}

async function deleteHabit(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  habitId: string
): Promise<void> {
  const userId = getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'userId is required', 401);
    return;
  }

  try {
    const habits = await getHabitsCollection(userId);
    const index = habits.findIndex((h) => h.id === habitId);

    if (index === -1) {
      sendError(res, 'Habit not found', 404);
      return;
    }

    // Soft delete
    habits[index].isActive = false;
    habits[index].updatedAt = new Date().toISOString();
    await saveHabitsCollection(userId, habits);

    log.info({ userId, habitId }, '🗑️ Habit deleted');

    sendJSON(res, { success: true });
  } catch (error) {
    log.error({ error: String(error), userId, habitId }, 'Failed to delete habit');
    sendError(res, 'Failed to delete habit', 500);
  }
}

async function completeHabit(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  habitId: string
): Promise<void> {
  const userId = getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'userId is required', 401);
    return;
  }

  try {
    const body = await parseBody<{
      notes?: string;
      mood?: 'great' | 'good' | 'okay' | 'tough';
      date?: string;
    }>(req);

    const habits = await getHabitsCollection(userId);
    const index = habits.findIndex((h) => h.id === habitId);

    if (index === -1) {
      sendError(res, 'Habit not found', 404);
      return;
    }

    const date = body.date || getTodayDate();
    const now = new Date().toISOString();

    // Check if already completed today
    const completions = await getCompletions(habitId, userId);
    const alreadyCompleted = completions.some((c) => c.date === date);

    if (alreadyCompleted) {
      sendJSON(res, {
        success: true,
        message: 'Already completed for this day',
        habit: habits[index],
      });
      return;
    }

    // Record completion
    const completion: HabitCompletion = {
      habitId,
      userId,
      completedAt: now,
      date,
      notes: body.notes,
      mood: body.mood,
    };
    await saveCompletion(completion);

    // Update habit stats
    habits[index].totalCompletions++;
    habits[index].lastCompletedAt = now;
    habits[index].updatedAt = now;

    // Recalculate streak
    const updatedCompletions = [...completions, completion];
    habits[index].currentStreak = calculateStreak(updatedCompletions, habits[index].frequency);
    if (habits[index].currentStreak > habits[index].longestStreak) {
      habits[index].longestStreak = habits[index].currentStreak;
    }

    await saveHabitsCollection(userId, habits);

    log.info({ userId, habitId, streak: habits[index].currentStreak }, '🎉 Habit completed');

    sendJSON(res, {
      success: true,
      habit: habits[index],
      streak: habits[index].currentStreak,
      isNewRecord: habits[index].currentStreak === habits[index].longestStreak,
    });
  } catch (error) {
    log.error({ error: String(error), userId, habitId }, 'Failed to complete habit');
    sendError(res, 'Failed to complete habit', 500);
  }
}

async function getHabitHistory(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  habitId: string
): Promise<void> {
  const userId = getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'userId is required', 401);
    return;
  }

  try {
    const habits = await getHabitsCollection(userId);
    const habit = habits.find((h) => h.id === habitId);

    if (!habit) {
      sendError(res, 'Habit not found', 404);
      return;
    }

    const completions = await getCompletions(habitId, userId);

    // Get last 30 days status
    const last30Days: Record<string, boolean> = {};
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      last30Days[dateStr] = completions.some((c) => c.date === dateStr);
    }

    sendJSON(res, {
      habitId,
      name: habit.name,
      currentStreak: habit.currentStreak,
      longestStreak: habit.longestStreak,
      totalCompletions: habit.totalCompletions,
      last30Days,
      recentCompletions: completions.slice(-10),
    });
  } catch (error) {
    log.error({ error: String(error), userId, habitId }, 'Failed to get habit history');
    sendError(res, 'Failed to get habit history', 500);
  }
}

// ============================================================================
// ROUTER
// ============================================================================

/**
 * Handle habit API requests
 */
export async function handleHabitRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Only handle /api/habits routes
  if (!pathname.startsWith('/api/habits')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Apply rate limiting
  if (rateLimit(req, res, { maxRequests: 100, windowMs: 60000 })) {
    return true;
  }

  // Require authentication
  const auth = await requireAuth(req, res, { allowDevMode: true });
  if (!auth) {
    return true; // 401 already sent
  }

  const method = req.method || 'GET';

  // GET /api/habits - List habits
  if (pathname === '/api/habits' && method === 'GET') {
    await listHabits(req, res, parsedUrl);
    return true;
  }

  // POST /api/habits - Create habit
  if (pathname === '/api/habits' && method === 'POST') {
    await createHabit(req, res, parsedUrl);
    return true;
  }

  // Routes with habit ID
  const habitMatch = pathname.match(/^\/api\/habits\/([^/]+)(\/.*)?$/);
  if (habitMatch) {
    const habitId = habitMatch[1];
    const subPath = habitMatch[2] || '';

    // GET /api/habits/:id
    if (method === 'GET' && !subPath) {
      await getHabit(req, res, parsedUrl, habitId);
      return true;
    }

    // PUT /api/habits/:id
    if (method === 'PUT' && !subPath) {
      await updateHabit(req, res, parsedUrl, habitId);
      return true;
    }

    // DELETE /api/habits/:id
    if (method === 'DELETE' && !subPath) {
      await deleteHabit(req, res, parsedUrl, habitId);
      return true;
    }

    // POST /api/habits/:id/complete
    if (method === 'POST' && subPath === '/complete') {
      await completeHabit(req, res, parsedUrl, habitId);
      return true;
    }

    // GET /api/habits/:id/history
    if (method === 'GET' && subPath === '/history') {
      await getHabitHistory(req, res, parsedUrl, habitId);
      return true;
    }
  }

  // Unknown route
  return false;
}

export default handleHabitRoutes;
