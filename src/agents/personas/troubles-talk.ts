/**
 * Troubles talk: how a good friend listens when someone brings them a trouble
 * or big news, measured against the research on supportive talk.
 *
 * Coded baseline (41 synthetic eval calls, 157 substantive Ferni turns,
 * 2026-10-16): the big news itself got a stock reaction ("I am sorry, Sam.")
 * in 8 of 8 first disclosures; Ferni turned to his own life during a trouble
 * in 6 of 69 heavy turns ("Do you have a minute to talk?" got his brother's
 * snow); the caller had 34% of the talk and Ferni was longer in 77% of heavy
 * turns; unasked advice came after support and a question in 2 of 13 (Feng
 * 2014); reflections were shallow or templated ("has a way of"), with the
 * sheet's "don't name their feelings" ruling out saying the meaning back; and
 * laughing along can land on a trouble, which listeners don't do (Jefferson 1984).
 *
 * TROUBLES_TALK=on (off by default) adds the lines below to the per-turn shape
 * (turn-shape.ts), holds back the moves that shift the talk to Ferni during a
 * trouble (second story, asking his advice, the life ledger's thread invite,
 * laughing along) and swaps the sheet's feelings line (prompt-loader.ts).
 *
 * Precedence: LISTEN_FIRST's listening reply (a caller low on energy) replaces
 * the drawn shape whole, so on those turns none of these per-turn lines ride
 * and its "a few words or one short sentence" is the only length; the sheet
 * swap and the quieter ledger still apply. With TURN_LENGTH=learned, the
 * learned length line carries the cap below instead of a second length line.
 *
 * @module agents/personas/troubles-talk
 */

import { hardNews } from './turn-candor.js';
import { callerVenting, type TurnSignals } from './turn-extras.js';

type Env = Record<string, string | undefined>;

export function troublesTalkEnabled(env: Env = process.env): boolean {
  return env.TROUBLES_TALK === 'on';
}

/** A trouble announced before it is told: "Do you have a minute?", "Can I talk to you about something?" */
const TROUBLE_OPENING =
  /\b(?:(?:do|have|got) you (?:got |have )?(?:a (?:minute|sec(?:ond)?|moment)|(?:some )?time)(?: to talk)?|can (?:i|we) (?:talk|tell you|ask you)(?: to you)? about something|can we talk|i need to talk|something(?:'s| has| is)? (?:been )?(?:going on|happened|on my mind|bugging me))\b/i;

export function troubleOpening(text: string): boolean {
  return TROUBLE_OPENING.test(text);
}

/** This turn is a trouble: venting or bad news (the signals), hard news, or a trouble announced. */
export function troubleTurn(
  text: string,
  sig: Pick<TurnSignals, 'careful' | 'supportFirst'>
): boolean {
  return sig.careful || sig.supportFirst === true || hardNews(text) || troubleOpening(text);
}

/** From the words alone (the life ledger has no signals): venting, hard news or a trouble announced. */
export function troubleWords(text: string): boolean {
  return callerVenting(text) || hardNews(text) || troubleOpening(text);
}

/** They are telling something (news, a story, how it went), not asking Ferni a question. */
export function telling(text: string, move: TurnSignals['move']): boolean {
  return move === 'share' && !text.includes('?');
}

/** Fewer words than this and "no longer than they said" would be a grunt. */
const LENGTH_FLOOR = 8;

export function lengthCap(text: string): number {
  return Math.max(LENGTH_FLOOR, text.trim().split(/\s+/).filter(Boolean).length);
}

export const REFLECT =
  'Say back the meaning under what they said, in your own words, as a statement: not a feelings label, and not a stock frame like "has a way of" or "the hardest part".';

/** The per-turn lines for something they shared (turn-shape.ts): the peak, the reflection, the advice order. */
export const SHARE_LINES = [
  'When they first tell you something big, good or bad, react to that exact thing and what it means for them, not a stock line like "I\'m sorry" or "that\'s heavy".',
  REFLECT,
  "Hold a suggestion they didn't ask for until you've shown you get how it lands for them and asked one question about it; then offer it as one option. If they ask for advice, give it.",
];

export function tellingLengthLine(cap: number): string {
  return `They're telling you something: say no more than they just did, ${cap} words at most.`;
}

/**
 * The character sheet's line (ferni and the coaches) with the feelings ban
 * swapped for REFLECT. A sheet without the line (Maya's) is returned as is.
 */
const FEELINGS_BAN = /(don't [^;.]*?) or name their feelings for them;(.*?you let them lead\.)/;
/** Nayan "doesn't rush to make meaning of it": "say back the meaning" would contradict that. */
const REFLECT_HEARD =
  'You say back what you heard underneath it, in your own words, as a statement: not a feelings label, and not a stock frame like "has a way of" or "the hardest part".';

export function withReflection(sheet: string, env: Env = process.env): string {
  if (!troublesTalkEnabled(env)) return sheet;
  return sheet.replace(FEELINGS_BAN, (_line, dont: string, rest: string) => {
    const reflect = /\bmeaning\b/.test(dont) ? REFLECT_HEARD : `You s${REFLECT.slice(1)}`;
    return `${dont};${rest} ${reflect}`;
  });
}
