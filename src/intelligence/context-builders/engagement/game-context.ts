/**
 * 🎮 Game Context Builder
 *
 * Injects game state into LLM context so it knows when to:
 * - Route user guesses to submitGameAnswer tool
 * - Use game-appropriate tone
 * - Reference scores, rounds, etc.
 */

import { getSessionGameEngine } from '../../../services/games/game-engine.js';
import { getLogger } from '../../../utils/safe-logger.js';
import {
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = getLogger();

/**
 * Build game context injection
 */
async function buildGameContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const injections: ContextInjection[] = [];

  try {
    const personaId = input.persona?.id || 'ferni';
    const sessionId = input.services?.sessionId;

    if (!sessionId) {
      log.debug('🎮 No session ID available for game context');
      return injections;
    }

    const engine = getSessionGameEngine(sessionId, personaId);

    if (!engine.isGameActive()) {
      return injections;
    }

    const state = engine.getState();

    // Build the game context injection
    const gameTypeNames: Record<string, string> = {
      'name-that-tune': 'Name That Tune',
      'one-word-song': 'One Word Song',
      'desert-island-discs': 'Desert Island Discs',
      'this-or-that': 'This or That',
      'mood-dj-challenge': 'Mood DJ Challenge',
    };

    const gameName = gameTypeNames[state.gameType || ''] || state.gameType || 'music game';

    let contextContent = `[🎮 ACTIVE GAME: ${gameName}]
You are currently playing ${gameName} with the user.
- Current round: ${state.currentRound} of ${state.totalRounds}
- Score: ${state.score} points
- High score to beat: ${state.highScore}

IMPORTANT: The user's next message is likely their answer/guess for the game.
- Use the submitGameAnswer tool to process their response
- If they want to skip, use skipGameRound
- If they need help, use getGameHint
- If they want to quit, use endGame

Be playful and encouraging! React to correct/wrong answers with appropriate energy.
`;

    // Add game-specific instructions
    switch (state.gameType) {
      case 'name-that-tune':
        contextContent += `\nNAME THAT TUNE: A song is playing. User guesses song title OR artist.
- ANY close match counts (partial title, artist name)
- Call submitGameAnswer with their guess
- If they say "skip", "pass", "next" → skipGameRound
- If they say "hint", "help" → getGameHint`;
        break;

      case 'one-word-song':
        contextContent += `\nONE WORD SONG: User says ANY word, you find a song with it.
- Call submitGameAnswer with their word
- You'll search iTunes and play a matching song
- Any word works - be creative finding matches!`;
        break;

      case 'desert-island-discs':
        contextContent += `\nDESERT ISLAND DISCS: User picks songs for their desert island.
- Call submitGameAnswer with the song name they mention
- Ask WHY they chose that song - the story matters!
- Play a clip of their pick`;
        break;

      case 'this-or-that':
        contextContent += `\nTHIS OR THAT: Two songs are playing/mentioned, user picks favorite.
- User should say "A" or "B" (or the song name)
- Call submitGameAnswer with their choice
- Ask quick follow-up about why they chose it`;
        break;

      case 'mood-dj-challenge':
        contextContent += `\nMOOD DJ CHALLENGE: You describe a mood, user picks the perfect song.
- Call submitGameAnswer with the song they suggest
- Judge if it matches the mood you described
- Be generous with scoring - subjective is okay!`;
        break;
    }

    injections.push(
      createStandardInjection('game-active', contextContent, { category: 'game-context' })
    );

    log.debug({ gameType: state.gameType, round: state.currentRound }, '🎮 Game context injected');
  } catch (error) {
    log.warn({ error }, '🎮 Failed to build game context');
  }

  return injections;
}

// ============================================================================
// REGISTER CONTEXT BUILDER
// ============================================================================

registerContextBuilder('game-context', buildGameContext);

export { buildGameContext };
export default buildGameContext;
