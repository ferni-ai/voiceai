/**
 * Date/Time Utilities
 *
 * Date calculations: days until, date from now, age calculation.
 *
 * @module simple-utilities/date-tools
 */

import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';
import { recordUsage, generateInsight } from './pattern-intelligence.js';
import { loadLifeContext } from './context-integration.js';

const daysUntilDef: ToolDefinition = {
  id: 'daysUntil',
  name: 'Days Until',
  description: 'Calculate days until a date or event',
  domain: 'simple-utilities',
  tags: ['date', 'countdown', 'time', 'event'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Calculate how many days until a specific date or event. Use when someone asks:
- "How many days until Christmas?"
- "Days until my birthday on March 15"
- "When is Thanksgiving?"
- "How many sleeps until vacation?"`,
      parameters: z.object({
        targetDate: z.string().optional().describe('Target date (YYYY-MM-DD) if specific'),
        event: z
          .enum([
            'christmas',
            'new_years',
            'thanksgiving',
            'halloween',
            'valentines',
            'easter',
            'july_4th',
            'mothers_day',
            'fathers_day',
            'labor_day',
            'memorial_day',
            'custom',
          ])
          .describe('Named event or custom'),
        customMonth: z.number().optional().describe('Month (1-12) for custom date'),
        customDay: z.number().optional().describe('Day of month for custom date'),
      }),
      execute: async ({ targetDate, event, customMonth, customDay }) => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        let target: Date;
        let eventName = '';

        if (targetDate) {
          target = new Date(targetDate);
          eventName = 'that date';
        } else if (event === 'custom' && customMonth && customDay) {
          target = new Date(now.getFullYear(), customMonth - 1, customDay);
          if (target < now) {
            target.setFullYear(target.getFullYear() + 1);
          }
          eventName = `${target.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
        } else {
          // Calculate well-known holidays
          const year = now.getFullYear();
          const nextYear = year + 1;

          const holidays: Record<string, () => Date> = {
            christmas: () => {
              const d = new Date(year, 11, 25);
              return d < now ? new Date(nextYear, 11, 25) : d;
            },
            new_years: () => new Date(nextYear, 0, 1),
            halloween: () => {
              const d = new Date(year, 9, 31);
              return d < now ? new Date(nextYear, 9, 31) : d;
            },
            valentines: () => {
              const d = new Date(year, 1, 14);
              return d < now ? new Date(nextYear, 1, 14) : d;
            },
            july_4th: () => {
              const d = new Date(year, 6, 4);
              return d < now ? new Date(nextYear, 6, 4) : d;
            },
            thanksgiving: () => {
              // 4th Thursday of November
              const nov = new Date(year, 10, 1);
              const thursday = 1;
              while (nov.getDay() !== 4) {
                nov.setDate(nov.getDate() + 1);
              }
              const d = new Date(year, 10, nov.getDate() + 21);
              return d < now ? new Date(nextYear, 10, thursday + 21) : d;
            },
            easter: () => {
              // Simplified Easter calculation (Western)
              const a = year % 19;
              const b = Math.floor(year / 100);
              const c = year % 100;
              const d = Math.floor(b / 4);
              const e = b % 4;
              const f = Math.floor((b + 8) / 25);
              const g = Math.floor((b - f + 1) / 3);
              const h = (19 * a + b - d - g + 15) % 30;
              const i = Math.floor(c / 4);
              const k = c % 4;
              const l = (32 + 2 * e + 2 * i - h - k) % 7;
              const m = Math.floor((a + 11 * h + 22 * l) / 451);
              const month = Math.floor((h + l - 7 * m + 114) / 31);
              const day = ((h + l - 7 * m + 114) % 31) + 1;
              const easter = new Date(year, month - 1, day);
              return easter < now ? new Date(nextYear, month - 1, day) : easter;
            },
            mothers_day: () => {
              // 2nd Sunday of May
              const may = new Date(year, 4, 1);
              while (may.getDay() !== 0) may.setDate(may.getDate() + 1);
              const d = new Date(year, 4, may.getDate() + 7);
              return d < now ? new Date(nextYear, 4, may.getDate() + 7) : d;
            },
            fathers_day: () => {
              // 3rd Sunday of June
              const june = new Date(year, 5, 1);
              while (june.getDay() !== 0) june.setDate(june.getDate() + 1);
              const d = new Date(year, 5, june.getDate() + 14);
              return d < now ? new Date(nextYear, 5, june.getDate() + 14) : d;
            },
            labor_day: () => {
              // 1st Monday of September
              const sept = new Date(year, 8, 1);
              while (sept.getDay() !== 1) sept.setDate(sept.getDate() + 1);
              return sept < now ? new Date(nextYear, 8, sept.getDate()) : sept;
            },
            memorial_day: () => {
              // Last Monday of May
              const may = new Date(year, 4, 31);
              while (may.getDay() !== 1) may.setDate(may.getDate() - 1);
              return may < now ? new Date(nextYear, 4, may.getDate()) : may;
            },
          };

          const names: Record<string, string> = {
            christmas: 'Christmas',
            new_years: "New Year's Day",
            halloween: 'Halloween',
            valentines: "Valentine's Day",
            july_4th: 'July 4th',
            thanksgiving: 'Thanksgiving',
            easter: 'Easter',
            mothers_day: "Mother's Day",
            fathers_day: "Father's Day",
            labor_day: 'Labor Day',
            memorial_day: 'Memorial Day',
          };

          if (event && holidays[event]) {
            target = holidays[event]();
            eventName = names[event] || event;
          } else {
            return `I don't recognize that event. Try Christmas, Thanksgiving, Halloween, or give me a specific date.`;
          }
        }

        const diffTime = target.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const diffWeeks = Math.floor(diffDays / 7);
        const remainingDays = diffDays % 7;

        const dateStr = target.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: target.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
        });

        if (diffDays === 0) {
          return `🎉 **${eventName} is TODAY!** (${dateStr})`;
        } else if (diffDays === 1) {
          return `**${eventName} is TOMORROW!** (${dateStr})`;
        } else if (diffDays < 7) {
          return `**${diffDays} days** until ${eventName}\n${dateStr}`;
        } else {
          let response = `**${diffDays} days** (${diffWeeks} weeks`;
          if (remainingDays > 0) response += ` and ${remainingDays} days`;
          response += `) until ${eventName}\n${dateStr}`;
          return response;
        }
      },
    });
  },
};

