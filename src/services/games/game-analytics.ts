/**
 * 🎮 Game Analytics
 *
 * Tracks game usage, engagement, and feature adoption.
 * Data can be exported to analytics services or stored for insights.
 *
 * PERSISTENCE: Uses Firestore for event storage and analytics aggregation.
 */

import admin from 'firebase-admin';
import { getLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

const log = getLogger();

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

const EVENTS_COLLECTION = 'game_analytics_events';
const COUNTERS_COLLECTION = 'game_analytics_counters';
let firestoreInstance: admin.firestore.Firestore | null = null;
let firestoreInitAttempted = false;

function getFirestore(): admin.firestore.Firestore | null {
  if (firestoreInstance) return firestoreInstance;
  if (firestoreInitAttempted) return null;

  firestoreInitAttempted = true;

  try {
    if (admin.apps.length === 0) {
      const projectId =
        process.env.GCP_PROJECT_ID ||
        process.env.FIREBASE_PROJECT_ID ||
        process.env.GOOGLE_CLOUD_PROJECT;

      if (projectId) {
        admin.initializeApp({ projectId });
      } else {
        admin.initializeApp();
      }
    }

    firestoreInstance = admin.firestore();
    log.info('✅ Firestore initialized for game analytics');
    return firestoreInstance;
  } catch (error) {
    log.warn({ error }, 'Firebase not available for game analytics, using in-memory only');
    return null;
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface GameEvent {
  type: GameEventType;
  timestamp: Date;
  userId: string;
  sessionId?: string;
  gameType?: string;
  personaId?: string;
  data?: Record<string, unknown>;
}

export type GameEventType =
  | 'game_started'
  | 'game_completed'
  | 'game_abandoned'
  | 'round_completed'
  | 'correct_answer'
  | 'incorrect_answer'
  | 'music_played'
  | 'dashboard_opened'
  | 'game_picker_opened'
  | 'proactive_offer_shown'
  | 'proactive_offer_accepted'
  | 'proactive_offer_declined';

export interface GameAnalyticsSummary {
  totalGamesStarted: number;
  totalGamesCompleted: number;
  completionRate: number;
  averageScore: number;
  totalCorrectAnswers: number;
  totalRoundsPlayed: number;
  mostPlayedGame: string | null;
  dashboardOpens: number;
  proactiveOfferAcceptanceRate: number;
  uniquePlayersCount: number;
}

// ============================================================================
// IN-MEMORY CACHE (with Firestore persistence)
// ============================================================================

const events: GameEvent[] = [];
const MAX_EVENTS = 10000; // Keep last 10k events in memory

// Aggregated counters (persist to Firestore for cross-restart survival)
const counters = {
  gamesStarted: 0,
  gamesCompleted: 0,
  gamesAbandoned: 0,
  correctAnswers: 0,
  incorrectAnswers: 0,
  roundsPlayed: 0,
  dashboardOpens: 0,
  gamePickerOpens: 0,
  proactiveOffersShown: 0,
  proactiveOffersAccepted: 0,
  proactiveOffersDeclined: 0,
  gameTypeCounts: {} as Record<string, number>,
  scoreSums: {} as Record<string, number>,
};

const uniquePlayers = new Set<string>();
let countersLoaded = false;

// ============================================================================
// PERSISTENCE FUNCTIONS
// ============================================================================

/**
 * Save event to Firestore
 */
async function saveEventToFirestore(event: GameEvent): Promise<void> {
  const db = getFirestore();
  if (!db) return;

  try {
    await db.collection(EVENTS_COLLECTION).add(cleanForFirestore({
      ...event,
      timestamp: event.timestamp,
    }));
  } catch (error) {
    log.warn({ error, eventType: event.type }, 'Failed to save game event to Firestore');
  }
}

/**
 * Update counters in Firestore (using increment for atomic updates)
 */
async function incrementCounter(field: string, amount = 1): Promise<void> {
  const db = getFirestore();
  if (!db) return;

  try {
    const counterRef = db.collection(COUNTERS_COLLECTION).doc('global');
    await counterRef.set(
      cleanForFirestore({ [field]: admin.firestore.FieldValue.increment(amount) }),
      { merge: true }
    );
  } catch (error) {
    log.warn({ error, field }, 'Failed to increment game counter in Firestore');
  }
}

/**
 * Load counters from Firestore on startup
 */
export async function loadCountersFromFirestore(): Promise<void> {
  if (countersLoaded) return;

  const db = getFirestore();
  if (!db) {
    countersLoaded = true;
    return;
  }

  try {
    const doc = await db.collection(COUNTERS_COLLECTION).doc('global').get();
    if (doc.exists) {
      const data = doc.data() || {};
      Object.assign(counters, {
        gamesStarted: data.gamesStarted || 0,
        gamesCompleted: data.gamesCompleted || 0,
        gamesAbandoned: data.gamesAbandoned || 0,
        correctAnswers: data.correctAnswers || 0,
        incorrectAnswers: data.incorrectAnswers || 0,
        roundsPlayed: data.roundsPlayed || 0,
        dashboardOpens: data.dashboardOpens || 0,
        gamePickerOpens: data.gamePickerOpens || 0,
        proactiveOffersShown: data.proactiveOffersShown || 0,
        proactiveOffersAccepted: data.proactiveOffersAccepted || 0,
        proactiveOffersDeclined: data.proactiveOffersDeclined || 0,
        gameTypeCounts: data.gameTypeCounts || {},
        scoreSums: data.scoreSums || {},
      });
      log.info({ counters }, 'Loaded game analytics counters from Firestore');
    }
  } catch (error) {
    log.warn({ error }, 'Failed to load game counters from Firestore');
  }

  countersLoaded = true;
}

/**
 * Query events from Firestore
 */
export async function queryEventsFromFirestore(
  filter: { userId?: string; gameType?: string; type?: GameEventType },
  limit = 100
): Promise<GameEvent[]> {
  const db = getFirestore();
  if (!db) return events.slice(-limit);

  try {
    let query: admin.firestore.Query = db.collection(EVENTS_COLLECTION);

    if (filter.userId) {
      query = query.where('userId', '==', filter.userId);
    }
    if (filter.gameType) {
      query = query.where('gameType', '==', filter.gameType);
    }
    if (filter.type) {
      query = query.where('type', '==', filter.type);
    }

    const snapshot = await query.orderBy('timestamp', 'desc').limit(limit).get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        timestamp: data.timestamp?.toDate?.() || new Date(data.timestamp),
      } as GameEvent;
    });
  } catch (error) {
    log.warn({ error }, 'Failed to query game events from Firestore');
    return events.slice(-limit);
  }
}

