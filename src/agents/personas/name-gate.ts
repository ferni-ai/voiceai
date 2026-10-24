/**
 * Say the caller's name the way a friend does: at hello, at goodbye, and
 * otherwise rarely.
 *
 * Seth: "How he calls me Seth is so... not human." A prod call (2026-10-14)
 * said his name in 16 of 24 replies ("I am, Seth.", "Yes, Seth, I'm sure.");
 * the dev voice-eval runs in 11 of 70 turns. Friends in SBCSAE address each
 * other by name in 1.3% of turns (0.7% one-to-one; the most name-heavy of 34
 * conversations, 4.2%): aggregates in voiceai-evidence/human-baselines/
 * score-targets.json (nameUseRate).
 *
 * Prompts asking for the name are gone, but the model still reaches for it,
 * so a vocative name is dropped here, before the words reach TTS, captions
 * and the saved history (the same place as opener-gate.ts):
 * - "That's rough, Sam." -> "That's rough."
 * - "Yes, Sam, I'm sure." -> "Yes, I'm sure."
 * - "Sam, really? Again?" -> "Really? Again?"
 * It stays in the call's first reply (hello), when the caller is saying
 * goodbye or the name closes a goodbye ("Talk soon, Sam."), and once
 * NAME_EVERY replies have gone by without it; never twice in a reply. Only the name addressing the caller
 * goes: "Tell Sam I said hi", "Sam's sister", "Your name is Sam." and "My
 * friend, Sam, called" stay, and a reply to a question about the caller's own
 * name is left alone.
 *
 * With NAME_FALLING_INTONATION on, a kept name that runs on into its sentence
 * ("Sam, take care.") ends its own sentence ("Sam. Take care.") so it falls:
 * the delivery #1320 measured for greetings (speech/tts-gateway/name-intonation.ts).
 *
 * Text waits only where the name itself is arriving. A comma or a hello word
 * that might come before it goes out at once when first audio could need it
 * (continuation-tts cuts its first piece on a clause of 12+ characters), and
 * a name after it is still dropped: "Yes, Sam, I'm" -> "Yes, I'm"; "Hey" then
 * " Sam, ..." -> "Hey, ...". A sentence-final name after a comma that already
 * went out leaves the comma: "Did I miss something,?" (#1413 latency).
 *
 * NAME_GATE_V2 (off by default) also drops a name from a question, in every
 * slot: on Ferni's voice (fdeb5d75) "What about you, | Seth?" rose 14.8 st, 9.1
 * in one push, name-first "Seth, how's it going?" 7.2 (voiceai-evidence/
 * name-intonation-2026-10-24). A reply's one name then goes to a statement later
 * in it, if there is one: "What about you? ... your voice, Seth." ended the name
 * 4.6 st below the speaker where keeping it in the question ended 10 st above
 * (name-gate-v2-2026-10-24). A hello ("Hey Sam, how are you?") and a name
 * between clauses stay with NAME_FALLING_INTONATION on, which makes them
 * statements ("Hey Sam."). "Oh hey Sam" never stays (7.7 st). V2 also widens
 * the vocatives found (", Sam, and that sounds hard") and gates scripted lines
 * spoken with session.say() (scripted-name-gate.ts). It never adds a name.
 *
 * NAME_GATE=off turns it off.
 *
 * @module agents/personas/name-gate
 */

import type { llm } from '@livekit/agents';
import { ReadableStream, type ReadableStreamDefaultController } from 'node:stream/web';

import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';
import { applyVocatives, findVocatives, LETTER, type Vocative } from './name-vocatives.js';

export { applyVocatives, findVocatives, type Vocative } from './name-vocatives.js';

const log = createLogger({ module: 'NameGate' });

/**
 * Replies between kept names (hello and goodbye aside): 1 / 0.025, the
 * score-targets.json nameUseRate max (the p90 of SBCSAE friend conversations).
 */
export const NAME_EVERY = 40;

const GOODBYE_PHRASES = String.raw`bye(?:-bye)?|goodbye|good ?night|talk (?:to you )?(?:soon|later|tomorrow)|(?<!\bi )see (?:you|ya)(?: (?:soon|later|tomorrow|then|next time|around))?|take care(?: of yourself)?|(?:gotta|got to|have to|need to) (?:go|run|hop off)|catch you later|let you go`;
/**
 * A goodbye closes its sentence: "Take care, Sam." and "See you tomorrow!"
 * do; "I see you" and "I have to go to the doctor" don't.
 */
