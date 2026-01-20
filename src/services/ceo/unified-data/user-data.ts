/**
 * User data fetchers for Unified Data Service
 *
 * @module services/ceo/unified-data/user-data
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { toSafeDate, recordDegradation } from '../../../utils/firestore-utils.js';
import { goalsService } from '../goals.js';
import { dataCache, CACHE_TTL } from './cache.js';
import { getPeriodStartDate, getUserCollection } from './helpers.js';
import type { Period, Goal, Habit, JournalEntry, Win } from './types.js';

const log = createLogger({ module: 'ceo-unified-data-user' });

// ============================================================================
// GOALS
// ============================================================================

export async function getUserGoals(userId: string): Promise<Goal[]> {
  const cacheKey = `user_goals_${userId}`;
  const cached = dataCache.get<Goal[]>(cacheKey);
  if (cached !== null) return cached;

  try {
    // Delegate to existing goalsService
    const goals = await goalsService.getGoals(userId);
    dataCache.set(cacheKey, goals, CACHE_TTL.USER_DATA);
    return goals;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get user goals');
    return [];
  }
}

// ============================================================================
// HABITS
// ============================================================================

export async function getUserHabits(userId: string): Promise<Habit[]> {
  const cacheKey = `user_habits_${userId}`;
  const cached = dataCache.get<Habit[]>(cacheKey);
  if (cached !== null) return cached;

  const collection = getUserCollection(userId, 'habits');
  if (!collection) {
    recordDegradation('unified-data', 'db_unavailable');
    return [];
  }

  try {
    const snapshot = await collection.orderBy('createdAt', 'desc').get();

    const habits: Habit[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId,
        name: String(data.name || ''),
        description: data.description ? String(data.description) : undefined,
        frequency: (data.frequency as Habit['frequency']) || 'daily',
        streak: Number(data.streak) || 0,
        lastCompletedAt: data.lastCompletedAt ? toSafeDate(data.lastCompletedAt) : undefined,
        createdAt: toSafeDate(data.createdAt),
        category: data.category ? String(data.category) : undefined,
        reminderTime: data.reminderTime ? String(data.reminderTime) : undefined,
      };
    });

    dataCache.set(cacheKey, habits, CACHE_TTL.USER_DATA);
    log.debug({ userId, count: habits.length }, 'User habits fetched');
    return habits;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get user habits');
    return [];
  }
}

// ============================================================================
// JOURNAL
// ============================================================================

export async function getUserJournal(userId: string, period: Period): Promise<JournalEntry[]> {
  const cacheKey = `user_journal_${userId}_${period}`;
  const cached = dataCache.get<JournalEntry[]>(cacheKey);
  if (cached !== null) return cached;

  const collection = getUserCollection(userId, 'journal_entries');
  if (!collection) {
    recordDegradation('unified-data', 'db_unavailable');
    return [];
  }

  try {
    const startDate = getPeriodStartDate(period);
    const snapshot = await collection
      .where('date', '>=', startDate.toISOString())
      .orderBy('date', 'desc')
      .get();

    const entries: JournalEntry[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId,
        date: toSafeDate(data.date),
        gratitudes: Array.isArray(data.gratitudes) ? data.gratitudes.map(String) : [],
        highlight: data.highlight ? String(data.highlight) : undefined,
        challenge: data.challenge ? String(data.challenge) : undefined,
        learnings: data.learnings ? String(data.learnings) : undefined,
        tomorrowIntention: data.tomorrowIntention ? String(data.tomorrowIntention) : undefined,
        mood: Number(data.mood) || 5,
        notes: data.notes ? String(data.notes) : undefined,
        createdAt: toSafeDate(data.createdAt),
      };
    });

    dataCache.set(cacheKey, entries, CACHE_TTL.USER_DATA);
    log.debug({ userId, period, count: entries.length }, 'User journal fetched');
    return entries;
  } catch (error) {
    const errorStr = String(error);
    if (errorStr.includes('FAILED_PRECONDITION') && errorStr.includes('index')) {
      log.debug({ userId }, 'Firestore index still building for journal - returning empty');
      return [];
    }
    log.error({ error: errorStr, userId, period }, 'Failed to get user journal');
    return [];
  }
}

// ============================================================================
// WINS
// ============================================================================

export async function getUserWins(userId: string, period: Period): Promise<Win[]> {
  const cacheKey = `user_wins_${userId}_${period}`;
  const cached = dataCache.get<Win[]>(cacheKey);
  if (cached !== null) return cached;

  const collection = getUserCollection(userId, 'wins');
  if (!collection) {
    recordDegradation('unified-data', 'db_unavailable');
    return [];
  }

  try {
    const startDate = getPeriodStartDate(period);
    const snapshot = await collection
      .where('celebratedAt', '>=', startDate.toISOString())
      .orderBy('celebratedAt', 'desc')
      .get();

    const wins: Win[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId,
        title: String(data.title || ''),
        description: data.description ? String(data.description) : undefined,
        category: data.category as Win['category'],
        celebratedAt: toSafeDate(data.celebratedAt),
        createdAt: toSafeDate(data.createdAt),
      };
    });

    dataCache.set(cacheKey, wins, CACHE_TTL.USER_DATA);
    log.debug({ userId, period, count: wins.length }, 'User wins fetched');
    return wins;
  } catch (error) {
    const errorStr = String(error);
    if (errorStr.includes('FAILED_PRECONDITION') && errorStr.includes('index')) {
      log.debug({ userId }, 'Firestore index still building for wins - returning empty');
      return [];
    }
    log.error({ error: errorStr, userId, period }, 'Failed to get user wins');
    return [];
  }
}