// ============================================================================
// TRACKING FUNCTIONS
// ============================================================================

/**
 * Track a game event
 */
export function trackGameEvent(event: Omit<GameEvent, 'timestamp'>): void {
  const fullEvent: GameEvent = {
    ...event,
    timestamp: new Date(),
  };

  // Store event in memory (circular buffer)
  if (events.length >= MAX_EVENTS) {
    events.shift();
  }
  events.push(fullEvent);

  // Update counters
  uniquePlayers.add(event.userId);
  updateCounters(fullEvent);

  // Persist to Firestore (fire-and-forget)
  void saveEventToFirestore(fullEvent);

  log.debug({ eventType: event.type, gameType: event.gameType }, '🎮 Game event tracked');
}

/**
 * Update aggregated counters
 */
function updateCounters(event: GameEvent): void {
  switch (event.type) {
    case 'game_started':
      counters.gamesStarted++;
      if (event.gameType) {
        counters.gameTypeCounts[event.gameType] =
          (counters.gameTypeCounts[event.gameType] || 0) + 1;
      }
      break;
    case 'game_completed':
      counters.gamesCompleted++;
      if (event.gameType && event.data?.score !== undefined) {
        counters.scoreSums[event.gameType] =
          (counters.scoreSums[event.gameType] || 0) + (event.data.score as number);
      }
      break;
    case 'game_abandoned':
      counters.gamesAbandoned++;
      break;
    case 'round_completed':
      counters.roundsPlayed++;
      break;
    case 'correct_answer':
      counters.correctAnswers++;
      break;
    case 'incorrect_answer':
      counters.incorrectAnswers++;
      break;
    case 'dashboard_opened':
      counters.dashboardOpens++;
      break;
    case 'game_picker_opened':
      counters.gamePickerOpens++;
      break;
    case 'proactive_offer_shown':
      counters.proactiveOffersShown++;
      break;
    case 'proactive_offer_accepted':
      counters.proactiveOffersAccepted++;
      break;
    case 'proactive_offer_declined':
      counters.proactiveOffersDeclined++;
      break;
  }
}

