/**
 * CEO Coaching Focus Tools
 *
 * Tools for deep work: focus sessions and daily reflection.
 * These support intentional work and end-of-day processing.
 *
 * TOOLS:
 *   - startFocusSession: Start/stop focus with timer
 *   - dailyReflection: End-of-day reflection prompts
 */

import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';
import {
  startFocusSession,
  endFocusSession,
  getActiveFocusSession,
  saveDailyReflection,
  getCEOCoachingState,
} from './storage.js';

const log = getLogger();

// ============================================================================
// FOCUS SESSION TOOL
// ============================================================================

export const focusSessionDef: ToolDefinition = {
  id: 'focusSession',
  name: 'Focus Session',
  description: 'Start or end a timed focus session for deep work',
  domain: 'ceo-coaching',
  tags: ['ceo', 'coaching', 'focus', 'deep-work', 'productivity'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Manage focus sessions for deep work. Start a session with a specific duration and optional task, ' +
        'check status, or end the session. Focus sessions help you protect time for important work.',
      parameters: z.object({
        action: z
          .enum(['start', 'end', 'status'])
          .describe('Start a session, end it, or check status'),
        durationMinutes: z
          .number()
          .min(5)
          .max(180)
          .optional()
          .describe('Session duration in minutes (for start action)'),
        task: z.string().optional().describe("What you're focusing on"),
        status: z
          .enum(['completed', 'interrupted'])
          .optional()
          .describe('How the session ended (for end action)'),
      }),
      execute: async ({ action, durationMinutes, task, status: endStatus }) => {
        const userId = ctx.userId;
        if (!userId) {
          return 'I need to know who you are to manage focus sessions.';
        }

        log.info({ agentId: ctx.agentId, userId, action }, 'Focus session');

        try {
          if (action === 'start') {
            // Check if already in a session
            const existing = await getActiveFocusSession(userId);
            if (existing) {
              const startTime = new Date(existing.startedAt);
              const minutesIn = Math.floor((Date.now() - startTime.getTime()) / (1000 * 60));
              return (
                `**Already in a focus session** 🎯\n\n` +
                `Task: ${existing.task || 'Deep work'}\n` +
                `Duration: ${existing.durationMinutes} minutes\n` +
                `Progress: ${minutesIn} minutes in\n\n` +
                `End this session before starting a new one.`
              );
            }

            const duration = durationMinutes || 25; // Default to Pomodoro
            const session = await startFocusSession(userId, duration, task);

            let response = `**Focus Session Started** 🎯\n\n`;
            if (task) {
              response += `Task: ${task}\n`;
            }
            response += `Duration: ${duration} minutes\n\n`;

            // Tips based on duration
            if (duration <= 25) {
              response += `**Pomodoro-style session.** Single focus, no distractions.\n`;
            } else if (duration <= 50) {
              response += `**Deep work block.** Protect this time fiercely.\n`;
            } else {
              response += `**Extended focus.** Remember to take brief breaks if needed.\n`;
            }

            response += `\nI'll be here when you're done. Good luck!`;

            return response;
          } else if (action === 'end') {
            const session = await getActiveFocusSession(userId);
            if (!session) {
              return 'No active focus session to end.';
            }

            const startTime = new Date(session.startedAt);
            const actualMinutes = Math.floor((Date.now() - startTime.getTime()) / (1000 * 60));

            await endFocusSession(userId, session.id, endStatus || 'completed');

            let response = '';
            if (endStatus === 'interrupted') {
              response = `**Focus Session Interrupted** ⚡\n\n`;
              response += `You made it ${actualMinutes} minutes of ${session.durationMinutes} planned.\n\n`;
              response += `Interruptions happen. What pulled you away?\n`;
              response += `Knowing your interruption patterns helps protect future focus time.`;
            } else {
              response = `**Focus Session Complete** 🎉\n\n`;
              if (session.task) {
                response += `Task: ${session.task}\n`;
              }
              response += `Duration: ${actualMinutes} minutes`;
              if (actualMinutes >= session.durationMinutes) {
                response += ` (exceeded target! 💪)`;
              }
              response += `\n\n`;
              response += `Nice work protecting that focus time. How did it go?`;
            }

            return response;
          } else if (action === 'status') {
            const session = await getActiveFocusSession(userId);

            if (!session) {
              return '**No active focus session.**\n\nReady to start one?';
            }

            const startTime = new Date(session.startedAt);
            const minutesIn = Math.floor((Date.now() - startTime.getTime()) / (1000 * 60));
            const remaining = session.durationMinutes - minutesIn;

            let response = `**Focus Session Active** 🎯\n\n`;
            if (session.task) {
              response += `Task: ${session.task}\n`;
            }
            response += `Progress: ${minutesIn}/${session.durationMinutes} minutes\n`;

            if (remaining > 0) {
              response += `Remaining: ${remaining} minutes\n`;
            } else {
              response += `**Time's up!** Ready to wrap up?\n`;
            }

            return response;
          }

          return "I didn't understand that action.";
        } catch (error) {
          log.error({ error: String(error), userId }, 'Failed focus session');
          return 'I had trouble with that. Let me try again.';
        }
      },
    });
  },
};

