/**
 * CEO Coaching Tracking Tools
 *
 * Tools for tracking personal metrics: wins, energy, gratitude, and journal entries.
 * These are the "quick capture" tools for daily self-awareness.
 *
 * TOOLS:
 *   - trackWin: Log an achievement
 *   - trackEnergy: Log energy level (1-10)
 *   - logGratitude: Log gratitude
 *   - quickJournal: Quick journal entry
 */

import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';
import {
  saveWin,
  logEnergy,
  logGratitude,
  saveJournalEntry,
  getEnergyTrend,
} from './storage.js';

const log = getLogger();

// ============================================================================
// TRACK WIN TOOL
// ============================================================================

export const trackWinDef: ToolDefinition = {
  id: 'trackWin',
  name: 'Track Win',
  description: 'Log an achievement or win to celebrate progress and build momentum',
  domain: 'ceo-coaching',
  tags: ['ceo', 'coaching', 'wins', 'achievement', 'tracking'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Log a win or achievement. Wins can be big or small - shipping a feature, closing a deal, ' +
        'having a good conversation, or completing a challenging task. Tracking wins builds positive momentum.',
      parameters: z.object({
        text: z.string().describe('Description of the win or achievement'),
        category: z
          .enum(['work', 'personal', 'health', 'relationships', 'growth'])
          .optional()
          .describe('Category of the win'),
      }),
      execute: async ({ text, category }) => {
        const userId = ctx.userId;
        if (!userId) {
          return 'I need to know who you are to log your win.';
        }

        log.info({ agentId: ctx.agentId, userId, category }, 'Tracking win');

        try {
          const today = new Date().toISOString().split('T')[0];
          const win = await saveWin(userId, {
            text,
            date: today,
            category,
          });

          let response = `**Win Logged!** 🎉\n\n`;
          response += `"${text}"\n\n`;

          if (category) {
            response += `Category: ${category}\n`;
          }

          // Add encouragement based on category
          const encouragements: Record<string, string> = {
            work: 'Great progress on the professional front!',
            personal: 'Personal wins matter just as much as work ones.',
            health: 'Investing in your health pays dividends.',
            relationships: 'Relationships are what make life rich.',
            growth: 'Growth mindset in action!',
          };

          if (category && encouragements[category]) {
            response += `\n${encouragements[category]}`;
          } else {
            response += `\nNice work! Every win counts.`;
          }

          return response;
        } catch (error) {
          log.error({ error: String(error), userId }, 'Failed to track win');
          return 'I had trouble logging that win. Let me try again.';
        }
      },
    });
  },
};

// ============================================================================
// TRACK ENERGY TOOL
// ============================================================================

export const trackEnergyDef: ToolDefinition = {
  id: 'trackEnergy',
  name: 'Track Energy',
  description: 'Log current energy level on a 1-10 scale to track patterns over time',
  domain: 'ceo-coaching',
  tags: ['ceo', 'coaching', 'energy', 'wellbeing', 'tracking'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Log your current energy level from 1 to 10. Tracking energy helps identify patterns - ' +
        'when you feel best, what drains you, and how to optimize your schedule for peak performance.',
      parameters: z.object({
        level: z.number().min(1).max(10).describe('Energy level from 1 (exhausted) to 10 (peak energy)'),
        note: z.string().optional().describe('Optional note about what\'s affecting energy'),
      }),
      execute: async ({ level, note }) => {
        const userId = ctx.userId;
        if (!userId) {
          return 'I need to know who you are to log your energy.';
        }

        log.info({ agentId: ctx.agentId, userId, level }, 'Tracking energy');

        try {
          await logEnergy(userId, level, note);
          const trend = await getEnergyTrend(userId, 7);

          let response = `**Energy Logged:** ${level}/10\n`;

          if (note) {
            response += `Note: ${note}\n`;
          }

          response += `\n`;

          // Provide context based on level
          if (level <= 3) {
            response += `That's on the lower side. `;
            if (trend.weekAverage && trend.weekAverage > level + 2) {
              response += `This is below your usual ${trend.weekAverage}/10 average. What's going on?`;
            } else {
              response += `What's draining you? Is rest possible today?`;
            }
          } else if (level <= 5) {
            response += `Middle of the road. `;
            response += `What would bump this up a notch?`;
          } else if (level <= 7) {
            response += `Good energy! `;
            response += `A solid foundation for the day.`;
          } else {
            response += `High energy! 🔥 `;
            response += `Make the most of this - tackle something challenging.`;
          }

          // Show trend if available
          if (trend.weekAverage !== undefined) {
            response += `\n\n`;
            response += `**Week average:** ${trend.weekAverage}/10 `;
            if (trend.trend === 'up') {
              response += `(trending up 📈)`;
            } else if (trend.trend === 'down') {
              response += `(trending down 📉)`;
            }
          }

          return response;
        } catch (error) {
          log.error({ error: String(error), userId }, 'Failed to track energy');
          return 'I had trouble logging your energy. Let me try again.';
        }
      },
    });
  },
};

