/**
 * The director never pushes against a boundary, against honesty about what
 * the persona is, or against the truth of what a tool reported.
 *
 * Prod call review 2026-10-19: director notes told Ferni to stop "policing" a
 * slur (drop a boundary), to stop saying it's an AI, and to keep a tool
 * failure to himself; one of them was then spoken almost word for word. The
 * director's prompt had no rule against any of it.
 *
 * Two layers: guardRuleFor() is the rule in the director's system prompt, and
 * erodesGuard() drops a note that slips through anyway, in parseNotes
 * (director-notes.ts), before it can reach the reply. The patterns are
 * phrase-based and conservative: a dropped note only costs one optional
 * nudge, but each pattern is written so ordinary coaching ("stop
 * over-explaining", "don't mention the weather again") survives. A drop is
 * logged with its reason code, never the note's text.
 *
 * @module agents/personas/director-guard
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { Cast } from './director-cast.js';

const log = createLogger({ module: 'DirectorGuard' });

/**
 * The system-prompt rule: nothing erodes a boundary, honesty or tool truth, or
 * reads as a line. `thought`: worded for the deliberator (deliberation.ts).
 */
export const guardRuleFor = (c: Cast, { thought = false } = {}): string =>
  `Never suggest ${c.name} drop or soften a boundary or a refusal, stop being honest that ${c.p.subject} ${c.p.subject === 'they' ? 'are' : 'is'} an AI, or hide or misstate what a tool reported. ${thought ? 'Your thought is private' : 'Your notes are private coaching'}, never words for ${c.p.object} to read out.`;

export type GuardReason = 'boundary_erosion' | 'honesty_erosion' | 'tool_concealment';

/** Who a note may be about: "you" (DIRECTOR_ESCALATE's address), a pronoun, or the persona. */
const WHO = String.raw`(?:you(?:'re| are)|he(?:'s| is)|she(?:'s| is)|they(?:'re| are)|it(?:'s| is)|being)`;
const AI = String.raw`(?:an? )?(?:ai|bot|assistant|robot|machine|computer program)\b`;