// ============================================================================
// DAILY REFLECTION TOOL
// ============================================================================

export const dailyReflectionDef: ToolDefinition = {
  id: 'dailyReflection',
  name: 'Daily Reflection',
  description: 'Guided end-of-day reflection to process the day and set up tomorrow',
  domain: 'ceo-coaching',
  tags: ['ceo', 'coaching', 'reflection', 'review', 'evening'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Conduct a daily reflection. Guided prompts to process what happened today, celebrate wins, ' +
        'acknowledge challenges, and set intentions for tomorrow. Best done in the evening.',
      parameters: z.object({
        action: z
          .enum(['start', 'save'])
          .describe('Start reflection prompts or save completed reflection'),
        highlights: z.array(z.string()).optional().describe("Day's highlights (for save action)"),
        challenges: z.array(z.string()).optional().describe('Challenges faced (for save action)'),
        tomorrow: z
          .array(z.string())
          .optional()
          .describe('Intentions for tomorrow (for save action)'),
      }),
      execute: async ({ action, highlights, challenges, tomorrow }) => {
        const userId = ctx.userId;
        if (!userId) {
          return 'I need to know who you are for your reflection.';
        }

        log.info({ agentId: ctx.agentId, userId, action }, 'Daily reflection');

        try {
          if (action === 'start') {
            // Get today's data to seed the reflection
            const state = await getCEOCoachingState(userId);
            const today = new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            });

            let response = `**Daily Reflection: ${today}**\n\n`;

            // Show wins from today
            const todayStr = new Date().toISOString().split('T')[0];
            const todayWins = state.recentWins.filter((w) => w.date === todayStr);

            if (todayWins.length > 0) {
              response += `**Today's Wins:**\n`;
              todayWins.forEach((w) => {
                response += `- ${w.text}\n`;
              });
              response += `\n`;
            }

            // Show energy if logged
            if (state.energyTrend.current !== undefined) {
              response += `**Energy:** ${state.energyTrend.current}/10\n\n`;
            }

            response += `---\n\n`;
            response += `**Reflection Questions:**\n\n`;
            response += `1. **Highlights:** What went well today? What are you proud of?\n\n`;
            response += `2. **Challenges:** What was difficult? What didn't go as planned?\n\n`;
            response += `3. **Tomorrow:** What's the one thing that would make tomorrow great?\n\n`;
            response += `Take a moment to think through these. When ready, share your thoughts.`;

            return response;
          } else if (action === 'save') {
            const today = new Date().toISOString().split('T')[0];

            await saveDailyReflection(userId, {
              date: today,
              highlights: highlights || [],
              challenges: challenges || [],
              tomorrow: tomorrow || [],
            });

            let response = `**Reflection Saved** 🌙\n\n`;

            if (highlights && highlights.length > 0) {
              response += `**Highlights:** ${highlights.length} captured\n`;
            }
            if (challenges && challenges.length > 0) {
              response += `**Challenges:** ${challenges.length} noted\n`;
            }
            if (tomorrow && tomorrow.length > 0) {
              response += `**Tomorrow:** ${tomorrow.join(', ')}\n`;
            }

            response += `\n`;
            response += `Processing the day helps you grow from it. Rest well, and come back refreshed.`;

            return response;
          }

          return "I didn't understand that action.";
        } catch (error) {
          log.error({ error: String(error), userId }, 'Failed daily reflection');
          return 'I had trouble with that. Let me try again.';
        }
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const focusTools: ToolDefinition[] = [focusSessionDef, dailyReflectionDef];
