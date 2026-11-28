/**
 * MORNING_BRIEF_WRITER: the deterministic check on a written brief (no second model); any
 * failure sends the template. Length and style; every fact named, or the last ones counted;
 * with the labels, times and name taken out, no advice and no name, number, date or word the
 * facts don't have; and not yesterday's opener (only its hash is stored).
 *
 * @module services/outreach/morning-brief/brief-check
 */

import { createHash } from 'node:crypto';
import type { BriefFact } from './brief-facts.js';
import { MAX_CHARS } from './compose.js';

export type CheckFailure =
  | 'empty' | 'too-long' | 'style' | 'missing-fact' | 'unseen-name' | 'unseen-number'
  | 'unseen-date' | 'unseen-word' | 'advice' | 'same-opener'; // prettier-ignore

export interface CheckContext {
  readonly facts: readonly BriefFact[];
  readonly name?: string;
  /** Yesterday's opener hash, when one was stored. */
  readonly lastOpener?: string | null;
}

const STYLE = /[!…—–]|\.{3}|\p{Extended_Pictographic}|hope this finds you/iu;
const ADVICE =
  /\b(?:you should (?:take|see|stop|start|buy|sell|invest|sue|sign)|dos(?:e|age)|\d+\s?mg|prescri|diagnos|lawyer|attorney|legal advice|sue|invest\w*|stocks?|crypto|refinanc\w*|deduct\w*)\b/iu;
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']; // prettier-ignore
const DATE_WORDS = new Set(
  'monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december tomorrow yesterday tonight weekend noon midnight'.split(' ') // prettier-ignore
);
/** Words of four letters or more Alex may use around the items; a word outside it fails. */
const VOICE = new Set(
  "morning good today today's this that there there's then with your have also just still open list call text want move anything something hand help from about after before first next later left waiting plus more other others couple things thing items item busy light full quiet easy start ahead keep need here what when which worth don't won't can't it's that's here's you've you're you'll let's know sure nothing else quick note reminder reminders task tasks overdue calendar lined plate free time check back some those these them they into over well again only sorted handled whenever ring shout give alex".split(' ') // prettier-ignore
);
const CAPS_OK = new Set(['i', "i'm", "i'll", "i've", "i'd", 'ok', 'alex']);

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const whole = (s: string): RegExp => new RegExp(`(?<![\\p{L}\\p{N}])${escape(s)}(?![\\p{L}\\p{N}])`, 'giu'); // prettier-ignore
/** "10 AM", "10:00a.m." read as "10am", the way compose.ts writes a time. */
const clocks = (s: string): string =>
  s.replace(
    /\b(\d{1,2})(?::(\d{2}))?\s?([ap])\.?m\b\.?/giu,
    (_m, h: string, m?: string, p = 'a') =>
      `${h}${m && m !== '00' ? `:${m}` : ''}${p.toLowerCase()}m`
  );
const stem = (w: string): string => w.replace(/(?:ing|ed|es|s)$/u, '');

/** The first sentence, lower case, letters, digits and spaces only. */
function openerOf(text: string): string {
  const first = text.trim().split(/(?<=[.?!])\s|\n/u)[0] ?? '';
  return first
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const openerHash = (text: string): string =>
  createHash('sha256').update(openerOf(text)).digest('hex').slice(0, 16);

/** Names left in `rest`: capital words mid-sentence, or a sentence start followed by "," or "'s". */
function unseenName(rest: string): boolean {
  for (const m of rest.matchAll(/[\p{Lu}][\p{L}']*/gu)) {
    const word = m[0].toLowerCase().replace(/'s$/u, '');
    if (CAPS_OK.has(word) || VOICE.has(word)) continue;
    const before = rest.slice(0, m.index).trimEnd();
    const initial = before === '' || /[.?!:\n]$/u.test(before);
    if (!initial || /^(?:,|'s)/u.test(rest.slice((m.index ?? 0) + m[0].length))) return true;
  }
  return false;
}

/** Why `text` can't go as written, or null when it can. */
export function checkBrief(raw: string, ctx: CheckContext): CheckFailure | null {
  const text = raw.trim().replace(/[’‘]/gu, "'");
  if (!text) return 'empty';
  if (text.length > MAX_CHARS) return 'too-long';
  if (STYLE.test(text)) return 'style';
  let rest = clocks(text);
  const named = ctx.facts.map((f) => whole(f.label).test(rest));
  for (const f of ctx.facts) rest = rest.replace(whole(f.label), ' ');
  for (const at of new Set(ctx.facts.flatMap((f) => (f.at ? [f.at] : [])))) rest = rest.replace(whole(at), ' '); // prettier-ignore
  if (ctx.name) rest = rest.replace(whole(ctx.name), ' ');
  const left = named.indexOf(false) === -1 ? 0 : named.length - named.indexOf(false);
  if (named.slice(named.length - left).some(Boolean)) return 'missing-fact'; // only the last may go
  const numbers = [...rest.matchAll(/\p{N}+|\p{L}+/gu)]
    .map((m) => m[0].toLowerCase())
    .flatMap((w) => (/^\p{N}+$/u.test(w) ? [Number(w)] : NUMBER_WORDS.includes(w) ? [NUMBER_WORDS.indexOf(w)] : [])); // prettier-ignore
  if (left > 0 && !new RegExp(`\\b(?:${left}|${NUMBER_WORDS[left] ?? left})\\s+(?:more|others?)\\b`, 'iu').test(rest)) return 'missing-fact'; // prettier-ignore
  if (ADVICE.test(rest)) return 'advice';
  if (unseenName(rest)) return 'unseen-name';
  if (numbers.some((n) => n !== left)) return 'unseen-number';
  const words = [...rest.toLowerCase().matchAll(/[\p{L}']+/gu)].map((m) => m[0].replace(/^'+|'+$/gu, '')); // prettier-ignore
  if (words.some((w) => DATE_WORDS.has(w))) return 'unseen-date';
  const labelWords = new Set(ctx.facts.flatMap((f) => f.label.toLowerCase().match(/\p{L}+/gu) ?? []).map(stem)); // prettier-ignore
  const known = (w: string): boolean => VOICE.has(w) || NUMBER_WORDS.includes(w) || labelWords.has(stem(w)); // prettier-ignore
  if (words.some((w) => w.length > 3 && !known(w))) return 'unseen-word';
  if (ctx.lastOpener && openerHash(text) === ctx.lastOpener) return 'same-opener';
  return null;
}
