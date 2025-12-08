/**
 * 🔊 Game Sound Effects
 *
 * Short audio cues for game feedback.
 * Now uses local sound files via the session-sounds service
 * with TTS verbal fallbacks for reliability.
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  playSessionSound,
  getVerbalSound,
  type SessionSoundType,
} from '../../audio/session-sounds.js';

const log = getLogger();

// ============================================================================
// VERBAL SOUND EFFECTS (Most reliable - uses TTS)
// ============================================================================

/**
 * Get verbal sound effect that TTS will pronounce
 * These work reliably across all TTS providers
 */
export function getVerbalSoundEffect(
  type: 'correct' | 'wrong' | 'highScore' | 'hint' | 'gameEnd' | 'gameStart'
): string {
  // Map game types to session sound types
  const typeMap: Record<string, SessionSoundType> = {
    correct: 'correct',
    wrong: 'wrong',
    highScore: 'high-score',
    hint: 'hint',
    gameEnd: 'game-end',
    gameStart: 'game-start',
  };

  const sessionType = typeMap[type] || 'correct';
  return getVerbalSound(sessionType);
}

// ============================================================================
// PLAY SOUND EFFECTS
// ============================================================================

/**
 * Play a sound effect using the session sounds service
 * Falls back to verbal cue if audio not available
 */
export async function playGameSound(
  type: 'correct' | 'wrong' | 'highScore' | 'hint' | 'gameEnd' | 'gameStart' | 'roundStart' | 'tick'
): Promise<{ played: boolean; verbalFallback?: string }> {
  // Map game types to session sound types
  const typeMap: Record<string, SessionSoundType> = {
    correct: 'correct',
    wrong: 'wrong',
    highScore: 'high-score',
    hint: 'hint',
    gameEnd: 'game-end',
    gameStart: 'game-start',
    roundStart: 'game-start', // Reuse game-start for rounds
    tick: 'notification', // Use notification for ticks
  };

  const sessionType = typeMap[type];
  if (!sessionType) {
    log.warn({ type }, '🔊 Unknown game sound type');
    return { played: false };
  }

  try {
    const result = await playSessionSound(sessionType);

    if (result.played) {
      log.debug({ type }, '🔊 Played game sound effect');
    }

    return result;
  } catch (error) {
    log.error({ error, type }, '🔊 Failed to play game sound effect');
    return {
      played: false,
      verbalFallback: getVerbalSoundEffect(
        type as 'correct' | 'wrong' | 'highScore' | 'hint' | 'gameEnd' | 'gameStart'
      ),
    };
  }
}

// ============================================================================
// INTEGRATED FEEDBACK
// ============================================================================

/**
 * Get complete feedback for a game result
 * Includes sound effect (or verbal fallback) + message
 */
export async function getGameFeedback(
  isCorrect: boolean,
  isHighScore = false,
  baseMessage = ''
): Promise<string> {
  let prefix = '';

  if (isHighScore) {
    const result = await playGameSound('highScore');
    prefix = result.verbalFallback || getVerbalSoundEffect('highScore');
  } else if (isCorrect) {
    const result = await playGameSound('correct');
    prefix = result.verbalFallback || getVerbalSoundEffect('correct');
  } else {
    const result = await playGameSound('wrong');
    prefix = result.verbalFallback || getVerbalSoundEffect('wrong');
  }

  return `${prefix} ${baseMessage}`;
}

/**
 * Play game start sound
 */
export async function playGameStartSound(): Promise<string> {
  const result = await playGameSound('gameStart');
  if (!result.played) {
    return result.verbalFallback || getVerbalSoundEffect('gameStart');
  }
  return '';
}

/**
 * Play game end sound/fanfare
 */
export async function playGameEndSound(score: number, isHighScore: boolean): Promise<string> {
  if (isHighScore) {
    const result = await playGameSound('highScore');
    return result.verbalFallback || getVerbalSoundEffect('highScore');
  }

  const result = await playGameSound('gameEnd');
  return result.verbalFallback || getVerbalSoundEffect('gameEnd');
}

/**
 * Play hint sound
 */
export async function playHintSound(): Promise<string> {
  const result = await playGameSound('hint');
  return result.verbalFallback || getVerbalSoundEffect('hint');
}

/**
 * Play round start sound (for multi-round games)
 */
export async function playRoundStartSound(): Promise<string> {
  const result = await playGameSound('roundStart');
  if (!result.played) {
    return '<break time="150ms"/>Next round!<break time="150ms"/>';
  }
  return '';
}