// ============================================================================
// CONVENIENCE TRACKERS
// ============================================================================

/**
 * Track game start
 */
export function trackGameStart(
  userId: string,
  gameType: string,
  personaId?: string,
  sessionId?: string
): void {
  trackGameEvent({
    type: 'game_started',
    userId,
    gameType,
    personaId,
    sessionId,
  });
}

/**
 * Track game completion
 */
export function trackGameComplete(
  userId: string,
  gameType: string,
  score: number,
  roundsPlayed: number,
  durationSeconds: number
): void {
  trackGameEvent({
    type: 'game_completed',
    userId,
    gameType,
    data: { score, roundsPlayed, durationSeconds },
  });
}

/**
 * Track game abandonment
 */
export function trackGameAbandoned(userId: string, gameType: string, roundReached: number): void {
  trackGameEvent({
    type: 'game_abandoned',
    userId,
    gameType,
    data: { roundReached },
  });
}

/**
 * Track correct/incorrect answer
 */
export function trackAnswer(
  userId: string,
  gameType: string,
  correct: boolean,
  guessTimeMs?: number
): void {
  trackGameEvent({
    type: correct ? 'correct_answer' : 'incorrect_answer',
    userId,
    gameType,
    data: { guessTimeMs },
  });
}

/**
 * Track dashboard open
 */
export function trackDashboardOpen(userId: string): void {
  trackGameEvent({
    type: 'dashboard_opened',
    userId,
  });
}

/**
 * Track proactive game offer
 */
export function trackProactiveOffer(userId: string, accepted: boolean, gameType?: string): void {
  trackGameEvent({
    type: accepted ? 'proactive_offer_accepted' : 'proactive_offer_declined',
    userId,
    gameType,
  });
}

// ============================================================================
// ANALYTICS GETTERS
// ============================================================================

/**
 * Get analytics summary
 */
export function getAnalyticsSummary(): GameAnalyticsSummary {
  const completionRate =
    counters.gamesStarted > 0 ? (counters.gamesCompleted / counters.gamesStarted) * 100 : 0;

  const proactiveAcceptanceRate =
    counters.proactiveOffersShown > 0
      ? (counters.proactiveOffersAccepted / counters.proactiveOffersShown) * 100
      : 0;

  // Find most played game
  let mostPlayedGame: string | null = null;
  let maxPlays = 0;
  for (const [game, count] of Object.entries(counters.gameTypeCounts)) {
    if (count > maxPlays) {
      maxPlays = count;
      mostPlayedGame = game;
    }
  }

  // Calculate average score across all games
  const totalScore = Object.values(counters.scoreSums).reduce((a, b) => a + b, 0);
  const averageScore = counters.gamesCompleted > 0 ? totalScore / counters.gamesCompleted : 0;

  return {
    totalGamesStarted: counters.gamesStarted,
    totalGamesCompleted: counters.gamesCompleted,
    completionRate: Math.round(completionRate * 10) / 10,
    averageScore: Math.round(averageScore * 10) / 10,
    totalCorrectAnswers: counters.correctAnswers,
    totalRoundsPlayed: counters.roundsPlayed,
    mostPlayedGame,
    dashboardOpens: counters.dashboardOpens,
    proactiveOfferAcceptanceRate: Math.round(proactiveAcceptanceRate * 10) / 10,
    uniquePlayersCount: uniquePlayers.size,
  };
}

/**
 * Get recent events for a user
 */
export function getUserEvents(userId: string, limit = 50): GameEvent[] {
  return events.filter((e) => e.userId === userId).slice(-limit);
}

/**
 * Get game type breakdown
 */
export function getGameTypeBreakdown(): Record<string, number> {
  return { ...counters.gameTypeCounts };
}

/**
 * Reset analytics (for testing)
 */
export function resetAnalytics(): void {
  events.length = 0;
  uniquePlayers.clear();
  counters.gamesStarted = 0;
  counters.gamesCompleted = 0;
  counters.gamesAbandoned = 0;
  counters.correctAnswers = 0;
  counters.incorrectAnswers = 0;
  counters.roundsPlayed = 0;
  counters.dashboardOpens = 0;
  counters.gamePickerOpens = 0;
  counters.proactiveOffersShown = 0;
  counters.proactiveOffersAccepted = 0;
  counters.proactiveOffersDeclined = 0;
  counters.gameTypeCounts = {};
  counters.scoreSums = {};
  log.info('🎮 Analytics reset');
}