const GOODBYE = new RegExp(
  String.raw`\b(?:${GOODBYE_PHRASES})\s*(?:,\s*[\p{L}'’-]+\s*)?(?:[.!?…]|$)`,
  'iu'
);
/** A goodbye the name closes: "Talk soon, Sam." (decided before the name, so nothing waits). */
const GOODBYE_BEFORE_NAME = new RegExp(String.raw`\b(?:${GOODBYE_PHRASES})\s*,?\s*$`, 'iu');

/** The caller asking about, or giving, their own name: the reply may need it. */
const ASKS_OWN_NAME =
  /\b(?:what(?:'s| is) my name|(?:know|remember|forgot|forget|say|said|got|spell) my name|my name(?:'s| is)|what (?:do|should|would) you call me|what am i called)\b/i;

/** "Just call me Sam" (a capital, so not "call me tomorrow"). */
const GIVES_NAME = /\b(?:[Yy]ou can|[Jj]ust|[Pp]lease) call me \p{Lu}/u;

/** Held text that only might come before the name: punctuation, spaces, a hello word or its start. */
const RELEASABLE = /^[\s,—–;:]*(?:(?:hey|hi|hiya|hello|oh)\b\s*)?([a-z]*)$/i;
const GREETING_WORDS = ['hey', 'hi', 'hiya', 'hello', 'oh'];
/** continuation-tts cuts its first piece on a clause once this many characters will be spoken. */
const FIRST_PIECE_CHARS = 12;
const SPOKEN = /\p{L}/u;
/** Letters outside markup: what counts as words for timing. */
const spoken = (t: string): boolean => SPOKEN.test(t.replace(/<[^>]*>|\[[^\]]*\]/g, ''));

type Chunk = llm.ChatChunk | string | object;

/**
 * NAME_GATE_V2: whether this name sits in a question the voice would end on a
 * rise. With the falling delivery, a hello ("Hey Sam,") and a name between
 * clauses end their own statement, so only a name before "?" or opening the
 * question ("Sam, really?") counts; null while the sentence's end is to come.
 */
function inQuestion(v: Vocative, falling: boolean): boolean | null {
  if (falling && (v.shape === 'greeting' || v.shape === 'pivot')) return false;
  return v.asks === undefined ? false : v.asks;
}

/**
 * Whether a vocative may be the reply's one name: the first at hello, a
 * caller's goodbye or the interval, else the first that closes a goodbye
 * ("Talk soon, Sam."); with NAME_GATE_V2 never one in a question.
 */
function mayKeep(
  v: Vocative,
  before: string,
  gate: { allowed: boolean; falling: boolean; v2: boolean }
): boolean {
  if (!gate.allowed && !GOODBYE_BEFORE_NAME.test(before)) return false;
  if (!gate.v2) return true;
  // "Oh hey Sam" rises whatever follows it (7.7 st; 8.2 with a full stop after the name).
  return v.shape !== 'ohhey' && inQuestion(v, gate.falling) !== true;
}

/**
 * NAME_GATE_V2's prompt line where name use is asked for (goodbye.ts,
 * first-call-rapport.ts): the gate drops a name in a question, so ask for the
 * shape that keeps it. A name after a falling statement stayed low on the
 * voice ("That's rough, Sam." 0.1 st); one before "?" rose.
 */
export const NAME_PLACEMENT_RULE =
  'Never put their name next to a question mark or a request; when you use it, end a warm statement with it.';

/** How long the gate held text back in one reply. */
export interface NameGateTiming {
  /** From the reply's first spoken letters arriving to the first going out. */
  firstHoldMs: number;
  /** The longest one stretch of text waited for the characters that decide it. */
  maxHoldMs: number;
}
export interface HistoryItem {
  type?: string;
  role?: string;
  textContent?: string;
}

function contentOf(chunk: Chunk): string | undefined {
  if (typeof chunk === 'string') return chunk;
  const c = chunk as llm.ChatChunk;
  if (c && typeof c === 'object' && 'delta' in c && c.delta && !c.delta.toolCalls?.length) {
    return c.delta.content ?? '';
  }
  return undefined; // tool calls, usage, flush sentinels: not reply text
}

