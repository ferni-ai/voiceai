/**
 * CEO Coaching Briefing Tools
 *
 * Tools for morning briefings and weekly reviews.
 * Provides executives with structured start-of-day and end-of-week summaries.
 *
 * TOOLS:
 *   - getMorningBriefing: Calendar, priorities, wins, reminders
 *   - weeklyReview: Weekly review and planning
 *
 * CROSS-DOMAIN INTEGRATIONS:
 *   - Calendar: Today's meetings from unified calendar store
 */

import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';
import {
  getCEOCoachingState,
  getRecentWins,
  saveWeeklyReview,
} from './storage.js';
// Cross-Domain: Calendar integration
import { getEventsForDay, hasAnyProviderConnected, type CalendarEvent } from '../../../services/calendar/index.js';

const log = getLogger();

// ============================================================================
// CALENDAR HELPERS
// ============================================================================

/**
 * Format a time for display (e.g., "9:00 AM")
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Get calendar events for today, formatted for briefing
 */
async function getTodayCalendarSummary(userId: string): Promise<string | null> {
  try {
    // Check if user has any calendar connected
    const hasCalendar = await hasAnyProviderConnected(userId);
    if (!hasCalendar) {
      return null; // No calendar connected
    }

    const today = new Date();
    const events = await getEventsForDay(userId, today);

    if (events.length === 0) {
      return 'No meetings scheduled today. Clear calendar for deep work!';
    }

    // Sort by start time
    events.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    // Format events
    const lines: string[] = [];
    for (const event of events.slice(0, 5)) { // Show up to 5 meetings
      const start = formatTime(event.startTime);
      const end = formatTime(event.endTime);
      const title = event.title.length > 40 ? event.title.slice(0, 37) + '...' : event.title;
      lines.push(`- ${start}-${end}: ${title}`);
    }

    if (events.length > 5) {
      lines.push(`... and ${events.length - 5} more`);
    }

    // Add meeting load indicator
    const totalMinutes = events.reduce((sum, e) => {
      return sum + (e.endTime.getTime() - e.startTime.getTime()) / (1000 * 60);
    }, 0);
    const hours = Math.round(totalMinutes / 60 * 10) / 10;

    return `${events.length} meetings (${hours}h total):\n${lines.join('\n')}`;
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Could not get calendar summary');
    return null;
  }
}

// ============================================================================
// MORNING BRIEFING TOOL
// ============================================================================

export const getMorningBriefingDef: ToolDefinition = {
  id: 'getMorningBriefing',
  name: 'Get Morning Briefing',
  description: 'Provides a personalized morning briefing with priorities, wins, blockers, and focus suggestions',
  domain: 'ceo-coaching',
  tags: ['ceo', 'coaching', 'briefing', 'morning', 'productivity'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Get a personalized morning briefing. Includes current priorities, recent wins, active blockers, ' +
        'pending decisions, and energy trends. Helps executives start their day with clarity and focus.',
      parameters: z.object({
        includeCalendar: z
          .boolean()
          .optional()
          .describe('Whether to include calendar summary (requires calendar integration)'),
        focusArea: z
          .enum(['priorities', 'energy', 'decisions', 'full'])
          .optional()
          .describe('Specific area to focus on, or full briefing'),
      }),
      execute: async ({ includeCalendar, focusArea = 'full' }) => {
        const userId = ctx.userId;
        if (!userId) {
          return 'I need to know who you are to give you a briefing. Please sign in.';
        }

        log.info({ agentId: ctx.agentId, userId, focusArea }, 'Generating morning briefing');

        try {
          const state = await getCEOCoachingState(userId);
          const today = new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          });

          let response = `**Good morning! Here's your briefing for ${today}**\n\n`;

          // Calendar (Cross-Domain Integration)
          if (includeCalendar !== false) { // Include by default
            const calendarSummary = await getTodayCalendarSummary(userId);
            if (calendarSummary) {
              response += `**Today's Calendar** 📅\n${calendarSummary}\n\n`;
            }
          }

          // Priorities
          if (focusArea === 'full' || focusArea === 'priorities') {
            response += `**Priorities**\n`;
            if (state.currentPriorities.length > 0) {
              state.currentPriorities.slice(0, 3).forEach((p, i) => {
                response += `${i + 1}. ${p.text}\n`;
              });
            } else {
              response += `No priorities set. What's most important today?\n`;
            }
            response += `\n`;
          }

          // Blockers
          if (focusArea === 'full') {
            if (state.activeBlockers.length > 0) {
              response += `**Active Blockers** (${state.activeBlockers.length})\n`;
              state.activeBlockers.slice(0, 2).forEach((b) => {
                response += `- ${b.text}\n`;
              });
              response += `\n`;
            }
          }

          // Pending Decisions
          if (focusArea === 'full' || focusArea === 'decisions') {
            if (state.pendingDecisions.length > 0) {
              response += `**Pending Decisions** (${state.pendingDecisions.length})\n`;
              state.pendingDecisions.slice(0, 2).forEach((d) => {
                response += `- ${d.description}\n`;
              });
              response += `\n`;
            }
          }

          // Energy Trend
          if (focusArea === 'full' || focusArea === 'energy') {
            const { current, weekAverage, trend } = state.energyTrend;
            if (current !== undefined || weekAverage !== undefined) {
              response += `**Energy**\n`;
              if (weekAverage !== undefined) {
                const trendEmoji = trend === 'up' ? '📈' : trend === 'down' ? '📉' : '➡️';
                response += `Week average: ${weekAverage}/10 ${trendEmoji}\n`;
              }
              response += `\n`;
            }
          }

          // Recent Wins (motivational)
          if (focusArea === 'full' && state.recentWins.length > 0) {
            response += `**Recent Wins** 🎉\n`;
            state.recentWins.slice(0, 2).forEach((w) => {
              const daysAgo = Math.floor(
                (Date.now() - new Date(w.createdAt).getTime()) / (1000 * 60 * 60 * 24)
              );
              const ago = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;
              response += `- ${w.text} (${ago})\n`;
            });
            response += `\n`;
          }

          // Active Focus Session
          if (state.activeFocusSession) {
            const startTime = new Date(state.activeFocusSession.startedAt);
            const minutesIn = Math.floor((Date.now() - startTime.getTime()) / (1000 * 60));
            response += `**Active Focus Session** 🎯\n`;
            response += `${state.activeFocusSession.task || 'Focus time'} - ${minutesIn} min in\n\n`;
          }

          // Closing
          response += `---\n`;
          response += `What would you like to focus on first?`;

          return response;
        } catch (error) {
          log.error({ error: String(error), userId }, 'Failed to generate morning briefing');
          return 'I had trouble getting your briefing. Let me try again.';
        }
      },
    });
  },
};

