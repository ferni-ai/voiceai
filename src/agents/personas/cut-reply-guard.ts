/**
 * The reply after a cut-off: observed, never changed (CUT_REPLY_IN_HISTORY, #2422).
 *
 * Prod AJ_9iynUbCArM2p: a tennis tip cut before a word played, the caller moved
 * on to the app, and the next reply was the same tip. AJ_EKcqk2pyFZBP: ten
 * replies in a row opened "you got me there, fair and square".
 *
 * The fix is before generation: the cut reply goes into the chat, marked as cut
 * (shared/cut-reply-history.ts), so the model sees what it said and the caller
 * didn't hear. This module only:
 * - removes a copied cut mark from a reply (dropCutMarks), the exact mark only;
 * - logs CUT_REPLY_REPEATED (word counts, no text) once a reply that followed a
 *   cut has ended as a near-copy of it, so dev can measure whether repeats remain.
 *
 * Nothing Ferni generates is held, delayed or replaced on account of a repeat.
 * Rounds 1 and 2 of verify on #2786 failed a post-generation re-ask: deciding on
 * a reply's opening words and asking again lost safety content that came later
 * (988 dropped in round 1; in round 2 a word-by-word reply offering 988 after its
 * opening was re-asked and the caller heard only "Sure thing."). So no re-ask.
 *
 * @module agents/personas/cut-reply-guard
 */
import type { llm } from '@livekit/agents';
import { ReadableStream, TransformStream } from 'node:stream/web';
import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { armedCutReply, wordsOf } from '../shared/cut-reply-history.js';
import { textOf, withText } from './said-by.js';

const log = createLogger({ module: 'cut-reply-guard' });

type Chunk = llm.ChatChunk | string | object;
type Model = (request: llm.ChatContext) => Promise<ReadableStream<Chunk> | null>;

/** Opening words compared with the cut reply's. */
export const OPENING_WORDS = 8;
/** Shared-word share (Jaccard) at or above which two openings are the same line. */
const NEAR = 0.8;
/** This many identical opening words are the same line, whatever follows. */
const SAME_START = 6;
/** Shorter than this on either side is a stock word or two, not a repeated reply. */
const MIN_WORDS = 5;
/** A copied cut mark is held from its "[" for at most this many characters. */
const LONGEST_MARK = 120;
/** A copied cut mark anywhere in a reply. */
const ANY_MARK = /\s*\[cut off by the caller[^\]]{0,80}\]/gi;

const norm = (text: string): string[] =>
  wordsOf(text.toLowerCase()).map((w) => w.replace(/[^\p{L}\p{N}']/gu, ''));

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  let shared = 0;
  for (const w of sa) if (sb.has(w)) shared++;
  return shared / (sa.size + sb.size - shared || 1);
}

/**
 * The reply says the cut reply again: the same first SAME_START words, or nearly the
 * same words (Jaccard >= NEAR) in the opening or overall.
 */
export function isNearCopy(reply: string, cut: string): boolean {
  const a = norm(reply);
  const b = norm(cut);
  if (a.length < MIN_WORDS || b.length < MIN_WORDS) return false;
  const same = (k: number): boolean =>
    a.length >= k && b.length >= k && a.slice(0, k).join(' ') === b.slice(0, k).join(' ');
  const n = Math.min(OPENING_WORDS, a.length, b.length);
  return same(SAME_START) || jaccard(a.slice(0, n), b.slice(0, n)) >= NEAR || jaccard(a, b) >= NEAR;
}

/**
 * The reply with any copied cut mark removed, wherever it falls. Text is held only
 * from a "[" until its "]" (at most LONGEST_MARK characters); everything else passes.
 */
export function dropCutMarks(reply: ReadableStream<Chunk>): ReadableStream<Chunk> {
  const reader = reply.getReader();
  return new ReadableStream<Chunk>({
    async start(controller) {
      let held: Chunk[] = [];
      let text = '';
      const flush = (): void => {
        const clean = text.replace(ANY_MARK, '');
        let first = true;
        for (const chunk of held) {
          if (textOf(chunk) === undefined) controller.enqueue(chunk);
          else {
            controller.enqueue(withText(chunk, first ? clean : ''));
            first = false;
          }
        }
        held = [];
        text = '';
      };
      try {
        for (let r = await reader.read(); !r.done; r = await reader.read()) {
          const t = textOf(r.value);
          if (t === undefined) {
            if (held.length) held.push(r.value);
            else controller.enqueue(r.value);
            continue;
          }
          if (!held.length && !t.includes('[')) {
            controller.enqueue(r.value);
            continue;
          }
          held.push(r.value);
          text += t;
          const open = text.lastIndexOf('[');
          const closed = open >= 0 && text.indexOf(']', open) >= 0;
          if (open < 0 || closed || text.length - open > LONGEST_MARK) flush();
        }
        if (held.length) flush();
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => undefined);
    },
  });
}

/**
 * The reply passed through chunk for chunk, as it arrives; once it has ended, a
 * near-copy of `cut` is logged (CUT_REPLY_REPEATED, word counts only).
 */
export function logNearCopy(
  reply: ReadableStream<Chunk>,
  cut: string,
  sessionId?: string
): ReadableStream<Chunk> {
  let text = '';
  return reply.pipeThrough(
    new TransformStream<Chunk, Chunk>({
      transform(chunk, controller) {
        controller.enqueue(chunk);
        text += textOf(chunk) ?? '';
      },
      flush() {
        if (!isNearCopy(text, cut)) return;
        const words = { replyWords: wordsOf(text).length, cutWords: wordsOf(cut).length };
        log.warn({ sessionId, ...words }, 'CUT_REPLY_REPEATED');
      },
    })
  );
}

/**
 * CUT_REPLY_IN_HISTORY=on: the persona's model with copied cut marks removed and, after a
 * cut, a repeat of it logged (ferni-agent.ts llmNode). Off: the model itself, unchanged.
 */
export function withCutReplyCheck<M extends Model>(
  session: object,
  model: M,
  sessionId?: string,
  env: Env = process.env
): M {
  if (!flagOn('CUT_REPLY_IN_HISTORY', env)) return model;
  const services = (session as { userData?: { services?: { sessionId?: string } } }).userData
    ?.services;
  const id = sessionId ?? services?.sessionId;
  const checked = async (request: llm.ChatContext): Promise<ReadableStream<Chunk> | null> => {
    const cut = armedCutReply(session);
    const reply = await model(request);
    if (!reply) return reply;
    const clean = dropCutMarks(reply);
    return cut === undefined ? clean : logNearCopy(clean, cut, id);
  };
  return checked as M;
}
