/**
 * Games Domain Tools
 *
 * Interactive games for engaging conversations.
 *
 * DOMAIN: games
 * TOOLS:
 *   Music Games: startGame, submitAnswer, getHint, skipRound, endGame
 *   Text Games: startTextGame, makeTextGameMove, getTextGameBoard, endTextGame
 *   Game Info: getGameStatus, getGameHistory, suggestGame
 *
 * AVAILABLE MUSIC GAMES:
 *   - Name That Tune: Play a clip, guess the song
 *   - One Word Song: Say a word, find a song with it
 *   - Desert Island Discs: Pick 5 songs for an island
 *   - This or That: Choose between two songs
 *   - Mood DJ Challenge: Describe mood, agent picks song
 *
 * AVAILABLE TEXT GAMES:
 *   - Tic-Tac-Toe: Classic 3x3 grid game
 *   - (More coming: 20 Questions, Word Association, Would You Rather)
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getSessionGameEngine } from '../../../services/games/game-engine.js';
import { getSessionTextGameEngine } from '../../../services/games/text-game-engine.js';
import type { TextGameType } from '../../../services/games/text-game-types.js';
import type { GameType } from '../../../services/games/types.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { createDomainExport } from '../../registry/loader.js';
import type { ToolContext, ToolDefinition } from '../../registry/types.js';

import { getToolDescription } from '../../utils/tool-descriptions.js';
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
    'tictactoe': 'tic-tac-toe',
    // 20 Questions variants
    '20-questions': '20-questions',
    'twentyquestions': '20-questions',
    'twenty-questions': '20-questions',
    // Word Association variants
    'word-association': 'word-association',
    'wordassociation': 'word-association',
    // Would You Rather variants
    'would-you-rather': 'would-you-rather',
    'wouldyourather': 'would-you-rather',
    // Story Builder variants
    'story-builder': 'story-builder',
    'storybuilder': 'story-builder',
    // Reflection games
    'three-word-day': 'three-word-day',
    'threewordday': 'three-word-day',
    'values-card-sort': 'values-card-sort',
    'valuescardsorc': 'values-card-sort',
    'headline-writer': 'headline-writer',
    'headlinewriter': 'headline-writer',
    'emoji-story': 'emoji-story',
    'emojistory': 'emoji-story',
    'one-word-checkin': 'one-word-checkin',
    'onewordcheckin': 'one-word-checkin',
    'tiny-win-tracker': 'tiny-win-tracker',
    'tinywintracker': 'tiny-win-tracker',
    'fortune-cookie': 'fortune-cookie',
    'fortunecookie': 'fortune-cookie',
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
async function broadcastGameStarted(
  gameType: string,
  gameData: Record<string, unknown>
): Promise<void> {
  try {
    const { getFrontendPublisher } = await import(
      '../../../agents/realtime/frontend-publisher.js'
    );
    const publisher = getFrontendPublisher();

    if (publisher.isConnected()) {
      // Normalize game type to canonical form for frontend
      const normalizedType = normalizeGameType(gameType);
      const gameId = `game-${Date.now()}`;
      const gameName = getGameDisplayName(normalizedType);

      await publisher.sendGameStarted(gameId, normalizedType, gameName);
      // Also send initial state (transformed for frontend compatibility)
      const frontendState = transformStateForFrontend(normalizedType, gameData);
      await publisher.sendGameState(normalizedType as Parameters<typeof publisher.sendGameState>[0], 'active', frontendState);

      log.debug({ gameType: normalizedType }, '🎮 Game state broadcast: started');
    }
  } catch (error) {
    log.warn({ error: String(error), gameType }, '🎮 Failed to broadcast game start');
  }
}

/**
 * Broadcast game state update to frontend
 */
async function broadcastGameState(
  gameType: string,
  status: 'active' | 'completed' | 'abandoned',
  gameData: Record<string, unknown>
): Promise<void> {
  try {
    const { getFrontendPublisher } = await import(
      '../../../agents/realtime/frontend-publisher.js'
    );
    const publisher = getFrontendPublisher();

    if (publisher.isConnected()) {
      // Normalize game type to canonical form for frontend
      const normalizedType = normalizeGameType(gameType);
      // Transform state for frontend compatibility
      const frontendState = transformStateForFrontend(normalizedType, gameData);
      await publisher.sendGameState(normalizedType as Parameters<typeof publisher.sendGameState>[0], status, frontendState);
      log.debug({ gameType: normalizedType, status }, '🎮 Game state broadcast: updated');
    }
  } catch (error) {
    log.warn({ error: String(error), gameType }, '🎮 Failed to broadcast game state');
  }
}

