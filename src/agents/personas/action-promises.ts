/**
 * Ferni's promise to call or message someone, said with no tool call.
 *
 * Dev replay 2026-10-18: Ferni said "I'll text him then" and called nothing,
 * and the action-claim guard let it stand. A plain future is not a claim that
 * something happened (action-claims.ts leaves "I'll text Dana that you're
 * running late" alone, since the confirm read-back sounds like that), but a
 * future self-commitment with no tool behind it promises what nothing will do.
 *
 * The guard (action-claim-guard.ts) holds such a sentence until the reply shows
 * whether a tool of that kind runs: if one does, the words go out as written;
 * if none does, the promise is asked as an offer instead ("Want me to text
 * him?"), so the caller's yes is what sends it. Only calls and messages: those
 * are the promises a tool must keep, and "I'll remember that" is a figure of
 * speech. Offers, questions, conditions and negations are never promises.
 *
 * @module agents/personas/action-promises
 */
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';
import { kindsOfTool, type ActionKind } from './action-claims.js';
import type { ClaimKind } from './honest-line.js';

const KIN =
  '(?:mom|mum|mother|dad|father|sister|brother|grandma|grandmother|gran|grandpa|grandfather|aunt|auntie|uncle|cousin|wife|husband|partner|son|daughter|kids?|friend|boss|doctor|dentist|landlord|teacher|neighbou?r|family)';
/** Someone in the caller's world: a pronoun, a name (read as "her"), or a relative. Never "you". */
const WHO = `(?:her|him|them|${KIN}|your (?:\\w+ )?${KIN})\\b(?!'s)`;
const NUMBER = '(?:(?:that|the|this|her|his|their|your \\w+) number|\\d[\\d -]{2,})';
// "I'll make sure to give them a call" (#3006, prod 2026-10-28) is a promise too.
const WILL =
  "\\b(?:i'll|i will|let me|i'm going to|i'm gonna)(?: go ahead and| just| quickly| make sure (?:to|i))?";

const PROMISES: Record<'call' | 'send', RegExp[]> = {
  call: [
    new RegExp(`${WILL} (?:call|ring|phone|dial) (?:${WHO}|${NUMBER})(?! back)`),
    new RegExp(`${WILL} give ${WHO} a (?:ring|call|buzz)`),
    new RegExp(`${WILL} (?:make|place) (?:that|the|this) call\\b`),
  ],
  send: [
    new RegExp(`${WILL} (?:text|message|email|ping) ${WHO}`),
    new RegExp(`${WILL} send (?:it|that|this|the (?:text|message|email|note)|${WHO})`),
    new RegExp(
      `${WILL} (?:shoot|drop) ${WHO} a (?:quick |short )?(?:text|message|note|email|line)`
    ),
  ],
};

/** An offer, question, condition or negation anywhere in the sentence: not a promise. */
const NOT_A_PROMISE =
  /\?|\b(?:want me to|should i|shall i|can i|could i|i can|i could|i'd|i would|would you like|do you want|say the word|let me know|if you|once you|after you|when you|unless|i can't|i cannot|i won't|i haven't|i didn't|i don't|i'm not|never)\b/;
/** Ferni's own life or an idiom: "I'll call it a day", "I'll send you a hug", last summer. */
const NOT_AN_ACTION =
  /\b(?:yesterday|last (?:night|week|month|year|time)|ago|used to|back when|someday|one day)\b|\bcall (?:it|that|this)\b|\bsend(?:ing)? (?:you )?(?:\w+ ){0,4}(?:hugs?|love|vibes|strength|thoughts|prayers|energy|luck|warmth)\b|\bin (?:my|your) (?:heart|head|mind|dreams)\b|\bin spirit\b/;

/** A message's quoted words are never Ferni's; a capitalised name mid-sentence reads as "her". */
const normalize = (text: string): string =>
  text
    .replace(/"[^"]*"|“[^”]*”/g, ' ')
    .replace(/([a-z,;:]\s+)(?!I\b|I'|I’)[A-Z][a-z]+\b(?!['’])/g, '$1her')
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/** The kind of action a sentence promises Ferni will do now (a call or a message), or null. */
export function promisedAction(sentence: string): ActionKind | null {
  const text = normalize(sentence);
  if (NOT_A_PROMISE.test(text) || NOT_AN_ACTION.test(text)) return null;
  return (['call', 'send'] as const).find((k) => PROMISES[k].some((re) => re.test(text))) ?? null;
}

const PROMISE_OF =
  /\b(?:I'll|I will|let me|I'm going to|I'm gonna)\s+(?:go ahead and |just |quickly |make sure (?:to|I) )?([^.!?,;]+?)(?:\s+(?:then|now|right now|right away|straight away|for you|real quick|in a (?:sec|second|minute|moment)))*\s*(?:[.!,;]|$)/i;

/** The promise asked as an offer instead: "I'll text him then." is "Want me to text him?" */
export function offerFor(sentence: string): string | undefined {
  const m = PROMISE_OF.exec(sentence.replace(/[‘’]/g, "'"));
  return m ? `Want me to ${m[1].trim()}?` : undefined;
}

/**
 * The kinds of action a tool ran for since the caller last spoke: the reply
 * after a tool's result may say "I'll send that now" of what already ran. Any
 * tool that ran counts as a 'lookup', so "I checked" may stand (announced-check.ts).
 */
export function kindsRunThisTurn(chatCtx: { items: readonly unknown[] }): Set<ClaimKind> {
  const kinds = new Set<ClaimKind>();
  const items = chatCtx.items as ReadonlyArray<{
    type?: string;
    role?: string;
    name?: string;
    textContent?: string;
  }>;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    const note = item.textContent?.startsWith(TURN_CONTEXT_HEADER) ?? false;
    if (item.type === 'message' && item.role === 'user' && !note) break;
    if (item.type === 'function_call' || item.type === 'function_call_output') {
      for (const kind of kindsOfTool(item.name ?? '')) kinds.add(kind);
      kinds.add('lookup');
    }
  }
  return kinds;
}
