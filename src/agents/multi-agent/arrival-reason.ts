/**
 * The rest of ARRIVAL_LINE_GROUNDED (arrival-grounding.ts, off by default): the grounded
 * first line names why the caller came, in their own words, never re-asks it, and never
 * repeats an earlier arrival line on the same call.
 *
 * Grounding made arrival lines honest, and with it they rarely say anything:
 * - dev sweep 2026-10-21: 0/6 arrival lines named the reason. The director wrote "Sounds
 *   like you're trying to figure out if that Denver startup equity is actually worth
 *   anything" and the claim filter dropped it ("invented": "trying" and "actually" are not
 *   the caller's words), so the canned hello played;
 * - prod sweep 2026-10-21: 3/4 better-than-human arrivals named nothing ("Hello. Good to
 *   sit with you.", "Good morning, Sam. I'm here, and I'm listening.") or re-asked
 *   ("Mornings can be so tough, what's going on?"). A caller who says what it's about and
 *   THEN "Can I talk to Nayan?" got the brief "asked for you by name, not said what about"
 *   (only the last line was read), so the director was told to meet the hour;
 * - each arrival was written blind to the ones before it: back with Ferni, he said "Early
 *   start for a birthday, huh?" right after Nayan's "You're up early for a birthday."
 *
 * With the flag on, the reason is the caller's last line that says something, the cue says
 * to name it (and not the hour), and the line is checked: a re-ask is cut, and a line that
 * was dropped, names nothing they said, or repeats an earlier arrival becomes their own
 * words handed back ("Ferni said you've been a lawyer for 10 years, and lately, you feel
 * like none of it means anything."), grounded by construction. With no reason, a line is
 * as before except that a repeat is not said.
 *
 * The 10-11 "lon" arm (ack in first line 18/19, briefed-handoff-2026-10-11) is the director
 * line BEFORE grounding existed: its lines included "Ferni said you're weighing the offer",
 * the invention grounding was built to stop. This keeps grounding and names the reason.
 *
 * @module agents/multi-agent/arrival-reason
 */

import type { Env } from '../../config/env-flag.js';
import { contentWords } from '../../memory/recall/session-recall.js';
import { teammateHeardAs } from '../../tools/handoff/teammate-names.js';
import { arrivalGrounded } from './arrival-grounding.js';
import { sameWord, topicWords } from './caller-words.js';

/** Added to the director's cue when the brief says what the caller came about. */
const ARRIVAL_DIRECTION_REASON =
  " They already told {from} what this is about (the facts, in their words): your first sentence names it, the way a friend who was filled in would, in their own words ({from} said ...), then at most one short line of your own. Don't greet them with the time of day, don't ask what's going on or anything they already said.";

/** The cue's note on the arrival lines this call already heard. */
function earlierArrivalsCue(earlier: string[]): string {
  if (earlier.length === 0) return '';
  return ` Teammates already opened this call with ${earlier.map((l) => `"${l}"`).join(', ')}: say something different.`;
}

/** Asking the caller to start over: wrong once the brief says what they came about. */
const REASK =
  /\bwhat'?s (?:up|going on|happening|on your mind|been going on)\b|\bwhat (?:happened|brings you|can i (?:help|do)|do you need|would you like to (?:talk|chat))\b|\bhow can i help\b|\btell me (?:more|everything|what'?s going on|where you'?re at|about it)\b/i;

const sentencesOf = (text: string): string[] =>
  text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

/** The line without its re-ask sentences; '' when nothing else is left. */
export function withoutReask(line: string): string {
  return sentencesOf(line)
    .filter((s) => !REASK.test(s))
    .join(' ')
    .trim();
}

/** The caller's lines up to the last one that says something: "Can I talk to Nayan?" after it isn't the reason. */
export function upToLastTopic(callerLines: string[]): string[] {
  for (let i = callerLines.length - 1; i >= 0; i--) {
    if (topicWords(callerLines[i]).length > 0) return callerLines.slice(0, i + 1);
  }
  return callerLines;
}

/** "talk to Maya about my mornings": an ask that carries its reason. */
const ASK_ABOUT = /\b(?:talk|speak|chat)\s+(?:to|with)\s+([A-Za-z]+)\s+(about\s.+)$/i;

/**
 * True when a sentence says what the call is about: a statement (or an ask "about" something)
 * with 2+ topic words of 4+ letters. "That's all I needed" and "Can you take me back?" don't.
 */
