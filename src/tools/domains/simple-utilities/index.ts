/**
 * Simple Utilities Domain Tools
 *
 * The everyday helper tools that make Ferni feel like a real friend.
 *
 * BETTER THAN SIRI: Siri is transactional - answer and forget.
 * BETTER THAN HUMAN: We catch patterns humans miss, follow up, anticipate.
 *
 * KEY DIFFERENTIATORS:
 * 1. PATTERN RECOGNITION - "You always set a 5-min timer around 3pm"
 * 2. PROACTIVE WISDOM - After low tip: "That's 12% - fine if service was rough"
 * 3. ANTICIPATORY HELP - "Want your usual 5-minute tea timer?"
 * 4. CONNECTED DOTS - Links timezone checks to travel planning
 * 5. FOLLOW-THROUGH - "Timer done! How did it turn out?"
 * 6. SMALL CELEBRATIONS - "That's 100 days until your trip!"
 *
 * DOMAIN: simple-utilities
 * TOOLS:
 *   Quick Math: calculateTip, splitBill, calculatePercentage, quickMath
 *   Unit Conversions: convertUnits, convertTemperature
 *   Date/Time: daysUntil, dateFromNow, calculateAge, howLongAgo
 *   Timezones: timeInCity, bestTimeToCall
 *   Random/Decisions: flipCoin, rollDice, pickRandom, helpMeDecide
 *   Timer: setTimer, cancelTimer
 *   Quick Notes: quickNote, recallNote, clearNotes
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';

// Pattern Intelligence - makes us "better than human"
import {
  recordUsage,
  generateInsight,
  getUserPatterns,
  getTimerFollowUp,
  getProactiveSuggestions,
} from './pattern-intelligence.js';

// Voice Callbacks - speak to user, don't just log
import { onTimerComplete, speakDuration } from './voice-callbacks.js';

// Context Integration - connect to what we know about them
import {
  loadLifeContext,
  enrichCountdownWithContext,
  enrichTimezoneWithContext,
  enrichTimerWithContext,
} from './context-integration.js';

// Persistence - remember across sessions
import {
  updateTimerPreferences,
  updateTipPreferences,
  updateTimezonePreferences,
  trackCountdown,
  loadPatternsFromFirestore,
} from './persistence.js';

// Proactive Hooks - anticipate needs
import { getProactiveOpener } from './proactive-hooks.js';

// ============================================================================
// IN-MEMORY STORES (per-session)
// ============================================================================

// Active timers by user
const activeTimers = new Map<string, { timeout: NodeJS.Timeout; label: string; endTime: Date }>();

// Quick notes by user (transient, session-only)
const quickNotes = new Map<string, Array<{ note: string; createdAt: Date }>>();

// ============================================================================
// QUICK MATH TOOLS
// ============================================================================

const calculateTipDef: ToolDefinition = {
  id: 'calculateTip',
  name: 'Calculate Tip',
  description: 'Calculate tip amount and total bill',
  domain: 'simple-utilities',
  tags: ['math', 'tip', 'restaurant', 'money'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Calculate the tip on a bill. Use when someone asks:
- "What's 20% tip on $47?"
- "How much should I tip on $85?"
- "Calculate the tip for dinner"`,
      parameters: z.object({
        billAmount: z.number().describe('The bill amount in dollars'),
        tipPercent: z.number().default(20).describe('Tip percentage (default 20%)'),
        splitWays: z.number().optional().describe('If splitting, how many people'),
      }),
      execute: async ({ billAmount, tipPercent, splitWays }, { ctx: toolCtx }) => {
        const userData = toolCtx.userData as { userId?: string };
        const userId = userData?.userId || 'session';

        // Record usage for pattern learning
        recordUsage(userId, 'calculateTip', { billAmount, tipPercent, splitWays });

        const tip = billAmount * (tipPercent / 100);
        const total = billAmount + tip;

        let response = `On $${billAmount.toFixed(2)}:\n`;
        response += `• ${tipPercent}% tip = $${tip.toFixed(2)}\n`;
        response += `• Total = $${total.toFixed(2)}`;

        if (splitWays && splitWays > 1) {
          const perPerson = total / splitWays;
          response += `\n• Split ${splitWays} ways = $${perPerson.toFixed(2)} each`;
        }

        // Add quick reference for other percentages
        if (tipPercent === 20) {
          const tip15 = billAmount * 0.15;
          const tip25 = billAmount * 0.25;
          response += `\n\n(Quick ref: 15% = $${tip15.toFixed(2)}, 25% = $${tip25.toFixed(2)})`;
        }

        // Apply pattern intelligence - notice patterns, add wisdom
        const insight = generateInsight(
          userId,
          'calculateTip',
          { billAmount, tipPercent },
          response
        );
        let finalResponse = insight.response;
        if (insight.followUp) {
          finalResponse += `\n\n${insight.followUp}`;
        }

        // Persist tip preference for cross-session learning
        updateTipPreferences(userId, tipPercent).catch((err) =>
          getLogger().debug({ err }, 'Failed to persist tip preference')
        );

        return finalResponse;
      },
    });
  },
};

const splitBillDef: ToolDefinition = {
  id: 'splitBill',
  name: 'Split Bill',
  description: 'Split a bill evenly between people',
  domain: 'simple-utilities',
  tags: ['math', 'split', 'money', 'group'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Split a bill between multiple people. Use when someone asks:
- "Split $150 four ways"
- "How much do we each owe if the bill is $87?"
- "Divide this bill between 3 people"`,
      parameters: z.object({
        totalAmount: z.number().describe('Total bill amount'),
        numberOfPeople: z.number().min(2).describe('Number of people splitting'),
        includeTip: z.boolean().default(true).describe('Add tip before splitting'),
        tipPercent: z.number().default(20).describe('Tip percentage if including tip'),
      }),
      execute: async ({ totalAmount, numberOfPeople, includeTip, tipPercent }) => {
        let finalTotal = totalAmount;
        let response = '';

        if (includeTip) {
          const tip = totalAmount * (tipPercent / 100);
          finalTotal = totalAmount + tip;
          response = `Bill: $${totalAmount.toFixed(2)} + ${tipPercent}% tip ($${tip.toFixed(2)}) = $${finalTotal.toFixed(2)}\n\n`;
        } else {
          response = `Total: $${totalAmount.toFixed(2)}\n\n`;
        }

        const perPerson = finalTotal / numberOfPeople;
        response += `**Split ${numberOfPeople} ways: $${perPerson.toFixed(2)} each**`;

        // Handle uneven splits
        const rounded = Math.ceil(perPerson * 100) / 100;
        const totalCollected = rounded * numberOfPeople;
        if (totalCollected !== finalTotal) {
          response += `\n\n(If everyone pays $${rounded.toFixed(2)}, you'll collect $${totalCollected.toFixed(2)} — ${totalCollected > finalTotal ? 'extra covers rounding' : 'close enough'})`;
        }

        return response;
      },
    });
  },
};

const calculatePercentageDef: ToolDefinition = {
  id: 'calculatePercentage',
  name: 'Calculate Percentage',
  description: 'Quick percentage calculations',
  domain: 'simple-utilities',
  tags: ['math', 'percentage', 'calculation'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Calculate percentages. Use when someone asks:
- "What's 15% of 240?"
- "What percentage is 30 of 120?"
- "Increase 50 by 20%"
- "Decrease 80 by 25%"`,
      parameters: z.object({
        operation: z
          .enum(['of', 'is_what_percent', 'increase', 'decrease'])
          .describe('What type of calculation'),
        value: z.number().describe('The main value'),
        percent: z.number().optional().describe('The percentage (for of/increase/decrease)'),
        partValue: z.number().optional().describe('The part value (for is_what_percent)'),
      }),
      execute: async ({ operation, value, percent, partValue }) => {
        switch (operation) {
          case 'of': {
            const result = value * ((percent || 0) / 100);
            return `${percent}% of ${value} = **${result.toFixed(2)}**`;
          }
          case 'is_what_percent': {
            const percentage = ((partValue || 0) / value) * 100;
            return `${partValue} is **${percentage.toFixed(1)}%** of ${value}`;
          }
          case 'increase': {
            const increase = value * ((percent || 0) / 100);
            const result = value + increase;
            return `${value} + ${percent}% = **${result.toFixed(2)}** (increased by ${increase.toFixed(2)})`;
          }
          case 'decrease': {
            const decrease = value * ((percent || 0) / 100);
            const result = value - decrease;
            return `${value} - ${percent}% = **${result.toFixed(2)}** (decreased by ${decrease.toFixed(2)})`;
          }
          default:
            return 'I can help with percentage calculations. Try "what is 15% of 200" or "what percent is 30 of 120"';
        }
      },
    });
  },
};

const quickMathDef: ToolDefinition = {
  id: 'quickMath',
  name: 'Quick Math',
  description: 'Simple arithmetic calculations',
  domain: 'simple-utilities',
  tags: ['math', 'calculator', 'arithmetic'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Do quick math calculations. Use for:
- Basic arithmetic: "What's 247 + 183?"
- Multiplication: "12 times 15"
- Division: "Split 847 by 12"`,
      parameters: z.object({
        expression: z.string().describe('The math expression to calculate'),
      }),
      execute: async ({ expression }) => {
        try {
          // Clean up the expression
          const cleaned = expression
            .toLowerCase()
            .replace(/what's|what is|calculate|equals/gi, '')
            .replace(/times|x|×/gi, '*')
            .replace(/divided by|÷/gi, '/')
            .replace(/plus/gi, '+')
            .replace(/minus/gi, '-')
            .replace(/[^0-9+\-*/().]/g, '')
            .trim();

          // Safe evaluation using Function constructor (no eval)
          const result = new Function(`return ${cleaned}`)();

          if (typeof result !== 'number' || !isFinite(result)) {
            return `I couldn't calculate that. Could you rephrase the math problem?`;
          }

          // Format nicely
          const formatted = Number.isInteger(result) ? result.toString() : result.toFixed(2);

          return `${expression} = **${formatted}**`;
        } catch {
          return `I had trouble with that calculation. Could you give me the numbers more clearly?`;
        }
      },
    });
  },
};

