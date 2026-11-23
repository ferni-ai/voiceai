/**
 * ROUTER_CONTEXT_ADDITIVE (off by default): the context layer can only raise a score.
 *
 * Off, matcher.ts averages the context boost (0.05 a keyword) into the weighted score,
 * which pulls every score toward the boost. A tool scoring above it goes DOWN when the
 * last three turns mention one of its keywords: after "lately i feel suicidal", a
 * keyword-only "i'm suicidal" dropped crisis_support from 0.425 to below the 0.35 minimum.
 * The current turn is usually in that history too (transcript-handler pushes each final
 * onto recentTranscripts before processTurn routes), so a turn could demote itself.
 *
 * On, a tool's score is worked out without the context layer (scoreWithoutContext), then
 * the boost is added, capped (addContextBonus), and only to a tool this turn names by
 * pattern or keyword: the holistic layer gives whole categories 0.7-0.9 from mood alone,
 * and a bonus there would let an unrelated tool overtake the one the caller asked for.
 * The current turn, and the finals it was stitched from, are taken out of the history
 * first (historyBeforeTurn), so a turn never boosts itself.
 *
 * First built in #2509; this version drops a history turn only when the trailing turns
 * exactly make up the current one.
 *
 * @module tools/semantic-router/context-additive
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import type { ConversationTurn, MatchLayer } from './types.js';

/** Most the context layer can add: two keyword mentions, or one same-category recent tool. */
const CONTEXT_BONUS_CAP = 0.1;

/** Top score for anything short of a perfect pattern match (as matcher.ts's multi-layer bonus). */
const NON_PERFECT_MAX = 0.99;

export function contextAdditive(env: Env = process.env): boolean {
  return flagOn('ROUTER_CONTEXT_ADDITIVE', env);
}

/** The layer scores for the base score: with the flag on, the context layer taken out. */
export function scoreWithoutContext<T extends { context: number; matchedBy: MatchLayer[] }>(
  scores: T,
  additive: boolean
): T {
  if (!additive || (scores.context === 0 && !scores.matchedBy.includes('context'))) return scores;
  return { ...scores, context: 0, matchedBy: scores.matchedBy.filter((l) => l !== 'context') };
}

/** The base confidence plus the capped context boost; never lower than the base. */
export function addContextBonus(
  confidence: number,
  scores: { context: number; pattern: number; keyword: number },
  additive: boolean
): number {
  const { context: boost, pattern, keyword } = scores;
  if (!additive || !(boost > 0) || pattern >= 1.0 || !(pattern > 0 || keyword > 0)) {
    return confidence;
  }
  const raised = Math.min(NON_PERFECT_MAX, confidence + Math.min(CONTEXT_BONUS_CAP, boost));
  return Math.max(confidence, raised);
}

const NOT_WORD = /[^\p{L}\p{N}\s]+/gu;
const SPACES = /\s+/g;

function words(text: string | undefined): string {
  return (text ?? '').toLowerCase().replace(NOT_WORD, '').replace(SPACES, ' ').trim();
}

/**
 * The history before this turn: the trailing caller turns that together are exactly this
 * turn (the turn itself, or the final transcripts it was stitched from) are dropped.
 * A trailing turn that only shares words with this one stays.
 */
export function historyBeforeTurn(
  history: ConversationTurn[] | undefined,
  inputText: string
): ConversationTurn[] | undefined {
  const turn = words(inputText);
  if (history === undefined || history.length === 0 || !turn) return history;
  let joined = '';
  for (let start = history.length - 1; start >= 0; start--) {
    const last = history[start];
    const said = words(last?.text);
    if (last?.role !== 'user' || !said) break;
    joined = joined ? `${said} ${joined}` : said;
    if (joined === turn) return history.slice(0, start);
    if (!turn.endsWith(` ${joined}`)) break;
  }
  return history;
}
