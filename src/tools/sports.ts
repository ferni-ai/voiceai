/**
 * Sports Tools
 *
 * Domain: Live scores, game schedules, sports news.
 * Single responsibility: Fetching and presenting sports information.
 *
 * APIs used:
 * - ESPN API (free, no key required)
 *
 * Jack loves his Phillies! But we support all teams.
 */

import { llm, log } from '@livekit/agents';
import { z } from 'zod';

const getLogger = () => log();

// ============================================================================
// TYPES
// ============================================================================

interface ESPNCompetitor {
  team?: {
    abbreviation?: string;
    displayName?: string;
    name?: string;
  };
  score?: string;
  winner?: boolean;
  homeAway?: string;
}

interface ESPNEvent {
  name?: string;
  shortName?: string;
  status?: {
    type?: {
      description?: string;
      shortDetail?: string;
    };
  };
  competitions?: Array<{
    competitors?: ESPNCompetitor[];
    venue?: { fullName?: string };
    startDate?: string;
  }>;
}

interface ESPNResponse {
  events?: ESPNEvent[];
  leagues?: Array<{
    name?: string;
    abbreviation?: string;
  }>;
}

// ============================================================================
// ESPN API HELPERS
// ============================================================================

const ESPN_SPORTS: Record<string, string> = {
  mlb: 'baseball/mlb',
  nfl: 'football/nfl',
  nba: 'basketball/nba',
  nhl: 'hockey/nhl',
  mls: 'soccer/usa.1',
  epl: 'soccer/eng.1', // English Premier League
  ncaaf: 'football/college-football',
  ncaab: 'basketball/mens-college-basketball',
};

/**
 * Get scoreboard for a sport
 */
async function getSportScoreboard(sport: string): Promise<ESPNResponse | null> {
  const sportPath = ESPN_SPORTS[sport.toLowerCase()];
  if (!sportPath) return null;

  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/scoreboard`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });

    if (!response.ok) return null;
    return (await response.json()) as ESPNResponse;
  } catch (error) {
    getLogger().warn(`ESPN API error for ${sport}: ${error}`);
    return null;
  }
}

/**
 * Format a game for display
 */
function formatGame(event: ESPNEvent): string {
  const comp = event.competitions?.[0];
  const teams = comp?.competitors;
  const status = event.status?.type?.shortDetail || event.status?.type?.description || 'Unknown';

  if (!teams || teams.length < 2) return '';

  const away = teams.find((t) => t.homeAway === 'away') || teams[0];
  const home = teams.find((t) => t.homeAway === 'home') || teams[1];

  const awayName = away?.team?.displayName || away?.team?.name || 'Away';
  const homeName = home?.team?.displayName || home?.team?.name || 'Home';
  const awayScore = away?.score || '0';
  const homeScore = home?.score || '0';

  return `${awayName} ${awayScore} @ ${homeName} ${homeScore} (${status})`;
}

/**
 * Find games for a specific team
 */
function findTeamGames(data: ESPNResponse, teamName: string): ESPNEvent[] {
  const searchTerm = teamName.toLowerCase();

  return (data.events || []).filter((event) => {
    const name = event.name?.toLowerCase() || '';
    const shortName = event.shortName?.toLowerCase() || '';
    const teams = event.competitions?.[0]?.competitors || [];

    return (
      name.includes(searchTerm) ||
      shortName.includes(searchTerm) ||
      teams.some(
        (t) =>
          t.team?.displayName?.toLowerCase().includes(searchTerm) ||
          t.team?.name?.toLowerCase().includes(searchTerm) ||
          t.team?.abbreviation?.toLowerCase() === searchTerm
      )
    );
  });
}

// ============================================================================
// PUBLIC API FUNCTIONS
// ============================================================================

/**
 * Get all scores for a sport
 */
export async function getSportScores(sport: string): Promise<string> {
  const data = await getSportScoreboard(sport);

  if (!data?.events?.length) {
    return `No ${sport.toUpperCase()} games found today. Check back during game time!`;
  }

  const games = data.events.slice(0, 5).map(formatGame).filter(Boolean);

  if (games.length === 0) {
    return `Couldn't parse the ${sport.toUpperCase()} scores. The API might be having issues.`;
  }

  return `${sport.toUpperCase()} scores: ${games.join(' | ')}`;
}