// ============================================================================
// UNIT CONVERSION TOOLS
// ============================================================================

const convertUnitsDef: ToolDefinition = {
  id: 'convertUnits',
  name: 'Convert Units',
  description: 'Convert between common units of measurement',
  domain: 'simple-utilities',
  tags: ['conversion', 'units', 'measurement', 'cooking'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Convert between units. Use when someone asks:
- "How many cups is 500ml?"
- "Convert 5 miles to kilometers"
- "How many grams in 8 ounces?"
- "What's 2 tablespoons in teaspoons?"`,
      parameters: z.object({
        value: z.number().describe('The value to convert'),
        fromUnit: z.string().describe('The unit to convert from'),
        toUnit: z.string().describe('The unit to convert to'),
      }),
      execute: async ({ value, fromUnit, toUnit }) => {
        const from = fromUnit.toLowerCase().replace(/s$/, ''); // Normalize plurals
        const to = toUnit.toLowerCase().replace(/s$/, '');

        // Conversion factors to base units
        const conversions: Record<string, Record<string, number>> = {
          // Volume (base: ml)
          volume: {
            ml: 1,
            milliliter: 1,
            l: 1000,
            liter: 1000,
            cup: 236.588,
            tbsp: 14.787,
            tablespoon: 14.787,
            tsp: 4.929,
            teaspoon: 4.929,
            'fl oz': 29.574,
            'fluid ounce': 29.574,
            pint: 473.176,
            quart: 946.353,
            gallon: 3785.41,
          },
          // Weight (base: gram)
          weight: {
            g: 1,
            gram: 1,
            kg: 1000,
            kilogram: 1000,
            oz: 28.3495,
            ounce: 28.3495,
            lb: 453.592,
            pound: 453.592,
            mg: 0.001,
            milligram: 0.001,
          },
          // Length (base: meter)
          length: {
            m: 1,
            meter: 1,
            km: 1000,
            kilometer: 1000,
            cm: 0.01,
            centimeter: 0.01,
            mm: 0.001,
            millimeter: 0.001,
            mi: 1609.34,
            mile: 1609.34,
            ft: 0.3048,
            foot: 0.3048,
            feet: 0.3048,
            in: 0.0254,
            inch: 0.0254,
            yd: 0.9144,
            yard: 0.9144,
          },
        };

        // Find which category the units belong to
        for (const [category, units] of Object.entries(conversions)) {
          if (from in units && to in units) {
            const baseValue = value * units[from];
            const result = baseValue / units[to];

            // Format result nicely
            const formatted =
              result < 0.01 || result > 10000
                ? result.toExponential(2)
                : result.toFixed(result < 1 ? 3 : 2).replace(/\.?0+$/, '');

            return `${value} ${fromUnit} = **${formatted} ${toUnit}**`;
          }
        }

        return `I don't know how to convert ${fromUnit} to ${toUnit}. I can help with volume (cups, ml, liters), weight (oz, grams, pounds), and length (miles, km, feet).`;
      },
    });
  },
};

