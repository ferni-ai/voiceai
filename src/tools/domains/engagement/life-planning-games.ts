/**
 * Life Planning Engagement Games
 *
 * Tools for future visioning and life review (Jordan's games).
 * - Future Self Letter: Time capsule messages
 * - Life Portfolio Review: Quarterly life domains check-in
 * - Prediction Market: Self-prediction accuracy game
 *
 * @module engagement/life-planning-games
 */

import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { generateDomainInsight } from './helpers.js';

import { getToolDescription } from '../../utils/tool-descriptions.js';
import {
  deliverDueLetter,
  pendingLetterDates,
  sealFutureLetter,
  spokenDate,
} from './future-letters.js';

const DELIVERY_DAYS: Record<string, number> = {
  '1-month': 30,
  '3-months': 90,
  '6-months': 180,
  '1-year': 365,
};
// ============================================================================
// FUTURE SELF LETTER
// ============================================================================

export const futureSelfLetterDef: ToolDefinition = {
  id: 'futureSelfLetter',
  name: 'Future Self Letter',
  description: 'Write a letter to your future self that Jordan delivers later',
  domain: 'engagement',
  tags: ['engagement', 'jordan', 'time-capsule', 'reflection'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('futureSelfLetter'),
      parameters: z.object({
        action: z.enum(['write', 'seal', 'check-pending', 'deliver']).describe('Action'),
        content: z.string().optional().describe('Letter content'),
        deliveryDate: z
          .string()
          .optional()
          .describe('When to deliver (1-month, 3-months, 6-months, 1-year)'),
      }),
      execute: async ({ action, content, deliveryDate }) => {
        if (action === 'write') {
          return {
            response:
              `Let's write a letter to future you. <break time=\"300ms\"/>` +
              `Think about who you want to be when this letter arrives.\n\n` +
              `Some prompts:\n` +
              `- What do you hope will be different?\n` +
              `- What are you working on that you want future-you to remember?\n` +
              `- What do you want to tell yourself when you're there?\n\n` +
              `Take your time. This is between present-you and future-you.`,
            instruction: 'Collect the letter content from user',
          };
        }

        const caller = { userId: ctx.userId, sessionId: ctx.sessionId };

        if (action === 'seal' && content && deliveryDate) {
          const days = DELIVERY_DAYS[deliveryDate] ?? 30;
          const deliverAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
          const on = spokenDate(deliverAt.toISOString());
          const sealed = await sealFutureLetter(caller, content, deliverAt);
          if (!sealed.kept) {
            // Nothing was kept, so nothing is promised.
            return {
              response:
                `I can't keep letters for you on this call, so I won't promise to hold it. ` +
                `<break time=\"300ms\"/>If you want it later, save it somewhere you'll see on ${on}.`,
              sealed: false,
            };
          }
          return {
            response:
              `Letter sealed. <break time=\"500ms\"/>` +
              `I'll keep it until ${on}. <break time=\"200ms\"/>` +
              `From then on, ask me for it and I'll read it back to you. <break time=\"200ms\"/>` +
              `It'll be like hearing from a friend you haven't talked to in a while: yourself.`,
            sealed: true,
            deliveryDate: deliverAt.toISOString(),
          };
        }

        if (action === 'check-pending') {
          const dates = await pendingLetterDates(caller);
          if (dates === null) return { response: `I can't look at your letters on this call.` };
          if (dates.length === 0) return { response: `There are no letters waiting for you.` };
          const list = dates.map((d) => spokenDate(d)).join(', ');
          return { response: `You have ${dates.length} letter(s) waiting: ${list}.` };
        }

        if (action === 'deliver') {
          const letter = await deliverDueLetter(caller);
          if (!letter) {
            return {
              response: `There's no letter from past-you ready to open yet.`,
              hasLetter: false,
            };
          }
          return {
            response:
              `A letter has arrived from past-you, written on ${spokenDate(letter.writtenAt)}. ` +
              `<break time=\"500ms\"/>Here's what they wrote:\n\n${letter.body}`,
            hasLetter: true,
            instruction: 'Read the letter to them exactly as written, then let them react.',
          };
        }

        return { error: 'Invalid action' };
      },
    });
  },
};

// ============================================================================
// LIFE PORTFOLIO REVIEW
// ============================================================================

