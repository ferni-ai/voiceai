/**
 * ROUTER_CONTEXT_ADDITIVE (off by default): the context layer can only raise a score.
 *
 * Off, matcher.ts averages the context boost (0.05 a keyword) into the score at weight
 * 0.5. That pulls every score toward 0.05, so a keyword-only score above ~0.3 goes DOWN
 * when the last three turns mention one of the tool's keywords. A caller who said "die"
 * or "suicidal" a turn ago pushed crisis_support from first (0.90) to fifth (0.69).
 *
 * On, a tool's score is worked out without the context layer (scoreWithoutContext), then
 * the boost is added, capped (addContextBonus), and only to a tool this turn names by
 * pattern or keyword: the holistic layer gives whole categories 0.7-0.9 from mood alone,
 * and a bonus on those let an unrelated tool overtake the one the caller asked for (and,
 * once in the crisis eval set, crisis_support). And the current turn is dropped from the
 * history when the history already ends with it (historyBeforeTurn): transcript-handler
 * pushes each final transcript onto recentTranscripts before or after processTurn reads
 * it, so a turn could otherwise boost itself.
 *
 * @module tools/semantic-router/context-additive
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import type { ConversationTurn, MatchLayer } from './types.js';

/** Most the context layer can add: two keyword mentions, or one same-category recent tool. */
export const CONTEXT_BONUS_CAP = 0.1;

/** Top score for anything short of a perfect pattern match (as matcher.ts's multi-layer bonus). */
const NON_PERFECT_MAX = 0.99;

export function contextAdditive(env: Env = process.env): boolean {
  return flagOn('ROUTER_CONTEXT_ADDITIVE', env);
}

/** The layer scores for the base score: with the flag on, the context layer taken out. */
export function scoreWithoutContext<T extends { context: number; matchedBy: MatchLayer[] }>(
  scores: T,
  additive = true
): T {
  if (!additive) return scores;
  return { ...scores, context: 0, matchedBy: scores.matchedBy.filter((l) => l !== 'context') };
}

/** The base confidence plus the capped context boost; never lower than the base. */
export function addContextBonus(
  confidence: number,
  scores: { context: number; pattern: number; keyword: number },
  additive = true
): number {
  const { context: boost, pattern, keyword } = scores;
  if (!additive || !(boost > 0) || pattern >= 1.0 || !(pattern > 0 || keyword > 0))
    return confidence;
  return Math.max(
    confidence,
    Math.min(NON_PERFECT_MAX, confidence + Math.min(CONTEXT_BONUS_CAP, boost))
  );
}

function words(text: string | undefined): string {
  return (text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The history before this turn: trailing caller turns this turn already contains (the
 * turn itself, or the final transcripts it was stitched from) are dropped.
 */
export function historyBeforeTurn(
  history: ConversationTurn[] | undefined,
  inputText: string
): ConversationTurn[] | undefined {
  if (history === undefined || history.length === 0) return history;
  const turn = words(inputText);
  let end = history.length;
  while (end > 0) {
    const last = history[end - 1];
    const said = words(last?.text);
    if (last?.role !== 'user' || !said || !` ${turn} `.includes(` ${said} `)) break;
    end--;
  }
  return end === history.length ? history : history.slice(0, end);
}