/**
 * Get score for a specific team
 */
export async function getTeamScore(teamName: string): Promise<string> {
  // Try each sport until we find the team
  for (const sport of Object.keys(ESPN_SPORTS)) {
    const data = await getSportScoreboard(sport);
    if (!data) continue;

    const games = findTeamGames(data, teamName);
    if (games.length > 0) {
      const game = games[0];
      const formatted = formatGame(game);

      if (formatted) {
        // Add Jack's personal touch for Philly teams
        if (teamName.toLowerCase().includes('phillies')) {
          return `${formatted} You know I love my Phillies!`;
        } else if (teamName.toLowerCase().includes('eagles')) {
          return `${formatted} Go Birds!`;
        } else if (
          teamName.toLowerCase().includes('76ers') ||
          teamName.toLowerCase().includes('sixers')
        ) {
          return `${formatted} Trust the Process!`;
        } else if (teamName.toLowerCase().includes('flyers')) {
          return `${formatted} Broad Street Bullies!`;
        }

        return formatted;
      }
    }
  }

  return `I couldn't find a game for "${teamName}" today. They might not be playing, or check your spelling.`;
}

/**
 * Get Phillies score specifically (Jack's favorite!)
 */
export async function getPhilliesScore(): Promise<string> {
  const data = await getSportScoreboard('mlb');

  if (!data) {
    return "I couldn't check on the Phillies right now. I hope they're doing better than usual!";
  }

  const games = findTeamGames(data, 'phillies');

  if (games.length > 0) {
    const formatted = formatGame(games[0]);
    return `${formatted} You know I love my Phillies!`;
  }

  return "The Phillies don't have a game right now. Baseball season keeps an old man's heart young, you know.";
}

/**
 * Get Eagles score specifically
 */
export async function getEaglesScore(): Promise<string> {
  const data = await getSportScoreboard('nfl');

  if (!data) {
    return "I couldn't check on the Eagles right now.";
  }

  const games = findTeamGames(data, 'eagles');

  if (games.length > 0) {
    const formatted = formatGame(games[0]);
    return `${formatted} Go Birds!`;
  }

  return "No Eagles game right now. But there's always next Sunday!";
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createSportsTools() {
  return {
    getTeamScore: llm.tool({
      description:
        'Get the score for any sports team. Works for MLB, NFL, NBA, NHL, MLS, college football, and college basketball.',
      parameters: z.object({
        teamName: z
          .string()
          .describe('Team name (e.g., "Yankees", "Lakers", "Patriots", "Phillies", "Eagles")'),
      }),
      execute: async ({ teamName }) => {
        getLogger().info(`Getting score for: ${teamName}`);
        return getTeamScore(teamName);
      },
    }),

    getSportScores: llm.tool({
      description:
        'Get all scores for a sport league. Use when user asks "how did baseball do today" or "NBA scores".',
      parameters: z.object({
        sport: z
          .enum(['mlb', 'nfl', 'nba', 'nhl', 'mls', 'epl', 'ncaaf', 'ncaab'])
          .describe(
            'Sport league: mlb (baseball), nfl (football), nba (basketball), nhl (hockey), mls (soccer), epl (Premier League), ncaaf (college football), ncaab (college basketball)'
          ),
      }),
      execute: async ({ sport }) => {
        getLogger().info(`Getting ${sport} scores`);
        return getSportScores(sport);
      },
    }),

    getPhilliesScore: llm.tool({
      description: "Get the Philadelphia Phillies score - Jack's favorite team!",
      parameters: z.object({}),
      execute: async () => {
        getLogger().info('Getting Phillies score');
        return getPhilliesScore();
      },
    }),

    getEaglesScore: llm.tool({
      description: 'Get the Philadelphia Eagles score.',
      parameters: z.object({}),
      execute: async () => {
        getLogger().info('Getting Eagles score');
        return getEaglesScore();
      },
    }),
  };
}

export default createSportsTools;
