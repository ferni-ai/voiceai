/**
 * Wisdom Engagement Games
 *
 * Tools for philosophical contemplation and depth exploration (Nayan's games).
 * - Paradox of the Day: Daily paradox for contemplation
 * - The Question Beneath: 5 Whys exploration game
 *
 * @module engagement/wisdom-games
 */

import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';

// ============================================================================
// PARADOX OF THE DAY
// ============================================================================

export const paradoxOfTheDayDef: ToolDefinition = {
  id: 'paradoxOfTheDay',
  name: 'Paradox of the Day',
  description: "Nayan's daily paradox for contemplation",
  domain: 'engagement',
  tags: ['engagement', 'nayan', 'wisdom', 'contemplation'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Get today's paradox from Nayan. User can respond or just sit with it.
Paradoxes stretch the mind and create openings for insight.`,
      parameters: z.object({
        action: z.enum(['get-paradox', 'reflect', 'request-new']).describe('Action'),
        reflection: z.string().optional().describe('User reflection on the paradox'),
      }),
      execute: async ({ action, reflection }) => {
        const paradoxes = [
          'The more you try to control, the less control you have.',
          'To find yourself, you must lose yourself.',
          'The only constant is change.',
          'You must be willing to fail completely to succeed completely.',
          'The quieter you become, the more you can hear.',
          'When you let go, you get more than you gave up.',
          'The obstacle is the way.',
          'You cannot step in the same river twice.',
          'To teach is to learn twice.',
          "The more you know, the more you know you don't know.",
          'Happiness can only exist in acceptance.',
          'The wound is where the light enters.',
          'What you resist, persists.',
          'Less is more.',
          'In the middle of difficulty lies opportunity.',
        ];

        const dayOfYear = Math.floor(
          (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24)
        );
        const todaysParadox = paradoxes[dayOfYear % paradoxes.length];

        if (action === 'get-paradox') {
          return {
            paradox: todaysParadox,
            response:
              `Today's paradox: <break time=\"500ms\"/>\n\n` +
              `"${todaysParadox}"\n\n` +
              `<break time=\"300ms\"/>Sit with this. <break time=\"200ms\"/>` +
              `Let it work on you. <break time=\"300ms\"/>` +
              `You don't have to solve it. <break time=\"200ms\"/>Just hold it.`,
          };
        }

        if (action === 'reflect' && reflection) {
          return {
            response:
              `Your reflection: "${reflection}"\n\n` +
              `<break time=\"300ms\"/>Good. <break time=\"200ms\"/>` +
              `The paradox is doing its work. <break time=\"300ms\"/>` +
              `Truth often lives in contradiction. <break time=\"200ms\"/>` +
              `Your mind is stretching.`,
            paradox: todaysParadox,
            reflection,
          };
        }

        return { error: 'Invalid action' };
      },
    });
  },
};

// ============================================================================
// THE QUESTION BENEATH
// ============================================================================

export const questionBeneathDef: ToolDefinition = {
  id: 'questionBeneath',
  name: 'The Question Beneath',
  description: "Nayan's 5 Whys exploration game",
  domain: 'engagement',
  tags: ['engagement', 'nayan', 'depth', 'exploration'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: `When user shares a problem or question, Nayan plays "5 Whys" to find the real question beneath.`,
      parameters: z.object({
        surfaceQuestion: z.string().describe('The initial question or problem'),
        depth: z.number().min(1).max(5).describe('Current depth (1-5)'),
        response: z.string().optional().describe('User response to why question'),
      }),
      execute: async ({ surfaceQuestion, depth, response }) => {
        const prompts = [
          'Why does that matter to you?',
          'And why is that important?',
          'What is beneath that?',
          'And under that?',
          'What is the question you are really asking?',
        ];

        if (depth === 1) {
          return {
            response:
              `You're asking about: "${surfaceQuestion}"\n\n` +
              `<break time=\"300ms\"/>But I'm curious about the question beneath the question. ` +
              `<break time=\"200ms\"/>${prompts[0]}`,
            currentDepth: 1,
            prompt: prompts[0],
          };
        }

        if (depth < 5 && response) {
          return {
            response: `"${response}"\n\n<break time=\"300ms\"/>${prompts[depth]}`,
            currentDepth: depth + 1,
            prompt: prompts[depth],
          };
        }

        if (depth === 5 && response) {
          return {
            response:
              `"${response}"\n\n<break time=\"500ms\"/>` +
              `There it is. <break time=\"300ms\"/>` +
              `The real question. <break time=\"400ms\"/>\n\n` +
              `You started asking about ${surfaceQuestion}. <break time=\"200ms\"/>` +
              `But the question beneath was: "${response}"\n\n` +
              `Now. <break time=\"300ms\"/>What will you do with this clarity?`,
            realQuestion: response,
            surfaceQuestion,
            complete: true,
          };
        }

        return { error: 'Invalid depth or missing response' };
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const wisdomGameDefinitions: ToolDefinition[] = [
  paradoxOfTheDayDef,
  questionBeneathDef,
];