const convertTemperatureDef: ToolDefinition = {
  id: 'convertTemperature',
  name: 'Convert Temperature',
  description: 'Convert between Fahrenheit and Celsius',
  domain: 'simple-utilities',
  tags: ['conversion', 'temperature', 'weather'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Convert temperatures between Fahrenheit and Celsius. Use when someone asks:
- "What's 72°F in Celsius?"
- "Convert 25C to Fahrenheit"
- "Is 38C a fever?"`,
      parameters: z.object({
        temperature: z.number().describe('The temperature value'),
        fromScale: z
          .enum(['F', 'C', 'fahrenheit', 'celsius'])
          .describe('The scale to convert from'),
      }),
      execute: async ({ temperature, fromScale }) => {
        const isFahrenheit = fromScale.toLowerCase().startsWith('f');

        if (isFahrenheit) {
          const celsius = ((temperature - 32) * 5) / 9;
          let context = '';

          // Add contextual info
          if (temperature < 32) context = ' (below freezing)';
          else if (temperature >= 68 && temperature <= 72) context = ' (room temperature)';
          else if (temperature >= 98 && temperature <= 99) context = ' (normal body temp)';
          else if (temperature >= 100) context = ' (fever range)';
          else if (temperature >= 90) context = ' (hot day)';

          return `${temperature}°F = **${celsius.toFixed(1)}°C**${context}`;
        } else {
          const fahrenheit = (temperature * 9) / 5 + 32;
          let context = '';

          // Add contextual info
          if (temperature < 0) context = ' (below freezing)';
          else if (temperature >= 20 && temperature <= 22) context = ' (room temperature)';
          else if (temperature >= 36.5 && temperature <= 37.5) context = ' (normal body temp)';
          else if (temperature >= 38) context = ' (fever range)';
          else if (temperature >= 32) context = ' (hot day)';

          return `${temperature}°C = **${fahrenheit.toFixed(1)}°F**${context}`;
        }
      },
    });
  },
};

// ============================================================================
// DATE/TIME MATH TOOLS
// ============================================================================

const daysUntilDef: ToolDefinition = {
  id: 'daysUntil',
  name: 'Days Until',
  description: 'Calculate days until a date or event',
  domain: 'simple-utilities',
  tags: ['date', 'countdown', 'time', 'event'],

  create: (ctx: ToolContext): Tool => {
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

  create: (ctx: ToolContext): Tool => {
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

  create: (ctx: ToolContext): Tool => {
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
          const willTurn = age;
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
// TIMEZONE TOOLS
// ============================================================================

const timeInCityDef: ToolDefinition = {
  id: 'timeInCity',
  name: 'Time in City',
  description: 'Get the current time in any city',
  domain: 'simple-utilities',
  tags: ['timezone', 'time', 'city', 'world'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Get the current time in a city. Use when someone asks:
- "What time is it in Tokyo?"
- "Time in London right now"
- "What's the time in Sydney?"`,
      parameters: z.object({
        city: z.string().describe('City name'),
      }),
      execute: async ({ city }, { ctx: toolCtx }) => {
        // Map common cities to IANA timezone names
        const cityTimezones: Record<string, string> = {
          // Americas
          'new york': 'America/New_York',
          nyc: 'America/New_York',
          'los angeles': 'America/Los_Angeles',
          la: 'America/Los_Angeles',
          chicago: 'America/Chicago',
          denver: 'America/Denver',
          phoenix: 'America/Phoenix',
          seattle: 'America/Los_Angeles',
          miami: 'America/New_York',
          boston: 'America/New_York',
          philadelphia: 'America/New_York',
          houston: 'America/Chicago',
          dallas: 'America/Chicago',
          'san francisco': 'America/Los_Angeles',
          sf: 'America/Los_Angeles',
          toronto: 'America/Toronto',
          vancouver: 'America/Vancouver',
          'mexico city': 'America/Mexico_City',
          'são paulo': 'America/Sao_Paulo',
          'sao paulo': 'America/Sao_Paulo',
          'buenos aires': 'America/Argentina/Buenos_Aires',
          // Europe
          london: 'Europe/London',
          paris: 'Europe/Paris',
          berlin: 'Europe/Berlin',
          rome: 'Europe/Rome',
          madrid: 'Europe/Madrid',
          amsterdam: 'Europe/Amsterdam',
          moscow: 'Europe/Moscow',
          istanbul: 'Europe/Istanbul',
          dublin: 'Europe/Dublin',
          lisbon: 'Europe/Lisbon',
          // Asia
          tokyo: 'Asia/Tokyo',
          beijing: 'Asia/Shanghai',
          shanghai: 'Asia/Shanghai',
          'hong kong': 'Asia/Hong_Kong',
          singapore: 'Asia/Singapore',
          seoul: 'Asia/Seoul',
          bangkok: 'Asia/Bangkok',
          dubai: 'Asia/Dubai',
          mumbai: 'Asia/Kolkata',
          delhi: 'Asia/Kolkata',
          jakarta: 'Asia/Jakarta',
          manila: 'Asia/Manila',
          taipei: 'Asia/Taipei',
          // Oceania
          sydney: 'Australia/Sydney',
          melbourne: 'Australia/Melbourne',
          brisbane: 'Australia/Brisbane',
          perth: 'Australia/Perth',
          auckland: 'Pacific/Auckland',
          // Africa
          cairo: 'Africa/Cairo',
          johannesburg: 'Africa/Johannesburg',
          lagos: 'Africa/Lagos',
          nairobi: 'Africa/Nairobi',
        };

        const cityLower = city.toLowerCase().trim();
        const timezone = cityTimezones[cityLower];

        if (!timezone) {
          return `I don't have the timezone for "${city}" in my quick lookup. Try a major city like Tokyo, London, or New York.`;
        }

        const userData = toolCtx.userData as { userId?: string };
        const userId = userData?.userId || 'session';

        // Record usage for pattern learning
        recordUsage(userId, 'timeInCity', { city: cityLower });

        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          weekday: 'long',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
        const dateFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          month: 'short',
          day: 'numeric',
        });

        const time = formatter.format(now);
        const date = dateFormatter.format(now);

        // Calculate offset from user's local time
        const localHour = now.getHours();
        const remoteTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
        const remoteHour = remoteTime.getHours();
        let hourDiff = remoteHour - localHour;
        if (hourDiff > 12) hourDiff -= 24;
        if (hourDiff < -12) hourDiff += 24;

        const diffStr =
          hourDiff === 0
            ? 'same time as you'
            : hourDiff > 0
              ? `${hourDiff} hours ahead`
              : `${Math.abs(hourDiff)} hours behind`;

        let response = `🌍 **${city}**: ${time}, ${date}\n(${diffStr})`;

        // Apply pattern intelligence - notice travel planning patterns
        const insight = generateInsight(userId, 'timeInCity', { city: cityLower }, response);
        if (insight.followUp) {
          response += `\n\n${insight.followUp}`;
        }

        // Try to enrich with life context (travel plans, people we know there)
        try {
          const lifeContext = await loadLifeContext(userId);
          const contextEnrichment = enrichTimezoneWithContext(cityLower, lifeContext);
          if (contextEnrichment) {
            response += `\n\n_${contextEnrichment}_`;
          }
        } catch {
          // Context not available, that's fine
        }

        // Persist timezone preference for cross-session learning
        updateTimezonePreferences(userId, cityLower).catch((err) =>
          getLogger().debug({ err }, 'Failed to persist timezone preference')
        );

        return response;
      },
    });
  },
};

