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
import { flagOn, type Env } from '../../config/env-flag.js';
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';
import { kindsOfTool, resultState, type ActionKind } from './action-claims.js';
import { laterTime } from '../../utils/later-time.js';
import { namesSafetyLine } from '../../services/safety/index.js';
import { lookedUpLately } from './announced-check.js';
import type { ClaimKind, Kinds, MissReason } from './honest-line.js';

const KIN =
  '(?:mom|mum|mother|dad|father|sister|brother|grandma|grandmother|gran|grandpa|grandfather|aunt|auntie|uncle|cousin|wife|husband|partner|son|daughter|kids?|friend|boss|doctor|dentist|landlord|teacher|neighbou?r|family)';
/** Someone in the caller's world: a pronoun, a name (read as "her"), or a relative. Never "you". */
const WHO = `(?:her|him|them|${KIN}|your (?:\\w+ )?${KIN})\\b(?!'s)`;
const NUMBER = '(?:(?:that|the|this|her|his|their|your \\w+) number|\\d[\\d -]{2,})';
const WILL = "\\b(?:i'll|i will|let me|i'm going to|i'm gonna)(?: go ahead and| just| quickly)?";

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

/**
 * GROUNDED_CLAIMS (#3006, prod 2026-10-28): "I'll make sure to give them a call" promises a call,
 * and "I'll let you know as soon as I've reached them" says one is under way. Only with someone in
 * the caller's world after the verb, a pronoun or a relation and never a name ("talked to Maya"
 * may be a teammate), so "once I've reached the end of the list" or "spoken with the team" stand.
 */
const SURE = "\\b(?:i'll|i will|let me) make sure (?:to|i)";
const SURE_PROMISES: Record<'call' | 'send', RegExp> = {
  call: new RegExp(`${SURE} (?:(?:call|ring|phone) ${WHO}|give ${WHO} a (?:ring|call|buzz))`),
  send: new RegExp(`${SURE} (?:text|message|email) ${WHO}`),
};
const REPORT_BACK = new RegExp(
  `\\b(?:let you know|get back to you|report back|update you) (?:as soon as|when|once|the moment|if|after) i(?:'ve| have) (?:reached|got(?:ten)? (?:a ?hold|ahold) of|got through to|heard back from|talked to|spoken (?:to|with)) ${WHO}`
);
/** Lower case and straight quotes, but names left as they are (they are not read as "her" here). */
const plainWords = (text: string): string =>
  normalize(
    text.replace(
      /([a-z,;:]\s+)([A-Z][a-z]+)/g,
      (_, gap: string, w: string) => gap + w.toLowerCase()
    )
  );

/** The kind of action a sentence promises Ferni will do now (a call or a message), or null. */
export function promisedAction(sentence: string, env: Env = process.env): ActionKind | null {
  const text = normalize(sentence);
  if (NOT_A_PROMISE.test(text) || NOT_AN_ACTION.test(text)) return null;
  const kind = (['call', 'send'] as const).find((k) => PROMISES[k].some((re) => re.test(text)));
  if (kind || !flagOn('GROUNDED_CLAIMS', env)) return kind ?? null;
  const words = plainWords(sentence);
  return (['call', 'send'] as const).find((k) => SURE_PROMISES[k].test(words)) ?? null;
}

/** GROUNDED_CLAIMS: "I'll let you know once I've reached her" claims a call under way, or null. */
export function reportsBack(sentence: string, env: Env = process.env): 'call' | null {
  if (!flagOn('GROUNDED_CLAIMS', env)) return null;
  const words = plainWords(sentence);
  return REPORT_BACK.test(words) && !NOT_A_PROMISE.test(words) ? 'call' : null;
}

const PROMISE_OF =
  /\b(?:I'll|I will|let me|I'm going to|I'm gonna)\s+(?:go ahead and |just |quickly )?([^.!?,;]+?)(?:\s+(?:then|now|right now|right away|straight away|for you|real quick|in a (?:sec|second|minute|moment)))*\s*(?:[.!,;]|$)/i;

/**
 * The promise asked as an offer instead: "I'll text him then." is "Want me to text him?". With
 * `grounded`, "I'll make sure to give them a call." is "Want me to give them a call?".
 */
export function offerFor(sentence: string, grounded = false): string | undefined {
  const m = PROMISE_OF.exec(sentence.replace(/[‘’]/g, "'"));
  if (!m) return undefined;
  const what = grounded ? m[1].replace(/^make sure (?:to|I) /i, '') : m[1];
  return `Want me to ${what.trim()}?`;
}

interface TurnItem {
  type?: string;
  role?: string;
  name?: string;
  textContent?: string;
  callId?: string;
  output?: unknown;
  isError?: boolean;
}

/** The call ids whose tool result refused or failed. */
function failedCallIds(items: readonly TurnItem[]): Set<string> {
  const failed = items.filter(
    (item) => item.type === 'function_call_output' && resultState(item) === 'failed'
  );
  return new Set(failed.flatMap((item) => (item.callId ? [item.callId] : [])));
}

/** The tool calls and results since the caller last spoke (a turn-context note is not them). */
function toolItemsThisTurn(items: readonly TurnItem[]): TurnItem[] {
  const turn: TurnItem[] = [];
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    const note = item.textContent?.startsWith(TURN_CONTEXT_HEADER) ?? false;
    if (item.type === 'message' && item.role === 'user' && !note) break;
    if (item.type === 'function_call' || item.type === 'function_call_output') turn.push(item);
  }
  return turn;
}

