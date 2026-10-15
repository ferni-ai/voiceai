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
 * goodbye or the reply is one, and once NAME_EVERY replies have gone by
 * without it; never twice in a reply. Only the name addressing the caller
 * goes: "Tell Sam I said hi", "Sam's sister", "Your name is Sam." and "My
 * friend, Sam, called" stay, and a reply to a question about the caller's own
 * name is left alone.
 *
 * With NAME_FALLING_INTONATION on, a kept name that runs on into its sentence
 * ("Sam, take care.") ends its own sentence ("Sam. Take care.") so it falls:
 * the delivery #1320 measured for greetings (speech/tts-gateway/name-intonation.ts).
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

/**
 * A goodbye closes its sentence: "Take care, Sam." and "See you tomorrow!"
 * do; "I see you" and "I have to go to the doctor" don't.
 */
const GOODBYE =
  /\b(?:bye(?:-bye)?|goodbye|good ?night|talk (?:to you )?(?:soon|later|tomorrow)|(?<!\bi )see (?:you|ya)(?: (?:soon|later|tomorrow|then|next time|around))?|take care(?: of yourself)?|(?:gotta|got to|have to|need to) (?:go|run|hop off)|catch you later|let you go)\s*(?:,\s*[\p{L}'’-]+\s*)?(?:[.!?…]|$)/iu;

/** The caller asking about, or giving, their own name: the reply may need it. */
const ASKS_OWN_NAME =
  /\b(?:what(?:'s| is) my name|(?:know|remember|forgot|forget|say|said|got|spell) my name|my name(?:'s| is)|what (?:do|should|would) you call me|what am i called)\b/i;

/** "Just call me Sam" (a capital, so not "call me tomorrow"). */
const GIVES_NAME = /\b(?:[Yy]ou can|[Jj]ust|[Pp]lease) call me \p{Lu}/u;

/** Characters a name may wait for its sentence to end (a goodbye is shorter). */
const GOODBYE_WAIT = 40;

type Chunk = llm.ChatChunk | string | object;
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
 * straight through except where a vocative might be starting (after a comma
 * or at a sentence start); that waits only until the next few characters
 * decide it.
 */
export function withNameGate(
  input: ReadableStream<Chunk>,
  opts: { name: string | null; history: readonly HistoryItem[]; env?: Env }
): ReadableStream<Chunk> {
  const env = opts.env ?? process.env;
  const { name, history } = opts;
  if (!name || !flagOn('NAME_GATE', env)) return input;
  const caller = lastCallerWords(history);
  if (ASKS_OWN_NAME.test(caller) || GIVES_NAME.test(caller)) return input;
  const allowed = mayUseName(history, name);
  const falling = flagOn('NAME_FALLING_INTONATION', env);
  let raw = '';
  let sent = '';
  let template: Chunk | null = null;

  const render = (final: boolean): string => {
    const { found, undecidedAt } = findVocatives(raw, name, final);
    let upTo = final ? raw.length : (undecidedAt ?? raw.length);
    // Outside hello, a name is kept only in a goodbye ("Sam, take care."), so
    // it waits for its sentence to end before that is decided.
    const keep = new Set<Vocative>();
    for (const v of found) {
      if (v.start >= upTo || keep.size > 0) break;
      if (allowed) {
        keep.add(v);
        break;
      }
      // Goodbyes are short: only the first GOODBYE_WAIT characters after the
      // name are read, so the decision never changes once it is made.
      const stop = raw.slice(v.end).search(/[.!?…]/);
      const window = v.end + GOODBYE_WAIT;
      let close: number;
      if (stop >= 0 && v.end + stop + 1 <= window) close = v.end + stop + 1;
      else if (raw.length >= window) close = window;
      else if (final) close = raw.length;
      else {
        upTo = v.start;
        break;
      }
      const from =
        Math.max(...['.', '!', '?', '…'].map((p) => raw.lastIndexOf(p, v.start - 1))) + 1;
      // A cut mid-sentence is not a sentence end: "take care" there doesn't close it.
      const said =
        raw.slice(from, close) + (close === window && stop !== close - v.end - 1 ? 'x' : '');
      if (GOODBYE.test(said)) keep.add(v);
    }
    for (const v of found) if (v.start < upTo && v.end > upTo) upTo = v.start; // waits whole
    const done = found.filter((v) => v.end <= upTo);
    const out = applyVocatives(raw.slice(0, upTo), done, (v) => keep.has(v), falling);
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
    // Decisions are final once made, so what was sent stays a prefix.
    if (out.startsWith(sent)) {
      enqueue(controller, out.slice(sent.length));
      sent = out;
    } else if (final) {
      // Never expected: say what is left past what was sent, never anything twice.
      log.warn({ sent: sent.length, out: out.length }, 'Name gate output diverged');
      enqueue(controller, out.slice(sent.length));
    }
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
          template = chunk;
          flush(controller, false);
        }
        flush(controller, true);
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
