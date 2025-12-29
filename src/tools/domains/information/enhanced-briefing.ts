/**
 * Enhanced Daily Briefing
 *
 * "Better Than Human" version of daily briefing that integrates:
 * - Environmental health (air quality, UV, pollen)
 * - Proactive alerts (weather-calendar conflicts)
 * - User preferences (favorite teams, watchlist)
 * - Personalized news based on interests
 *
 * A human friend might say "Nice day today!"
 * We say "Great day for your 2pm run - air quality is good, UV is moderate,
 * but bring sunscreen. Oh, and the Eagles play tonight at 8:25!"
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import type { ToolContext, ToolDefinition } from '../../registry/types.js';

// Environmental tools
import { getEnvironmentalBriefing } from './environmental/index.js';

// Preferences
import { getUserPreferences, getFavoriteTeams, getWatchlist } from './preferences/storage.js';

// Proactive alerts
import { checkAllAlerts, type AlertGenerationContext } from './proactive/index.js';

// Sports
import { getTeamScore } from './sports.js';

// Weather
import { getCurrentWeather, getWeatherForecast } from './weather.js';

// Phase 5: Cross-domain connections
import { getWeatherHabitInsights } from './cross-domain/weather-habits.js';
import { analyzeNewsMoodImpact } from './cross-domain/news-mood.js';
import { generateCommuteSuggestions } from './cross-domain/traffic-productivity.js';

// Phase 6: Relationship intelligence
import { getBirthdayInsights, getContactReminderInsights } from './relationships/insights.js';

const log = getLogger();

// ============================================================================
// GREETING & TIME HELPERS
// ============================================================================

function formatGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

function getFormattedDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function isWeekday(): boolean {
  const day = new Date().getDay();
  return day !== 0 && day !== 6;
}

// ============================================================================
// MOTIVATIONAL QUOTES (time-appropriate)
// ============================================================================

const MORNING_QUOTES = [
  "Let's make today count.",
  "You've got this.",
  'One step at a time.',
  "Today's a fresh start.",
  'Ready when you are.',
];

const EVENING_QUOTES = [
  'Nice work today.',
  'Take a moment to breathe.',
  'You did your best today.',
  "Rest well, you've earned it.",
  "Tomorrow's another opportunity.",
];

function getRandomQuote(timeOfDay: string): string {
  const quotes = timeOfDay === 'evening' || timeOfDay === 'night' ? EVENING_QUOTES : MORNING_QUOTES;
  return quotes[Math.floor(Math.random() * quotes.length)];
}

// ============================================================================
// ENHANCED BRIEFING GENERATOR
// ============================================================================

interface EnhancedBriefingOptions {
  userId: string;
  location?: string;
  includeWeather?: boolean;
  includeSports?: boolean;
  includeAlerts?: boolean;
  includeEnvironmental?: boolean;
}

/**
 * Generate an enhanced "better than human" daily briefing
 */
