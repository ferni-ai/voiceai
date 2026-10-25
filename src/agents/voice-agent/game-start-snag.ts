/**
 * What the agent says when a game picked in the app (Let's Play) won't start.
 *
 * It used to say a fixed English line with the raw id in it ("try saying
 * let's play 20-questions"). Now the line names the game the way the picker
 * shows it, or just "that game" for an id it doesn't know, and goes through
 * sayInOwnWords like the agent's other fallbacks, so the character says it in
 * their own words and the canned text is only the understudy.
 *
 * @module voice-agent/game-start-snag
 */

import type { GameType } from '../../services/games/types.js';
import type { TextGameType } from '../../services/games/text-game-types.js';
import { sayInOwnWords } from '../../speech/direction/index.js';

/** The picker's names (apps/web gamePicker.* in en-US), keyed by the engine's game ids. */
const GAME_NAMES: Readonly<Record<GameType | TextGameType, string>> = {
  'name-that-tune': 'Name That Tune',
  'one-word-song': 'One Word Song',
  'desert-island-discs': 'Desert Island Discs',
  'this-or-that': 'This or That',
  'mood-dj-challenge': 'Mood DJ Challenge',
  'finish-the-lyric': 'Finish the Lyric',
  'decade-challenge': 'Decade Challenge',
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

/** The line for a game that didn't start; never the raw id. */
export function gameStartSnag(gameType: unknown): string {
  // Own keys only: "constructor" or "__proto__" must not read Object's built-ins
  const name =
    typeof gameType === 'string' && Object.hasOwn(GAME_NAMES, gameType)
      ? GAME_NAMES[gameType as GameType]
      : undefined;
  return name
    ? `Hmm, I couldn't get ${name} going just now. Want to try again, or just ask me for it?`
    : "Hmm, I couldn't get that game going just now. Want to try again, or pick another one?";
}

/** Say the snag line in the character's own words. Fire and forget. */
export function sayGameStartSnag(sessionId: string, gameType: unknown): void {
  sayInOwnWords(sessionId, gameStartSnag(gameType), 'game_start_failed', {
    allowInterruptions: true,
  });
}
