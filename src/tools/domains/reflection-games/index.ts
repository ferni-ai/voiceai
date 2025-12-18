/**
 * Reflection Games Domain
 *
 * Fun, introspective activities that help users learn about themselves
 * through playful prompts and creative exercises.
 *
 * @module ReflectionGames
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import { getLogger } from '../../../utils/safe-logger.js';

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
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport('reflection-games', [
  startReflectionGameDef,
]);
