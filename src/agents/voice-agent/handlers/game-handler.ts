/**
 * Game Handler
 *
 * Handles game topic change detection - when user moves on from an active game.
 *
 * Extracted from transcript-handler.ts to reduce file size.
 *
 * @module voice-agent/handlers/game-handler
 */

import type { SilenceContext } from '../../../personas/meaningful-silence.js';
import { fireAndForget } from '../../../utils/safe-fire-and-forget.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'GameHandler' });

/**
 * Process game topic change detection
 */
export function processGameTopicChange(
  transcript: string,
  silenceContext: SilenceContext,
  sessionId: string
): void {
  fireAndForget(async () => {
    const {
      isSessionGameActive,
      getSessionGameType,
      detectTopicChange,
      getSessionGameEngine,
      resetSessionGameActivity,
    } = await import('../../../services/games/index.js');

    if (isSessionGameActive(sessionId)) {
      type GameType = import('../../../services/games/types.js').GameType;
      const gameType = getSessionGameType(sessionId) as GameType | null;
      const hasChangedTopic = detectTopicChange(transcript, gameType);

      if (hasChangedTopic) {
        // User seems to have moved on from the game
        const engine = getSessionGameEngine(sessionId);
        const gameSession = engine.endGame();
        resetSessionGameActivity(sessionId);

        log.info('Game auto-ended due to topic change', {
          gameType,
          score: gameSession.score,
          rounds: gameSession.roundsPlayed,
        });
      }

      // Update silence context to reflect game state
      silenceContext.isGameActive = isSessionGameActive(sessionId);
      silenceContext.activeGameType = getSessionGameType(sessionId) || undefined;
    }
  }, 'game-topic-change');
}