const dateFromNowDef: ToolDefinition = {
  id: 'dateFromNow',
  name: 'Date From Now',
  description: 'Calculate a date in the future or past',
  domain: 'simple-utilities',
  tags: ['date', 'future', 'past', 'calculation'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Calculate what date will be X days/weeks/months from now. Use when someone asks:
- "What's 90 days from today?"
- "What day is 3 weeks from now?"
- "6 months from now"
- "2 weeks ago was what date?"`,
      parameters: z.object({
        amount: z.number().describe('Number of units'),
        unit: z.enum(['days', 'weeks', 'months', 'years']).describe('Time unit'),
        direction: z.enum(['from_now', 'ago']).default('from_now').describe('Future or past'),
      }),
      execute: async ({ amount, unit, direction }) => {
        const now = new Date();
        const target = new Date(now);

        const multiplier = direction === 'ago' ? -1 : 1;

        switch (unit) {
          case 'days':
            target.setDate(target.getDate() + amount * multiplier);
            break;
          case 'weeks':
            target.setDate(target.getDate() + amount * 7 * multiplier);
            break;
          case 'months':
            target.setMonth(target.getMonth() + amount * multiplier);
            break;
          case 'years':
            target.setFullYear(target.getFullYear() + amount * multiplier);
            break;
        }

        const dateStr = target.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        });

        const directionWord = direction === 'ago' ? 'ago' : 'from now';
        return `${amount} ${unit} ${directionWord} is **${dateStr}**`;
      },
    });
  },
};

const calculateAgeDef: ToolDefinition = {
  id: 'calculateAge',
  name: 'Calculate Age',
  description: 'Calculate age from birthdate',
  domain: 'simple-utilities',
  tags: ['age', 'birthday', 'date', 'years'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Calculate age from a birth year or date. Use when someone asks:
- "How old am I if I was born in 1987?"
- "What's my age if my birthday is March 15, 1990?"
- "Someone born in 2005 is how old?"`,
      parameters: z.object({
        birthYear: z.number().optional().describe('Birth year'),
        birthMonth: z.number().optional().describe('Birth month (1-12)'),
        birthDay: z.number().optional().describe('Birth day'),
      }),
      execute: async ({ birthYear, birthMonth, birthDay }) => {
        const now = new Date();
        const currentYear = now.getFullYear();

        if (!birthYear) {
          return 'I need at least a birth year to calculate age.';
        }

        // Simple age calculation with just year
        if (!birthMonth) {
          const age = currentYear - birthYear;
          const _willTurn = age;
          return `Someone born in ${birthYear} is **${age - 1} or ${age} years old** (depending on whether their birthday has passed this year).`;
        }

        // Precise calculation with full date
        const birthDate = new Date(birthYear, (birthMonth || 1) - 1, birthDay || 1);
        let age = currentYear - birthYear;

        // Check if birthday has occurred this year
        const birthdayThisYear = new Date(currentYear, birthDate.getMonth(), birthDate.getDate());
        if (now < birthdayThisYear) {
          age--;
        }

        // Days until next birthday
        let nextBirthday = new Date(currentYear, birthDate.getMonth(), birthDate.getDate());
        if (nextBirthday <= now) {
          nextBirthday = new Date(currentYear + 1, birthDate.getMonth(), birthDate.getDate());
        }
        const daysUntil = Math.ceil(
          (nextBirthday.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        let response = `Age: **${age} years old**`;
        if (daysUntil === 0) {
          response += `\n🎂 **Happy Birthday!**`;
        } else if (daysUntil === 1) {
          response += `\n🎂 Birthday is tomorrow!`;
        } else if (daysUntil <= 30) {
          response += `\n🎂 ${daysUntil} days until birthday!`;
        }

        return response;
      },
    });
  },
};


// ============================================================================
// EXPORTS
// ============================================================================

export const dateToolDefinitions: ToolDefinition[] = [
  daysUntilDef,
  dateFromNowDef,
  calculateAgeDef,
];

export {
  daysUntilDef,
  dateFromNowDef,
  calculateAgeDef,
};
