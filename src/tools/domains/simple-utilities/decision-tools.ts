/**
 * Decision Helper Utilities
 *
 * Random choices, coin flips, dice rolls, decision assistance.
 *
 * @module simple-utilities/decision-tools
 */

import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';
import { recordUsage, generateInsight } from './pattern-intelligence.js';

const flipCoinDef: ToolDefinition = {
  id: 'flipCoin',
  name: 'Flip Coin',
  description: 'Flip a coin for a random heads/tails',
  domain: 'simple-utilities',
  tags: ['random', 'coin', 'decision', 'chance'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Flip a coin for a random result. Use when someone asks:
- "Flip a coin"
- "Heads or tails?"
- "Coin toss"`,
      parameters: z.object({
        headsOption: z.string().optional().describe('What heads means'),
        tailsOption: z.string().optional().describe('What tails means'),
      }),
      execute: async ({ headsOption, tailsOption }, { ctx: toolCtx }) => {
        const userData = toolCtx.userData as { userId?: string };
        const userId = userData?.userId || 'session';

        // Record usage for pattern learning
        recordUsage(userId, 'flipCoin', { headsOption, tailsOption });

        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        const emoji = '🪙';

        let response: string;
        if (headsOption && tailsOption) {
          const choice = result === 'heads' ? headsOption : tailsOption;
          response = `${emoji} **${result.toUpperCase()}!**\n\nThat means: **${choice}**`;
        } else {
          response = `${emoji} **${result.toUpperCase()}!**`;
        }

        // Apply pattern intelligence - notice decision-making patterns
        const insight = generateInsight(userId, 'flipCoin', { headsOption, tailsOption }, response);
        if (insight.followUp) {
          response += `\n\n${insight.followUp}`;
        }

        return response;
      },
    });
  },
};

const rollDiceDef: ToolDefinition = {
  id: 'rollDice',
  name: 'Roll Dice',
  description: 'Roll dice for random numbers',
  domain: 'simple-utilities',
  tags: ['random', 'dice', 'game', 'number'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Roll dice for random numbers. Use when someone asks:
- "Roll a dice"
- "Roll 2d6" (D&D notation)
- "Give me a random number 1-20"`,
      parameters: z.object({
        numberOfDice: z.number().default(1).describe('How many dice to roll'),
        sides: z.number().default(6).describe('Number of sides (default 6)'),
      }),
      execute: async ({ numberOfDice, sides }) => {
        const rolls: number[] = [];
        for (let i = 0; i < numberOfDice; i++) {
          rolls.push(Math.floor(Math.random() * sides) + 1);
        }

        const total = rolls.reduce((a, b) => a + b, 0);

        if (numberOfDice === 1) {
          const diceEmoji = sides === 6 ? ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][rolls[0] - 1] : '🎲';
          return `${diceEmoji} **${rolls[0]}**`;
        }

        return `🎲 Rolled ${numberOfDice}d${sides}: [${rolls.join(', ')}]\n**Total: ${total}**`;
      },
    });
  },
};

const pickRandomDef: ToolDefinition = {
  id: 'pickRandom',
  name: 'Pick Random',
  description: 'Pick randomly from a list of options',
  domain: 'simple-utilities',
  tags: ['random', 'pick', 'choice', 'decision'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Pick randomly from options. Use when someone asks:
- "Pick a number between 1 and 10"
- "Choose between pizza, tacos, or sushi"
- "Random selection from these options"`,
      parameters: z.object({
        options: z.array(z.string()).optional().describe('List of options to pick from'),
        min: z.number().optional().describe('Minimum number (for number range)'),
        max: z.number().optional().describe('Maximum number (for number range)'),
      }),
      execute: async ({ options, min, max }) => {
        if (options && options.length > 0) {
          const pick = options[Math.floor(Math.random() * options.length)];
          return `🎯 **${pick}**\n\n(picked from: ${options.join(', ')})`;
        }

        if (min !== undefined && max !== undefined) {
          const number = Math.floor(Math.random() * (max - min + 1)) + min;
          return `🎯 **${number}** (between ${min} and ${max})`;
        }

        return 'Give me some options to pick from, or a number range!';
      },
    });
  },
};

const helpMeDecideDef: ToolDefinition = {
  id: 'helpMeDecide',
  name: 'Help Me Decide',
  description: 'Help make a decision with weighted pros/cons',
  domain: 'simple-utilities',
  tags: ['decision', 'choice', 'help', 'thinking'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Help with decisions beyond random chance. Use when someone needs to think through a choice:
- "Help me decide between A and B"
- "Should I go with option 1 or 2?"`,
      parameters: z.object({
        options: z.array(z.string()).min(2).describe('The options to choose between'),
        context: z.string().optional().describe('Any context about the decision'),
      }),
      execute: async ({ options, context }) => {
        // For simple 50/50, add some thoughtful randomness
        if (options.length === 2) {
          const random = Math.random();

          // 60% chance of giving a clear recommendation
          // 40% chance of reflecting it back
          if (random < 0.6) {
            const pick = options[Math.floor(Math.random() * 2)];
            return (
              `My gut says: **${pick}**\n\n` +
              `But here's a thought: which one made you feel something when I said it? That reaction tells you something.${
                context ? `\n\nConsidering ${context}, lean into that feeling.` : ''
              }`
            );
          } else {
            return (
              `Both sound valid! Quick exercise:\n\n` +
              `• Imagine you picked **${options[0]}**. How does that feel?\n` +
              `• Now imagine **${options[1]}**. Better or worse?\n\n` +
              `Your gut reaction often knows. What came up?`
            );
          }
        }

        // For more options, pick one but invite reflection
        const pick = options[Math.floor(Math.random() * options.length)];
        return (
          `From these options, I'd try **${pick}** first.\n\n` +
          `But if that doesn't feel right, which one did you secretly hope I'd pick? That's your answer.`
        );
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const decisionToolDefinitions: ToolDefinition[] = [
  flipCoinDef,
  rollDiceDef,
  pickRandomDef,
  helpMeDecideDef,
];

export { flipCoinDef, rollDiceDef, pickRandomDef, helpMeDecideDef };
