/**
 * Personal insights configuration: kill switch, budgets, cache tiers.
 *
 * `PERSONAL_INSIGHTS=off` disables everything (no reads at session start, no
 * per-turn person notes, no precompute). Default is on.
 *
 * @module services/personal-insights/config
 */

export function personalInsightsEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  const v = (env.PERSONAL_INSIGHTS ?? '').trim().toLowerCase();
  return v !== 'off' && v !== 'false' && v !== '0';
}

/** LLM-written insights/openers; rules-only when off (still grounded). */
export function personalInsightsLlmEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  const v = (env.PERSONAL_INSIGHTS_LLM ?? '').trim().toLowerCase();
  return v !== 'off' && v !== 'false' && v !== '0';
}

export const INSIGHTS_LIMITS = {
  /** Session-start "What's on their mind" block, in characters. */
  sessionBlockChars: 900,
  /** Per-turn person note, in characters. */
  personNoteChars: 420,
  /** How long the session start waits for the precomputed bundle. */
  sessionLoadTimeoutMs: 300,
  maxPredictions: 5,
  maxInsights: 3,
  maxOpeners: 3,
  maxPeopleInBlock: 3,
  /** Upcoming dates considered "soon". */
  upcomingWindowDays: 14,
  /** Reads per collection (a user's memory is small). */
  maxFacts: 300,
  maxEntities: 300,
  maxRelationships: 300,
  maxSummaries: 60,
  maxConversations: 60,
  /** Recent outcomes used for calibration. */
  calibrationWindow: 50,
} as const;

/** Cache tiers, matching the superhuman cache (STABLE 5m / NORMAL 2m / FRESH 30s). */
export const INSIGHTS_TTL_MS = {
  people: 2 * 60_000,
  bundle: 2 * 60_000,
  calibration: 5 * 60_000,
} as const;
