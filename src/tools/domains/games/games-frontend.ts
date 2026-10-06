import { getLogger } from '../../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// GAME STATE BROADCASTING HELPERS
// ============================================================================

/**
 * Canonical game type strings used for frontend communication.
 * Always use these normalized forms - never send variant spellings to frontend.
 */
type CanonicalGameType =
  | 'tic-tac-toe'
  | '20-questions'
  | 'word-association'
  | 'would-you-rather'
  | 'story-builder'
  | 'three-word-day'
  | 'values-card-sort'
  | 'headline-writer'
  | 'emoji-story'
  | 'one-word-checkin'
  | 'tiny-win-tracker'
  | 'fortune-cookie';

/**
 * Normalize game type variants to canonical form.
 * Ensures consistent game type strings are sent to frontend.
 *
 * Examples:
 * - 'tictactoe' → 'tic-tac-toe'
 * - 'twentyquestions' → '20-questions'
 * - 'tic-tac-toe' → 'tic-tac-toe' (unchanged)
 */
function normalizeGameType(gameType: string): CanonicalGameType | string {
  const mapping: Record<string, CanonicalGameType> = {
    // Tic-tac-toe variants
    'tic-tac-toe': 'tic-tac-toe',
    tictactoe: 'tic-tac-toe',
    // 20 Questions variants
    '20-questions': '20-questions',
    twentyquestions: '20-questions',
    'twenty-questions': '20-questions',
    // Word Association variants
    'word-association': 'word-association',
    wordassociation: 'word-association',
    // Would You Rather variants
    'would-you-rather': 'would-you-rather',
    wouldyourather: 'would-you-rather',
    // Story Builder variants
    'story-builder': 'story-builder',
    storybuilder: 'story-builder',
    // Reflection games
    'three-word-day': 'three-word-day',
    threewordday: 'three-word-day',
    'values-card-sort': 'values-card-sort',
    valuescardsorc: 'values-card-sort',
    'headline-writer': 'headline-writer',
    headlinewriter: 'headline-writer',
    'emoji-story': 'emoji-story',
    emojistory: 'emoji-story',
    'one-word-checkin': 'one-word-checkin',
    onewordcheckin: 'one-word-checkin',
    'tiny-win-tracker': 'tiny-win-tracker',
    tinywintracker: 'tiny-win-tracker',
    'fortune-cookie': 'fortune-cookie',
    fortunecookie: 'fortune-cookie',
  };
  return mapping[gameType.toLowerCase()] || gameType;
}

/**
 * Helper to get display name for game types (used in frontend UI)
 */
function getGameDisplayName(gameType: string): string {
  const names: Record<string, string> = {
    'tic-tac-toe': 'Tic-Tac-Toe',
    '20-questions': '20 Questions',
    'word-association': 'Word Association',
    'would-you-rather': 'Would You Rather',
    'story-builder': 'Story Builder',
    'three-word-day': 'Three Word Day',
    'values-card-sort': 'Values Card Sort',
    'headline-writer': 'Headline Writer',
    'emoji-story': 'Emoji Story',
    'one-word-checkin': 'One Word Check-in',
    'tiny-win-tracker': 'Tiny Win Tracker',
    'fortune-cookie': 'Fortune Cookie',
  };
  return names[gameType] || gameType;
}

/**
 * Transform backend game state to frontend-compatible format.
 *
 * Backend and frontend have slightly different property names for some games.
 * This ensures the UI receives the expected shape.
 *
 * NOTE: Always normalizes gameType first to handle variant spellings.
 */
