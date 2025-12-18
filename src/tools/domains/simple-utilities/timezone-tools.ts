/**
 * Timezone Utilities
 *
 * Time in different cities, best time to call across timezones.
 *
 * @module simple-utilities/timezone-tools
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import type { Tool, ToolContext, ToolDefinition } from '../../registry/types.js';
import { enrichTimezoneWithContext, loadLifeContext } from './context-integration.js';
import { generateInsight, recordUsage } from './pattern-intelligence.js';
import { updateTimezonePreferences } from './persistence.js';

import { getToolDescription } from '../../utils/tool-descriptions.js';
const timeInCityDef: ToolDefinition = {
  id: 'timeInCity',
  name: 'Time in City',
  description: 'Get the current time in any city',
  domain: 'simple-utilities',
  tags: ['timezone', 'time', 'city', 'world'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('timeInCity'),
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

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('bestTimeToCall'),
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
// EXPORTS
// ============================================================================

export const timezoneToolDefinitions: ToolDefinition[] = [timeInCityDef, bestTimeToCallDef];

export { bestTimeToCallDef, timeInCityDef };