const bestTimeToCallDef: ToolDefinition = {
  id: 'bestTimeToCall',
  name: 'Best Time to Call',
  description: 'Find a good time to call someone in another timezone',
  domain: 'simple-utilities',
  tags: ['timezone', 'call', 'schedule', 'international'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Find a good time to call someone in another timezone. Use when someone asks:
- "When should I call someone in Tokyo?"
- "Best time to video chat with London?"
- "If I call at 9am, what time is it in Sydney?"`,
      parameters: z.object({
        theirCity: z.string().describe('City where the other person is'),
        yourTime: z.string().optional().describe('Your proposed time (e.g., "9am")'),
      }),
      execute: async ({ theirCity, yourTime }) => {
        // Same city mapping as timeInCity
        const cityTimezones: Record<string, string> = {
          tokyo: 'Asia/Tokyo',
          london: 'Europe/London',
          sydney: 'Australia/Sydney',
          'new york': 'America/New_York',
          'los angeles': 'America/Los_Angeles',
          paris: 'Europe/Paris',
          berlin: 'Europe/Berlin',
          dubai: 'Asia/Dubai',
          singapore: 'Asia/Singapore',
          beijing: 'Asia/Shanghai',
          mumbai: 'Asia/Kolkata',
          toronto: 'America/Toronto',
        };

        const cityLower = theirCity.toLowerCase().trim();
        const timezone = cityTimezones[cityLower];

        if (!timezone) {
          return `I don't have timezone info for "${theirCity}". Try Tokyo, London, Sydney, or other major cities.`;
        }

        // If specific time provided, calculate what it would be there
        if (yourTime) {
          const match = yourTime.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
          if (match) {
            let hour = parseInt(match[1]);
            const minutes = match[2] ? parseInt(match[2]) : 0;
            const period = match[3]?.toLowerCase();

            if (period === 'pm' && hour !== 12) hour += 12;
            if (period === 'am' && hour === 12) hour = 0;

            const yourDateTime = new Date();
            yourDateTime.setHours(hour, minutes, 0, 0);

            const theirFormatter = new Intl.DateTimeFormat('en-US', {
              timeZone: timezone,
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            });

            const theirTime = theirFormatter.format(yourDateTime);
            const theirHour = new Date(
              yourDateTime.toLocaleString('en-US', { timeZone: timezone })
            ).getHours();

            let assessment = '';
            if (theirHour >= 9 && theirHour <= 17) {
              assessment = '✅ Good time - business hours';
            } else if (theirHour >= 7 && theirHour <= 21) {
              assessment = '⚠️ Okay - early/late but reasonable';
            } else if (theirHour >= 22 || theirHour <= 6) {
              assessment = '❌ Not great - likely sleeping';
            }

            return `If you call at ${yourTime}, it'll be **${theirTime}** in ${theirCity}.\n${assessment}`;
          }
        }

        // Find overlapping reasonable hours (9am-9pm both sides)
        const suggestions: string[] = [];

        // Quick calculation of current offset
        const now = new Date();
        const theirNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
        const hourDiff = theirNow.getHours() - now.getHours();

        // Find good overlap times
        for (let yourHour = 8; yourHour <= 20; yourHour++) {
          const theirHour = (yourHour + hourDiff + 24) % 24;
          if (theirHour >= 9 && theirHour <= 21) {
            const yourTimeStr =
              yourHour <= 12 ? `${yourHour}${yourHour < 12 ? 'am' : 'pm'}` : `${yourHour - 12}pm`;
            const theirTimeStr =
              theirHour <= 12
                ? `${theirHour}${theirHour < 12 ? 'am' : 'pm'}`
                : `${theirHour - 12}pm`;
            suggestions.push(`${yourTimeStr} (${theirTimeStr} their time)`);
          }
        }

        if (suggestions.length === 0) {
          return `Tough timezone difference! There's minimal overlap during reasonable hours with ${theirCity}. You might need to schedule early morning or late evening.`;
        }

        return `Best times to call ${theirCity}:\n${suggestions
          .slice(0, 5)
          .map((s) => `• ${s}`)
          .join('\n')}`;
      },
    });
  },
};

