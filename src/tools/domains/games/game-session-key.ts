/**
 * Which call a games tool is playing on, and what a board move tells the model.
 *
 * The engines keep each call's game in a Map keyed by the session id, cleaned
 * up when the call ends (cleanup-handler.ts). With no session id the tools
 * used to key the game by `fallback-<persona>-<Date.now()>`, a new key on
 * every call, so the board was lost between moves. Now they fail closed.
 *
 * @module tools/domains/games/game-session-key
 */

import type { ToolContext } from '../../registry/types.js';
import { getSessionId } from '../../utils/tool-helpers.js';

/** What the tools say when the call has no session to keep a game on. */
export const NO_GAME_SESSION =
  "I can't keep a game board on this call right now, so let's play one we can do by talking.";

/** The call's session id (the run's, then the tool context's); undefined when there is none. */
export function gameSessionKey(run: unknown, ctx: ToolContext): string | undefined {
  const fromRun = getSessionId((run ?? {}) as { ctx?: unknown });
  return fromRun || ctx.sessionId || undefined;
}

/**
 * An engine answer with the board as the engine has it, so the model says
 * where the pieces are from the game, never from memory.
 */
export function withBoard(result: { message: string; boardDescription?: string }): string {
  if (!result.boardDescription) return result.message;
  return `${result.message}\nThe board now (from the game; describe it only from this): ${result.boardDescription}.`;
}