// ============================================================================
// WEEKLY REVIEW TOOL
// ============================================================================

export const weeklyReviewDef: ToolDefinition = {
  id: 'weeklyReview',
  name: 'Weekly Review',
  description: 'Conducts a guided weekly review to reflect on wins, learnings, and plan next week',
  domain: 'ceo-coaching',
  tags: ['ceo', 'coaching', 'weekly', 'review', 'planning'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Conduct a weekly review. Summarizes the week\'s wins and energy, prompts for learnings, ' +
        'and helps set focus for next week. Essential for continuous improvement.',
      parameters: z.object({
        action: z
          .enum(['start', 'summarize', 'save'])
          .describe('Start review, get summary, or save completed review'),
        wins: z
          .array(z.string())
          .optional()
          .describe('List of wins to record (for save action)'),
        learnings: z
          .array(z.string())
          .optional()
          .describe('Key learnings from the week (for save action)'),
        nextWeekFocus: z
          .array(z.string())
          .optional()
          .describe('Focus areas for next week (for save action)'),
      }),
      execute: async ({ action, wins, learnings, nextWeekFocus }) => {
        const userId = ctx.userId;
        if (!userId) {
          return 'I need to know who you are for your weekly review.';
        }

        log.info({ agentId: ctx.agentId, userId, action }, 'Weekly review');

        try {
          if (action === 'start' || action === 'summarize') {
            // Get week's data
            const recentWins = await getRecentWins(userId, 7);
            const state = await getCEOCoachingState(userId);

            // Calculate week dates
            const now = new Date();
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - now.getDay() + 1); // Monday
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6); // Sunday

            let response = `**Weekly Review**\n`;
            response += `Week of ${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}\n\n`;

            // Wins summary
            response += `**This Week's Wins** (${recentWins.length})\n`;
            if (recentWins.length > 0) {
              recentWins.forEach((w) => {
                response += `- ${w.text}\n`;
              });
            } else {
              response += `No wins logged this week. That's okay - sometimes weeks are about grinding through.\n`;
            }
            response += `\n`;

            // Energy summary
            const { weekAverage, trend } = state.energyTrend;
            if (weekAverage !== undefined) {
              response += `**Energy This Week**\n`;
              response += `Average: ${weekAverage}/10 `;
              response += trend === 'up' ? '(trending up 📈)' : trend === 'down' ? '(trending down 📉)' : '(stable ➡️)';
              response += `\n\n`;
            }

            // Completed priorities
            response += `**Priorities Completed:** Check your priority list for completed items\n\n`;

            // Blockers resolved
            response += `**Blockers:** ${state.activeBlockers.length} still active\n\n`;

            response += `---\n`;
            response += `**Reflection Questions:**\n`;
            response += `1. What's the biggest thing you learned this week?\n`;
            response += `2. What would you do differently?\n`;
            response += `3. What are your top 3 priorities for next week?\n`;

            return response;
          } else if (action === 'save') {
            // Save the weekly review
            const now = new Date();
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - now.getDay() + 1);
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);

            // Get energy average
            const state = await getCEOCoachingState(userId);

            await saveWeeklyReview(userId, {
              weekStart: weekStart.toISOString().split('T')[0],
              weekEnd: weekEnd.toISOString().split('T')[0],
              wins: wins || [],
              learnings: learnings || [],
              nextWeekFocus: nextWeekFocus || [],
              energyAverage: state.energyTrend.weekAverage,
            });

            let response = `**Weekly Review Saved** ✅\n\n`;
            if (wins && wins.length > 0) {
              response += `**Wins:** ${wins.length} recorded\n`;
            }
            if (learnings && learnings.length > 0) {
              response += `**Learnings:** ${learnings.join(', ')}\n`;
            }
            if (nextWeekFocus && nextWeekFocus.length > 0) {
              response += `**Next Week Focus:** ${nextWeekFocus.join(', ')}\n`;
            }
            response += `\nGreat work reflecting on your week. Have a restful weekend!`;

            return response;
          }

          return 'I didn\'t understand that action. Try "start", "summarize", or "save".';
        } catch (error) {
          log.error({ error: String(error), userId }, 'Failed weekly review');
          return 'I had trouble with the weekly review. Let me try again.';
        }
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const briefingTools: ToolDefinition[] = [
  getMorningBriefingDef,
  weeklyReviewDef,
];
