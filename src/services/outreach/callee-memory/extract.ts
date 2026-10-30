/**
 * What to keep from one on-behalf call a person answered, read from its CallOutcome in
 * code (no model call). At capture the transcript is gone (finalizeTranscript deletes it
 * once the call is read), so the outcome is the source: `transcriptSummary` is their side
 * of the call, `message` what they asked to pass on, `callbackRequired`/`callbackTime`
 * the call back they asked for.
 *
 * Every line is the shared caller-text screen's (screenedCallerText) and is dropped
 * whole, never rewritten, when it holds contact data (containsContactData), a code or
 * number, money or credentials (isRiskyCallerText, MONEY), or speaks to the assistant
 * (addressesAssistant, from feat/contact-call-memory's call-memory-filter.ts). Nothing is
 * kept for a name that is the owner, the caller or Ferni, or a number.
 *
 * @module services/outreach/callee-memory/extract
 */

import { containsContactData, OWNER_LEAD, personKey } from '../../../memory/index.js';
import type { CallOutcome, OnBehalfCallRequest } from '../../../tools/domains/telephony/index.js';
import { wallTimeIn } from '../../../utils/time-zone.js';
import { callerText, isRiskyCallerText, screenedCallerText } from '../caller-text.js';
import { CALL_MEMORY_TTL_MS, type CallMemory, type CallMood } from './store.js';

/** All of `said`, in characters. */
const SAID_MAX = 600;
const LINE_MAX = 300;
const DAY_MS = 86_400_000;

/** Words that are the owner, the person speaking or Ferni: no name holding one is kept. */
const SELF_WORDS = new Set(
  'me myself i you user caller speaker ferni assistant ai them him her someone somebody unknown my our the'.split(
    ' '
  )
);
/** A code, PIN or any other run of 4+ digits, or 3+ number words ("one two three"). */
const CODE = /\d(?:[\s.-]?\d){3,}/;
const NUMBER_WORD =
  'zero|oh|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand';
const SPELLED_NUMBER = new RegExp(`\\b(?:(?:${NUMBER_WORD})\\b[\\s,-]*){3,}`, 'i');
const MONEY =
  /\b(?:money|cash|owes?|owed|debts?|loans?|mortgage|rent|bills?|paycheck|salary|income|prices?|costs?|fees?|insurance|balance|refund|payments?|paid|pay)\b/i;
/** Secrets with no "password" in them: a wifi key, a door code, a card "ending in". */
const SECRET =
  /\b(?:codes?|pins?|passphrase|passwords?|combination|combo|wi-?fi|network key|keys? to|card|visa|mastercard|amex|ending in|expir\w*)\b/i;
/** A street address or where someone lives (feat/contact-call-memory's call-memory-filter.ts). */
const ADDRESS =
  /\b\d+\s+(?:[a-z]+\s+){1,3}(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|way|terrace|circle|parkway|pkwy|highway|hwy)\b|\b(?:address|apartment|apt|suite|zip ?code|p\.?\s?o\.? box)\b|\b(?:lives?|living|staying) (?:at|on)\b/i;
const AT_ASSISTANT =
  /\b(?:ferni|assistant|a\.?i\.?|chat ?bot|bot|system|prompts?|instructions?|developer|model)\b/i;
