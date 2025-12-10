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

// ============================================================================
// FUTURE SELF LETTER
// ============================================================================

export const futureSelfLetterDef: ToolDefinition = {
  id: 'futureSelfLetter',
  name: 'Future Self Letter',
  description: 'Write a letter to your future self that Jordan delivers later',
  domain: 'engagement',
  tags: ['engagement', 'jordan', 'time-capsule', 'reflection'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Write a letter to your future self. Jordan seals it and delivers it at the specified time.
Creates anticipation and a powerful moment when delivered.`,
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

        if (action === 'seal' && content && deliveryDate) {
          const deliveryDates: Record<string, number> = {
            '1-month': 30,
            '3-months': 90,
            '6-months': 180,
            '1-year': 365,
          };

          const days = deliveryDates[deliveryDate] || 30;
          const deliveryDateObj = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

          return {
            response:
              `Letter sealed. <break time=\"500ms\"/>` +
              `I'll hold onto this until ${deliveryDateObj.toLocaleDateString()}.\n\n` +
              `When the time comes, I'll deliver it. <break time=\"200ms\"/>` +
              `It'll be like hearing from a friend you haven't talked to in a while— <break time=\"200ms\"/>` +
              `yourself.`,
            sealed: true,
            deliveryDate: deliveryDateObj.toISOString(),
            preview: `${content.slice(0, 50)}...`,
          };
        }

        if (action === 'deliver') {
          return {
            response:
              `A letter has arrived from past-you. <break time=\"500ms\"/>` +
              `They wrote this for exactly this moment. <break time=\"300ms\"/>` +
              `Ready to read what they had to say?`,
            hasLetter: true,
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
      description: `Quarterly review of all life domains. Rate each area 1-10 and track over time.
Jordan helps identify where to focus next.`,
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
      description: `Make predictions about your own life. Jordan tracks accuracy over time.
Fun way to build self-knowledge about what you'll actually do.`,
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
