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
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';

/**
 * Replies between kept names (hello and goodbye aside): 1 / 0.0424, the most
 * name-heavy SBCSAE friend conversation, so Ferni is never more name-heavy.
 */
export const NAME_EVERY = 24;

const GREETINGS = ['hey', 'hi', 'hiya', 'hello', 'oh'];
const GREETING_WORD = /^(?:hey|hi|hiya|hello|oh)\s+/i;
/** Words that open a new clause after ", Sam,": the name was addressing them. */
const CLAUSE_START = new Set(
  (
    "i i'm i'd i've i'll you you're you've you'll you'd we we're let's it it's that that's " +
    "this there there's what what's how how's why when honestly seriously listen look come " +
    'but so because ' +
    'please trust believe go take tell just'
  ).split(' ')
);
const GOODBYE =
  /\b(?:bye|goodbye|good night|goodnight|talk (?:to you )?(?:soon|later|tomorrow)|see you|take care|gotta go|have to go|catch you later)\b/i;
const ASKS_OWN_NAME = /\b(?:my name|call me|what am i called|who am i)\b/i;
const LETTER = /\p{L}/u;
const LEAD = /^(?:\s|<[^>]*>|\[[^\]]*\])*/;

/** A stretch of the reply that addresses the caller by name. */
export interface Vocative {
  start: number;
  end: number;
  /** What replaces it when it goes ("" or ","). */
  with: string;
  /** Capitalise the first letter after it when it goes (the name opened a sentence). */
  capNext: boolean;
  /** Where the name ends when it runs on into its sentence (for a falling name). */
  fallAt?: number;
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Sentence starts: the reply's first spoken character and after . ! ? … plus space. */
function sentenceStarts(text: string): number[] {
  const starts = [text.match(LEAD)?.[0].length ?? 0];
  for (const m of text.matchAll(/[.!?…]+["')\]]?\s+/g)) starts.push(m.index + m[0].length);
  return starts;
}

/**
 * Vocative uses of `name` in `text`, and the first position whose answer
 * still depends on text not here yet (null when everything is decided).
 * `final`: no more text is coming, so the end of `text` ends the reply.
 */
export function findVocatives(
  text: string,
  name: string,
  final: boolean
): { found: Vocative[]; undecidedAt: number | null } {
  const found: Vocative[] = [];
  let undecidedAt: number | null = null;
  const undecided = (i: number): void => {
    undecidedAt = undecidedAt === null ? i : Math.min(undecidedAt, i);
  };
  /** What follows the name ending at `i`. */
  const follow = (i: number): 'word' | 'space' | 'punct' | 'end' | 'wait' => {
    const c = text.charAt(i);
    if (c === '') return final ? 'end' : 'wait';
    if (LETTER.test(c) || /[\d'’]/.test(c)) return 'word';
    return /\s/.test(c) ? 'space' : 'punct';
  };
  /** A start of the name that more text could complete. */
  const partialName = (rest: string): boolean =>
    !final && rest.length < name.length && name.startsWith(rest);

  // ", Sam." | ", Sam" ending the reply | ", Sam, I'm sure"
  for (const m of text.matchAll(/,\s*/g)) {
    const at = m.index;
    const nameAt = at + m[0].length;
    const rest = text.slice(nameAt);
    if (partialName(rest)) {
      undecided(at);
      continue;
    }
    if (!rest.startsWith(name)) continue;
    const end = nameAt + name.length;
    const f = follow(end);
    if (f === 'wait') {
      undecided(at);
      continue;
    }
    if (f === 'word' || f === 'space') continue; // ", Sam said", ", Sam and I"
    if (f === 'end' || /^[.!?…]/.test(text.slice(end))) {
      found.push({ start: at, end, with: '', capNext: false });
      continue;
    }
    if (text.charAt(end) !== ',') continue;
    // ", Sam, I'm sure" addresses them; "My friend, Sam, called" names someone.
    const word = text.slice(end).match(/^,\s*([\p{L}'’]+)([\s\S]?)/u);
    if (!word || (word[2] === '' && !final)) {
      if (!final) undecided(at);
      continue;
    }
    if (CLAUSE_START.has(word[1].toLowerCase().replace('’', "'"))) {
      found.push({ start: at, end: end + 1, with: ',', capNext: false, fallAt: end });
    }
  }

  // "Sam, really?" | "Hey Sam, ..." | "… Sam" ending the reply
  for (const s of sentenceStarts(text)) {
    let rest = text.slice(s);
    if (
      !final &&
      /^[a-z]*$/i.test(rest) &&
      GREETINGS.some((g) => g.startsWith(rest.toLowerCase()))
    ) {
      undecided(s); // "", "He", "Hey": a greeting may still be coming
      continue;
    }
    const greet = rest.match(GREETING_WORD)?.[0] ?? '';
    rest = rest.slice(greet.length);
    if (partialName(rest)) {
      undecided(s);
      continue;
    }
    if (!rest.startsWith(name)) continue;
    const nameAt = s + greet.length;
    const end = nameAt + name.length;
    const f = follow(end);
    if (f === 'wait') {
      undecided(s);
      continue;
    }
    if (f === 'word' || f === 'space') continue; // "Sam's", "Sam and I"
    // The name goes with its comma or dash; a sentence that was only the name goes whole.
    const tail = text.slice(end).match(/^(?:\s*[,—–]\s*|[.!?…]+\s*)?/)?.[0] ?? '';
    const runsOn = f !== 'end' && /^\s*[,—–]/.test(tail);
    found.push({
      start: greet ? s : nameAt,
      end: end + tail.length,
      with: '',
      capNext: true,
      fallAt: runsOn ? end : undefined,
    });
  }
  found.sort((a, b) => a.start - b.start);
  const merged: Vocative[] = []; // a stretch found from both sides counts once
  for (const v of found)
    if (!merged.length || v.start >= merged[merged.length - 1].end) merged.push(v);
  return { found: merged, undecidedAt };
}

/**
 * Apply the decisions to `text`: with `keepOne`, the first vocative stays
 * (ending its own sentence when `falling`); every other one goes.
 */
export function applyVocatives(
  text: string,
  found: readonly Vocative[],
  keepOne: boolean,
  falling: boolean
): string {
  let out = '';
  let at = 0;
  let kept = false;
  let cap = false;
  const emit = (s: string): void => {
    if (cap) {
      const i = s.search(LETTER);
      if (i >= 0) {
        s = s.slice(0, i) + s.charAt(i).toUpperCase() + s.slice(i + 1);
        cap = false;
      }
    }
    out += s;
  };
  for (const v of found) {
    emit(text.slice(at, v.start));
    const said = text.slice(v.start, v.end);
    if (keepOne && !kept) {
      kept = true;
      if (falling && v.fallAt !== undefined) {
        // "Sam, take care" -> "Sam. Take care": the name ends its own sentence.
        const cut = v.fallAt - v.start;
        emit(`${said.slice(0, cut)}.${said.slice(cut).replace(/^\s*[,—–]/, '')}`);
        cap = true;
      } else emit(said);
    } else {
      emit(v.with);
      if (v.capNext) cap = true;
    }
    at = v.end;
  }
  emit(text.slice(at));
  return out;
}

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
  return first.charAt(0).toUpperCase() + first.slice(1);
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
  const said = new RegExp(`(?<![\\p{L}'])${escape(name)}(?![\\p{L}'])`, 'u');
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
  if (ASKS_OWN_NAME.test(lastCallerWords(history))) return input;
  const allowed = mayUseName(history, name);
  const falling = flagOn('NAME_FALLING_INTONATION', env);
  let raw = '';
  let sent = '';
  let template: Chunk | null = null;

  const render = (final: boolean): string => {
    const { found, undecidedAt } = findVocatives(raw, name, final);
    let upTo = final ? raw.length : (undecidedAt ?? raw.length);
    for (const v of found) if (v.start < upTo && v.end > upTo) upTo = v.start; // waits whole
    const done = found.filter((v) => v.end <= upTo);
    const keep = allowed || GOODBYE.test(raw.slice(0, done[0]?.end ?? 0));
    const out = applyVocatives(raw.slice(0, upTo), done, keep, falling);
    // A reply that was only the name ("Sam?") is said as it came.
    if (final && !LETTER.test(out) && !LETTER.test(sent)) return raw;
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
