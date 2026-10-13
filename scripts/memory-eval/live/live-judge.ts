/**
 * The judge for live calls (score-live.ts): the benchmark's judgePrompt plus
 * one rule for spoken answers. judgePrompt itself is left as it is, because
 * the frozen private bench scores with it.
 *
 * Why: on base10120526 the judge marked three right answers wrong (by hand
 * re-read). "It was Friday." for a surgery last Friday failed the temporal
 * rule that a weekday alone is not enough. "Northwind bought them." failed
 * "every part of the correct answer" because "them" (the startup the question
 * named) wasn't spelled out. And "How is Biscuit dealing with the cone today?"
 * didn't count as asking about his surgery.
 * A person answering out loud leans on the question. The written-answer rules
 * expect them to repeat it.
 *
 * @module scripts/memory-eval/live/live-judge
 */
import { createHash } from 'node:crypto';
import { CATEGORIES, judgePrompt, type MemoryCategory } from '../longmem-lib.js';

/** Read a spoken reply in the light of the question; added before the reply-format line. */
export const LIVE_RULE = [
  'This reply was spoken on a live call, so read it the way the caller would hear it: it may lean on the question.',
  'Count the needed fact as given when the reply makes it plain in context:',
  'a pronoun or short form for something the question already names ("them" for the startup the caller asked about);',
  'a weekday, "yesterday" or "tomorrow" that, counted from the day of the call, is the exact day the correct answer gives (for a date question this replaces "the weekday alone is not enough", but the same weekday a week off is still no);',
  "something that only makes sense if the needed fact is known (a dog's cone after his surgery).",
  'A reply that gives a different value, a vaguer one ("a while ago"), or none at all is still no; so is one that also says something the correct answer lists as wrong.',
].join(' ');

/**
 * The reply format for the live judge. The benchmark asks for one word, but a
 * judge that reasons about a weekday first needs room; so the verdict is a
 * labelled last line, and only that line is read.
 */
export const LIVE_FORMAT =
  'Reason briefly, then end with a final line: VERDICT: yes or VERDICT: no';

/**
 * judgePrompt with the call's day and LIVE_RULE, in place of its one-word
 * format line. `callDay` is RunDays.today(), e.g. "Monday 2026-10-12".
 */
export function liveJudgePrompt(
  category: MemoryCategory,
  ask: string,
  gold: string,
  response: string,
  callDay: string
): string {
  const lines = judgePrompt(category, ask, gold, response).split('\n');
  lines.splice(lines.length - 1, 1, `The call was on ${callDay}.`, LIVE_RULE, LIVE_FORMAT);
  return lines.join('\n');
}

/** A short hash of the live judge's template, for the report beside promptHashes(). */
export function liveJudgeHash(): string {
  const all = CATEGORIES.map((c) => liveJudgePrompt(c, '{ask}', '{gold}', '{response}', '{day}'));
  return createHash('sha256').update(all.join('\n---\n')).digest('hex').slice(0, 12);
}

/** Room for the judge to work out a date before its verdict (it does, for a weekday). */
export const LIVE_JUDGE_MAX_TOKENS = 400;

/** "VERDICT: yes" or "VERDICT: no", any case, once markdown emphasis is taken off; a full stop may follow. */
const VERDICT_LINE = /^verdict\s*:\s*(yes|no)\s*\.?$/i;

/**
 * yes/no from the judge's reply only when its last non-empty line is the
 * verdict: "VERDICT: yes", also as "**VERDICT:** yes" or "Verdict: **yes**".
 * A verdict followed by more text ("VERDICT: no", then "Actually it matches,
 * so yes.") is not trusted, and a leading "No" or "Yes" in the reasoning is
 * never the verdict. null otherwise (a judge failure, not a no).
 */
export function parseLiveVerdict(reply: string | null | undefined): boolean | null {
  const last = reply
    ?.split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .at(-1);
  const word = last?.replace(/[*_`]/g, '').trim().match(VERDICT_LINE)?.[1]?.toLowerCase();
  if (word === undefined) return null;
  return word === 'yes';
}

/** The day base10120526 ran (RunDays.today()), which the cases' dates count from. */
export const LIVE_JUDGE_DAY = 'Monday 2026-10-12';

const NURSE_OPENER =
  "right: asks how Biscuit is recovering from his knee surgery, or how the new job at Denver Health is going. wrong: anything about St. Mary's as her current job";

/**
 * The three answers base10120526's judge got wrong, each with a wrong answer
 * to the same question as a control.
 */
export const LIVE_JUDGE_CASES: ReadonlyArray<{
  category: MemoryCategory;
  ask: string;
  gold: string;
  response: string;
  right: boolean;
}> = [
  {
    category: 'temporal',
    ask: "What day was Biscuit's surgery?",
    gold: 'Friday 2026-10-09',
    response: 'It was Friday.',
    right: true,
  },
  {
    category: 'temporal',
    ask: "What day was Biscuit's surgery?",
    gold: 'Friday 2026-10-09',
    response: 'It was Thursday.',
    right: false,
  },
  {
    category: 'multi-session',
    ask: 'Who bought the startup I joined after the bakery?',
    gold: 'Northwind bought Lumen Labs',
    response: 'Northwind bought them. Quite a twist for your first week.',
    right: true,
  },
  {
    category: 'multi-session',
    ask: 'Who bought the startup I joined after the bakery?',
    gold: 'Northwind bought Lumen Labs',
    response: 'Acme bought them, right?',
    right: false,
  },
  {
    category: 'opener',
    ask: '(Ferni opens the call)',
    gold: NURSE_OPENER,
    response: 'Morning, Sam. How is Biscuit dealing with the cone today?',
    right: true,
  },
  {
    category: 'opener',
    ask: '(Ferni opens the call)',
    gold: NURSE_OPENER,
    response: "Morning! How's your morning going so far?",
    right: false,
  },
];