function transformStateForFrontend(
  gameType: string,
  gameData: Record<string, unknown>
): Record<string, unknown> {
  // Normalize game type to canonical form before processing
  const normalizedType = normalizeGameType(gameType);

  switch (normalizedType) {
    case 'story-builder': {
      // Backend: storyParts, Frontend: chapters
      const backendState = gameData as {
        storyParts?: string[];
        genre?: string;
        turnCount?: number;
        isUserTurn?: boolean;
        currentChapter?: number;
      };
      return {
        title: undefined, // Optional in frontend
        chapters: backendState.storyParts || [],
        currentChapter: backendState.currentChapter || 1,
        isUserTurn: backendState.isUserTurn ?? true,
        genre: backendState.genre,
      };
    }

    case 'would-you-rather': {
      // Backend: currentDilemma, questionsAnswered, choiceHistory
      // Frontend: currentQuestion, roundNumber, userChoices, aiChoices
      const backendState = gameData as {
        currentDilemma?: { optionA: string; optionB: string };
        questionsAnswered?: number;
        choiceHistory?: Array<{ optionA: string; optionB: string; chosen?: 'A' | 'B' }>;
      };
      return {
        currentQuestion: backendState.currentDilemma,
        roundNumber: (backendState.questionsAnswered || 0) + 1,
        userChoices: (backendState.choiceHistory || [])
          .filter((c) => c.chosen)
          .map((c) => (c.chosen === 'A' ? c.optionA : c.optionB)),
        aiChoices: [], // AI doesn't make choices in this game
      };
    }

    case 'word-association': {
      // Add optional fields expected by frontend
      const backendState = gameData as {
        chain?: string[];
        currentWord?: string;
        isUserTurn?: boolean;
        turnCount?: number;
        lastValidWord?: string;
      };
      return {
        ...backendState,
        invalidAttempts: 0, // Frontend expects this optional field
      };
    }

    case '20-questions': {
      // Add optional maxQuestions expected by frontend
      const backendState = gameData as Record<string, unknown>;
      return {
        ...backendState,
        maxQuestions: 20, // Frontend expects this optional field
      };
    }

    default: {
      // These game types work without transformation
      const knownPassthroughTypes = [
        'tic-tac-toe',
        'tictactoe',
        'three-word-day',
        'headline-writer',
        'emoji-story',
        'values-card-sort',
        'one-word-checkin',
        'tiny-win-tracker',
        'fortune-cookie',
      ];
      // Log warning for unexpected game types to catch missing transforms early
      if (!knownPassthroughTypes.includes(gameType)) {
        log.warn({ gameType }, 'Unknown game type - using raw state without transform');
      }
      return gameData;
    }
  }
}

/**
 * Broadcast game started event to frontend
 */
export async function broadcastGameStarted(
  sessionId: string,
  gameType: string,
  gameData: Record<string, unknown>
): Promise<void> {
  try {
    const { getFrontendPublisher } = await import('../../../agents/realtime/frontend-publisher.js');
    const publisher = getFrontendPublisher(sessionId);

    if (publisher.isConnected()) {
      // Normalize game type to canonical form for frontend
      const normalizedType = normalizeGameType(gameType);
      const gameId = `game-${Date.now()}`;
      const gameName = getGameDisplayName(normalizedType);

      await publisher.sendGameStarted(gameId, normalizedType, gameName);
      // Also send initial state (transformed for frontend compatibility)
      const frontendState = transformStateForFrontend(normalizedType, gameData);
      await publisher.sendGameState(
        normalizedType as Parameters<typeof publisher.sendGameState>[0],
        'active',
        frontendState
      );

      log.debug({ gameType: normalizedType }, '🎮 Game state broadcast: started');
    }
  } catch (error) {
    log.warn({ error: String(error), gameType }, '🎮 Failed to broadcast game start');
  }
}

/**
 * Broadcast game state update to frontend
 */
export async function broadcastGameState(
  sessionId: string,
  gameType: string,
  status: 'active' | 'completed' | 'abandoned',
  gameData: Record<string, unknown>
): Promise<void> {
  try {
    const { getFrontendPublisher } = await import('../../../agents/realtime/frontend-publisher.js');
    const publisher = getFrontendPublisher(sessionId);

    if (publisher.isConnected()) {
      // Normalize game type to canonical form for frontend
      const normalizedType = normalizeGameType(gameType);
      // Transform state for frontend compatibility
      const frontendState = transformStateForFrontend(normalizedType, gameData);
      await publisher.sendGameState(
        normalizedType as Parameters<typeof publisher.sendGameState>[0],
        status,
        frontendState
      );
      log.debug({ gameType: normalizedType, status }, '🎮 Game state broadcast: updated');
    }
  } catch (error) {
    log.warn({ error: String(error), gameType }, '🎮 Failed to broadcast game state');
  }
}

/**
 * Broadcast game ended event to frontend
 */
export async function broadcastGameEnded(
  sessionId: string,
  gameType: string,
  result?: string
): Promise<void> {
  try {
    const { getFrontendPublisher } = await import('../../../agents/realtime/frontend-publisher.js');
    const publisher = getFrontendPublisher(sessionId);

    if (publisher.isConnected()) {
      // Normalize game type to canonical form for frontend
      const normalizedType = normalizeGameType(gameType);
      await publisher.sendGameEnded(normalizedType, result);
      log.debug({ gameType: normalizedType, result }, '🎮 Game state broadcast: ended');
    }
  } catch (error) {
    log.warn({ error: String(error), gameType }, '🎮 Failed to broadcast game end');
  }
}

