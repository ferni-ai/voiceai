/**
 * Games Domain Tools
 *
 * Interactive music games for engaging conversations.
 * Uses existing music playback - no refactoring needed!
 *
 * DOMAIN: games
 * TOOLS:
 *   Game Management: startGame, submitAnswer, getHint, skipRound, endGame
 *   Game Info: getGameStatus, getGameHistory, suggestGame
 *
 * AVAILABLE GAMES:
 *   - Name That Tune: Play a clip, guess the song
 *   - One Word Song: Say a word, find a song with it
 *   - Desert Island Discs: Pick 5 songs for an island
 *   - This or That: Choose between two songs
 *   - Mood DJ Challenge: Describe mood, agent picks song
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext } from '../../registry/types.js';
import { getGameEngine } from '../../../services/games/game-engine.js';
import type { GameType } from '../../../services/games/types.js';
import { getLogger } from '../../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// GAME TOOL DEFINITIONS
// ============================================================================

function createGameToolDefinitions(): ToolDefinition[] {
  return [
    // ========================================
    // GAME MANAGEMENT
    // ========================================
    {
      id: 'startGame',
      name: 'Start Game',
      description: `Start a fun music game with the user!

Available games:
- "name-that-tune" - Play a song clip, user guesses the song/artist
- "one-word-song" - User says a word, you find a song with that word
- "desert-island-discs" - User picks 5 songs they'd bring to a desert island
- "this-or-that" - Play two songs, user picks their favorite
- "mood-dj-challenge" - User describes a mood, you pick the perfect song

Use when user says things like:
- "Let's play a game"
- "Play name that tune"
- "Let's do desert island discs"
- "Can we play a music game?"`,
      domain: 'games',
      tags: ['games', 'music', 'interactive', 'fun'],
      create: (ctx: ToolContext) => llm.tool({
        description: 'Start a music game',
        parameters: z.object({
          gameType: z.enum([
            'name-that-tune',
            'one-word-song',
            'desert-island-discs',
            'this-or-that',
            'mood-dj-challenge',
          ]).describe('Which game to play'),
          rounds: z.number().optional().describe('Number of rounds (default varies by game)'),
        }),
        execute: async ({ gameType, rounds }) => {
          try {
            const personaId = ctx.agentId || 'ferni';
            const gameEngine = getGameEngine(personaId);
            
            const config = rounds ? { rounds } : undefined;
            const welcomeMessage = await gameEngine.startGame(
              gameType as GameType,
              config as Record<string, unknown>
            );
            
            log.info({ gameType, personaId }, '🎮 Game started');
            return welcomeMessage;
          } catch (error) {
            log.error({ error, gameType }, '🎮 Failed to start game');
            return `I couldn't start that game right now. Want to try a different one?`;
          }
        },
      }),
    },

    {
      id: 'submitGameAnswer',
      name: 'Submit Game Answer',
      description: `Submit the user's answer or choice in the current game.

Use when:
- User guesses a song in Name That Tune
- User says a word in One Word Song
- User picks a song in Desert Island Discs
- User chooses A or B in This or That
- User describes a mood in Mood DJ Challenge
- User rates your song pick (1-5)`,
      domain: 'games',
      tags: ['games', 'answer', 'interactive'],
      create: (ctx: ToolContext) => llm.tool({
        description: 'Submit answer in current game',
        parameters: z.object({
          answer: z.string().describe('The user\'s answer, choice, or input'),
        }),
        execute: async ({ answer }) => {
          const personaId = ctx.agentId || 'ferni';
          const gameEngine = getGameEngine(personaId);
          
          if (!gameEngine.isGameActive()) {
            return "We're not playing a game right now. Want to start one?";
          }

          try {
            const result = await gameEngine.submitAnswer(answer);
            
            let response = result.feedback;
            
            if (result.gameOver) {
              response += `\n\n🏆 Game Over! Final score: ${result.finalScore} points!`;
              
              const state = gameEngine.getState();
              if (result.finalScore && result.finalScore >= state.highScore) {
                response += `\n🎉 That's a new high score!`;
              }
            }
            
            return response;
          } catch (error) {
            log.error({ error }, '🎮 Failed to submit answer');
            return "Something went wrong. Try your answer again?";
          }
        },
      }),
    },

    {
      id: 'getGameHint',
      name: 'Get Game Hint',
      description: `Give the user a hint in the current game.
Use when user says "hint", "help", "I don't know", or seems stuck.`,
      domain: 'games',
      tags: ['games', 'hint', 'help'],
      create: (ctx: ToolContext) => llm.tool({
        description: 'Get a hint for the current game',
        parameters: z.object({}),
        execute: async () => {
          const personaId = ctx.agentId || 'ferni';
          const gameEngine = getGameEngine(personaId);
          
          if (!gameEngine.isGameActive()) {
            return "We're not playing a game right now!";
          }

          const hint = gameEngine.getHint();
          return hint || "I don't have any more hints! Take your best guess!";
        },
      }),
    },

    {
      id: 'skipGameRound',
      name: 'Skip Game Round',
      description: `Skip the current round in the game.
Use when user says "skip", "pass", "next", or wants to move on.`,
      domain: 'games',
      tags: ['games', 'skip', 'next'],
      create: (ctx: ToolContext) => llm.tool({
        description: 'Skip the current round',
        parameters: z.object({}),
        execute: async () => {
          const personaId = ctx.agentId || 'ferni';
          const gameEngine = getGameEngine(personaId);
          
          if (!gameEngine.isGameActive()) {
            return "We're not playing a game right now!";
          }

          try {
            const result = await gameEngine.skipRound();
            return result.feedback;
          } catch (error) {
            log.error({ error }, '🎮 Failed to skip round');
            return "Couldn't skip that round. Try again?";
          }
        },
      }),
    },

    {
      id: 'endGame',
      name: 'End Game',
      description: `End the current game early.
Use when user says "stop", "quit", "end game", or wants to do something else.`,
      domain: 'games',
      tags: ['games', 'end', 'quit'],
      create: (ctx: ToolContext) => llm.tool({
        description: 'End the current game',
        parameters: z.object({}),
        execute: async () => {
          const personaId = ctx.agentId || 'ferni';
          const gameEngine = getGameEngine(personaId);
          
          if (!gameEngine.isGameActive()) {
            return "We're not playing a game right now!";
          }

          const session = gameEngine.endGame();
          return `Game over! You scored ${session.score} points in ${session.roundsPlayed} rounds.\n\nWant to play again or do something else?`;
        },
      }),
    },

    // ========================================
    // GAME INFO
    // ========================================
    {
      id: 'getGameStatus',
      name: 'Get Game Status',
      description: `Check the current game status.
Use when user asks "what's the score?", "what round?", "how am I doing?"`,
      domain: 'games',
      tags: ['games', 'status', 'score'],
      create: (ctx: ToolContext) => llm.tool({
        description: 'Get current game status',
        parameters: z.object({}),
        execute: async () => {
          const personaId = ctx.agentId || 'ferni';
          const gameEngine = getGameEngine(personaId);
          const state = gameEngine.getState();
          
          if (state.status === 'idle') {
            return "We're not playing a game right now. Want to start one?";
          }

          return `🎮 Current Game: ${state.gameType}\n` +
            `📊 Score: ${state.score} points\n` +
            `🔄 Round: ${state.currentRound} of ${state.totalRounds}\n` +
            `🏆 High Score: ${state.highScore}`;
        },
      }),
    },

    {
      id: 'getGameHistory',
      name: 'Get Game History',
      description: `Check the user's game history and stats.
Use when user asks "how many games have I played?", "what's my best score?"`,
      domain: 'games',
      tags: ['games', 'history', 'stats'],
      create: (ctx: ToolContext) => llm.tool({
        description: 'Get game history and stats',
        parameters: z.object({}),
        execute: async () => {
          const personaId = ctx.agentId || 'ferni';
          const gameEngine = getGameEngine(personaId);
          const history = gameEngine.getHistory();
          
          if (history.sessionGames.length === 0) {
            return "You haven't played any games this session! Want to start one?";
          }

          const sessionSummary = history.sessionGames
            .map(g => `• ${g.gameType}: ${g.score} points`)
            .join('\n');

          return `🎮 Games This Session:\n${sessionSummary}\n\n` +
            `Total games: ${history.sessionGames.length}`;
        },
      }),
    },

    {
      id: 'suggestGame',
      name: 'Suggest Game',
      description: `Suggest a game to the user based on context or mood.
Use proactively during lulls or when user seems like they want to do something fun.`,
      domain: 'games',
      tags: ['games', 'suggest', 'proactive'],
      create: (_ctx: ToolContext) => llm.tool({
        description: 'Suggest a game based on mood',
        parameters: z.object({
          context: z.enum(['energetic', 'relaxed', 'competitive', 'creative', 'social']).optional()
            .describe('The vibe/context for the suggestion'),
        }),
        execute: async ({ context }) => {
          const suggestions: Record<string, { game: string; pitch: string }> = {
            energetic: {
              game: 'name-that-tune',
              pitch: "How about Name That Tune? Let's test your music knowledge!",
            },
            relaxed: {
              game: 'desert-island-discs',
              pitch: "Want to play Desert Island Discs? Pick 5 songs you'd bring to an island.",
            },
            competitive: {
              game: 'name-that-tune',
              pitch: "Feeling competitive? Let's do Name That Tune and see your high score!",
            },
            creative: {
              game: 'mood-dj-challenge',
              pitch: "Try Mood DJ Challenge! Describe a scenario and I'll find the perfect song.",
            },
            social: {
              game: 'this-or-that',
              pitch: "Let's play This or That! I'll play two songs, you pick your favorite.",
            },
          };

          const suggestion = suggestions[context || 'relaxed'] || suggestions.relaxed;
          return suggestion.pitch;
        },
      }),
    },
  ];
}

// ============================================================================
// DOMAIN EXPORT
// ============================================================================

const gamesTools: ToolDefinition[] = createGameToolDefinitions();

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'games',
  gamesTools
);

export { createGameToolDefinitions };

export default getToolDefinitions;

