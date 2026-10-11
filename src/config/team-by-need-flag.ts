/**
 * TEAM_BY_NEED: how a caller meets Ferni's teammates.
 *
 * Off (the default): teammates unlock with conversations, days and streaks
 * (services/social/team-unlocks.ts), and daily chats and streaks earn seeds.
 * On (product decision, 2026-10-11): every teammate is on every caller's team
 * from the first call, and Ferni introduces one when the conversation calls
 * for them ("want Alex for that talk with your manager?"). Nothing unlocks on a
 * streak, nothing nudges a caller to keep one, and daily use earns no seeds.
 *
 * Read on every call, so a test (or a restart with new env) sees the current
 * value. The API server and the voice agent each read their own env; set it on
 * both (`lk agent update-secrets --secrets "TEAM_BY_NEED=on"` for the agent).
 *
 * @module config/team-by-need-flag
 */

export const TEAM_BY_NEED_ENV = 'TEAM_BY_NEED';

/** True only when TEAM_BY_NEED is 'on' or 'true'. */
export function isTeamByNeedEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env[TEAM_BY_NEED_ENV]?.trim().toLowerCase();
  return value === 'on' || value === 'true';
}