/** The caller's first name as said ("Seth" from "seth ford"); null if there isn't a usable one. */
export function firstNameOf(userName: unknown): string | null {
  if (typeof userName !== 'string') return null;
  const first = userName.trim().split(/\s+/)[0] ?? '';
  if (first.length < 2 || !/^\p{L}[\p{L}'’-]*$/u.test(first)) return null;
  // "O'Neil", "McKenzie" as written; "SETH" and "seth" become "Seth".
  if (first !== first.toLowerCase() && first !== first.toUpperCase()) return first;
  return first
    .toLowerCase()
    .replace(/(^|['’-])(\p{L})/gu, (_, p: string, c: string) => p + c.toUpperCase());
}

const messagesOf = (items: readonly HistoryItem[]): HistoryItem[] =>
  items.filter(
    (i) =>
      (i.type === undefined || i.type === 'message') &&
      !(i.textContent ?? '').startsWith(TURN_CONTEXT_HEADER)
  );
const lastCallerWords = (items: readonly HistoryItem[]): string =>
  [...messagesOf(items)].reverse().find((i) => i.role === 'user')?.textContent ?? '';

/**
 * Whether this reply may say the name: the call's first reply (hello), a
 * goodbye from the caller, or NAME_EVERY replies since Ferni last said it
 * (or since the call began, when it hasn't).
 */
export function mayUseName(items: readonly HistoryItem[], name: string, v2 = false): boolean {
  const said = { test: (t: string): boolean => findVocatives(t, name, true, v2).found.length > 0 };
  const replies = messagesOf(items).filter((i) => i.role === 'assistant');
  if (replies.length === 0) return true;
  if (GOODBYE.test(lastCallerWords(items))) return true;
  let since = 0;
  for (let i = replies.length - 1; i >= 0 && !said.test(replies[i].textContent ?? ''); i--) since++;
  return since >= NAME_EVERY;
}

/**
 * One reply's LLM stream with the caller's vocative name limited. Text passes
 * straight through; only the name, while its next character is still to come,
 * waits (and a comma later in the reply, which no audio is waiting for).
 */
export function withNameGate(
  input: ReadableStream<Chunk>,
  opts: {
    name: string | null;
    history: readonly HistoryItem[];
    env?: Env;
    /** How long the gate held text back (tests; production logs it). */
    onTiming?: (timing: NameGateTiming) => void;
    now?: () => number;
  }
): ReadableStream<Chunk> {
  const env = opts.env ?? process.env;
  const { name, history } = opts;
  if (!name || !flagOn('NAME_GATE', env)) return input;
  const caller = lastCallerWords(history);
  if (ASKS_OWN_NAME.test(caller) || GIVES_NAME.test(caller)) return input;
  const v2 = flagOn('NAME_GATE_V2', env);
  const allowed = mayUseName(history, name, v2);
  const falling = flagOn('NAME_FALLING_INTONATION', env);
  const gate = { allowed, falling, v2 };
  const now = opts.now ?? Date.now;
  let raw = '';
  let sent = '';
  /** raw[0, sentRaw) has gone out, as decided then. */
  let sentRaw = 0;
  /** Vocatives settled so far, by where the name starts: what is dropped, and whether it stays. */
  /** undefined: as found; null: the name went out, nothing to drop; else the clipped stretch. */
  const decided = new Map<number, { keep: boolean; clipped: Vocative | null | undefined }>();
  let keptOne = false;
  let template: Chunk | null = null;
  let held = 0;
  let firstIn: number | null = null;
  let firstOut: number | null = null;
  let holdAt = -1;
  let holdSince = 0;
  let maxHoldMs = 0;

  /**
   * Whether held text may go out undecided: a hello word always (the name is
   * dropped after it), a comma when first audio may be waiting on it (the
   * reply's first clause break with 12+ letters before it) or at hello before
   * any name (the first one is kept anyway).
   */
  const releasable = (from: number, decidedAny: boolean): boolean => {
    const m = raw.slice(from).match(RELEASABLE);
    if (!m) return false; // the name itself is arriving
    const letters = m[1].toLowerCase();
    if (letters && !GREETING_WORDS.some((g) => g.startsWith(letters))) return false;
    if (letters && name.toLowerCase().startsWith(letters)) return false;
    if (/^\s*(?:hey|hi|hiya|hello|oh)\b/i.test(raw.slice(from).replace(/^[\s,—–;:]*/, '')))
      return true;
    if (letters) return true; // "He", "Hel": a hello word on its way
    if (allowed && !decidedAny) return true;
    // The first clause break continuation-tts could cut on: 12+ spoken characters
    // through it, and no earlier break that long.
    const spokenTo = (end: number): number =>
      raw
        .slice(0, end)
        .replace(/<[^>]*>|\[[^\]]*\]/g, '')
        .trim().length;
    const comma = raw.slice(from).search(/[,;:—–]/);
    if (comma < 0 || spokenTo(from + comma + 1) < FIRST_PIECE_CHARS) return false;
    for (const m of raw.slice(0, from).matchAll(/[,;:—–.!?…]/g)) {
      if (spokenTo(m.index + 1) >= FIRST_PIECE_CHARS) return false;
    }
    return true;
  };

  /** A vocative that starts in text already sent: drop only what is still to come. */
  const clip = (v: Vocative): Vocative | null => {
    if (v.nameAt < sentRaw) return null; // the name went out: it stays
    // Only the name and the spaces right before it can still go; letters before it went out as said.
    const spaces = raw.slice(0, v.nameAt).match(/\s*$/)?.[0].length ?? 0;
    const start = Math.max(sentRaw, v.nameAt - spaces);
    const spaceSent = start === v.nameAt && spaces > 0;
    const after = (i: number): number => i + (raw.slice(i).match(/^\s*/)?.[0].length ?? 0);
    const plain = { ...v, start, with: '', capNext: false, fallAt: undefined };
    // ", Sam, I'm" -> ", I'm" (or "Sam, " goes when the space before it went out).
    if (v.with === ',') return { ...plain, end: spaceSent ? after(v.end) : v.end };
    // "Hey"/"Oh" went out: "Hey, how" (space still to come) or "Hey how" (it went too).
    if (v.capNext || /\b(?:hey|hi|hiya|hello|oh)\s+$/i.test(raw.slice(0, v.nameAt))) {
      const tail = raw.slice(v.nameEnd).match(/^(?:\s*[,—–;:])?\s*/)?.[0].length ?? 0;
      return { ...plain, end: spaceSent ? v.nameEnd + tail : v.nameEnd };
    }
    // ", Sam." after the comma went out: the name goes, the comma stays ("something,?").
    return { ...plain, end: v.nameEnd };
  };

  /** Whether this vocative is the one that stays (decided once, from the text before it). */
  const decideKeep = (v: Vocative): boolean => {
    const keep = !keptOne && mayKeep(v, raw.slice(0, v.nameAt), gate);
    if (keep) keptOne = true;
    return keep;
  };
  /** NAME_GATE_V2: a name that may stay waits until its sentence shows whether it asks. */
  const awaitsQuestion = (v: Vocative): boolean =>
    v2 &&
    !keptOne &&
    inQuestion(v, falling) === null &&
    (allowed || GOODBYE_BEFORE_NAME.test(raw.slice(0, v.nameAt)));

  const render = (final: boolean): string => {
    const result = findVocatives(raw, name, final, v2);
    const waiting: Vocative[] = [];
    const found: Vocative[] = [];
    for (const v of result.found) {
      const d = decided.get(v.nameAt);
      if (d) {
        // Clipped ones keep the stretch they were clipped to; others are as found
        // (their stretch may still take in the spaces after it).
        if (d.clipped === undefined) found.push(v);
        else if (d.clipped) found.push(d.clipped);
        continue;
      }
      if (v.start >= sentRaw) {
        found.push(v);
        continue;
      }
      // It starts in text that went out undecided: drop only what is still to come.
      const clipped = clip(v);
      if (clipped && awaitsQuestion(v)) {
        waiting.push(clipped);
        found.push(clipped);
        continue;
      }
      if (clipped === null) keptOne = true; // the name went out
      decided.set(v.nameAt, { keep: clipped === null || decideKeep(v), clipped });
      if (clipped) found.push(clipped);
    }
    let upTo = final ? raw.length : Math.max(sentRaw, result.undecidedAt ?? raw.length);
    if (!final && upTo < raw.length && releasable(upTo, keptOne || decided.size > 0)) {
      upTo = raw.length;
    }
    for (const v of found) {
      if (v.start < upTo && v.end > upTo) {
        upTo = Math.max(sentRaw, v.start); // waits whole
      }
      if (waiting.includes(v) || (!decided.has(v.nameAt) && awaitsQuestion(v))) {
        upTo = Math.min(upTo, Math.max(sentRaw, v.start));
      }
    }
    const done = found.filter((v) => v.end <= upTo);
    for (const v of done) {
      if (!decided.has(v.nameAt))
        decided.set(v.nameAt, { keep: decideKeep(v), clipped: undefined });
    }
    held = raw.length - upTo;
    const out = applyVocatives(
      raw.slice(0, upTo),
      done,
      (v) => decided.get(v.nameAt)?.keep === true,
      falling
    );
    sentRaw = Math.max(sentRaw, upTo);
    // A reply that was only the name ("Sam?") is said as it came.
    if (final && sent === '' && !LETTER.test(out)) return raw;
    return out;
  };

  const enqueue = (controller: ReadableStreamDefaultController<Chunk>, text: string): void => {
    if (!text) return;
    if (typeof template === 'string' || template === null) controller.enqueue(text);
    else {
      const c = template as llm.ChatChunk;
      controller.enqueue({
        ...c,
        delta: { ...c.delta, role: c.delta?.role ?? 'assistant', content: text },
      });
    }
  };
  const flush = (controller: ReadableStreamDefaultController<Chunk>, final: boolean): void => {
    const out = render(final);
    const t = now();
    // Each held stretch is timed on its own, from where it starts.
    const at = held > 0 ? raw.length - held : -1;
    if (at !== holdAt) {
      if (holdAt >= 0) maxHoldMs = Math.max(maxHoldMs, t - holdSince);
      holdAt = at;
      holdSince = t;
    }
    // Decisions are final once made, so what was sent stays a prefix.
    if (out.startsWith(sent)) {
      enqueue(controller, out.slice(sent.length));
      sent = out;
    } else if (final) {
      // Never expected: say what is left past what was sent, never anything twice.
      log.warn({ sent: sent.length, out: out.length }, 'Name gate output diverged');
      enqueue(controller, out.slice(sent.length));
    }
    if (firstOut === null && spoken(sent)) firstOut = t;
  };

  return new ReadableStream<Chunk>({
    async start(controller) {
      try {
        for await (const chunk of input as unknown as AsyncIterable<Chunk>) {
          const content = contentOf(chunk);
          if (content === undefined) {
            flush(controller, false);
            controller.enqueue(chunk);
            continue;
          }
          raw += content;
          if (firstIn === null && spoken(raw)) firstIn = now();
          template = chunk;
          flush(controller, false);
        }
        flush(controller, true);
        const timing = {
          firstHoldMs: firstIn !== null && firstOut !== null ? firstOut - firstIn : 0,
          maxHoldMs,
        };
        opts.onTiming?.(timing);
        if (timing.firstHoldMs >= 50 || timing.maxHoldMs >= 150) {
          log.info(timing, 'Name gate held text');
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

/**
 * NAME_GATE_V2: the name gate on a whole scripted line (session.say(): the
 * greeting, the proactive "calling to check in" opener, a first-call
 * fallback), decided as one reply with `history` before it.
 */
export function nameGateText(
  text: string,
  opts: { name: string | null; history: readonly HistoryItem[]; env?: Env }
): string {
  const env = opts.env ?? process.env;
  const { name, history } = opts;
  if (!name || !flagOn('NAME_GATE', env) || !flagOn('NAME_GATE_V2', env)) return text;
  const caller = lastCallerWords(history);
  if (ASKS_OWN_NAME.test(caller) || GIVES_NAME.test(caller)) return text;
  const falling = flagOn('NAME_FALLING_INTONATION', env);
  const gate = { allowed: mayUseName(history, name, true), falling, v2: true };
  const { found } = findVocatives(text, name, true, true);
  const out = applyVocatives(
    text,
    found,
    (v) => mayKeep(v, text.slice(0, v.nameAt), gate),
    falling
  );
  return LETTER.test(out) ? out : text;
}