// ============================================================================
// RANDOM/DECISION TOOLS
// ============================================================================

const flipCoinDef: ToolDefinition = {
  id: 'flipCoin',
  name: 'Flip Coin',
  description: 'Flip a coin for a random heads/tails',
  domain: 'simple-utilities',
  tags: ['random', 'coin', 'decision', 'chance'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Flip a coin for a random result. Use when someone asks:
- "Flip a coin"
- "Heads or tails?"
- "Coin toss"`,
      parameters: z.object({
        headsOption: z.string().optional().describe('What heads means'),
        tailsOption: z.string().optional().describe('What tails means'),
      }),
      execute: async ({ headsOption, tailsOption }, { ctx: toolCtx }) => {
        const userData = toolCtx.userData as { userId?: string };
        const userId = userData?.userId || 'session';

        // Record usage for pattern learning
        recordUsage(userId, 'flipCoin', { headsOption, tailsOption });

        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        const emoji = '🪙';

        let response: string;
        if (headsOption && tailsOption) {
          const choice = result === 'heads' ? headsOption : tailsOption;
          response = `${emoji} **${result.toUpperCase()}!**\n\nThat means: **${choice}**`;
        } else {
          response = `${emoji} **${result.toUpperCase()}!**`;
        }

        // Apply pattern intelligence - notice decision-making patterns
        const insight = generateInsight(userId, 'flipCoin', { headsOption, tailsOption }, response);
        if (insight.followUp) {
          response += `\n\n${insight.followUp}`;
        }

        return response;
      },
    });
  },
};

const rollDiceDef: ToolDefinition = {
  id: 'rollDice',
  name: 'Roll Dice',
  description: 'Roll dice for random numbers',
  domain: 'simple-utilities',
  tags: ['random', 'dice', 'game', 'number'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Roll dice for random numbers. Use when someone asks:
- "Roll a dice"
- "Roll 2d6" (D&D notation)
- "Give me a random number 1-20"`,
      parameters: z.object({
        numberOfDice: z.number().default(1).describe('How many dice to roll'),
        sides: z.number().default(6).describe('Number of sides (default 6)'),
      }),
      execute: async ({ numberOfDice, sides }) => {
        const rolls: number[] = [];
        for (let i = 0; i < numberOfDice; i++) {
          rolls.push(Math.floor(Math.random() * sides) + 1);
        }

        const total = rolls.reduce((a, b) => a + b, 0);

        if (numberOfDice === 1) {
          const diceEmoji = sides === 6 ? ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][rolls[0] - 1] : '🎲';
          return `${diceEmoji} **${rolls[0]}**`;
        }

        return `🎲 Rolled ${numberOfDice}d${sides}: [${rolls.join(', ')}]\n**Total: ${total}**`;
      },
    });
  },
};

