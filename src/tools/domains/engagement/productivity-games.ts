/**
 * Productivity Engagement Games
 *
 * Tools for productivity and planning (Alex's games).
 * - Inbox Zero Challenge: Streak-based inbox management
 * - Sunday Prep Game: Weekly planning ritual
 *
 * @module engagement/productivity-games
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getDailyRitualsService } from '../../../services/daily-rituals.js';
import type { Tool, ToolContext, ToolDefinition } from '../../registry/types.js';

import { getToolDescription } from '../../utils/tool-descriptions.js';
// ============================================================================
// INBOX ZERO CHALLENGE
// ============================================================================

export const inboxZeroChallengeDef: ToolDefinition = {
  id: 'inboxZeroChallenge',
  name: 'Inbox Zero Challenge',
  description: "Alex's streak-based inbox management game",
  domain: 'engagement',
  tags: ['engagement', 'alex', 'productivity', 'streaks'],

  create: (ctx: ToolContext): Tool => {
    const userId = ctx.userId ?? 'anonymous';
    return llm.tool({
      description: getToolDescription('inboxZeroChallenge'),
      parameters: z.object({
        action: z.enum(['check-in', 'report-status', 'view-streak', 'tips']).describe('Action'),
        inboxCount: z.number().optional().describe('Current inbox count'),
      }),
      execute: async ({ action, inboxCount }) => {
        const service = getDailyRitualsService();

        if (action === 'check-in') {
          const opening = service.getRitualOpening('alex-inbox-pulse');
          return { message: opening };
        }

        if (action === 'report-status' && inboxCount !== undefined) {
          const isZero = inboxCount === 0;
          const result = isZero
            ? service.recordCompletion(userId, 'alex-inbox-pulse')
            : { newStreak: 0, isNewRecord: false };

          if (isZero) {
            return {
              response:
                `Inbox zero! <break time=\"200ms\"/>` +
                `That's not just organization— <break time=\"200ms\"/>that's respect for yourself and others. ` +
                `<break time=\"300ms\"/>Day ${result.newStreak} of inbox clarity.`,
              streak: result.newStreak,
              celebration: result.celebration,
            };
          } else if (inboxCount < 10) {
            return {
              response:
                `${inboxCount} emails. <break time=\"200ms\"/>` +
                `Manageable. <break time=\"200ms\"/>` +
                `Can you knock those out in the next hour?`,
              inboxCount,
              status: 'manageable',
            };
          } else {
            return {
              response:
                `${inboxCount} emails. <break time=\"300ms\"/>` +
                `Okay, triage time. <break time=\"200ms\"/>` +
                `Here's the rule: Delete what you can, respond to what's quick, defer what needs thought. ` +
                `<break time=\"200ms\"/>What can you delete right now without reading?`,
              inboxCount,
              status: 'needs-triage',
            };
          }
        }

        if (action === 'tips') {
          const tips = [
            'The 2-minute rule: If it takes less than 2 minutes, do it NOW.',
            "Unsubscribe from 3 newsletters today. You won't miss them.",
            "Create a 'Waiting On' folder. Reduces mental load.",
            'Schedule email time instead of checking constantly.',
            'Use templates for common responses. Your time matters.',
          ];

          return {
            response: `Quick tip: <break time=\"200ms\"/>${tips[Math.floor(Math.random() * tips.length)]}`,
          };
        }

        return { error: 'Invalid action' };
      },
    });
  },
};

// ============================================================================
// SUNDAY PREP GAME
// ============================================================================

export const sundayPrepGameDef: ToolDefinition = {
  id: 'sundayPrepGame',
  name: 'Sunday Prep Game',
  description: "Alex's weekly planning ritual",
  domain: 'engagement',
  tags: ['engagement', 'alex', 'planning', 'weekly'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('sundayPrepGame'),
      parameters: z.object({
        action: z
          .enum(['start', 'set-priorities', 'identify-blockers', 'complete'])
          .describe('Stage'),
        priorities: z.array(z.string()).optional().describe('Top 3 priorities'),
        blockers: z.array(z.string()).optional().describe('Potential blockers'),
      }),
      execute: async ({ action, priorities, blockers }) => {
        if (action === 'start') {
          return {
            response:
              `Sunday Prep time! <break time=\"200ms\"/>` +
              `Five minutes to set up your week for success.\n\n` +
              `First question: <break time=\"200ms\"/>` +
              `What are the THREE things that, if you accomplish them, would make this week a win?\n\n` +
              `Not ten things. <break time=\"200ms\"/>Not five. <break time=\"200ms\"/>Three.`,
            stage: 'priorities',
          };
        }

        if (action === 'set-priorities' && priorities) {
          return {
            response:
              `Your three priorities:\n${priorities.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n` +
              `Good. <break time=\"200ms\"/>Now: <break time=\"200ms\"/>` +
              `What could get in the way of these? <break time=\"300ms\"/>` +
              `What meetings, tasks, or distractions might derail you?`,
            priorities,
            stage: 'blockers',
          };
        }

        if (action === 'identify-blockers' && blockers) {
          return {
            response:
              `Potential blockers:\n${blockers.map((b) => `• ${b}`).join('\n')}\n\n` +
              `Now you see them coming. <break time=\"300ms\"/>` +
              `For each blocker, what's one thing you can do to prevent or minimize it?`,
            blockers,
            stage: 'mitigate',
          };
        }

        if (action === 'complete') {
          return {
            response:
              `Week designed. <break time=\"300ms\"/>` +
              `You've got your three priorities. <break time=\"200ms\"/>` +
              `You've anticipated the blockers. <break time=\"200ms\"/>` +
              `Now go make it happen.\n\n` +
              `Check in with me mid-week? <break time=\"200ms\"/>` +
              `I'll remember what you committed to.`,
            complete: true,
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

export const productivityGameDefinitions: ToolDefinition[] = [
  inboxZeroChallengeDef,
  sundayPrepGameDef,
];
