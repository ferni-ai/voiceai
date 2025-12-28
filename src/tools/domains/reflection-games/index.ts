/**
 * Reflection Games Domain
 *
 * Fun, introspective activities that help users learn about themselves
 * through playful prompts and creative exercises.
 *
 * Games include:
 * - Three Word Day: Describe your day/mood in 3 words
 * - Values Card Sort: Discover your core values through card sorting
 * - Headline Writer: Write newspaper headlines about your life
 * - Plus legacy reflection games (two truths, rose thorn bud, etc.)
 *
 * @module ReflectionGames
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import { getLogger } from '../../../utils/safe-logger.js';

// Game implementations
import * as ThreeWordDay from '../../../services/games/three-word-day.js';
import * as ValuesCardSort from '../../../services/games/values-card-sort.js';
import * as HeadlineWriter from '../../../services/games/headline-writer.js';

// ============================================================================
// GAME STATE STORAGE (per-session)
// ============================================================================

const threeWordDayStates = new Map<string, ThreeWordDay.ThreeWordDayState>();
const valuesCardSortStates = new Map<string, ValuesCardSort.ValuesCardSortState>();
const headlineWriterStates = new Map<string, HeadlineWriter.HeadlineWriterState>();

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

const startReflectionGameDef: ToolDefinition = {
  id: 'startReflectionGame',
  name: 'Start Reflection Game',
  description: 'Start a fun, introspective game to help users learn about themselves',
  domain: 'reflection-games',
  tags: ['play', 'reflection', 'games', 'self-discovery'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('startReflectionGame'),
      parameters: z.object({
        game: z
          .enum([
            'two_truths_dream',
            'values_auction',
            'rose_thorn_bud',
            'gratitude_chain',
            'life_bingo',
            'finish_sentence',
            'would_you_rather',
          ])
          .describe('The reflection game to start'),
        topic: z.string().optional().describe('Optional topic or theme to focus the game'),
      }),
      execute: async ({ game, topic }) => {
        getLogger().info({ agentId: ctx.agentId, game, topic }, 'Starting reflection game');

        const gameDescriptions: Record<string, string> = {
          two_truths_dream:
            "Let's play Two Truths and a Dream! Tell me two things that have actually happened in your life, and one thing you dream of doing. I'll try to guess which is the dream!",
          values_auction:
            'Imagine you have $100 to bid on different life values - things like adventure, security, creativity, connection, achievement. What would you spend the most on?',
          rose_thorn_bud:
            "Let's do a Rose, Thorn, Bud reflection. Share something positive (rose), something challenging (thorn), and something you're looking forward to (bud).",
          gratitude_chain:
            "Let's build a gratitude chain! I'll start with something I appreciate, then you add something that connects to it. We'll see where the chain takes us.",
          life_bingo:
            "Let's play Life Bingo! I'll share some experiences and you tell me if you've done them. We'll celebrate the ones you have and maybe set intentions for new ones!",
          finish_sentence:
            "I'll give you the start of a sentence, and you finish it with whatever comes to mind. Ready?",
          would_you_rather:
            "Let's play Would You Rather with some deeper questions that might reveal what matters to you!",
        };

        const prompt = topic
          ? `${gameDescriptions[game]} Let's focus on ${topic}.`
          : gameDescriptions[game];

        return {
          success: true,
          game,
          prompt,
          instructions: 'Start the game with the user in a warm, playful way.',
        };
      },
    });
  },
};

// ============================================================================
// THREE WORD DAY
// ============================================================================

const threeWordDayDef: ToolDefinition = {
  id: 'threeWordDay',
  name: 'Three Word Day',
  description: 'Start a Three Word Day game - user describes their day/mood in exactly 3 words',
  domain: 'reflection-games',
  tags: ['play', 'reflection', 'games', 'self-discovery', 'daily', 'check-in', 'mood'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Start a Three Word Day reflection game. User describes their day, mood, or experience in exactly 3 words, then we explore what each word means. Great for daily check-ins and emotional awareness.',
      parameters: z.object({
        promptType: z
          .enum(['day', 'mood', 'week', 'moment', 'year', 'custom'])
          .optional()
          .describe('Type of prompt: day, mood, week, moment, year, or custom'),
        customPrompt: z.string().optional().describe('Custom prompt if promptType is custom'),
      }),
      execute: async ({ promptType = 'day', customPrompt }) => {
        const log = getLogger();
        log.info({ agentId: ctx.agentId, promptType }, 'Starting Three Word Day game');

        // Initialize game state
        const state = ThreeWordDay.createInitialState(promptType, customPrompt);
        threeWordDayStates.set(ctx.userId, state);

        const result = ThreeWordDay.getStartResult(state);

        return {
          success: true,
          game: 'three-word-day',
          message: result.message,
          instructions: 'Wait for the user to provide exactly three words, then explore each one with curiosity.',
        };
      },
    });
  },
};

const threeWordDayRespondDef: ToolDefinition = {
  id: 'threeWordDayRespond',
  name: 'Three Word Day Response',
  description: 'Process user input during a Three Word Day game',
  domain: 'reflection-games',
  tags: ['play', 'reflection', 'games'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Process user input during an active Three Word Day game session.',
      parameters: z.object({
        userInput: z.string().describe("The user's input/response"),
      }),
      execute: async ({ userInput }) => {
        const log = getLogger();
        const state = threeWordDayStates.get(ctx.userId);

        if (!state) {
          return {
            success: false,
            error: 'No active Three Word Day game. Start one first.',
          };
        }

        const result = ThreeWordDay.processInput(state, userInput);
        threeWordDayStates.set(ctx.userId, result.newState);

        log.info({ agentId: ctx.agentId, gameOver: result.gameOver }, 'Three Word Day turn processed');

        if (result.gameOver) {
          threeWordDayStates.delete(ctx.userId);
        }

        return {
          success: true,
          message: result.message,
          gameOver: result.gameOver,
          words: result.newState.words,
        };
      },
    });
  },
};

// ============================================================================
// VALUES CARD SORT
// ============================================================================

const valuesCardSortDef: ToolDefinition = {
  id: 'valuesCardSort',
  name: 'Values Card Sort',
  description: 'Start a Values Card Sort game - discover your core values through card sorting',
  domain: 'reflection-games',
  tags: ['play', 'reflection', 'games', 'self-discovery', 'values', 'coaching'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Start a Values Card Sort game. User sorts through 30 value cards to discover their top 5 core values. Based on ACT (Acceptance and Commitment Therapy) values clarification. Great for decision-making clarity and life direction.',
      parameters: z.object({}),
      execute: async () => {
        const log = getLogger();
        log.info({ agentId: ctx.agentId }, 'Starting Values Card Sort game');

        // Initialize game state
        const state = ValuesCardSort.createInitialState();
        valuesCardSortStates.set(ctx.userId, state);

        const result = ValuesCardSort.getStartResult(state);

        return {
          success: true,
          game: 'values-card-sort',
          message: result.message,
          instructions: 'Guide the user through sorting value cards. Keep it flowing naturally.',
        };
      },
    });
  },
};

const valuesCardSortRespondDef: ToolDefinition = {
  id: 'valuesCardSortRespond',
  name: 'Values Card Sort Response',
  description: 'Process user input during a Values Card Sort game',
  domain: 'reflection-games',
  tags: ['play', 'reflection', 'games'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Process user input during an active Values Card Sort game session.',
      parameters: z.object({
        userInput: z.string().describe("The user's input/response"),
      }),
      execute: async ({ userInput }) => {
        const log = getLogger();
        const state = valuesCardSortStates.get(ctx.userId);

        if (!state) {
          return {
            success: false,
            error: 'No active Values Card Sort game. Start one first.',
          };
        }

        const result = ValuesCardSort.processInput(state, userInput);
        valuesCardSortStates.set(ctx.userId, result.newState);

        log.info({ agentId: ctx.agentId, phase: result.newState.phase, gameOver: result.gameOver }, 'Values Card Sort turn processed');

        if (result.gameOver) {
          // Get final values before deleting state
          const topFive = ValuesCardSort.getTopFiveValues(result.newState);
          valuesCardSortStates.delete(ctx.userId);

          return {
            success: true,
            message: result.message,
            gameOver: true,
            topFiveValues: topFive.map(v => ({ name: v.name, description: v.description })),
          };
        }

        return {
          success: true,
          message: result.message,
          gameOver: result.gameOver,
          phase: result.newState.phase,
        };
      },
    });
  },
};

// ============================================================================
// HEADLINE WRITER
// ============================================================================

const headlineWriterDef: ToolDefinition = {
  id: 'headlineWriter',
  name: 'Headline Writer',
  description: 'Start a Headline Writer game - write newspaper headlines about your life',
  domain: 'reflection-games',
  tags: ['play', 'reflection', 'games', 'self-discovery', 'creative', 'perspective'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Start a Headline Writer game. User writes newspaper headlines about their life - past, present, or future. Based on narrative therapy techniques. Great for perspective-taking, life review, and goal visualization.',
      parameters: z.object({
        timeframe: z
          .enum(['today', 'this_week', 'this_month', 'this_year', 'past', 'future', 'dream'])
          .optional()
          .describe('Timeframe for the headline: today, this_week, this_month, this_year, past, future, or dream'),
        tone: z
          .enum(['triumphant', 'honest', 'humorous', 'hopeful', 'any'])
          .optional()
          .describe('Suggested tone for the headline'),
      }),
      execute: async ({ timeframe, tone }) => {
        const log = getLogger();
        log.info({ agentId: ctx.agentId, timeframe, tone }, 'Starting Headline Writer game');

        // Initialize game state
        const state = HeadlineWriter.createInitialState(timeframe, tone);
        headlineWriterStates.set(ctx.userId, state);

        const result = HeadlineWriter.getStartResult(state);

        return {
          success: true,
          game: 'headline-writer',
          message: result.message,
          instructions: 'Encourage creative headlines. Ask follow-up questions about what the headline reveals.',
        };
      },
    });
  },
};

const headlineWriterRespondDef: ToolDefinition = {
  id: 'headlineWriterRespond',
  name: 'Headline Writer Response',
  description: 'Process user input during a Headline Writer game',
  domain: 'reflection-games',
  tags: ['play', 'reflection', 'games'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Process user input during an active Headline Writer game session.',
      parameters: z.object({
        userInput: z.string().describe("The user's input/response"),
      }),
      execute: async ({ userInput }) => {
        const log = getLogger();
        const state = headlineWriterStates.get(ctx.userId);

        if (!state) {
          return {
            success: false,
            error: 'No active Headline Writer game. Start one first.',
          };
        }

        const result = HeadlineWriter.processInput(state, userInput);
        headlineWriterStates.set(ctx.userId, result.newState);

        log.info({ agentId: ctx.agentId, phase: result.newState.phase, gameOver: result.gameOver }, 'Headline Writer turn processed');

        if (result.gameOver) {
          // Get headlines before deleting state
          const headlines = HeadlineWriter.getSessionHeadlines(result.newState);
          headlineWriterStates.delete(ctx.userId);

          return {
            success: true,
            message: result.message,
            gameOver: true,
            headlines: headlines.map(h => ({
              text: h.text,
              timeframe: h.timeframe,
              subheadline: h.subheadline,
            })),
          };
        }

        return {
          success: true,
          message: result.message,
          gameOver: result.gameOver,
          phase: result.newState.phase,
        };
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport('reflection-games', [
  startReflectionGameDef,
  threeWordDayDef,
  threeWordDayRespondDef,
  valuesCardSortDef,
  valuesCardSortRespondDef,
  headlineWriterDef,
  headlineWriterRespondDef,
]);