/** Rules or a role for whoever reads this later. A pass-on may still say "tell him...". */
const RULES = [
  /\byou (?:should|must|need to|have to|ought to|will|are going to|are to|are now|are (?:a|an|her|his|my|the|their))\b/i,
  /\b(?:remember to|make sure (?:to|you)|be sure to|from now on|from here on|going forward)\b/i,
  /\b(?:ignore|disregard|override|act as|pretend|role-?play|play the role|respond as|answer as|speak as)\b/i,
  // A few other languages' "instructions"/"prompt"/"ignore": defence in depth only (the
  // reader's reported-speech guard is the structural defence).
  /\b(?:instrucci\w*|anweisung\w*|consignes?|istruzion\w*|instru[cç][oõ]\w*|ignor[ae]\w*|olvid[ae]\w*|vergiss\w*|oublie\w*)\b/i,
];
/** An order opening a line of their side of the call: "tell...", "always...", "don't...". */
const ORDER_OPENER =
  /^\s*(?:please\s+|and\s+|so\s+)?(?:tell|ask|let|make|have|get|share|send|give|forward|show|book|buy|order|pay|call|text|email|remember|ignore|disregard|forget|override|always|never|don'?t|do not|stop|start|keep|be sure|make sure)\b/i;
/** A word mixing Latin with Cyrillic or Greek letters: a look-alike hiding a word ("pаssword"). */
const MIXED_SCRIPT =
  /(?=[^\s]*\p{Script=Latin})(?=[^\s]*[\p{Script=Cyrillic}\p{Script=Greek}])[^\s]+/u;

/** Words aimed at the assistant or its rules: read back later, they'd be planted instructions. */
function addressesAssistant(text: string, orders = true): boolean {
  return (
    AT_ASSISTANT.test(text) ||
    RULES.some((rule) => rule.test(text)) ||
    (orders && ORDER_OPENER.test(text))
  );
}

/** Contact data, a code or number, money, a secret, an address, a look-alike word, or words to the assistant. */
function unsafe(text: string, orders: boolean): boolean {
  return (
    isRiskyCallerText(text) ||
    containsContactData(text) ||
    CODE.test(text) ||
    SPELLED_NUMBER.test(text) ||
    MONEY.test(text) ||
    SECRET.test(text) ||
    ADDRESS.test(text) ||
    MIXED_SCRIPT.test(text) ||
    addressesAssistant(text, orders)
  );
}

/** One screened line, or undefined: anything unsafe drops the line, it is never rewritten. */
function kept(raw: string | undefined, name: string, max: number, orders = true) {
  const text = raw?.normalize('NFKC').trim();
  if (!text || unsafe(text, orders)) return undefined;
  const clean = screenedCallerText(text, name, max);
  if (!clean || clean.includes('[removed]') || unsafe(clean, false)) return undefined;
  return clean;
}

/** The name to keep them under, or null for a self-name, a number, no name or anything unsafe. */
function calleeName(raw: string | undefined): string | null {
  const name = callerText(raw, 60);
  const words = name
    .toLowerCase()
    .split(/[^\p{L}'-]+/u)
    .filter(Boolean);
  if (!/\p{L}/u.test(name) || /\d/.test(name) || words.length === 0 || words.length > 5)
    return null;
  if (words.some((w) => SELF_WORDS.has(w)) && words.every((w) => SELF_WORDS.has(w) || w === 'and'))
    return null;
  if (/\b(?:me|myself|ferni|caller|user|speaker|assistant)\b/i.test(name)) return null;
  if (name.includes('[removed]') || unsafe(name, false)) return null;
  return name;
}

const sentences = (text: string | undefined): string[] =>
  (text ?? '').split(/(?<=[.!?])\s+/).filter((s) => s.trim());

const MOODS: ReadonlyArray<[CallMood, RegExp]> = [
  ['happy', /\b(?:happy|cheerful|delighted|excited|thrilled|in good spirits)\b/i],
  ['well', /\b(?:doing|feeling) (?:well|great|good|fine|better)\b/i],
  ['tired', /\b(?:tired|exhausted|worn out)\b/i],
  ['busy', /\b(?:busy|swamped)\b/i],
  ['worried', /\b(?:worried|anxious|nervous)\b/i],
  ['sad', /\b(?:sad|lonely|heartbroken|feeling down)\b/i],
  ['unwell', /\b(?:sick|unwell|under the weather)\b/i],
];
const NEGATED = /\b(?:not|never|no|isn'?t|wasn'?t|aren'?t|hardly)\s+(?:\w+\s+)?$/i;

/** One mood word when exactly one is said, un-negated; else none. */
export function moodOf(text: string): CallMood | undefined {
  const found = MOODS.filter(([, pattern]) => {
    const match = pattern.exec(text);
    return match !== null && !NEGATED.test(text.slice(0, match.index));
  }).map(([mood]) => mood);
  return found.length === 1 ? found[0] : undefined;
}

const PROMISE =
  /\b(?:will|'ll|is going to|promised to|plans to)\b[^.!?]{0,40}\b(?:call|text|come|visit|stop by|get back|let (?:you|him|her|them) know)\b/i;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** The day a promise names ("tomorrow", "Friday"), as YYYY-MM-DD in the owner's zone. */
export function dayNamed(text: string, at: Date, timeZone: string): string | undefined {
  let wall;
  try {
    wall = wallTimeIn(at, timeZone || 'UTC');
  } catch {
    wall = wallTimeIn(at, 'UTC');
  }
  const today = Date.UTC(wall.year, wall.month - 1, wall.day);
  const dow = new Date(today).getUTCDay();
  const lower = text.toLowerCase();
  const named = WEEKDAYS.findIndex((d) => new RegExp(`\\b${d}\\b`).test(lower));
  const offset = /\btomorrow\b/.test(lower)
    ? 1
    : /\b(?:today|tonight)\b/.test(lower)
      ? 0
      : named >= 0
        ? (named - dow + 7) % 7 || 7
        : undefined;
  return offset === undefined
    ? undefined
    : new Date(today + offset * DAY_MS).toISOString().slice(0, 10);
}

/** Every key they go by, the owner's word first: "mom" and her saved contact "Rosa" both find her. */
function keysFor(request: OnBehalfCallRequest): string[] {
  const words = [
    request.contactQuery,
    request.resolvedContact?.relationship,
    request.resolvedContact?.name,
  ];
  const keys = words.map((w) => (w ? personKey(callerText(w, 60)) : '')).filter(Boolean);
  const relation = keys.find((k) => k.startsWith('rel:'));
  return [...new Set(relation ? [relation, ...keys] : keys)];
}

export interface CalleeCall {
  callId: string;
  outcome: CallOutcome;
  request: OnBehalfCallRequest;
  now?: Date;
}

/** What to keep from a call they answered, or null when nothing may be kept. */
export function calleeMemoryFrom({
  callId,
  outcome,
  request,
  now = new Date(),
}: CalleeCall): CallMemory | null {
  if (outcome.status !== 'completed') return null;
  const named = [request.contactQuery, request.resolvedContact?.name].filter(Boolean);
  if (named.length === 0 || named.some((n) => calleeName(n) === null)) return null;
  const name = calleeName(request.resolvedContact?.name || request.contactQuery);
  const [contactKey, ...aliases] = keysFor(request);
  if (!name || !contactKey) return null;

  const said: string[] = [];
  let room = SAID_MAX;
  let promise: string | undefined;
  for (const sentence of sentences(outcome.transcriptSummary)) {
    if (room < 20) break;
    const line = kept(sentence, name, Math.min(LINE_MAX, room));
    if (!line) continue;
    said.push(line);
    room -= line.length + 1;
    if (!promise && PROMISE.test(line)) promise = line;
  }
  const callback =
    outcome.callbackRequired && outcome.callbackTime
      ? kept(`Asked for a call back: ${outcome.callbackTime}`, name, 120, false)
      : undefined;
  const asked = [kept(outcome.message, name, 200, false), callback].filter(Boolean).join(' ');
  if (said.length === 0 && !asked) return null;

  const mood = moodOf(`${outcome.transcriptSummary ?? ''} ${outcome.outcome}`);
  const date = promise ? dayNamed(promise, now, request.userTimezone) : undefined;
  return {
    contactKey,
    contactKeys: [contactKey, ...aliases],
    contactName: name,
    callId,
    at: now.toISOString(),
    said,
    ...(asked ? { asked } : {}),
    ...(promise ? { promised: { text: promise, ...(date ? { date } : {}) } } : {}),
    ...(mood ? { mood } : {}),
    provenance: 'callee',
    expireAt: new Date(now.getTime() + CALL_MEMORY_TTL_MS),
  };
}
