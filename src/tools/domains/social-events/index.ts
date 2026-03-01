/**
 * Social Events Tools
 *
 * Birthday and social event tracking:
 * - Birthday reminders
 * - Anniversary tracking
 * - Gift suggestions and history
 *
 * DOMAIN: social-events
 */

import { z } from 'zod';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import type { ToolDefinition, Tool, ToolContext } from '../../registry/types.js';
import { createDomainExport } from '../../registry/loader.js';
import { getDefaultStore } from '../../../memory/index.js';

const log = getLogger();

// ============================================================================
// TYPES (would move to a store in production)
// ============================================================================

interface SocialEvent {
  id: string;
  userId: string;
  contactName: string;
  contactEmail?: string;
  eventType: 'birthday' | 'anniversary' | 'annual' | 'custom';
  date: string; // MM-DD format for recurring
  year?: number; // For age calculation
  reminderDays: number[];
  notes?: string;
  giftHistory: Array<{
    year: number;
    gift: string;
    notes?: string;
  }>;
  createdAt: string;
}

// Simple in-memory storage (would use Firestore)
const socialEventsStore: Map<string, SocialEvent[]> = new Map();

function getUserEvents(userId: string): SocialEvent[] {
  return socialEventsStore.get(userId) || [];
}

function saveUserEvents(userId: string, events: SocialEvent[]): void {
  socialEventsStore.set(userId, events);
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

const setBirthdayDef: ToolDefinition = {
  id: 'setBirthday',
  name: 'Set Birthday',
  description: "Remember someone's birthday for annual reminders.",
  domain: 'social-events',
  tags: ['birthday', 'reminder', 'contact'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: "Remember someone's birthday for annual reminders.",
      parameters: z.object({
        name: z.string().describe("Person's name"),
        date: z.string().describe('Birthday date (e.g., "March 15" or "03-15")'),
        year: z.number().optional().describe('Birth year (for age calculation)'),
        reminderDays: z
          .array(z.number())
          .optional()
          .describe('Days before to remind (default: [7, 1])'),
      }),
      execute: async (params) => {
        const userId = ctx.userId;
        if (!userId) {
          return 'I need to know who you are to save birthdays.';
        }

        const events = getUserEvents(userId);
        const now = new Date().toISOString();

        // Parse date
        let monthDay = params.date;
        if (params.date.includes(' ')) {
          const parsed = new Date(params.date + ', 2000');
          monthDay = `${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
        }

        const event: SocialEvent = {
          id: `event_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          userId,
          contactName: params.name,
          eventType: 'birthday',
          date: monthDay,
          year: params.year,
          reminderDays: params.reminderDays || [7, 1],
          giftHistory: [],
          createdAt: now,
        };

        // Check for existing
        const existing = events.findIndex(
          (e) =>
            e.contactName.toLowerCase() === params.name.toLowerCase() &&
            e.eventType === 'birthday'
        );
        if (existing >= 0) {
          events[existing] = event;
        } else {
          events.push(event);
        }

        saveUserEvents(userId, events);

        let response = `🎂 Birthday saved for **${params.name}**: ${params.date}`;
        if (params.year) {
          const age = new Date().getFullYear() - params.year;
          response += `\nThey'll be turning ${age + 1} on their next birthday.`;
        }
        response += `\nI'll remind you ${event.reminderDays.join(' and ')} days before.`;

        return response;
      },
    });
  },
};

const getUpcomingBirthdaysDef: ToolDefinition = {
  id: 'getUpcomingBirthdays',
  name: 'Get Upcoming Birthdays',
  description: 'Show birthdays coming up in the next 30 days.',
  domain: 'social-events',
  tags: ['birthday', 'upcoming', 'reminder'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Show birthdays coming up in the next 30 days.',
      parameters: z.object({
        days: z.number().optional().describe('Days ahead to check (default: 30)'),
      }),
      execute: async (params: { days?: number }) => {
        const userId = ctx.userId;
        if (!userId) {
          return 'I need to know who you are to check birthdays.';
        }

        const events = getUserEvents(userId);
        const birthdays = events.filter((e) => e.eventType === 'birthday');

        if (birthdays.length === 0) {
          return (
            "You haven't saved any birthdays yet. " +
            'Add one with "remember [name]\'s birthday is [date]".'
          );
        }

        const daysAhead = params.days || 30;
        const today = new Date();
        const upcoming: Array<{ event: SocialEvent; daysUntil: number }> = [];

        for (const event of birthdays) {
          const [month, day] = event.date.split('-').map(Number);
          const thisYear = new Date(today.getFullYear(), month - 1, day);
          let nextBirthday = thisYear;

          if (thisYear < today) {
            nextBirthday = new Date(today.getFullYear() + 1, month - 1, day);
          }

          const daysUntil = Math.ceil(
            (nextBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (daysUntil <= daysAhead) {
            upcoming.push({ event, daysUntil });
          }
        }

        upcoming.sort((a, b) => a.daysUntil - b.daysUntil);

        if (upcoming.length === 0) {
          return `No birthdays in the next ${daysAhead} days.`;
        }

        let response = `🎂 **Upcoming Birthdays**\n\n`;
        for (const { event, daysUntil } of upcoming) {
          if (daysUntil === 0) {
            response += `🎉 **${event.contactName}** - TODAY!\n`;
          } else if (daysUntil === 1) {
            response += `⏰ **${event.contactName}** - Tomorrow\n`;
          } else {
            response += `📅 **${event.contactName}** - in ${daysUntil} days\n`;
          }
        }

        return response;
      },
    });
  },
};