const pickRandomDef: ToolDefinition = {
  id: 'pickRandom',
  name: 'Pick Random',
  description: 'Pick randomly from a list of options',
  domain: 'simple-utilities',
  tags: ['random', 'pick', 'choice', 'decision'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Pick randomly from options. Use when someone asks:
- "Pick a number between 1 and 10"
- "Choose between pizza, tacos, or sushi"
- "Random selection from these options"`,
      parameters: z.object({
        options: z.array(z.string()).optional().describe('List of options to pick from'),
        min: z.number().optional().describe('Minimum number (for number range)'),
        max: z.number().optional().describe('Maximum number (for number range)'),
      }),
      execute: async ({ options, min, max }) => {
        if (options && options.length > 0) {
          const pick = options[Math.floor(Math.random() * options.length)];
          return `🎯 **${pick}**\n\n(picked from: ${options.join(', ')})`;
        }

        if (min !== undefined && max !== undefined) {
          const number = Math.floor(Math.random() * (max - min + 1)) + min;
          return `🎯 **${number}** (between ${min} and ${max})`;
        }

        return 'Give me some options to pick from, or a number range!';
      },
    });
  },
};

const helpMeDecideDef: ToolDefinition = {
  id: 'helpMeDecide',
  name: 'Help Me Decide',
  description: 'Help make a decision with weighted pros/cons',
  domain: 'simple-utilities',
  tags: ['decision', 'choice', 'help', 'thinking'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Help with decisions beyond random chance. Use when someone needs to think through a choice:
- "Help me decide between A and B"
- "Should I go with option 1 or 2?"`,
      parameters: z.object({
        options: z.array(z.string()).min(2).describe('The options to choose between'),
        context: z.string().optional().describe('Any context about the decision'),
      }),
      execute: async ({ options, context }) => {
        // For simple 50/50, add some thoughtful randomness
        if (options.length === 2) {
          const random = Math.random();

          // 60% chance of giving a clear recommendation
          // 40% chance of reflecting it back
          if (random < 0.6) {
            const pick = options[Math.floor(Math.random() * 2)];
            return (
              `My gut says: **${pick}**\n\n` +
              `But here's a thought: which one made you feel something when I said it? That reaction tells you something.${
                context ? `\n\nConsidering ${context}, lean into that feeling.` : ''
              }`
            );
          } else {
            return (
              `Both sound valid! Quick exercise:\n\n` +
              `• Imagine you picked **${options[0]}**. How does that feel?\n` +
              `• Now imagine **${options[1]}**. Better or worse?\n\n` +
              `Your gut reaction often knows. What came up?`
            );
          }
        }

        // For more options, pick one but invite reflection
        const pick = options[Math.floor(Math.random() * options.length)];
        return (
          `From these options, I'd try **${pick}** first.\n\n` +
          `But if that doesn't feel right, which one did you secretly hope I'd pick? That's your answer.`
        );
      },
    });
  },
};

// ============================================================================
// TIMER TOOLS
// ============================================================================

