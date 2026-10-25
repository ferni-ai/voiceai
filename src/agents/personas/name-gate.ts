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
 * NAME_FALLING_SPLIT (with NAME_FALLING_INTONATION):
 * - a kept name ends its sentence even when the comma before it already went
 *   out ("Yes, Sam, I'm" streamed -> "Yes, Sam. I'm");
 * - mid-call, a hello that opens the reply waits for the word after it, so a
 *   dropped name takes its hello too, as it does when the reply comes whole
 *   ("Hey" + " Sam, morning." -> "Morning.", not "Hey, morning."). The TTS
 *   gateway holds an opening hello until that word anyway
 *   (speech/tts-gateway/name-intonation.ts), so first audio is no later.
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
// The TTS gateway needs the same first name (speech/tts-gateway/name-intonation.ts).
export { firstNameOf } from '../../utils/caller-name.js';

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
const HELLO_WORDS = GREETING_WORDS.filter((g) => g !== 'oh');
/** continuation-tts cuts its first piece on a clause once this many characters will be spoken. */
const FIRST_PIECE_CHARS = 12;
const SPOKEN = /\p{L}/u;
/** Letters outside markup: what counts as words for timing. */
const spoken = (t: string): boolean => SPOKEN.test(t.replace(/<[^>]*>|\[[^\]]*\]/g, ''));

type Chunk = llm.ChatChunk | string | object;

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
export function mayUseName(items: readonly HistoryItem[], name: string): boolean {
  const said = { test: (t: string): boolean => findVocatives(t, name, true).found.length > 0 };
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
  const allowed = mayUseName(history, name);
  const falling = flagOn('NAME_FALLING_INTONATION', env);
  const split = flagOn('NAME_FALLING_SPLIT', env);
  /** NAME_FALLING_SPLIT: mid-call, an opening hello waits for the word after it (see above). */
  const holdHello = split && falling && !allowed;
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
    const opening = !spoken(sent);
    // The gateway holds an opening hello too; held here, a dropped name takes it with it.
    if (holdHello && opening && /^\s*(?:hey|hi|hiya|hello)\b/i.test(raw.slice(from))) return false;
    if (/^\s*(?:hey|hi|hiya|hello|oh)\b/i.test(raw.slice(from).replace(/^[\s,—–;:]*/, '')))
      return true;
    if (holdHello && opening && letters && HELLO_WORDS.some((g) => g.startsWith(letters)))
      return false; // "He", "Hel": a hello on its way waits too
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
    // ", Sam, I'm" -> ", I'm" (or "Sam, " goes when the space before it went out). NAME_FALLING_SPLIT:
    // kept, it still ends its sentence ("Yes, Sam. I'm") though the comma before it went out.
    const fallAt = split ? v.fallAt : undefined;
    if (v.with === ',') return { ...plain, fallAt, end: spaceSent ? after(v.end) : v.end };
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
    // At hello, a caller's goodbye or the interval, the first; otherwise the
    // first that closes a goodbye ("Talk soon, Sam.").
    const keep = !keptOne && (allowed || GOODBYE_BEFORE_NAME.test(raw.slice(0, v.nameAt)));
    if (keep) keptOne = true;
    return keep;
  };

  const render = (final: boolean): string => {
    const result = findVocatives(raw, name, final);
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
