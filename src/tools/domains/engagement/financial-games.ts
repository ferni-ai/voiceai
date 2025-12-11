/**
 * Financial Engagement Games
 *
 * Tools for financial habits and commitment (Maya's games).
 * - Compound & Interest Game: Habit tracking with cat metaphors
 * - Tiny Bets: Low-stakes habit commitment game
 *
 * @module engagement/financial-games
 */

import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getDailyRitualsService } from '../../../services/daily-rituals.js';

// ============================================================================
// COMPOUND & INTEREST GAME
// ============================================================================

export const compoundInterestGameDef: ToolDefinition = {
  id: 'compoundInterestGame',
  name: 'Compound & Interest Game',
  description: "Maya's habit tracking game with her cats",
  domain: 'engagement',
  tags: ['engagement', 'maya', 'habits', 'gamification'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Track habits with Maya's cats Compound and Interest.
Compound represents slow, steady growth. Interest is chaotic and demanding.
Users "feed" their habits daily and watch the cats thrive.`,
      parameters: z.object({
        action: z
          .enum(['check-in', 'feed-habit', 'view-cats', 'cat-wisdom'])
          .describe('Action to take'),
        habitName: z.string().optional().describe('Name of habit being fed'),
      }),
      execute: async ({ action, habitName }, { ctx: toolCtx }) => {
        const userData = toolCtx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        const service = getDailyRitualsService();

        if (action === 'check-in') {
          const opening = service.getRitualOpening('maya-habit-heartbeat');
          const cats = service.getCatCommentary();

          return {
            message: opening,
            catStatus: cats,
          };
        }

        if (action === 'feed-habit' && habitName) {
          const result = service.recordCompletion(userId, 'maya-habit-heartbeat');
          const cats = service.getCatCommentary();

          return {
            message: `Habit "${habitName}" fed! <break time="200ms"/>`,
            catReaction: `${cats.compound}\n${cats.interest}`,
            streak: result.newStreak,
            celebration: result.celebration,
          };
        }

        if (action === 'view-cats') {
          return {
            compound: {
              status: 'Content and growing',
              message:
                'Compound is lounging peacefully. <break time="200ms"/>Your consistency is his comfort.',
              mood: 'serene',
            },
            interest: {
              status: 'Energetically curious',
              message:
                'Interest is bouncing around! <break time="200ms"/>She wants to see what you\'ll do today.',
              mood: 'excited',
            },
          };
        }

        if (action === 'cat-wisdom') {
          const wisdoms = [
            "Compound says: 'Small deposits, massive returns. That's how it works.'",
            "Interest says: 'QUICK! Do the thing! The thing you said you'd do!'",
            "Compound says: 'I don't rush. I don't need to. I'll be enormous eventually.'",
            "Interest says: 'Ooh ooh ooh! Did you do it? Did you? Did you?!'",
            "Compound says: 'Patience. The formula always works.'",
            "Interest says: 'I DEMAND you celebrate that win!'",
          ];

          return {
            wisdom: wisdoms[Math.floor(Math.random() * wisdoms.length)],
          };
        }

        return { error: 'Invalid action' };
      },
    });
  },
};

// ============================================================================
// TINY BETS
// ============================================================================

export const tinyBetsDef: ToolDefinition = {
  id: 'tinyBets',
  name: 'Tiny Bets',
  description: "Maya's low-stakes habit commitment game",
  domain: 'engagement',
  tags: ['engagement', 'maya', 'habits', 'commitment'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Create tiny, low-stakes commitments. User bets they'll do a micro-habit.
If they miss, Maya offers compassionate reset. Track success rate over time.`,
      parameters: z.object({
        action: z.enum(['make-bet', 'report-outcome', 'view-history']).describe('Action'),
        habit: z.string().optional().describe('The tiny habit to commit to'),
        outcome: z.enum(['success', 'missed']).optional().describe('How the bet went'),
      }),
      execute: async ({ action, habit, outcome }) => {
        if (action === 'make-bet' && habit) {
          return {
            bet: habit,
            response:
              `Tiny bet placed: "${habit}"\n\n` +
              `This is a bet you can't really lose. <break time=\"200ms\"/>` +
              `If you do it: <break time=\"150ms\"/>celebration. <break time=\"200ms\"/>` +
              `If you miss: <break time=\"150ms\"/>learning. <break time=\"300ms\"/>` +
              `No shame either way. <break time=\"200ms\"/>Just data.\n\n` +
              `Check back with me to report how it went!`,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          };
        }

        if (action === 'report-outcome' && outcome) {
          if (outcome === 'success') {
            return {
              response:
                `You did it! <break time=\"200ms\"/>` +
                `That's not nothing. <break time=\"300ms\"/>` +
                `Small wins compound. <break time=\"200ms\"/>` +
                `Ready for another tiny bet?`,
              celebration: true,
            };
          } else {
            return {
              response:
                `Missed this one. <break time=\"300ms\"/>` +
                `That's okay. <break time=\"200ms\"/>Really. <break time=\"300ms\"/>` +
                `What got in the way? <break time=\"200ms\"/>` +
                `Understanding the obstacle is progress too.\n\n` +
                `Want to try again with something even tinier?`,
              compassionateReset: true,
            };
          }
        }

        return { error: 'Invalid action' };
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const financialGameDefinitions: ToolDefinition[] = [compoundInterestGameDef, tinyBetsDef];