const setTimerDef: ToolDefinition = {
  id: 'setTimer',
  name: 'Set Timer',
  description: 'Set a simple countdown timer',
  domain: 'simple-utilities',
  tags: ['timer', 'countdown', 'alarm', 'reminder'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Set a simple timer. Use when someone asks:
- "Set a timer for 5 minutes"
- "Timer for 30 seconds"
- "Remind me in 10 minutes"`,
      parameters: z.object({
        minutes: z.number().optional().describe('Minutes for the timer'),
        seconds: z.number().optional().describe('Seconds for the timer'),
        label: z.string().optional().describe('What the timer is for'),
      }),
      execute: async ({ minutes = 0, seconds = 0, label }, { ctx: toolCtx }) => {
        const totalMs = (minutes * 60 + seconds) * 1000;

        if (totalMs <= 0) {
          return 'I need a time for the timer. Try "5 minutes" or "30 seconds".';
        }

        if (totalMs > 60 * 60 * 1000) {
          return "For times over an hour, I'd recommend setting an actual reminder instead. Want me to do that?";
        }

        const userData = toolCtx.userData as { userId?: string };
        const userId = userData?.userId || 'session';

        // Record usage for pattern learning
        recordUsage(userId, 'setTimer', { minutes, seconds, label });

        // Clear any existing timer for this user
        const existing = activeTimers.get(userId);
        if (existing) {
          clearTimeout(existing.timeout);
        }

        const endTime = new Date(Date.now() + totalMs);
        const timerLabel = label || 'Timer';

        // Set the timer with voice callback when complete
        const timeout = setTimeout(() => {
          activeTimers.delete(userId);

          // Trigger voice callback - actually speaks to user!
          void onTimerComplete(userId, timerLabel, minutes + seconds / 60).then(() => {
            // Get personalized follow-up message for logging
            const followUpMsg = getTimerFollowUp(userId);
            getLogger().info(
              { userId, label: timerLabel, followUp: followUpMsg },
              '⏰ Timer finished!'
            );
          });
        }, totalMs);

        // Persist timer preference for cross-session learning
        const hour = new Date().getHours();
        const timeOfDay =
          hour >= 5 && hour < 12
            ? 'morning'
            : hour >= 12 && hour < 17
              ? 'afternoon'
              : hour >= 17 && hour < 21
                ? 'evening'
                : 'night';

        updateTimerPreferences(userId, {
          minutes: minutes + seconds / 60,
          label: label,
          timeOfDay,
        }).catch((err) => getLogger().debug({ err }, 'Failed to persist timer preference'));

        activeTimers.set(userId, { timeout, label: timerLabel, endTime });

        // Check if this is their usual timer
        const patterns = getUserPatterns(userId);
        const usualTimer = patterns.patterns.commonTimerDurations.find(
          (d) => Math.abs(d.minutes - (minutes + seconds / 60)) < 0.5 && d.count >= 3
        );

        const timeStr =
          minutes > 0
            ? seconds > 0
              ? `${minutes} minute${minutes !== 1 ? 's' : ''} and ${seconds} second${seconds !== 1 ? 's' : ''}`
              : `${minutes} minute${minutes !== 1 ? 's' : ''}`
            : `${seconds} second${seconds !== 1 ? 's' : ''}`;

        // Personalize response based on patterns
        let response =
          usualTimer && usualTimer.label
            ? `⏱️ **Your ${usualTimer.label} timer set for ${timeStr}!**`
            : `⏱️ **Timer set for ${timeStr}!**${label ? `\n(${label})` : ''}`;

        response += `\n\nI'll check in when it's done!`;

        return response;
      },
    });
  },
};

const cancelTimerDef: ToolDefinition = {
  id: 'cancelTimer',
  name: 'Cancel Timer',
  description: 'Cancel an active timer',
  domain: 'simple-utilities',
  tags: ['timer', 'cancel', 'stop'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Cancel an active timer. Use when someone says:
- "Cancel the timer"
- "Stop the timer"
- "Never mind about the timer"`,
      parameters: z.object({}),
      execute: async (_, { ctx: toolCtx }) => {
        const userData = toolCtx.userData as { userId?: string };
        const userId = userData?.userId || 'session';

        const timer = activeTimers.get(userId);
        if (timer) {
          clearTimeout(timer.timeout);
          activeTimers.delete(userId);
          return `⏱️ Timer canceled (was set for ${timer.label})`;
        }

        return "You don't have an active timer running.";
      },
    });
  },
};

// ============================================================================
// QUICK NOTES TOOLS
// ============================================================================

const quickNoteDef: ToolDefinition = {
  id: 'quickNote',
  name: 'Quick Note',
  description: 'Save a quick transient note for this session',
  domain: 'simple-utilities',
  tags: ['note', 'remember', 'quick', 'temp'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Save a quick note for this session. Use when someone says:
- "Remember I parked in spot B4"
- "Note: meeting code is 12345"
- "Quick note: call John back"
These are temporary - not long-term memory.`,
      parameters: z.object({
        note: z.string().describe('The note to remember'),
      }),
      execute: async ({ note }, { ctx: toolCtx }) => {
        const userData = toolCtx.userData as { userId?: string };
        const userId = userData?.userId || 'session';

        if (!quickNotes.has(userId)) {
          quickNotes.set(userId, []);
        }

        const notes = quickNotes.get(userId)!;
        notes.push({ note, createdAt: new Date() });

        // Keep only last 10 notes
        if (notes.length > 10) {
          notes.shift();
        }

        return `📝 Got it: "${note}"`;
      },
    });
  },
};

const recallNoteDef: ToolDefinition = {
  id: 'recallNote',
  name: 'Recall Note',
  description: 'Recall quick notes from this session',
  domain: 'simple-utilities',
  tags: ['note', 'recall', 'remember'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Recall quick notes from this session. Use when someone asks:
- "What did I note about parking?"
- "What was that code?"
- "Show my notes"`,
      parameters: z.object({
        search: z.string().optional().describe('Search term to filter notes'),
      }),
      execute: async ({ search }, { ctx: toolCtx }) => {
        const userData = toolCtx.userData as { userId?: string };
        const userId = userData?.userId || 'session';

        const notes = quickNotes.get(userId) || [];

        if (notes.length === 0) {
          return "You haven't saved any quick notes this session.";
        }

        let filtered = notes;
        if (search) {
          const searchLower = search.toLowerCase();
          filtered = notes.filter((n) => n.note.toLowerCase().includes(searchLower));
        }

        if (filtered.length === 0) {
          return `No notes matching "${search}". Your notes: ${notes.map((n) => n.note).join(', ')}`;
        }

        if (filtered.length === 1) {
          return `📝 ${filtered[0].note}`;
        }

        return `📝 Your notes:\n${filtered.map((n, i) => `${i + 1}. ${n.note}`).join('\n')}`;
      },
    });
  },
};

