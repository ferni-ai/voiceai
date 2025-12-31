/**
 * User Information Preferences Tools
 *
 * Tools for managing personalized information delivery.
 * Enables "Better Than Human" features like zero-param tools:
 * - "How are my teams doing?" → Gets scores for YOUR teams
 * - "What's my commute?" → Gets traffic for YOUR route
 * - "How's the market?" → Gets YOUR watchlist performance
 *
 * TOOLS:
 *   addFavoriteTeam     - Remember a favorite sports team
 *   removeFavoriteTeam  - Forget a favorite team
 *   getMyTeams          - Get scores for all favorite teams
 *   addToWatchlist      - Add a stock to watchlist
 *   removeFromWatchlist - Remove a stock from watchlist
 *   getMyWatchlist      - Get watchlist performance
 *   saveMyLocation      - Save home/work/other location
 *   setMyAllergies      - Remember allergy information
 *   setNewsPreferences  - Configure news interests
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../../utils/safe-logger.js';
import type { ToolContext, ToolDefinition } from '../../../registry/types.js';

// Import storage operations
import {
  getUserPreferences,
  addFavoriteTeam,
  removeFavoriteTeam,
  getFavoriteTeams,
  addToWatchlist,
  removeFromWatchlist,
  getWatchlist,
  saveLocation,
  setAllergies,
  addNewsInterest,
  addAvoidTopic,
  updateUserPreferences,
} from './storage.js';

// Import related tools for zero-param convenience
import { getTeamScore } from '../sports.js';
import { getStockNews } from '../news.js';

// Re-export types and storage
export * from './types.js';
export * from './storage.js';

const log = getLogger();

// ============================================================================
// SPORTS PREFERENCE TOOLS
// ============================================================================

const LEAGUE_MAPPINGS: Record<string, string> = {
  nfl: 'NFL',
  mlb: 'MLB',
  nba: 'NBA',
  nhl: 'NHL',
  mls: 'MLS',
  epl: 'EPL',
  'premier league': 'EPL',
  football: 'NFL',
  baseball: 'MLB',
  basketball: 'NBA',
  hockey: 'NHL',
  soccer: 'MLS',
};

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export const preferencesToolDefinitions: ToolDefinition[] = [
  // ────────────────────────────────────────────────────────────────────────
  // FAVORITE TEAMS
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'addFavoriteTeam',
    name: 'Add Favorite Team',
    description: "Remember a user's favorite sports team for personalized score updates.",
    domain: 'information',
    tags: ['information', 'sports', 'preferences', 'favorites'],
    create: (ctx: ToolContext) =>
      llm.tool({
        description:
          'Add a team to the user\'s favorites. Use when user says "I\'m an Eagles fan", "The Phillies are my team", or "Remember I follow the Lakers". Enables zero-param team updates later.',
        parameters: z.object({
          teamName: z.string().describe('Team name (e.g., "Eagles", "Phillies", "Lakers")'),
          league: z.string().optional().describe('League (NFL, MLB, NBA, NHL, MLS, EPL)'),
          isPrimary: z.boolean().optional().describe('Whether this is their main team'),
        }),
        execute: async ({ teamName, league, isPrimary }) => {
          if (!ctx.userId) {
            return 'I need to know who you are to save your favorite teams. Are you logged in?';
          }

          const normalizedLeague = league
            ? LEAGUE_MAPPINGS[league.toLowerCase()] || league.toUpperCase()
            : 'Unknown';

          const result = await addFavoriteTeam(ctx.userId, {
            name: teamName,
            league: normalizedLeague,
            priority: isPrimary ? 'primary' : 'secondary',
          });

          log.info(
            { userId: ctx.userId, team: teamName, league: normalizedLeague },
            '🏈 Added favorite team'
          );

          return result.success
            ? `Got it! I'll remember you're a ${teamName} fan. Just say "how are my teams doing?" anytime for updates.`
            : result.message;
        },
      }),
  },

  {
    id: 'removeFavoriteTeam',
    name: 'Remove Favorite Team',
    description: 'Remove a team from favorites.',
    domain: 'information',
    tags: ['information', 'sports', 'preferences'],
    create: (ctx: ToolContext) =>
      llm.tool({
        description:
          'Remove a team from favorites. Use when user says "I don\'t follow the Jets anymore" or "Remove the Lakers from my favorites".',
        parameters: z.object({
          teamName: z.string().describe('Team name to remove'),
        }),
        execute: async ({ teamName }) => {
          if (!ctx.userId) {
            return 'I need to know who you are to update your favorites.';
          }

          const result = await removeFavoriteTeam(ctx.userId, teamName);
          log.info({ userId: ctx.userId, team: teamName }, '🏈 Removed favorite team');

          return result.message;
        },
      }),
  },

  {
    id: 'getMyTeams',
    name: 'Get My Teams Scores',
    description: "Get scores for all the user's favorite teams - zero params needed!",
    domain: 'information',
    tags: ['information', 'sports', 'favorites', 'personalized'],
    create: (ctx: ToolContext) =>
      llm.tool({
        description:
          'Get scores for ALL the user\'s favorite teams. Use when user asks "how are my teams doing?", "any sports updates?", or "did my teams win?". NO PARAMETERS NEEDED - uses saved favorites.',
        parameters: z.object({}),
        execute: async () => {
          if (!ctx.userId) {
            return 'I need to know who you are to check your teams. Are you logged in?';
          }

          const favorites = await getFavoriteTeams(ctx.userId);

          if (favorites.length === 0) {
            return "You haven't told me your favorite teams yet! Just say something like \"I'm an Eagles fan\" and I'll remember.";
          }

          log.info(
            { userId: ctx.userId, teamCount: favorites.length },
            '🏈 Getting favorite teams scores'
          );

          // Fetch scores for all favorites (limit to avoid long responses)
          const teamsToCheck = favorites.slice(0, 5);
          const results: string[] = [];

          for (const team of teamsToCheck) {
            try {
              const score = await getTeamScore(team.name);
              results.push(`**${team.name}**: ${score}`);
            } catch {
              results.push(`**${team.name}**: Couldn't get the score right now.`);
            }
          }

          return results.length > 0
            ? `Here's how your teams are doing:\n\n${results.join('\n\n')}`
            : "Couldn't get scores for your teams right now. Try again in a moment?";
        },
      }),
  },

  // ────────────────────────────────────────────────────────────────────────
  // STOCK WATCHLIST
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'addToWatchlist',
    name: 'Add Stock to Watchlist',
    description: "Add a stock to the user's watchlist for personalized market updates.",
    domain: 'information',
    tags: ['information', 'finance', 'stocks', 'preferences'],
    create: (ctx: ToolContext) =>
      llm.tool({
        description:
          'Add a stock to the user\'s watchlist. Use when user says "I want to follow Apple stock", "add Tesla to my watchlist", or "remind me about NVDA".',
        parameters: z.object({
          symbol: z.string().describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
        }),
        execute: async ({ symbol }) => {
          if (!ctx.userId) {
            return 'I need to know who you are to save your watchlist.';
          }

          const result = await addToWatchlist(ctx.userId, symbol);
          log.info({ userId: ctx.userId, symbol }, '📈 Added to watchlist');

          return result.success
            ? `Added ${symbol.toUpperCase()} to your watchlist! Say "how's my portfolio?" anytime for updates.`
            : result.message;
        },
      }),
  },

  {
    id: 'removeFromWatchlist',
    name: 'Remove Stock from Watchlist',
    description: 'Remove a stock from the watchlist.',
    domain: 'information',
    tags: ['information', 'finance', 'stocks', 'preferences'],
    create: (ctx: ToolContext) =>
      llm.tool({
        description:
          'Remove a stock from watchlist. Use when user says "remove Apple from my watchlist" or "I don\'t care about Tesla anymore".',
        parameters: z.object({
          symbol: z.string().describe('Stock ticker symbol to remove'),
        }),
        execute: async ({ symbol }) => {
          if (!ctx.userId) {
            return 'I need to know who you are to update your watchlist.';
          }

          const result = await removeFromWatchlist(ctx.userId, symbol);
          log.info({ userId: ctx.userId, symbol }, '📈 Removed from watchlist');

          return result.message;
        },
      }),
  },

  {
    id: 'getMyWatchlist',
    name: 'Get My Watchlist',
    description: "Get news and updates for all stocks on the user's watchlist.",
    domain: 'information',
    tags: ['information', 'finance', 'stocks', 'personalized'],
    create: (ctx: ToolContext) =>
      llm.tool({
        description:
          'Get updates for all stocks on the user\'s watchlist. Use when user asks "how\'s my portfolio?", "any stock news?", or "how are my stocks doing?". NO PARAMETERS NEEDED.',
        parameters: z.object({}),
        execute: async () => {
          if (!ctx.userId) {
            return 'I need to know who you are to check your watchlist.';
          }

          const watchlist = await getWatchlist(ctx.userId);

          if (watchlist.length === 0) {
            return 'You haven\'t added any stocks to your watchlist yet! Say "add Apple to my watchlist" to get started.';
          }

          log.info(
            { userId: ctx.userId, stockCount: watchlist.length },
            '📈 Getting watchlist updates'
          );

          // Get news for watchlist stocks (limit to avoid long responses)
          const stocksToCheck = watchlist.slice(0, 5);
          const results: string[] = [];

          for (const symbol of stocksToCheck) {
            try {
              const news = await getStockNews(symbol);
              results.push(`**${symbol}**: ${news}`);
            } catch {
              results.push(`**${symbol}**: No recent news.`);
            }
          }

          return results.length > 0
            ? `Here's what's happening with your stocks:\n\n${results.join('\n\n')}`
            : "Couldn't get updates for your watchlist right now.";
        },
      }),
  },

  // ────────────────────────────────────────────────────────────────────────
  // LOCATIONS
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'saveMyLocation',
    name: 'Save My Location',
    description: 'Save a named location (home, work, etc.) for personalized traffic and weather.',
    domain: 'information',
    tags: ['information', 'location', 'preferences', 'commute'],
    create: (ctx: ToolContext) =>
      llm.tool({
        description:
          'Save a location for personalized updates. Use when user says "my home is in Philadelphia", "I work in Center City", or "save my gym location". Enables zero-param commute checks.',
        parameters: z.object({
          name: z.string().describe('Name for this location (e.g., "home", "work", "gym")'),
          address: z.string().describe('Address or city'),
        }),
        execute: async ({ name, address }) => {
          if (!ctx.userId) {
            return 'I need to know who you are to save your locations.';
          }

          const result = await saveLocation(ctx.userId, { name, address });
          log.info({ userId: ctx.userId, name, address }, '📍 Saved location');

          return result.success
            ? `Got it! I'll remember "${name}" is at ${address}. ${name.toLowerCase() === 'home' || name.toLowerCase() === 'work' ? 'Now you can just ask "what\'s my commute?" for traffic updates.' : ''}`
            : result.message;
        },
      }),
  },

  // ────────────────────────────────────────────────────────────────────────
  // HEALTH PREFERENCES
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'setMyAllergies',
    name: 'Set My Allergies',
    description: "Remember user's allergies for environmental alerts.",
    domain: 'information',
    tags: ['information', 'health', 'preferences', 'allergies'],
    create: (ctx: ToolContext) =>
      llm.tool({
        description:
          'Save user\'s allergy information. Use when user mentions "I have pollen allergies", "I\'m allergic to grass", or asks for allergy-aware weather. Enables proactive pollen alerts.',
        parameters: z.object({
          allergies: z
            .array(z.string())
            .describe('List of allergies (e.g., ["pollen", "grass", "dust"])'),
        }),
        execute: async ({ allergies }) => {
          if (!ctx.userId) {
            return 'I need to know who you are to save your health info.';
          }

          const result = await setAllergies(ctx.userId, allergies);
          log.info({ userId: ctx.userId, allergies }, '🤧 Saved allergies');

          return result.success
            ? `I'll remember about your allergies: ${allergies.join(', ')}. I'll give you a heads up when pollen is high!`
            : result.message;
        },
      }),
  },

  // ────────────────────────────────────────────────────────────────────────
  // NEWS PREFERENCES
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'setNewsInterests',
    name: 'Set News Interests',
    description: 'Configure what news topics the user cares about or wants to avoid.',
    domain: 'information',
    tags: ['information', 'news', 'preferences'],
    create: (ctx: ToolContext) =>
      llm.tool({
        description:
          'Set news preferences. Use when user says "I want more tech news", "less politics please", or "I\'m interested in climate news". Personalizes news delivery.',
        parameters: z.object({
          interests: z.array(z.string()).optional().describe('Topics to include more of'),
          avoid: z.array(z.string()).optional().describe('Topics to exclude/minimize'),
          frequency: z
            .enum(['heavy', 'moderate', 'light', 'minimal'])
            .optional()
            .describe('How much news they want'),
        }),
        execute: async ({ interests, avoid, frequency }) => {
          if (!ctx.userId) {
            return 'I need to know who you are to save your preferences.';
          }

          const updates: Record<string, unknown> = {};
          const messages: string[] = [];

          if (interests && interests.length > 0) {
            // Add each interest
            for (const topic of interests) {
              await addNewsInterest(ctx.userId, topic);
            }
            messages.push(`Added interests: ${interests.join(', ')}`);
          }

          if (avoid && avoid.length > 0) {
            // Add topics to avoid
            for (const topic of avoid) {
              await addAvoidTopic(ctx.userId, topic);
            }
            messages.push(`Will minimize: ${avoid.join(', ')}`);
          }

          if (frequency) {
            await updateUserPreferences(ctx.userId, { newsFrequency: frequency });
            messages.push(`News frequency set to: ${frequency}`);
          }

          log.info(
            { userId: ctx.userId, interests, avoid, frequency },
            '📰 Updated news preferences'
          );

          return messages.length > 0
            ? `Got it! ${messages.join('. ')}. Your news updates will be more personalized now.`
            : 'What news preferences would you like to change?';
        },
      }),
  },

  // ────────────────────────────────────────────────────────────────────────
  // QUERY ALL PREFERENCES
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'myPreferences',
    name: 'Get All My Preferences',
    description: "Get everything Ferni has learned about the user's preferences",
    domain: 'information',
    tags: ['information', 'preferences', 'personalized', 'memory'],
    create: (ctx: ToolContext) =>
      llm.tool({
        description:
          'Get all the user\'s learned preferences - sports teams, stocks, news interests, locations, allergies. ' +
          'Use when user asks "what do you know about me?", "what are my preferences?", "what have you learned about me?"',
        parameters: z.object({}),
        execute: async () => {
          if (!ctx.userId) {
            return "I'd need to know who you are to share what I've learned. Are you logged in?";
          }

          const preferences = await getUserPreferences(ctx.userId);
          const parts: string[] = [];

          // Sports teams
          if (preferences.favoriteTeams && preferences.favoriteTeams.length > 0) {
            const teams = preferences.favoriteTeams.map(t => 
              t.league !== 'Unknown' ? `${t.name} (${t.league})` : t.name
            );
            parts.push(`**Sports**: You follow ${teams.join(', ')}`);
          }

          // Stock watchlist
          if (preferences.stockWatchlist && preferences.stockWatchlist.length > 0) {
            parts.push(`**Stocks**: You're tracking ${preferences.stockWatchlist.join(', ')}`);
          }

          // News interests
          if (preferences.newsInterests && preferences.newsInterests.length > 0) {
            parts.push(`**News interests**: ${preferences.newsInterests.join(', ')}`);
          }

          // Topics to avoid
          if (preferences.avoidTopics && preferences.avoidTopics.length > 0) {
            parts.push(`**Topics to minimize**: ${preferences.avoidTopics.join(', ')}`);
          }

          // Locations
          if (preferences.homeLocation) {
            parts.push(`**Home**: ${preferences.homeLocation.address}`);
          }
          if (preferences.workLocation) {
            parts.push(`**Work**: ${preferences.workLocation.address}`);
          }

          // Allergies
          if (preferences.allergies && preferences.allergies.length > 0) {
            parts.push(`**Allergies**: ${preferences.allergies.join(', ')}`);
          }

          // Health conditions
          if (preferences.hasRespiratoryConditions) {
            parts.push(`**Health**: I know you have respiratory concerns, so I'll mention air quality`);
          }

          if (parts.length === 0) {
            return "I haven't learned many preferences from our conversations yet! " +
              "Just mention things naturally - like 'I'm an Eagles fan' or 'I follow Apple stock' - and I'll remember.";
          }

          log.info({ userId: ctx.userId, preferencesCount: parts.length }, '📋 User queried preferences');

          return `Here's what I've learned about you:\n\n${parts.join('\n\n')}\n\n` +
            "These help me personalize our conversations. If anything's wrong, just let me know!";
        },
      }),
  },
];

/**
 * Get preference tool definitions
 */
export function getPreferencesToolDefinitions(): ToolDefinition[] {
  return preferencesToolDefinitions;
}
