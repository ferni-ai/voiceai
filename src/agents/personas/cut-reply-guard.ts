/**
 * The reply after a cut-off must not say the cut reply again (CUT_REPLY_IN_HISTORY, #2422).
 *
 * Prod AJ_9iynUbCArM2p: a tennis tip cut before a word played, the caller moved
 * on to the app, and the next reply was the same tip. AJ_EKcqk2pyFZBP: ten
 * replies in a row opened "you got me there, fair and square".
 *
 * The marked cut reply in the chat (shared/cut-reply-history.ts) is the hint
 * before generation. This is the backstop after it: only on the reply right
 * after a cut, its opening words are held (OPENING_WORDS, a fraction of the
 * first sentence the TTS waits for anyway). If they are a near-copy of the cut
 * reply's opening, the model is asked once more, with a note to answer what the
 * caller just said, and the copy is never spoken. Otherwise the held words go
 * out and the rest streams through. Every other reply holds nothing, except a
 * reply opening with "[", held until its "]" in case it copied the cut mark,
 * which is cut. No extra model call unless a near-copy is caught.
 *
 * @module agents/personas/cut-reply-guard
 */
import type { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { armedCutReply, wordsOf } from '../shared/cut-reply-history.js';
import { cutFrom, textOf } from './said-by.js';
import { withTurnStyleReminder } from './turn-style.js';

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
/** A copied cut mark, at the very start of a reply. */
const LEADING_MARK = /^\s*\[cut off by the caller[^\]]{0,80}\]\s*/i;
const LONGEST_MARK = 120;

export const REPHRASE_NOTE =
  "Your last reply was cut off before the caller heard it, and they have spoken since. Don't say it again: answer what they just said. If something in it still matters, say it in one short sentence, in new words.";

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
 * The reply (or its opening) says the cut reply again: the same first SAME_START words, or
 * nearly the same words (Jaccard >= NEAR) in the opening or overall.
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

type Verdict = 'hold' | 'release' | 'redo';

/** Held chunks' text after any copied mark: the mark's length, and whether it is still undecided. */
function leadingMark(text: string): { cut: number; open: boolean } {
  const lead = text.trimStart();
  const mark = LEADING_MARK.exec(text);
  if (mark) return { cut: mark[0].length, open: false };
  const open =
    !lead || (lead.startsWith('[') && !lead.includes(']') && lead.length <= LONGEST_MARK);
  return { cut: 0, open };
}

function verdict(body: string, cut: string | undefined, ended: boolean): Verdict {
  if (!cut) return 'release';
  if (!ended && wordsOf(body).length < OPENING_WORDS) return 'hold';
  return isNearCopy(body, cut) ? 'redo' : 'release';
}

/**
 * The reply with a copied cut mark removed and, when `cut` is set, a near-copy of it
 * replaced by `redo()`'s reply. `redo` returning nothing lets the original go out.
 */
export function guardCutReply(
  reply: ReadableStream<Chunk>,
  cut: string | undefined,
  redo: () => Promise<ReadableStream<Chunk> | null>,
  sessionId?: string
): ReadableStream<Chunk> {
  let reader = reply.getReader();
  return new ReadableStream<Chunk>({
    async start(controller) {
      let held: Chunk[] | undefined = [];
      let text = '';
      let markCut = 0;
      const release = (): void => {
        for (const chunk of cutFrom(held ?? [], markCut)) controller.enqueue(chunk);
        held = undefined;
      };
      // Decide on what is held; true once the original is replaced.
      const decide = async (ended: boolean): Promise<boolean> => {
        const mark = leadingMark(text);
        if (mark.open && !ended) return false;
        if (mark.cut && !markCut) log.warn({ sessionId }, 'Reply opened with the cut mark; cut');
        markCut = mark.cut;
        const v = verdict(text.slice(markCut), cut, ended);
        if (v === 'hold') return false;
        if (v === 'redo') log.warn({ sessionId }, 'CUT_REPLY_REPEATED');
        const next = v === 'redo' ? await redo().catch(() => null) : null;
        if (!next) {
          release();
          return false;
        }
        held = undefined;
        await reader.cancel().catch(() => undefined);
        reader = guardCutReply(next, undefined, redo, sessionId).getReader();
        for (let r = await reader.read(); !r.done; r = await reader.read())
          controller.enqueue(r.value);
        return true;
      };
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!held) {
            controller.enqueue(value);
            continue;
          }
          held.push(value);
          const t = textOf(value);
          if (t === undefined) {
            release(); // a tool call: not a spoken repeat
            continue;
          }
          text += t;
          if (await decide(false)) return controller.close();
        }
        if (held && (await decide(true))) return controller.close();
        if (held) release();
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
 * CUT_REPLY_IN_HISTORY=on: the persona's model with the cut-reply check (ferni-agent.ts
 * llmNode). Off: the model itself, unchanged.
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
    const redo = async (): Promise<ReadableStream<Chunk> | null> =>
      model(withTurnStyleReminder(request, REPHRASE_NOTE));
    return guardCutReply(reply, cut, redo, id);
  };
  return checked as M;
}