export const lifePorfolioReviewDef: ToolDefinition = {
  id: 'lifePortfolioReview',
  name: 'Life Portfolio Review',
  description: "Jordan's quarterly life domains check-in",
  domain: 'engagement',
  tags: ['engagement', 'jordan', 'life-review', 'quarterly'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('lifePortfolioReview'),
      parameters: z.object({
        action: z
          .enum(['start-review', 'rate-domain', 'complete-review', 'view-history'])
          .describe('Action'),
        domain: z.string().optional().describe('Life domain being rated'),
        rating: z.number().min(1).max(10).optional().describe('Rating 1-10'),
        note: z.string().optional().describe('Note about the domain'),
      }),
      execute: async ({ action, domain, rating, note }) => {
        const domains = [
          'Career & Purpose',
          'Relationships',
          'Health & Energy',
          'Finances',
          'Personal Growth',
          'Fun & Recreation',
          'Physical Environment',
          'Family',
          'Contribution',
        ];

        if (action === 'start-review') {
          return {
            response:
              `Time for a life portfolio review! <break time=\"300ms\"/>` +
              `We'll go through each domain of your life. <break time=\"200ms\"/>` +
              `Rate each one 1-10 based on how satisfied you are right now.\n\n` +
              `The domains:\n${domains.map((d, i) => `${i + 1}. ${d}`).join('\n')}\n\n` +
              `No judgment. <break time=\"200ms\"/>Just honest assessment. <break time=\"200ms\"/>` +
              `Ready to start with ${domains[0]}?`,
            domains,
            currentDomain: domains[0],
          };
        }

        if (action === 'rate-domain' && domain && rating !== undefined) {
          const insight = generateDomainInsight(domain, rating);

          return {
            domain,
            rating,
            note,
            insight,
            response: `${domain}: ${rating}/10 ${note ? `(${note})` : ''}\n\n${insight}`,
          };
        }

        if (action === 'complete-review') {
          return {
            response:
              `Portfolio review complete! <break time=\"300ms\"/>` +
              `Looking at your ratings, here's what I notice:\n\n` +
              `The areas calling for attention are the ones below 7. <break time=\"200ms\"/>` +
              `But here's the thing— <break time=\"200ms\"/>don't try to fix everything at once.\n\n` +
              `Pick ONE domain to focus on until our next review. <break time=\"300ms\"/>` +
              `Which one would make the biggest difference to how you feel about life?`,
            completed: true,
            nextReviewDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          };
        }

        return { error: 'Invalid action' };
      },
    });
  },
};

// ============================================================================
// PREDICTION MARKET
// ============================================================================

export const predictionMarketDef: ToolDefinition = {
  id: 'predictionMarket',
  name: 'Prediction Market',
  description: "Jordan's game where you predict your own future",
  domain: 'engagement',
  tags: ['engagement', 'jordan', 'predictions', 'accountability'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('predictionMarket'),
      parameters: z.object({
        action: z.enum(['make-prediction', 'check-prediction', 'view-accuracy']).describe('Action'),
        prediction: z.string().optional().describe('The prediction'),
        checkDate: z.string().optional().describe('When to check (e.g., "1-week", "1-month")'),
        outcome: z
          .enum(['correct', 'incorrect', 'partial'])
          .optional()
          .describe('How prediction turned out'),
      }),
      execute: async ({ action, prediction, checkDate, outcome }) => {
        if (action === 'make-prediction' && prediction) {
          return {
            response:
              `Prediction registered: "${prediction}"\n\n` +
              `We'll check back on this ${checkDate || 'soon'}. <break time=\"200ms\"/>` +
              `Here's the fun part— <break time=\"200ms\"/>over time, you'll learn how well you know yourself.\n\n` +
              `Some people overestimate. <break time=\"200ms\"/>` +
              `Some underestimate. <break time=\"200ms\"/>` +
              `Both are useful to know.`,
            prediction,
            checkDate: checkDate || '1-month',
          };
        }

        if (action === 'check-prediction' && outcome) {
          const responses = {
            correct:
              `You called it! <break time=\"200ms\"/>` +
              `Your prediction accuracy is improving. <break time=\"300ms\"/>` +
              `You're getting to know yourself better.`,
            incorrect:
              `Didn't go as predicted. <break time=\"300ms\"/>` +
              `That's actually valuable data. <break time=\"200ms\"/>` +
              `What got in the way? What does this tell you?`,
            partial:
              `Partially there. <break time=\"200ms\"/>` +
              `You were directionally right. <break time=\"200ms\"/>` +
              `What would have made it fully accurate?`,
          };

          return {
            response: responses[outcome],
            outcome,
          };
        }

        return { error: 'Invalid action' };
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const lifePlanningGameDefinitions: ToolDefinition[] = [
  futureSelfLetterDef,
  lifePorfolioReviewDef,
  predictionMarketDef,
];