// ============================================================================
// LOG GRATITUDE TOOL
// ============================================================================

export const logGratitudeDef: ToolDefinition = {
  id: 'logGratitude',
  name: 'Log Gratitude',
  description: 'Capture something you\'re grateful for to cultivate a positive mindset',
  domain: 'ceo-coaching',
  tags: ['ceo', 'coaching', 'gratitude', 'wellbeing', 'mindfulness'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Log something you\'re grateful for. Regular gratitude practice is scientifically proven to ' +
        'improve wellbeing, reduce stress, and increase resilience. Can be big or small.',
      parameters: z.object({
        text: z.string().describe('What you\'re grateful for'),
      }),
      execute: async ({ text }) => {
        const userId = ctx.userId;
        if (!userId) {
          return 'I need to know who you are to log your gratitude.';
        }

        log.info({ agentId: ctx.agentId, userId }, 'Logging gratitude');

        try {
          await logGratitude(userId, text);

          let response = `**Gratitude Logged** 🙏\n\n`;
          response += `"${text}"\n\n`;
          response += `Taking a moment to notice what's good is a powerful practice. `;
          response += `The more you look for things to appreciate, the more you find.`;

          return response;
        } catch (error) {
          log.error({ error: String(error), userId }, 'Failed to log gratitude');
          return 'I had trouble logging that. Let me try again.';
        }
      },
    });
  },
};

// ============================================================================
// QUICK JOURNAL TOOL
// ============================================================================

export const quickJournalDef: ToolDefinition = {
  id: 'quickJournal',
  name: 'Quick Journal',
  description: 'Capture a quick journal entry or thought for reflection',
  domain: 'ceo-coaching',
  tags: ['ceo', 'coaching', 'journal', 'reflection', 'writing'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Capture a quick journal entry. Journaling helps process thoughts, track your journey, ' +
        'and create a record you can reflect on later. No need for it to be polished.',
      parameters: z.object({
        text: z.string().describe('Your journal entry - whatever\'s on your mind'),
        mood: z
          .enum(['great', 'good', 'okay', 'low', 'rough'])
          .optional()
          .describe('Current mood'),
      }),
      execute: async ({ text, mood }) => {
        const userId = ctx.userId;
        if (!userId) {
          return 'I need to know who you are to save your journal entry.';
        }

        log.info({ agentId: ctx.agentId, userId, mood }, 'Quick journal entry');

        try {
          await saveJournalEntry(userId, text, mood);

          let response = `**Journal Entry Saved** 📝\n\n`;

          if (mood) {
            const moodEmojis: Record<string, string> = {
              great: '😊',
              good: '🙂',
              okay: '😐',
              low: '😔',
              rough: '😞',
            };
            response += `Mood: ${mood} ${moodEmojis[mood] || ''}\n\n`;
          }

          response += `Your thoughts have been captured. `;
          response += `Writing things down often helps clarify them.`;

          // Add follow-up based on mood
          if (mood === 'low' || mood === 'rough') {
            response += `\n\nI notice you're not feeling great. Would you like to talk through what's going on?`;
          }

          return response;
        } catch (error) {
          log.error({ error: String(error), userId }, 'Failed to save journal entry');
          return 'I had trouble saving that. Let me try again.';
        }
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const trackingTools: ToolDefinition[] = [
  trackWinDef,
  trackEnergyDef,
  logGratitudeDef,
  quickJournalDef,
];
