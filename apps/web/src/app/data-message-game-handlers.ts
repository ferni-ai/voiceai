/**
 * Game data-message handlers (game_started / game_state / game_ended). Extracted from data-message-handlers.ts.
 */

import type { DataMessage } from '../types/events.js';
import { messageUI } from '../ui/message.ui.js';
import { soundUI } from '../ui/sound.ui.js';
import { ferniExpressions } from '../ui/ferni-expressions.ui.js';
import { ferni } from '../ui/better-than-human.ui.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('DataMessageHandlers');

/**
 * Game started event from backend
 */
export interface GameStartedEvent extends DataMessage {
  type: 'game_started';
  gameId: string;
  gameType: string;
  gameName: string;
  timestamp: number;
}

/**
 * Game state event from backend
 */
export interface GameStateEvent extends DataMessage {
  type: 'game_state';
  gameType: string;
  status: 'active' | 'completed' | 'abandoned';
  gameData: Record<string, unknown>;
  timestamp: number;
}

/**
 * Game ended event from backend
 */
export interface GameEndedEvent extends DataMessage {
  type: 'game_ended';
  gameType: string;
  result?: string;
  timestamp: number;
}

/**
 * Handle game started events from the backend.
 *
 * Dispatches a custom event that game-board.ui.ts listens for
 * to show the visual game board.
 */
export function handleGameStarted(event: GameStartedEvent): void {
  log.info('🎮 Game started!', {
    gameId: event.gameId,
    gameType: event.gameType,
    gameName: event.gameName,
  });

  // Play a subtle start sound
  soundUI.play('message');

  // Show a playful expression
  ferniExpressions.setExpression('excited', 400, 1500);

  // Dispatch custom event for the game board UI (document, not window - matches listener)
  document.dispatchEvent(
    new CustomEvent('ferni:game-started', {
      detail: {
        gameId: event.gameId,
        gameType: event.gameType,
        gameName: event.gameName,
      },
    })
  );
}

/**
 * Handle game state update events from the backend.
 *
 * Dispatches a custom event that game-board.ui.ts listens for
 * to update the visual game board (moves, turns, scores).
 */
export function handleGameState(event: GameStateEvent): void {
  log.debug('🎮 Game state update', {
    gameType: event.gameType,
    status: event.status,
  });

  // Map backend state to frontend expected format
  const gameState = {
    gameType: event.gameType,
    status: event.status,
    ...event.gameData,
  };

  // Dispatch custom event for the game board UI (document, not window - matches listener)
  document.dispatchEvent(
    new CustomEvent('ferni:game-state-update', {
      detail: gameState,
    })
  );

  // If game completed, show appropriate expression
  if (event.status === 'completed') {
    const { playMicroExpression } = ferni;
    playMicroExpression('delight_flash');
    ferniExpressions.setExpression('pleased', 400, 2000);
  }
}

/**
 * Handle game ended events from the backend.
 *
 * Dispatches a custom event that game-board.ui.ts listens for
 * to hide the visual game board.
 */
export function handleGameEnded(event: GameEndedEvent): void {
  log.info('🎮 Game ended!', {
    gameType: event.gameType,
    result: event.result,
  });

  // Show warm closing expression
  ferniExpressions.setExpression('happy', 400, 2000);

  // Dispatch custom event for the game board UI (document, not window - matches listener)
  document.dispatchEvent(
    new CustomEvent('ferni:game-ended', {
      detail: {
        gameType: event.gameType,
        result: event.result,
      },
    })
  );

  // Show result message if provided
  if (event.result) {
    messageUI.show(event.result, 'info', 4000);
  }
}