async function generateEnhancedBriefing(options: EnhancedBriefingOptions): Promise<string> {
  const {
    userId,
    location,
    includeWeather = true,
    includeSports = true,
    includeAlerts = true,
    includeEnvironmental = true,
  } = options;

  const parts: string[] = [];
  const timeOfDay = getTimeOfDay();

  // Greeting
  const greeting = formatGreeting();
  const date = getFormattedDate();
  parts.push(`${greeting}! It's ${date}.`);

  // Get user preferences for personalization
  const prefs = await getUserPreferences(userId);

  // Weather (if location available)
  if (includeWeather && location) {
    try {
      const weather = await getCurrentWeather(location);
      // Extract just the key info, make it conversational
      if (weather && !weather.includes("couldn't")) {
        // Make it more conversational
        parts.push(weather.replace('Right now in', 'Weather in'));
      }
    } catch (error) {
      log.debug({ error: String(error) }, '📅 Weather unavailable for briefing');
    }
  }

  // Environmental health summary (only if notable)
  if (includeEnvironmental && location) {
    try {
      const envSummary = await getEnvironmentalBriefing(location);
      if (envSummary) {
        parts.push(envSummary);
      }
    } catch (error) {
      log.debug({ error: String(error) }, '📅 Environmental data unavailable');
    }
  }

  // Proactive alerts
  if (includeAlerts) {
    try {
      const alertContext: AlertGenerationContext = {
        userId,
        location: location ? { city: location, latitude: 0, longitude: 0 } : undefined,
      };
      const alerts = await checkAllAlerts(alertContext);

      // Only include high/critical alerts in briefing
      const importantAlerts = alerts.filter(
        (a) => a.urgency === 'high' || a.urgency === 'critical'
      );
      if (importantAlerts.length > 0) {
        parts.push(`Heads up: ${importantAlerts[0].message}`);
      }
    } catch (error) {
      log.debug({ error: String(error) }, '📅 Alerts unavailable');
    }
  }

  // Favorite teams (morning only - game day info)
  if (includeSports && (timeOfDay === 'morning' || timeOfDay === 'afternoon')) {
    try {
      const favoriteTeams = await getFavoriteTeams(userId);

      if (favoriteTeams.length > 0) {
        // Check primary team only for briefing
        const primaryTeam = favoriteTeams.find((t) => t.priority === 'primary') || favoriteTeams[0];
        const teamScore = await getTeamScore(primaryTeam.name);

        // Only include if there's relevant info (game today/yesterday)
        if (teamScore && !teamScore.includes("couldn't") && !teamScore.includes('No recent')) {
          parts.push(`${primaryTeam.name} update: ${teamScore}`);
        }
      }
    } catch (error) {
      log.debug({ error: String(error) }, '📅 Sports unavailable');
    }
  }

  // Phase 5: Cross-domain connections - Weather → Habits advice
  if (includeEnvironmental && location) {
    try {
      const habitInsights = await getWeatherHabitInsights(location);
      if (habitInsights.length > 0) {
        // Include the first relevant insight
        const topInsight = habitInsights[0];
        if (topInsight.confidence > 0.7) {
          parts.push(`💡 ${topInsight.message}`);
        }
      }
    } catch (error) {
      log.debug({ error: String(error) }, '📅 Weather-habits insights unavailable');
    }
  }

  // Phase 6: Relationship intelligence - Birthdays
  try {
    const birthdayInsights = await getBirthdayInsights(userId);
    if (birthdayInsights.length > 0) {
      // Include today's birthdays and important upcoming ones
      const todayBirthdays = birthdayInsights.filter((i) => i.type === 'birthday_today');
      const upcomingBirthdays = birthdayInsights.filter(
        (i) => i.type === 'birthday_upcoming' && i.priority >= 70
      );

      if (todayBirthdays.length > 0) {
        parts.push(`🎂 ${todayBirthdays[0].message}`);
      } else if (upcomingBirthdays.length > 0) {
        parts.push(`📅 ${upcomingBirthdays[0].message}`);
      }
    }
  } catch (error) {
    log.debug({ error: String(error) }, '📅 Birthday insights unavailable');
  }

  // Phase 6: Contact reminders (only for morning briefings)
  if (timeOfDay === 'morning') {
    try {
      const contactReminders = await getContactReminderInsights(userId);
      // Only include urgent contact reminders
      const urgentReminders = contactReminders.filter(
        (i) => i.context?.urgency === 'urgent' || i.priority >= 70
      );

      if (urgentReminders.length > 0) {
        parts.push(`💬 ${urgentReminders[0].message}`);
      }
    } catch (error) {
      log.debug({ error: String(error) }, '📅 Contact reminders unavailable');
    }
  }

  // Closing quote
  parts.push(getRandomQuote(timeOfDay));

  return parts.join('\n\n');
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export const enhancedBriefingToolDefinitions: ToolDefinition[] = [
  {
    id: 'getSmartBriefing',
    name: 'Get Smart Briefing',
    description:
      'Enhanced daily briefing with environmental health, proactive alerts, and personalized sports updates.',
    domain: 'information',
    tags: ['information', 'briefing', 'morning', 'personalized', 'better-than-human'],
    create: (ctx: ToolContext) =>
      llm.tool({
        description:
          'Get a personalized daily briefing that includes weather, environmental conditions (air quality, UV, pollen if notable), proactive alerts, and updates on favorite teams. Use when user asks "what should I know today?", "morning briefing", "give me the rundown", or at session start.',
        parameters: z.object({
          includeWeather: z.boolean().optional().describe('Include weather (default true)'),
          includeSports: z.boolean().optional().describe('Include sports updates (default true)'),
          includeAlerts: z.boolean().optional().describe('Include proactive alerts (default true)'),
        }),
        execute: async ({ includeWeather = true, includeSports = true, includeAlerts = true }) => {
          if (!ctx.userId) {
            return 'I need to know who you are to personalize your briefing.';
          }

          // Get location from context
          const location = ctx.userLocation?.city
            ? ctx.userLocation.regionCode
              ? `${ctx.userLocation.city}, ${ctx.userLocation.regionCode}`
              : ctx.userLocation.city
            : undefined;

          log.info({ userId: ctx.userId, location }, '📅 Generating enhanced briefing');

          try {
            const briefing = await generateEnhancedBriefing({
              userId: ctx.userId,
              location,
              includeWeather,
              includeSports,
              includeAlerts,
              includeEnvironmental: true,
            });

            return briefing;
          } catch (error) {
            log.error({ error: String(error) }, '📅 Enhanced briefing failed');
            return `${formatGreeting()}! Let me give you the basics: It's ${getFormattedDate()}. ${getRandomQuote(getTimeOfDay())}`;
          }
        },
      }),
  },

  {
    id: 'getQuickStatus',
    name: 'Get Quick Status',
    description: 'Ultra-brief status check - just the essentials.',
    domain: 'information',
    tags: ['information', 'status', 'quick', 'brief'],
    create: (ctx: ToolContext) =>
      llm.tool({
        description:
          'Get an ultra-brief status. Use when user asks "anything I need to know?", "quick check", or wants just the highlights without a full briefing.',
        parameters: z.object({}),
        execute: async () => {
          if (!ctx.userId) {
            return 'All clear from what I can see.';
          }

          const parts: string[] = [];

          // Check for urgent alerts only
          try {
            const alertContext: AlertGenerationContext = {
              userId: ctx.userId,
              location: ctx.userLocation?.city
                ? { city: ctx.userLocation.city, latitude: 0, longitude: 0 }
                : undefined,
            };
            const alerts = await checkAllAlerts(alertContext);
            const critical = alerts.filter((a) => a.urgency === 'critical' || a.urgency === 'high');

            if (critical.length > 0) {
              parts.push(`⚠️ ${critical[0].title}: ${critical[0].message}`);
            }
          } catch {
            // Silently skip alerts
          }

          if (parts.length === 0) {
            return 'All clear! Nothing urgent needs your attention.';
          }

          return parts.join('\n\n');
        },
      }),
  },

  {
    id: 'getEndOfDayReflection',
    name: 'Get End of Day Reflection',
    description: 'Evening reflection and wind-down briefing.',
    domain: 'information',
    tags: ['information', 'evening', 'reflection', 'wind-down'],
    create: (ctx: ToolContext) =>
      llm.tool({
        description:
          'Get an evening reflection. Use when user asks "how was today?", "end of day", or in evening conversations. Focuses on wins, tomorrow prep, and rest.',
        parameters: z.object({}),
        execute: async () => {
          const parts: string[] = [];

          // Evening greeting
          parts.push('Nice work today.');

          // Tomorrow's weather preview
          if (ctx.userLocation?.city) {
            try {
              const forecast = await getWeatherForecast(ctx.userLocation.city, 1);
              if (forecast && !forecast.includes("couldn't")) {
                // Extract tomorrow info
                parts.push(
                  `Tomorrow's looking like: ${forecast.split('|')[0] || forecast.slice(0, 100)}`
                );
              }
            } catch {
              // Skip weather
            }
          }

          // Sports results (evening is good for this)
          if (ctx.userId) {
            try {
              const favoriteTeams = await getFavoriteTeams(ctx.userId);
              if (favoriteTeams.length > 0) {
                const primaryTeam =
                  favoriteTeams.find((t) => t.priority === 'primary') || favoriteTeams[0];
                const score = await getTeamScore(primaryTeam.name);
                if (score && !score.includes("couldn't")) {
                  parts.push(`${primaryTeam.name}: ${score}`);
                }
              }
            } catch {
              // Skip sports
            }
          }

          // Closing
          parts.push(getRandomQuote('evening'));

          return parts.join('\n\n');
        },
      }),
  },
];

/**
 * Get enhanced briefing tool definitions
 */
export function getEnhancedBriefingToolDefinitions(): ToolDefinition[] {
  return enhancedBriefingToolDefinitions;
}

// Export the generator for use by other modules
export { generateEnhancedBriefing };