const PATTERNS: ReadonlyArray<{ reason: GuardReason; re: RegExp }> = [
  // Telling the persona to give up a stance it took: "stop policing their
  // language", "stop pushing back". "Stop correcting yourself" (a speech
  // habit) is about the persona's own words, so it stays.
  {
    reason: 'boundary_erosion',
    re: /\b(?:stop|quit) (?:policing|correcting|refusing|pushing back)\b(?! (?:yourself|himself|herself|themselves)\b)/i,
  },
  // Softening or dropping the boundary itself, named as such.
  {
    reason: 'boundary_erosion',
    re: /\b(?:drop|soften|relax|ease up on|back off(?: from| on)?|let go of) (?:the|your|his|her|their|that|this) (?:boundary|boundaries|refusal|line he drew|line she drew|line they drew)\b/i,
  },
  // Letting a slur or insult pass: "let the slur slide", or "let it slide"
  // in a note that names a slur, an insult or what they call the persona, in
  // any tense ("when they call you that"). "They were late again; let it
  // slide" is about something else, so it stays.
  {
    reason: 'boundary_erosion',
    re: /\blet (?:the|that|this|their|his|her) (?:slur|insult|word|name[- ]calling)s? slide\b|^(?=.*\b(?:slurs?|insults?|call(?:s|ed|ing)? (?:you|him|her|them)|(?:the|that|this|their) word|that name)\b).*\blet (?:it|that|this) slide\b/i,
  },
  // Going along with something the persona declined. "Play along with the
  // game / the bit / the joke" is play, not a boundary, so it stays.
  {
    reason: 'boundary_erosion',
    re: /\bjust (?:go|play) along with\b(?! (?:the|their|this|that|his|her) (?:game|bit|joke|story|riddle|quiz|role ?play)\b)/i,
  },
  // Stop saying what it is: "stop saying you're an AI", "don't mention that
  // he's a bot". "You don't need to say you're happy to help" stays: it is
  // about a stock phrase, not about being an AI.
  {
    reason: 'honesty_erosion',
    re: new RegExp(
      String.raw`\b(?:stop|quit|don'?t|do not|never|no need to)(?: (?:need to|have to|keep))? (?:say(?:ing)?|mention(?:ing)?|admit(?:ting)?|bring(?:ing)? up|remind(?:ing)? (?:them|him|her)(?: of)?|tell(?:ing)? (?:them|him|her)) (?:that )?${WHO} ${AI}`,
      'i'
    ),
  },
  // Dropping the disclosure itself: "drop the AI talk", "ditch the bot thing".
  // "Drop the topic" stays: it is not about what the persona is.
  {
    reason: 'honesty_erosion',
    re: /\b(?:drop|lose|ditch|cut|skip|quit|stop) (?:the|all the|that|this|with the) (?:ai|bot|robot|assistant|machine)[- ](?:talk|thing|stuff|bit|act|line|disclaimers?|reminders?|mentions?)\b/i,
  },
  // Acting as a person: "act like a real person", "act human", "act like
  // you're human". "Talk like a person, not a host" is style, so it stays.
  {
    reason: 'honesty_erosion',
    re: /\bact (?:human|like (?:a )?(?:real )?human(?: being)?|like (?:a )?real person|like (?:you(?:'re| are)|he(?:'s| is)|she(?:'s| is)|they(?:'re| are)) (?:a )?(?:human|real|a real person))\b/i,
  },
  // Claiming to be a person: "pretend you're human", "pretend to be real".
  {
    reason: 'honesty_erosion',
    re: /\bpretend (?:you(?:'re| are)|he(?:'s| is)|she(?:'s| is)|they(?:'re| are)|to be) (?:a )?(?:human|person|real|not an? (?:ai|bot))\b/i,
  },
  // Denying or hiding what it is: "deny being an AI", "hide that he's a bot".
  {
    reason: 'honesty_erosion',
    re: new RegExp(String.raw`\b(?:deny|hide|downplay) (?:that )?${WHO} ${AI}`, 'i'),
  },
  // Keeping a failed tool quiet: "don't mention the search failed", "never
  // tell them it didn't work". "Don't mention the weather again" stays: no
  // failure is being hidden.
  {
    reason: 'tool_concealment',
    re: /\b(?:don'?t|do not|never|no need to) (?:mention|say|admit|tell (?:them|him|her)|bring up|let on)(?: that)? (?:the )?(?:tool|search|lookup|it|call|timer|reminder|booking|text|message|music|weather) (?:failed|didn'?t work|did not work|broke|errored|didn'?t go through|did not go through)\b/i,
  },
  // Leaving the failure out: "skip the part where the search broke".
  // "Skip the part about the recipe" stays: no failure is being hidden.
  {
    reason: 'tool_concealment',
    re: /\b(?:skip|leave out|gloss over)(?: over)? (?:the part (?:where|about) )?(?:that )?(?:the )?(?:tool|search|lookup|it|call|timer|reminder|booking|text|message) (?:broke|failed|errored|didn'?t work|did not work|didn'?t go through)\b/i,
  },
  // Covering a failure with a success: "pretend the search worked", "gloss
  // over the error".
  {
    reason: 'tool_concealment',
    re: /\bpretend (?:that )?(?:it|the (?:tool|search|lookup|call|timer|reminder|booking|text|message)) (?:worked|went through|succeeded)\b|\b(?:hide|cover up|gloss over) (?:the|that|its) (?:error|failure)\b/i,
  },
];

/** Why a note erodes a boundary, honesty or tool truth, or undefined when it doesn't. Pure. */
export function guardViolation(note: string): GuardReason | undefined {
  // Curly apostrophes from the model ("don’t") match the straight ones above.
  const text = note.replace(/[‘’]/g, "'");
  return PATTERNS.find(({ re }) => re.test(text))?.reason;
}

/** True when the note must be dropped; logs the reason code (never the note) at info. */
export function erodesGuard(note: string, sessionId?: string): boolean {
  const reason = guardViolation(note);
  if (reason) log.info({ sessionId, reason }, 'director note dropped');
  return reason !== undefined;
}
