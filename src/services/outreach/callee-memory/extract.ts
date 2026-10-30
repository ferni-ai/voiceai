/**
 * What to keep from one on-behalf call a person answered, read from its CallOutcome in
 * code (no model call). At capture the transcript is gone (finalizeTranscript deletes it
 * once the call is read), so the outcome is the source: `transcriptSummary` is their side
 * of the call, `message` what they asked to pass on, `callbackRequired`/`callbackTime`
 * the call back they asked for.
 *
 * Nothing is kept for a child (any age) or text that reads as a minor's, or under a name
 * that is the owner, the caller or Ferni, or a number. Crisis or risky text keeps none of
 * their words: only `concern: true` and the date. Otherwise every line is the shared
 * caller-text screen's (screenedCallerText) and is dropped whole when screen.ts's
 * unsafeLine flags it.
 *
 * @module services/outreach/callee-memory/extract
 */

import { personKey } from '../../../memory/index.js';
import type { CallOutcome, OnBehalfCallRequest } from '../../../tools/domains/telephony/index.js';
import { wallTimeIn } from '../../../utils/time-zone.js';
import { callerText, screenedCallerText } from '../caller-text.js';
import { calleeName, childContact, concerning, soundsMinor, unsafeLine } from './screen.js';
import { CALL_MEMORY_TTL_MS, type CallMemory, type CallMood } from './store.js';

/** One screened line, or undefined: anything unsafe drops the line, it is never rewritten. */
function kept(raw: string | undefined, name: string, max: number, orders = true) {
  const text = raw?.normalize('NFKC').trim();
  if (!text || unsafeLine(text, orders)) return undefined;
  const clean = screenedCallerText(text, name, max);
  if (!clean || clean.includes('[removed]') || unsafeLine(clean, false)) return undefined;
  return clean;
}

/** All of `said`, in characters. */
const SAID_MAX = 600;
const LINE_MAX = 300;
const DAY_MS = 86_400_000;

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
  const contact = request.resolvedContact;
  const named = [request.contactQuery, contact?.name].filter(Boolean);
  if (named.length === 0 || named.some((n) => calleeName(n) === null)) return null;
  const name = calleeName(contact?.name || request.contactQuery);
  const [contactKey, ...aliases] = keysFor(request);
  if (!name || !contactKey) return null;
  if (childContact([request.contactQuery, contact?.relationship, contact?.name])) return null;

  const theirs = [
    outcome.transcriptSummary,
    outcome.message,
    outcome.callbackTime,
    outcome.outcome,
    ...(outcome.actionItems ?? []),
  ];
  if (soundsMinor(theirs.filter(Boolean).join(' \n '))) return null;
  const base = {
    contactKey,
    contactKeys: [contactKey, ...aliases],
    contactName: name,
    callId,
    at: now.toISOString(),
    provenance: 'callee' as const,
    expireAt: new Date(now.getTime() + CALL_MEMORY_TTL_MS),
  };
  // Crisis or risky words: none of theirs are kept, only that something on the call worried Ferni.
  if (concerning(theirs, name)) return { ...base, said: [], concern: true };

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
    ...base,
    said,
    ...(asked ? { asked } : {}),
    ...(promise ? { promised: { text: promise, ...(date ? { date } : {}) } } : {}),
    ...(mood ? { mood } : {}),
  };
}
