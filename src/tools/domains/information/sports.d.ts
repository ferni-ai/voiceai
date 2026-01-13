/**
 * Sports Tools
 *
 * Domain: Live scores, game schedules, sports news.
 * Single responsibility: Fetching and presenting sports information.
 *
 * APIs used:
 * - ESPN API (free, no key required)
 *
 * Note: Returns clean data. Persona personality comes from system prompts,
 * not hardcoded in tools. See tool-humanization context builder.
 */
import { llm } from '@livekit/agents';
/**
 * Get all scores for a sport
 */
export declare function getSportScores(sport: string): Promise<string>;
/**
 * Get score for a specific team
 */
export declare function getTeamScore(teamName: string): Promise<string>;
/**
 * Get Phillies score specifically
 */
export declare function getPhilliesScore(): Promise<string>;
/**
 * Get Eagles score specifically
 */
export declare function getEaglesScore(): Promise<string>;
export declare function createSportsTools(): {
    getTeamScore: llm.FunctionTool<{
        teamName: string;
    }, unknown, string>;
    getSportScores: llm.FunctionTool<{
        sport: "mlb" | "nfl" | "nba" | "nhl" | "mls" | "epl" | "ncaaf" | "ncaab";
    }, unknown, string>;
    getPhilliesScore: llm.FunctionTool<Record<string, never>, unknown, string>;
    getEaglesScore: llm.FunctionTool<Record<string, never>, unknown, string>;
};
export default createSportsTools;
//# sourceMappingURL=sports.d.ts.map