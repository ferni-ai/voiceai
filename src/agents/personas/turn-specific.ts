/**
 * Two levers against the judge's commonest tell, a generic reply (blind next-turn test,
 * scripts/voice-eval/next-turn, 2026-10-11: "generic or cliché" in 60% of the pairs Ferni lost
 * with his length already learned; he reacted to or commented on what was said in 45% of replies,
 * friends in 16%).
 *
 * TURN_SPECIFIC=on: the reply picks up one concrete thing from the caller's last turn, in its own
 * words, and of two drafts made side by side the more specific one is kept: it reuses a content
 * word of theirs, and has no stock phrase (turn-cliche-table.generated.ts, phrases Ferni uses 15x
 * as often as friends) and no wholesale echo. Scoring is a few microseconds.
 *
 * TURN_FOLLOWUP=learned: at the rate friends ask in the same kind of moment
 * (turn-move-table.generated.ts), the reply is the short, curious question a friend blurts out
 * about what was just said, instead of a comment on it.
 *
 * Both off by default.
 *
 * @module agents/personas/turn-specific
 */

import { STOCK_PHRASES } from './turn-cliche-table.generated.js';
import { MOVES, NEXT_MOVE } from './turn-move-table.generated.js';
import type { RecentTurns } from './turn-length.js';

type Env = Record<string, string | undefined>;
export const specificOn = (env: Env = process.env): boolean => env.TURN_SPECIFIC === 'on';
export const followUpLearned = (env: Env = process.env): boolean => env.TURN_FOLLOWUP === 'learned';

export const SPECIFIC_LINE =
  "Pick up one concrete thing from what they just said (a name, a place, a thing, a number, what happened) and say something new about it in your own words; don't sum up or repeat what they said.";
export const FOLLOWUP_LINE =
  'THIS REPLY: instead of commenting, ask the one short question a close friend would blurt out about what they just said, about its most surprising or personal part, in a few words, with nothing before it.';

const STOP = new Set(
  'that this with have from they them were what when there their about would could should really just like know think going been into your then than also some well yeah okay because thing things said says tell told'.split(
    ' '
  )
);
const wordsOf = (t: string): string[] =>
  t
    .toLowerCase()
    .replace(/<[^>]*>|\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
const content = (ws: string[]): string[] => ws.filter((w) => w.length >= 4 && !STOP.has(w));

/** How specific a draft is to what they said: higher is better. */
export function specificity(reply: string, said: string): number {
  const r = wordsOf(reply);
  const theirs = new Set(content(wordsOf(said)));
  const mine = content(r);
  const reuses = mine.some((w) => theirs.has(w)) ? 1 : 0;
  const text = ` ${r.join(' ')} `;
  const stock = STOCK_PHRASES.filter((p) => text.includes(` ${p} `)).length;
  // Echo: most of the reply's content words are theirs, or it repeats four of their words in a row.
  const s = wordsOf(said);
  const run = r.some(
    (_, i) => i + 4 <= r.length && ` ${s.join(' ')} `.includes(` ${r.slice(i, i + 4).join(' ')} `)
  );
  const echo =
    run || (mine.length >= 2 && mine.filter((w) => theirs.has(w)).length / mine.length > 0.6)
      ? 1
      : 0;
  return reuses - 1.5 * stock - echo;
}

/** The more specific of drafts made side by side (the first on a tie). */
export function pickSpecific(drafts: string[], said: string): number {
  let best = 0;
  drafts.forEach((d, i) => {
    if (specificity(d, said) > specificity(drafts[best], said)) best = i;
  });
  return best;
}

const bucket = (x: number, edges: number[]): number => edges.filter((e) => x > e).length;

/** Whether this reply is a curious follow-up, at the rate friends ask in this kind of moment. */
export function followUpNow(
  said: string,
  recent: RecentTurns | undefined,
  rng: () => number
): boolean {
  const asked = /\?\s*$/.test(said.trim()) ? 1 : 0;
  const n = said.split(/\s+/).filter(Boolean).length;
  const key = `${asked}${bucket(n, [6, 15])}${bucket(recent?.ferniLastWords ?? 0, [4, 12])}`;
  const shares = NEXT_MOVE[key] ?? NEXT_MOVE['010'];
  return rng() < shares[MOVES.indexOf('ask')];
}