function saysWhy(sentence: string): boolean {
  if (sentence.trim().endsWith('?') && !ASK_ABOUT.test(sentence.replace(/\?$/, ''))) return false;
  return topicWords(sentence).filter((w) => w.length >= 4).length >= 2;
}

/** The caller's lines that hold their reason, or [] when they gave none to name. */
function reasonIn(callerLines: string[]): string[] {
  const lines = upToLastTopic(callerLines);
  return lines.some((l) => sentencesOf(l).some(saysWhy)) ? lines : [];
}

/** True when the line names something the caller said (give or take an ending). */
function namesTheirReason(line: string, callerLines: string[]): boolean {
  const said = topicWords(callerLines.join(' '));
  return topicWords(line).some((w) => said.some((s) => sameWord(w, s)));
}

/** True when the line says much the same as an earlier arrival line on this call. */
export function repeatsEarlier(line: string, earlier: string[]): boolean {
  const words = contentWords(line);
  return earlier.some((e) => {
    const before = contentWords(e);
    const shared = [...words].filter((w) => [...before].some((b) => sameWord(w, b))).length;
    return shared >= 2 && shared >= 0.6 * Math.min(words.size, before.size);
  });
}

const FIRST_PERSON: Record<string, string> = {
  i: 'you',
  "i'm": "you're",
  "i've": "you've",
  "i'd": "you'd",
  "i'll": "you'll",
  me: 'you',
  my: 'your',
  mine: 'yours',
  myself: 'yourself',
};
/** Words that would be wrong handed back: they're about Ferni, or about "us". */
const FIRST = /\b(?:I|I'm|I've|I'd|I'll|me|my)\b/i;
const NOT_THEIRS = /\b(?:you|your|you're|yours|we|we're|us|our)\b/i;
const LEAD_IN = /^(?:(?:hey|hi|hello|so|um+|uh+|well|okay|ok|yeah|and|but|like)\b[\s,]*)+/i;
const MAX_WORDS = 22;

/** One sentence of the caller's in the second person ("you've been late"), or undefined when it won't read right. */
function handedBack(sentence: string): string | undefined {
  let s = sentence.replace(LEAD_IN, '');
  const name = s.match(/^([A-Za-z]+),\s*/);
  if (name && teammateHeardAs(name[1].toLowerCase()) !== null) s = s.slice(name[0].length);
  s = s.replace(/[.!]+$/, '').trim();
  // "I'd like to talk to Maya about my mornings": Maya hears "you wanted to talk about your mornings"
  const about = s.replace(/\?$/, '').match(ASK_ABOUT);
  if (about && teammateHeardAs(about[1].toLowerCase())) s = `I wanted to talk ${about[2]}`;
  // Only something they said about themselves reads right handed back ("long night" doesn't)
  if (!s || s.endsWith('?') || NOT_THEIRS.test(s) || !FIRST.test(s)) return undefined;
  const words = s.split(/\s+/);
  if (words.length > MAX_WORDS) {
    // Too long to hand back whole: up to its last comma inside the limit
    const comma = words.slice(0, MAX_WORDS).join(' ').lastIndexOf(',');
    if (comma < 0 || s.slice(0, comma).split(/\s+/).length < 5) return undefined;
    s = s.slice(0, comma);
  }
  return s
    .replace(/\bI (?:am|was)\b/g, (m) => (m.endsWith('am') ? 'you are' : 'you were'))
    .replace(
      /\b(?:I'm|I've|I'd|I'll|I|me|my|mine|myself)\b/gi,
      (w) => FIRST_PERSON[w.toLowerCase()] ?? w
    );
}

/**
 * Their reason handed back, from the sentence that says the most:
 * "Ferni said you've been a lawyer for 10 years, and lately, you feel like none of it means anything."
 */
export function reasonInTheirWords(callerLines: string[], fromName: string): string | undefined {
  let best: { text: string; score: number } | undefined;
  for (const sentence of sentencesOf(callerLines.join(' '))) {
    const back = saysWhy(sentence) ? handedBack(sentence) : undefined;
    const score = topicWords(sentence).length;
    if (back && (!best || score > best.score)) best = { text: back, score };
  }
  return best && `${fromName} said ${best.text}.`;
}

interface ArrivalContext {
  /** The caller's lines that hold their reason; [] when they only asked for the teammate. */
  reasonLines: string[];
  fromName: string;
  /** Arrival lines already said on this call. */
  earlier: string[];
  /** The canned line, when nothing better is left. */
  fallback: string;
}

