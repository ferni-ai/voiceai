/**
 * 🎮 Game Analytics
 *
 * Tracks game usage, engagement, and feature adoption.
 * Data can be exported to analytics services or stored for insights.
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

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
// IN-MEMORY STORAGE (would be replaced by proper analytics service)
// ============================================================================

const events: GameEvent[] = [];
const MAX_EVENTS = 10000; // Keep last 10k events in memory

// Aggregated counters (survive restart if persisted)
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

  // Store event (circular buffer)
  if (events.length >= MAX_EVENTS) {
    events.shift();
  }
  events.push(fullEvent);

  // Update counters
  uniquePlayers.add(event.userId);
  updateCounters(fullEvent);

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
        counters.gameTypeCounts[event.gameType] = (counters.gameTypeCounts[event.gameType] || 0) + 1;
      }
      break;
    case 'game_completed':
      counters.gamesCompleted++;
      if (event.gameType && event.data?.score !== undefined) {
        counters.scoreSums[event.gameType] = (counters.scoreSums[event.gameType] || 0) + (event.data.score as number);
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
export function trackGameStart(userId: string, gameType: string, personaId?: string, sessionId?: string): void {
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
export function trackAnswer(userId: string, gameType: string, correct: boolean, guessTimeMs?: number): void {
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
  const completionRate = counters.gamesStarted > 0
    ? (counters.gamesCompleted / counters.gamesStarted) * 100
    : 0;

  const proactiveAcceptanceRate = counters.proactiveOffersShown > 0
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
  const averageScore = counters.gamesCompleted > 0
    ? totalScore / counters.gamesCompleted
    : 0;

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
export function getUserEvents(userId: string, limit: number = 50): GameEvent[] {
  return events
    .filter(e => e.userId === userId)
    .slice(-limit);
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