const clearNotesDef: ToolDefinition = {
  id: 'clearNotes',
  name: 'Clear Notes',
  description: 'Clear all quick notes',
  domain: 'simple-utilities',
  tags: ['note', 'clear', 'delete'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Clear all quick notes from this session.',
      parameters: z.object({}),
      execute: async (_, { ctx: toolCtx }) => {
        const userData = toolCtx.userData as { userId?: string };
        const userId = userData?.userId || 'session';

        quickNotes.delete(userId);
        return '📝 All quick notes cleared.';
      },
    });
  },
};

// ============================================================================
// PROACTIVE / ANTICIPATORY TOOLS
// ============================================================================

const getUtilitySuggestionsDef: ToolDefinition = {
  id: 'getUtilitySuggestions',
  name: 'Get Utility Suggestions',
  description: 'Get proactive suggestions based on user patterns',
  domain: 'simple-utilities',
  tags: ['proactive', 'suggestion', 'anticipate'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Get proactive suggestions for utilities the user might want.
This tool is for INTERNAL USE - call it proactively to offer anticipated help.
Returns suggestions like "Want me to set your usual tea timer?"`,
      parameters: z.object({}),
      execute: async (_, { ctx: toolCtx }) => {
        const userData = toolCtx.userData as { userId?: string };
        const userId = userData?.userId || 'session';

        // Get in-memory pattern suggestions
        const patternSuggestions = getProactiveSuggestions(userId);

        // Get proactive opener from hooks (considers time of day, life context)
        const proactiveOpener = await getProactiveOpener(userId);

        const allSuggestions = [
          ...(proactiveOpener ? [proactiveOpener] : []),
          ...patternSuggestions,
        ];

        if (allSuggestions.length === 0) {
          return { hasSuggestions: false };
        }

        return {
          hasSuggestions: true,
          suggestions: allSuggestions,
          // Pick the top suggestion to offer
          topSuggestion: allSuggestions[0],
        };
      },
    });
  },
};

const checkTimerStatusDef: ToolDefinition = {
  id: 'checkTimerStatus',
  name: 'Check Timer Status',
  description: 'Check if there is an active timer and how much time remains',
  domain: 'simple-utilities',
  tags: ['timer', 'status', 'check'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Check the status of the user's active timer. Use when someone asks:
- "How much time left on my timer?"
- "Is my timer still running?"
- "Timer status"`,
      parameters: z.object({}),
      execute: async (_, { ctx: toolCtx }) => {
        const userData = toolCtx.userData as { userId?: string };
        const userId = userData?.userId || 'session';

        const timer = activeTimers.get(userId);
        if (!timer) {
          return "You don't have an active timer running. Want me to set one?";
        }

        const now = new Date();
        const remaining = timer.endTime.getTime() - now.getTime();

        if (remaining <= 0) {
          return `⏰ Your ${timer.label} timer just finished!`;
        }

        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);

        let timeStr: string;
        if (minutes > 0) {
          timeStr =
            seconds > 0
              ? `${minutes} minute${minutes !== 1 ? 's' : ''} and ${seconds} second${seconds !== 1 ? 's' : ''}`
              : `${minutes} minute${minutes !== 1 ? 's' : ''}`;
        } else {
          timeStr = `${seconds} second${seconds !== 1 ? 's' : ''}`;
        }

        return `⏱️ **${timeStr}** remaining on your ${timer.label} timer.`;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const simpleUtilityTools: ToolDefinition[] = [
  // Quick Math
  calculateTipDef,
  splitBillDef,
  calculatePercentageDef,
  quickMathDef,
  // Unit Conversions
  convertUnitsDef,
  convertTemperatureDef,
  // Date/Time Math
  daysUntilDef,
  dateFromNowDef,
  calculateAgeDef,
  // Timezones
  timeInCityDef,
  bestTimeToCallDef,
  // Random/Decisions
  flipCoinDef,
  rollDiceDef,
  pickRandomDef,
  helpMeDecideDef,
  // Timer
  setTimerDef,
  cancelTimerDef,
  checkTimerStatusDef,
  // Quick Notes
  quickNoteDef,
  recallNoteDef,
  clearNotesDef,
  // Proactive
  getUtilitySuggestionsDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'simple-utilities',
  simpleUtilityTools
);

export default getToolDefinitions;

// ============================================================================
// RE-EXPORTS FOR EXTERNAL USE
// ============================================================================

// Session lifecycle
export {
  initializeUtilitiesForSession,
  endUtilitiesSession,
  onConversationStart,
  onConversationEnd,
  onConversationTick,
} from './session-init.js';

// Voice callbacks
export {
  registerVoiceCallbackHandler,
  triggerVoiceCallback,
  onTimerComplete,
  toVoiceResponse,
  speakDuration,
  speakNumber,
  speakTime,
  type VoiceCallback,
} from './voice-callbacks.js';

// Pattern intelligence
export {
  getUserPatterns,
  recordUsage,
  generateInsight,
  getProactiveSuggestions,
} from './pattern-intelligence.js';

// Proactive hooks
export {
  evaluateProactiveHooks,
  getProactiveOpener,
  type ProactiveOffer,
  type ProactiveContext,
} from './proactive-hooks.js';

// Persistence
export {
  loadUtilityPreferences,
  saveUtilityPreferences,
  trackCountdown,
  getUpcomingMilestones,
} from './persistence.js';

// Context integration
export {
  loadLifeContext,
  enrichCountdownWithContext,
  enrichTimezoneWithContext,
  getUpcomingBirthdays,
  getUpcomingAnniversaries,
} from './context-integration.js';