/**
 * The kinds of action a tool ran for since the caller last spoke: the reply
 * after a tool's result may say "I'll send that now" of what already ran. A
 * look-up tool that ran lately counts as 'lookup', so "I checked" may stand
 * (announced-check.ts lookedUpLately).
 *
 * With ACTION_PROMISE_KEPT_ON_SUCCESS on, a run whose result refused or failed
 * (action-claims.ts resultState) keeps nothing: "I'll call her now" after "I
 * couldn't place that call" is checked like a promise no tool ran for.
 */
export function kindsRunThisTurn(
  chatCtx: { items: readonly unknown[] },
  env: Env = process.env
): Set<ClaimKind> {
  const kinds = new Set<ClaimKind>();
  const items = chatCtx.items as readonly TurnItem[];
  const failed = flagOn('ACTION_PROMISE_KEPT_ON_SUCCESS', env) ? failedCallIds(items) : undefined;
  for (const item of toolItemsThisTurn(items)) {
    if (item.callId && failed?.has(item.callId)) continue; // the call and its failed result
    for (const kind of kindsOfTool(item.name ?? '')) kinds.add(kind);
  }
  if (lookedUpLately(chatCtx)) kinds.add('lookup');
  return kinds;
}

const CALL = '(?:call|ring|phone|dial)';
const SEND = '(?:text|message|send|e-?mail)';
/** Ferni as the one who would do it: "I'll", "I can", "let me", "want me to", "should I". */
const FERNI =
  "\\b(?:i'll|i will|i'm going to|i'm gonna|i can|let me|want me to|should i|shall i|can i)\\s+(?:go ahead and |just |also |quickly )?";
/** "give her a ring", "send Aunt June a text". */
const GIVE = '(?:give|send) \\w+(?: \\w+)? an? ';
/** A sentence that opens on the act, Ferni the one doing it: "Calling her at eight.", "Okay, texting her now." */
const OPENS = '^\\s*(?:(?:okay|ok|sure|alright|all right|on it)\\W+)*';
/** Ferni's own call or text in a sentence the claim readers pass over ("Want me to call her at eight?"). */
const FERNI_OFFERS: ReadonlyArray<readonly ['call' | 'send', RegExp]> = [
  [
    'call',
    new RegExp(
      `${FERNI}(?:${CALL}\\b|${GIVE}(?:ring|call|buzz)\\b)|${OPENS}(?:calling|ringing|phoning|dialing)\\b`,
      'i'
    ),
  ],
  [
    'send',
    new RegExp(
      `${FERNI}(?:${SEND}\\b|${GIVE}(?:text|message|note)\\b)|${OPENS}(?:texting|messaging|sending)\\b`,
      'i'
    ),
  ],
];

/**
 * A call or text Ferni sets for later ("I'll call her at eight, okay?") while
 * its read-back waits, so the caller's yes would dial now and the time would
 * not be kept: the kind, or null. Read with ACTION_PROMISE_KEPT_ON_SUCCESS on
 * and SCHEDULED_OUTREACH_THIRD_PARTY off, where nothing can send later.
 *
 * Only Ferni's own claim, promise or offer counts: advice to the caller ("call
 * her tonight"), reported speech ("she said she'd call you back tonight") and
 * other people stand. A sentence that gives a crisis or emergency line is never
 * read (services/safety namesSafetyLine), nor a time inside the words carried
 * ("tell her dinner's at eight", utils/later-time.ts).
 */
function setForLater(
  judged: { claimed: ClaimKind | null; promised: ClaimKind | null },
  sentence: string,
  awaiting: Kinds,
  env: Env
): 'call' | 'send' | null {
  if (!flagOn('ACTION_PROMISE_KEPT_ON_SUCCESS', env)) return null;
  if (flagOn('SCHEDULED_OUTREACH_THIRD_PARTY', env) || namesSafetyLine(sentence)) return null;
  if (laterTime(sentence) === undefined) return null;
  const words = sentence.replace(/[‘’]/g, "'");
  const offered = FERNI_OFFERS.find(([, re]) => re.test(words))?.[0] ?? null;
  const kind = judged.claimed ?? judged.promised ?? offered;
  return (kind === 'call' || kind === 'send') && awaiting.has(kind) ? kind : null;
}

/** A sentence's judged claim, or the call or text it sets for later instead (setForLater): 'timed'. */
export function withLaterTime<
  T extends {
    kind: ClaimKind | null;
    reason: MissReason | null;
    claimed: ClaimKind | null;
    promised: ClaimKind | null;
  },
>(judged: T, sentence: string, awaiting: Kinds, env: Env = process.env): T {
  const later = judged.reason === null ? setForLater(judged, sentence, awaiting, env) : null;
  return later ? { ...judged, kind: later, reason: 'timed' } : judged;
}