const suggestGiftDef: ToolDefinition = {
  id: 'suggestGift',
  name: 'Suggest Gift',
  description: 'Get gift suggestions for someone based on their interests.',
  domain: 'social-events',
  tags: ['gift', 'suggest', 'birthday'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Get gift suggestions for someone based on their interests.',
      parameters: z.object({
        name: z.string().describe('Person to get gift suggestions for'),
        occasion: z
          .enum(['birthday', 'anniversary', 'holiday', 'other'])
          .optional()
          .describe('The occasion'),
        budget: z.number().optional().describe('Budget in dollars'),
      }),
      execute: async (params) => {
        const userId = ctx.userId;
        if (!userId) {
          return 'I need to know who you are to suggest gifts.';
        }

        const events = getUserEvents(userId);
        const event = events.find((e) =>
          e.contactName.toLowerCase().includes(params.name.toLowerCase())
        );

        // Generic gift suggestions (would use AI/profile in production)
        const suggestions = [
          'Experience gift (concert tickets, cooking class)',
          'Subscription box (their favorite hobby)',
          'Personalized item with their name/photo',
          'Gift card to their favorite store',
          'Book related to their interests',
          'Quality time together (dinner, activity)',
        ];

        let response = `🎁 **Gift Ideas for ${params.name}**\n\n`;

        if (event?.giftHistory.length) {
          response += `**Previous gifts:**\n`;
          for (const gift of event.giftHistory.slice(-3)) {
            response += `- ${gift.year}: ${gift.gift}\n`;
          }
          response += '\n';
        }

        response += `**Suggestions:**\n`;
        for (const suggestion of suggestions.slice(0, 5)) {
          response += `- ${suggestion}\n`;
        }

        if (params.budget) {
          response += `\nBudget: $${params.budget}`;
        }

        return response;
      },
    });
  },
};

const trackGiftDef: ToolDefinition = {
  id: 'trackGift',
  name: 'Track Gift',
  description: 'Record a gift you gave someone.',
  domain: 'social-events',
  tags: ['gift', 'track', 'history'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Record a gift you gave someone.',
      parameters: z.object({
        name: z.string().describe('Person you gave the gift to'),
        gift: z.string().describe('What you gave them'),
        notes: z.string().optional().describe('Any notes (did they like it?)'),
      }),
      execute: async (params) => {
        const userId = ctx.userId;
        if (!userId) {
          return 'I need to know who you are to track gifts.';
        }

        const events = getUserEvents(userId);
        const event = events.find((e) =>
          e.contactName.toLowerCase().includes(params.name.toLowerCase())
        );

        if (!event) {
          return (
            `I don't have ${params.name} in your contacts. ` +
            `Add their birthday first with "remember ${params.name}'s birthday".`
          );
        }

        event.giftHistory.push({
          year: new Date().getFullYear(),
          gift: params.gift,
          notes: params.notes,
        });

        saveUserEvents(userId, events);

        return (
          `✅ Recorded: You gave **${params.name}** "${params.gift}".\n` +
          `I'll remember this for future gift ideas.`
        );
      },
    });
  },
};

const setAnniversaryDef: ToolDefinition = {
  id: 'setAnniversary',
  name: 'Set Anniversary',
  description: 'Remember an anniversary date.',
  domain: 'social-events',
  tags: ['anniversary', 'reminder'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Remember an anniversary date.',
      parameters: z.object({
        description: z.string().describe('What anniversary (e.g., "wedding", "first date")'),
        date: z.string().describe('Anniversary date'),
        year: z.number().optional().describe('Starting year'),
      }),
      execute: async (params) => {
        const userId = ctx.userId;
        if (!userId) {
          return 'I need to know who you are to save anniversaries.';
        }

        const events = getUserEvents(userId);
        const now = new Date().toISOString();

        // Parse date
        let monthDay = params.date;
        if (params.date.includes(' ')) {
          const parsed = new Date(params.date + ', 2000');
          monthDay = `${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
        }

        const event: SocialEvent = {
          id: `event_${Date.now()}`,
          userId,
          contactName: params.description,
          eventType: 'anniversary',
          date: monthDay,
          year: params.year,
          reminderDays: [7, 1],
          giftHistory: [],
          createdAt: now,
        };

        events.push(event);
        saveUserEvents(userId, events);

        let response = `💕 Anniversary saved: **${params.description}** on ${params.date}`;
        if (params.year) {
          const years = new Date().getFullYear() - params.year;
          response += `\nNext anniversary will be #${years + 1}!`;
        }

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN EXPORT
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport('social-events', [
  setBirthdayDef,
  getUpcomingBirthdaysDef,
  suggestGiftDef,
  trackGiftDef,
  setAnniversaryDef,
]);