/**
 * Broadcast game ended event to frontend
 */
async function broadcastGameEnded(gameType: string, result?: string): Promise<void> {
  try {
    const { getFrontendPublisher } = await import(
      '../../../agents/realtime/frontend-publisher.js'
    );
    const publisher = getFrontendPublisher();

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
- "finish-the-lyric" - Complete famous song lyrics, test music knowledge
- "decade-challenge" - Guess the decade from the sound (60s, 70s, 80s, 90s, 2000s)

Use when user says things like:
- "Let's play a game"
- "Play name that tune"
- "Let's do desert island discs"
- "Finish the lyric"
- "Guess the decade"
- "Can we play a music game?"`,
      domain: 'games',
      tags: ['games', 'music', 'interactive', 'fun'],
      create: (ctx: ToolContext) =>
        llm.tool({
          description: getToolDescription('startGame'),
          parameters: z.object({
            gameType: z
              .enum([
                'name-that-tune',
                'one-word-song',
                'desert-island-discs',
                'this-or-that',
                'mood-dj-challenge',
                'finish-the-lyric',
                'decade-challenge',
              ])
              .describe('Which game to play'),
            rounds: z.number().optional().describe('Number of rounds (default varies by game)'),
          }),
          execute: async ({ gameType, rounds }) => {
            try {
              const personaId = ctx.agentId || 'ferni';
              const sessionId = ctx.sessionId || `fallback-${personaId}-${Date.now()}`;
              const gameEngine = getSessionGameEngine(sessionId, personaId);

              const config = rounds ? { rounds } : undefined;
              const welcomeMessage = await gameEngine.startGame(
                gameType as GameType,
                config as Record<string, unknown>
              );

              // Broadcast game started to frontend
              const state = gameEngine.getState();
              await broadcastGameStarted(gameType, { ...state.gameData } as Record<string, unknown>);

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
      create: (ctx: ToolContext) =>
        llm.tool({
          description: getToolDescription('submitGameAnswer'),
          parameters: z.object({
            answer: z.string().describe("The user's answer, choice, or input"),
          }),
          execute: async ({ answer }) => {
            const personaId = ctx.agentId || 'ferni';
            const sessionId = ctx.sessionId || `fallback-${personaId}-${Date.now()}`;
            const gameEngine = getSessionGameEngine(sessionId, personaId);

            if (!gameEngine.isGameActive()) {
              return "We're not playing a game right now. Want to start one?";
            }

            try {
              const result = await gameEngine.submitAnswer(answer);
              const state = gameEngine.getState();
              const gameType = state.gameType || 'unknown';

              // Broadcast state update to frontend
              const status = result.gameOver ? 'completed' : 'active';
              await broadcastGameState(gameType, status, { ...state.gameData } as Record<string, unknown>);

              let response = result.feedback;

              if (result.gameOver) {
                response += `\n\n🏆 Game Over! Final score: ${result.finalScore} points!`;

                if (result.finalScore && result.finalScore >= state.highScore) {
                  response += `\n🎉 That's a new high score!`;
                }

                // Broadcast game ended
                const resultSummary = `Final score: ${result.finalScore} points`;
                await broadcastGameEnded(gameType, resultSummary);
              }

              return response;
            } catch (error) {
              log.error({ error }, '🎮 Failed to submit answer');
              return 'Something went wrong. Try your answer again?';
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
      create: (ctx: ToolContext) =>
        llm.tool({
          description: getToolDescription('getGameHint'),
          parameters: z.object({}),
          execute: async () => {
            const personaId = ctx.agentId || 'ferni';
            const sessionId = ctx.sessionId || `fallback-${personaId}-${Date.now()}`;
            const gameEngine = getSessionGameEngine(sessionId, personaId);

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
      create: (ctx: ToolContext) =>
        llm.tool({
          description: getToolDescription('skipGameRound'),
          parameters: z.object({}),
          execute: async () => {
            const personaId = ctx.agentId || 'ferni';
            const sessionId = ctx.sessionId || `fallback-${personaId}-${Date.now()}`;
            const gameEngine = getSessionGameEngine(sessionId, personaId);

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
      create: (ctx: ToolContext) =>
        llm.tool({
          description: getToolDescription('endGame'),
          parameters: z.object({}),
          execute: async () => {
            const personaId = ctx.agentId || 'ferni';
            const sessionId = ctx.sessionId || `fallback-${personaId}-${Date.now()}`;
            const gameEngine = getSessionGameEngine(sessionId, personaId);

            if (!gameEngine.isGameActive()) {
              return "We're not playing a game right now!";
            }

            // Get gameType before ending (endGame clears state)
            const state = gameEngine.getState();
            const gameType = state.gameType || 'unknown';

            const session = gameEngine.endGame();

            // Broadcast game ended to frontend
            await broadcastGameEnded(gameType, 'Game quit by user');

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
      create: (ctx: ToolContext) =>
        llm.tool({
          description: getToolDescription('getGameStatus'),
          parameters: z.object({}),
          execute: async () => {
            const personaId = ctx.agentId || 'ferni';
            const sessionId = ctx.sessionId || `fallback-${personaId}-${Date.now()}`;
            const gameEngine = getSessionGameEngine(sessionId, personaId);
            const state = gameEngine.getState();

            if (state.status === 'idle') {
              return "We're not playing a game right now. Want to start one?";
            }

            return (
              `🎮 Current Game: ${state.gameType}\n` +
              `📊 Score: ${state.score} points\n` +
              `🔄 Round: ${state.currentRound} of ${state.totalRounds}\n` +
              `🏆 High Score: ${state.highScore}`
            );
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
      create: (ctx: ToolContext) =>
        llm.tool({
          description: getToolDescription('getGameHistory'),
          parameters: z.object({}),
          execute: async () => {
            const personaId = ctx.agentId || 'ferni';
            const sessionId = ctx.sessionId || `fallback-${personaId}-${Date.now()}`;
            const gameEngine = getSessionGameEngine(sessionId, personaId);
            const history = gameEngine.getHistory();

            if (history.sessionGames.length === 0) {
              return "You haven't played any games this session! Want to start one?";
            }

            const sessionSummary = history.sessionGames
              .map((g) => `• ${g.gameType}: ${g.score} points`)
              .join('\n');

            return (
              `🎮 Games This Session:\n${sessionSummary}\n\n` +
              `Total games: ${history.sessionGames.length}`
            );
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
      create: (_ctx: ToolContext) =>
        llm.tool({
          description: getToolDescription('suggestGame'),
          parameters: z.object({
            context: z
              .enum(['energetic', 'relaxed', 'competitive', 'creative', 'social'])
              .optional()
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
                game: 'tic-tac-toe',
                pitch: "Feeling competitive? Let's play tic-tac-toe! I'm pretty good.",
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

    // ========================================
    // TEXT GAMES (Tic-Tac-Toe, etc.)
    // ========================================
    {
      id: 'startTextGame',
      name: 'Start Text Game',
      description: `Start a text-based game with the user!

Available text games:
- "tic-tac-toe" - Classic 3x3 grid game. User says positions like "center", "top left", or numbers 1-9.
- "20-questions" - User thinks of something, you have 20 yes/no questions to guess it.
- "word-association" - Quick word chains, say the first word that comes to mind.
- "would-you-rather" - Fun dilemmas, pick between two hypothetical scenarios.
- "story-builder" - Create a story together, one sentence at a time.

Use when user says things like:
- "Let's play tic tac toe"
- "Play 20 questions with me"
- "Word association game"
- "Would you rather"
- "Let's build a story together"
- "I want to play something"`,
      domain: 'games',
      tags: [
        'games',
        'text-games',
        'tic-tac-toe',
        '20-questions',
        'word-association',
        'would-you-rather',
        'story-builder',
        'interactive',
        'fun',
      ],
      create: (ctx: ToolContext) =>
        llm.tool({
          description: getToolDescription('startTextGame'),
          parameters: z.object({
            gameType: z
              .enum([
                'tic-tac-toe',
                '20-questions',
                'word-association',
                'would-you-rather',
                'story-builder',
                'three-word-day',
                'headline-writer',
                'emoji-story',
                'values-card-sort',
                'one-word-checkin',
                'tiny-win-tracker',
                'fortune-cookie',
              ])
              .describe('Which text game to play'),
            userGoesFirst: z
              .boolean()
              .optional()
              .describe('Whether user goes first (default: true)'),
            difficulty: z
              .enum(['easy', 'medium', 'hard'])
              .optional()
              .describe('AI difficulty level (default: medium)'),
          }),
          execute: async ({ gameType, userGoesFirst, difficulty }) => {
            try {
              const personaId = ctx.agentId || 'ferni';
              const sessionId = ctx.sessionId || `fallback-${personaId}-${Date.now()}`;
              const textGameEngine = getSessionTextGameEngine(sessionId, personaId);

              const config: Record<string, unknown> = {};
              if (userGoesFirst !== undefined) config.userGoesFirst = userGoesFirst;
              if (difficulty) config.difficulty = difficulty;

              const result = await textGameEngine.startGame(gameType as TextGameType, config);

              log.info({ gameType, personaId }, '🎲 Text game started');

              // Broadcast game started to frontend for visual board
              const state = textGameEngine.getState();
              await broadcastGameStarted(gameType, { ...state.gameData } as Record<string, unknown>);

              return result.message;
            } catch (error) {
              log.error({ error, gameType }, '🎲 Failed to start text game');
              return `I couldn't start that game right now. Want to try something else?`;
            }
          },
        }),
    },

    {
      id: 'makeTextGameMove',
      name: 'Make Text Game Move',
      description: `Submit the user's move in a text game like tic-tac-toe.

For tic-tac-toe, the user can say:
- Numbers 1-9 (top-left to bottom-right)
- Positions like "center", "top left", "bottom right", "middle"
- Descriptions like "the middle one", "upper right corner"

Use when:
- User says a position during tic-tac-toe
- User makes any move in an active text game`,
      domain: 'games',
      tags: ['games', 'text-games', 'move', 'interactive'],
      create: (ctx: ToolContext) =>
        llm.tool({
          description: getToolDescription('makeTextGameMove'),
          parameters: z.object({
            move: z.string().describe("The user's move (e.g., 'center', 'top left', '5')"),
          }),
          execute: async ({ move }) => {
            const personaId = ctx.agentId || 'ferni';
            const sessionId = ctx.sessionId || `fallback-${personaId}-${Date.now()}`;
            const textGameEngine = getSessionTextGameEngine(sessionId, personaId);

            if (!textGameEngine.isGameActive()) {
              return "We're not playing a game right now. Want to play tic-tac-toe?";
            }

            try {
              const result = await textGameEngine.makeMove(move);

              // Broadcast updated game state to frontend
              const state = textGameEngine.getState();
              const gameType = state.gameType || 'unknown';
              const status = result.gameOver ? 'completed' : 'active';
              await broadcastGameState(gameType, status, { ...state.gameData } as Record<string, unknown>);

              // If game ended, also send game ended event with result
              if (result.gameOver) {
                const resultSummary = result.winner
                  ? `Winner: ${result.winner}`
                  : 'Game complete';
                await broadcastGameEnded(gameType, resultSummary);
              }

              return result.message;
            } catch (error) {
              log.error({ error }, '🎲 Failed to make text game move');
              return 'Something went wrong. Try your move again?';
            }
          },
        }),
    },

    {
      id: 'getTextGameBoard',
      name: 'Get Text Game Board',
      description: `Describe the current state of a text game board.
Use when user asks "what does the board look like?", "where are the pieces?", "show me the board"`,
      domain: 'games',
      tags: ['games', 'text-games', 'status', 'board'],
      create: (ctx: ToolContext) =>
        llm.tool({
          description: getToolDescription('getTextGameBoard'),
          parameters: z.object({}),
          execute: async () => {
            const personaId = ctx.agentId || 'ferni';
            const sessionId = ctx.sessionId || `fallback-${personaId}-${Date.now()}`;
            const textGameEngine = getSessionTextGameEngine(sessionId, personaId);

            if (!textGameEngine.isGameActive()) {
              return "We're not playing a game right now. Want to start one?";
            }

            return textGameEngine.describeState();
          },
        }),
    },

    {
      id: 'endTextGame',
      name: 'End Text Game',
      description: `End the current text game early.
Use when user says "stop", "quit", "I give up", "end game", or wants to do something else.`,
      domain: 'games',
      tags: ['games', 'text-games', 'end', 'quit'],
      create: (ctx: ToolContext) =>
        llm.tool({
          description: getToolDescription('endTextGame'),
          parameters: z.object({}),
          execute: async () => {
            const personaId = ctx.agentId || 'ferni';
            const sessionId = ctx.sessionId || `fallback-${personaId}-${Date.now()}`;
            const textGameEngine = getSessionTextGameEngine(sessionId, personaId);

            if (!textGameEngine.isGameActive()) {
              return "We're not playing a text game right now!";
            }

            // Get game type before ending
            const state = textGameEngine.getState();
            const gameType = state.gameType || 'unknown';

            textGameEngine.endGame();

            // Broadcast game ended to frontend
            await broadcastGameEnded(gameType, 'Game quit by user');

            return 'Okay, game ended! Want to play again or do something else?';
          },
        }),
    },
  ];
}

// ============================================================================
// DOMAIN EXPORT
// ============================================================================

const gamesTools: ToolDefinition[] = createGameToolDefinitions();

export const { getToolDefinitions, domain, definitions } = createDomainExport('games', gamesTools);

export { createGameToolDefinitions };

export default getToolDefinitions;
