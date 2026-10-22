/**
 * VOICE_TICTACTOE=on: tic-tac-toe by voice runs on the real board engine
 * (services/games/text-game-engine.ts) instead of being improvised.
 *
 * Its tools live in the games domain, which every call loads, but the first
 * agent's 64-slot cap dropped all of them (games audit, 2026-10-18), so a
 * caller who asked for tic-tac-toe got a board Ferni kept in his head: he
 * accepted a move onto his own square and described the board wrong. Mapping
 * "tic tac toe" to the games domain would not help: the domain is already
 * loaded, so a topic load adds nothing (dynamic-loader processMessage). With
 * the flag on, these four tools are must-keep through every cap
 * (isEssentialTool, isStaticCoreTool in tool-config.ts).
 *
 * @module config/voice-tictactoe
 */

import { flagOn } from './env-flag.js';

export const VOICE_TICTACTOE_TOOLS: readonly string[] = [
  'startTextGame',
  'makeTextGameMove',
  'getTextGameBoard',
  'endTextGame',
];

/** True for a tic-tac-toe tool while VOICE_TICTACTOE=on. */
export function isVoiceTicTacToeTool(
  name: string,
  env: Record<string, string | undefined> = process.env
): boolean {
  return VOICE_TICTACTOE_TOOLS.includes(name) && flagOn('VOICE_TICTACTOE', env);
}
