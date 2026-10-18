/**
 * gameState: the model's scorekeeper for whatever game it is playing on the
 * call (would-you-rather, 20 questions, trivia, story-building, word games).
 * State lives with the call's AgentSession (services/games/call-game-state.ts);
 * while a game is on, each request carries a short note of it (turn-request.ts).
 *
 * Only in the games domain when GAME_STATE=on (index.ts).
 *
 * @module tools/domains/games/game-state-tool
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import {
  CALL_GAME_TYPES,
  describeCallGame,
  endCallGame,
  gameStateEnabled,
  getCallGame,
  startCallGame,
  updateCallGame,
} from '../../../services/games/call-game-state.js';
import { getLogger } from '../../../utils/safe-logger.js';
import type { ToolDefinition } from '../../registry/types.js';

const log = getLogger();

export const GAME_STATE_TOOL = 'gameState';

const DESCRIPTION = `Keep score in a game you're playing with the user by voice, like a friend would: whose turn it is, the score, what's been asked or said already (so you never repeat a question, dilemma or trivia question), and in 20 questions or a riddle the answer you're holding.
- start: when a game begins. gameType; players (names, default caller and Ferni); turn (who goes first); secret (20 questions when you're thinking of something, or a riddle's answer: pick it now and stay consistent with it).
- update: once per turn, after each move. used (the question asked, dilemma, story line or word just used); scorePlayer + scorePoints; nextTurn (true, or the name of who goes next) or turn. Its answer shows the whole game, your secret included, so you never need get first.
- get: to check the game when you aren't recording a move.
- end: when the game finishes, or as soon as the caller wants to stop or switch; then don't make another move. It gives the final score and the answer to reveal.
Trivia: turn is whoever answers. The score counts right answers only, to whoever answered (usually the caller); a wrong answer scores nobody. used is the question you asked, not their guess.
Never say the secret before the game ends, and never give a hint that contains it.`;

const parameters = z.object({
  action: z.enum(['start', 'update', 'get', 'end']).describe('What to do'),
  gameType: z.enum(CALL_GAME_TYPES).optional().describe('start: which game'),
  players: z.array(z.string()).optional().describe('start: player names'),
  secret: z
    .string()
    .optional()
    .describe(
      'start or update: what you are thinking of (20 questions) or the riddle answer; kept private'
    ),
  turn: z.string().optional().describe('Whose turn it is now'),
  nextTurn: z
    .union([z.boolean(), z.string()])
    .optional()
    .describe('update: pass the turn on; true for the next player, or the name of who goes next'),
  scorePlayer: z.string().optional().describe('update: who scored'),
  scorePoints: z.number().optional().describe('update: points to add (default 1)'),
  used: z
    .string()
    .optional()
    .describe('update: the question asked, dilemma, story line or word used'),
});

type GameStateArgs = z.infer<typeof parameters>;

/** What the tool answers; exported for tests. */
export function runGameState(session: object | undefined, args: GameStateArgs): string {
  if (!session) return "Game tracking isn't available right now; keep track in the conversation.";
  switch (args.action) {
    case 'start': {
      const game = startCallGame(session, {
        type: args.gameType ?? 'other',
        players: args.players,
        secret: args.secret,
        turn: args.turn,
      });
      log.info({ gameType: game.type, players: game.players.length }, 'GAME_STATE_START');
      const secretNote = game.secret ? " Your secret is saved; don't say it until the end." : '';
      return `Started. ${describeCallGame(game, { withSecret: false })}${secretNote}`;
    }
    case 'update': {
      const result = updateCallGame(session, args);
      if (!result) return 'No game is on. Start one with action start.';
      const notes = [
        result.repeated ? 'That was already used this game; pick something new.' : '',
        result.secretKept
          ? 'The secret was already set and stays the same; stay consistent with it.'
          : '',
        result.scoreRefused
          ? `No point given: in trivia only the player answering (${result.game.turn}) scores, and a wrong answer scores nobody.`
          : '',
      ].filter(Boolean);
      // Tool output is private to the model: the secret rides here so a turn needs one call, not get + update.
      return [...notes, describeCallGame(result.game, { withSecret: true })].join('\n');
    }
    case 'get': {
      const game = getCallGame(session);
      return game ? describeCallGame(game, { withSecret: true }) : 'No game is on.';
    }
    case 'end': {
      const game = endCallGame(session);
      if (!game) return 'No game was on.';
      log.info({ gameType: game.type, moves: game.usedTotal }, 'GAME_STATE_END');
      const answer = game.secret ? `\nThe answer was: ${game.secret}. You can say it now.` : '';
      return `Game over. ${describeCallGame(game, { withSecret: false })}${answer}`;
    }
  }
}

export const gameStateToolDefinition: ToolDefinition = {
  id: GAME_STATE_TOOL,
  name: 'Game State',
  description: DESCRIPTION,
  domain: 'games',
  tags: ['games', 'score', 'turns', 'interactive'],
  create: () =>
    llm.tool({
      description: DESCRIPTION,
      parameters,
      execute: async (args, run) => {
        const session = (run as { ctx?: { session?: object } } | undefined)?.ctx?.session;
        return runGameState(session, args);
      },
    }),
};

/** The games domain's share: the scorekeeper with GAME_STATE=on, nothing otherwise. */
export function gameStateTools(
  env: Record<string, string | undefined> = process.env
): ToolDefinition[] {
  return gameStateEnabled(env) ? [gameStateToolDefinition] : [];
}