/**
 * The first line with the flag on, from the director's line (undefined when late, off or
 * dropped as invented). No reason: that line unless it repeats one (undefined: the canned
 * line plays). A reason: the line minus a re-ask if it names the reason and isn't a repeat,
 * else their reason handed back, else the canned line minus a re-ask.
 */
function arrivalLineFromBrief(said: string | undefined, ctx: ArrivalContext): string | undefined {
  const fresh = (l: string | undefined): string | undefined =>
    l && !repeatsEarlier(l, ctx.earlier) ? l : undefined;
  if (ctx.reasonLines.length === 0) return fresh(said);
  const kept = said ? withoutReask(said) : '';
  const named = kept && namesTheirReason(kept, ctx.reasonLines) ? kept : undefined;
  return (
    fresh(named) ??
    fresh(reasonInTheirWords(ctx.reasonLines, ctx.fromName)) ??
    (withoutReask(ctx.fallback) || ctx.fallback)
  );
}

/*
 * The arrival lines of each live call, so the next teammate doesn't say the same thing.
 * Kept for HOLD_MS (a call's handoffs are minutes apart), keyed by the call's session id.
 */
const HOLD_MS = 60 * 60_000;
const said = new Map<string, Array<{ text: string; until: number }>>();

/** The arrival lines said on this call so far, oldest first. */
function earlierArrivals(callId: string | undefined, now = Date.now()): string[] {
  if (!callId) return [];
  return (said.get(callId) ?? []).filter((l) => l.until > now).map((l) => l.text);
}

/** Notes an arrival line said on this call. */
function rememberArrival(callId: string | undefined, line: string, now = Date.now()): void {
  if (!callId || !line.trim()) return;
  for (const [id, lines] of said) if (lines.every((l) => l.until <= now)) said.delete(id);
  const text = line
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const live = (said.get(callId) ?? []).filter((l) => l.until > now);
  said.set(callId, [...live, { text, until: now + HOLD_MS }]);
}

/**
 * The turns since the last arrival on this call: a second handoff's reason is what the
 * caller said after the first, not the first one's again.
 */
function sinceLastArrival<T extends { speaker: 'caller' | 'persona'; text: string }>(
  turns: T[],
  earlier: string[]
): T[] {
  const norm = (t: string): string => [...contentWords(t)].join(' ');
  const arrivals = new Set(earlier.map(norm).filter(Boolean));
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].speaker === 'persona' && arrivals.has(norm(turns[i].text)))
      return turns.slice(i + 1);
  }
  return turns;
}

/** For tests: forgets every call. */
export function clearArrivals(): void {
  said.clear();
}

/**
 * One handoff's view of ARRIVAL_LINE_GROUNDED's reason, for prepareBriefing (handoff-brief.ts): every method is
 * a pass-through when the flag is off.
 */
export class ArrivalReason {
  readonly on: boolean;
  readonly earlier: string[];

  constructor(
    private readonly call: { callId?: string; fromName: string },
    private readonly fallback: string,
    env: Env = process.env
  ) {
    this.on = arrivalGrounded(env);
    this.earlier = this.on ? earlierArrivals(call.callId) : [];
  }

  /** The turns the reason is read from. */
  turns<T extends { speaker: 'caller' | 'persona'; text: string }>(turns: T[]): T[] {
    return this.on ? sinceLastArrival(turns, this.earlier) : turns;
  }

  /** The caller's lines that hold their reason ([] when off or when they gave none). */
  reason(callerLines: string[]): string[] {
    return this.on ? reasonIn(callerLines) : [];
  }

  /** Added to the director's cue. */
  cue(reason: string[]): string {
    if (!this.on) return '';
    return `${reason.length > 0 ? ARRIVAL_DIRECTION_REASON : ''}${earlierArrivalsCue(this.earlier)}`;
  }

  /** The facts for the first line: with a reason to name, the hour only crowds it out. */
  facts(facts: Record<string, string>, reason: string[]): Record<string, string> {
    if (!this.on || reason.length === 0) return facts;
    const { 'their time': _hour, ...rest } = facts;
    return rest;
  }

  /** The first line to say (and remembered for this call); `cut` as it was when off. */
  line(cut: string | undefined, reason: string[]): string | undefined {
    if (!this.on) return cut;
    const line = arrivalLineFromBrief(cut || undefined, {
      reasonLines: reason,
      fromName: this.call.fromName,
      earlier: this.earlier,
      fallback: this.fallback,
    });
    if (line) rememberArrival(this.call.callId, line);
    return line;
  }
}
