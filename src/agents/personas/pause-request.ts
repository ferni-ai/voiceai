/**
 * A caller who asks for a moment gets the moment (#3983).
 *
 * rt-1116-let-me-think, dev 2026-11-16: "Hmm. Okay, hold on. Let me think." ends
 * on a full stop, so the unfinished-turn read calls it finished
 * (unfinished-turn.ts) and the reply goes at once. The reply was a 27-word
 * question that pulled the caller off their own thought. The director saw it
 * ("Let Sam think through the pause they just asked for.") 1.1 s later, after
 * the reply was already playing.
 *
 * Holding the turn longer can't fix it: the hold is capped below the turn
 * keeper's grace (about 2.5 s), and a caller thinking takes longer than that,
 * so the same question comes, only later. What a friend does is say "sure,
 * take your time" and wait. So with PAUSE_REQUEST_WAIT=on, a turn that is
 * only a request to wait gets a note asking for a few words that give the
 * moment and no question. The note rides the attunement slot
 * (turn-attunement.ts), after the turn shape, so its "no question" wins, and
 * it reaches the preemptive request as well as the final one.
 *
 * The read is narrow on purpose. The whole turn must be a pause request: at
 * most eight words, every clause one of the pause phrases below with only
 * fillers ("okay", "hmm", "um") around it, no question mark, nothing but
 * English letters and plain punctuation. "Hold on, I don't think I can do this
 * anymore", "let me think about whether it's worth it" and "wait, I need to
 * tell you something" don't match. On top of that the line must pass the
 * farewell and crisis read as it was said (farewell-risk.ts, which runs
 * detectCrisis); a read that throws counts as risk. That read counts "hang"
 * as risk content, so "hang on" is left out of the phrases rather than taken
 * out of the line before the read. A turn held for crisis
 * risk never gets the note (exits-held.ts, via the attunement's `careful`).
 *
 * Dev, 2026-11-23, three calls with the flag on: one gave the moment. In one the
 * model said "Take your time." and then kept going for 8.6 s, so a reply to a
 * request that carries the note stops after its first sentence
 * (withPauseReplyCap, first of the reply guards). In the other the STT clipped the
 * start ("on. Let me think."), so a lone first clause that ends a pause phrase
 * ("on", "sec") counts when a full pause clause follows it.
 *
 * @module agents/personas/pause-request
 */
import type { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';

import { flagOn, type Env } from '../../config/env-flag.js';
import { farewellRisk } from '../shared/farewell-risk.js';
import { createLogger } from '../../utils/safe-logger.js';
import { contentOf, hasToolCall, type ReplyChunk } from './reply-chunks.js';

const log = createLogger({ module: 'PauseRequest' });

/** The longest turn read as a pause request ("Okay, hold on, let me think about that."). */
const PAUSE_REQUEST_MAX_WORDS = 8;

const PAUSE_REQUEST_NOTE =
  '[They asked for a moment to think. Give it to them: a few warm words at most, ' +
  'such as "Sure, take your time." Ask no question, add nothing else, and let them come back to you.]';

const UNIT = '(?:sec|second|minute|moment)';
/** One clause that is a request to wait, fillers already taken off. */
const PAUSE_CLAUSE = new RegExp(
  `^(?:${[
    `hold on(?: (?:a|one) ${UNIT})?`,
    `wait(?: (?:a|one) ${UNIT})?`,
    `(?:give me|gimme)(?: a| one)? ${UNIT}`,
    `(?:one|a) ${UNIT}`,
    `(?:let me|lemme) think(?: about (?:it|that)| for a ${UNIT})?`,
    '(?:let me|lemme) see',
    `i need a ${UNIT}`,
  ].join('|')})$`
);

/** Words around a pause phrase that add nothing to it. */
// prettier-ignore
const FILLERS = new Set([
  'ok', 'okay', 'oh', 'ah', 'so', 'well', 'alright', 'right', 'yeah', 'sure', 'just',
  'please', 'actually',
]);
const isFiller = (w: string): boolean => FILLERS.has(w) || /^(?:h?m+|u+[hm]+|e+r+m*)$/.test(w);

/**
 * The last word of a pause phrase, all the STT kept when it clipped the start of the
 * turn ("on. Let me think." for "Okay, hold on. Let me think.", dev 2026-11-23).
 */
const CLIPPED_TAIL = new Set(['on', 'sec', 'second', 'minute', 'moment']);

/** Only English letters, spaces and plain punctuation: anything else is not read. */
const PLAIN_LINE = /^[a-z\s,.;:!'’-]+$/i;

const tokens = (clause: string): string[] =>
  clause
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z]+/)
    .filter(Boolean);

/** The clause with its leading and trailing fillers taken off ("okay, hold on please"). */
function core(ws: readonly string[]): string {
  let start = 0;
  let end = ws.length;
  while (start < end && isFiller(ws[start])) start++;
  while (end > start && isFiller(ws[end - 1])) end--;
  return ws.slice(start, end).join(' ');
}

/** True when the whole turn is a request to wait and nothing else, with no risk in it. */
function isPauseRequest(said: string): boolean {
  const line = said.trim();
  if (!line || !PLAIN_LINE.test(line)) return false;
  if (tokens(line).length > PAUSE_REQUEST_MAX_WORDS) return false;
  const clauses = line.split(/[,.;:!]+/).map((c) => core(tokens(c)));
  // A clipped first clause stands only before a full one (the some() just below).
  if (clauses.length > 1 && CLIPPED_TAIL.has(clauses[0])) clauses.shift();
  if (!clauses.some((c) => PAUSE_CLAUSE.test(c))) return false;
  if (!clauses.every((c) => c === '' || PAUSE_CLAUSE.test(c))) return false;
  try {
    return !farewellRisk(line); // the line as said, nothing taken out
  } catch (error) {
    log.warn({ error: String(error) }, 'PAUSE_REQUEST: risk read failed, no note');
    return false;
  }
}

/** PAUSE_REQUEST_WAIT=on: the note for a turn that only asks for a moment; '' otherwise. */
export function pauseRequestNote(said: string | undefined, env: Env = process.env): string {
  if (!said || !flagOn('PAUSE_REQUEST_WAIT', env) || !isPauseRequest(said)) return '';
  log.info({ callerWords: tokens(said).length }, 'PAUSE_REQUEST_WAIT');
  return PAUSE_REQUEST_NOTE;
}

/** True when the request's latest caller turn carries the pause note (turn-style.ts puts notes there). */
function carriesPauseNote(request: { items: readonly unknown[] }): boolean {
  for (let i = request.items.length - 1; i >= 0; i--) {
    const item = request.items[i] as { type?: string; role?: string; content?: unknown };
    if (item?.type !== 'message' || item.role !== 'user') continue;
    const content = Array.isArray(item.content) ? (item.content as unknown[]) : [];
    return content.some((c) => typeof c === 'string' && c.includes(PAUSE_REQUEST_NOTE));
  }
  return false;
}

/**
 * Index just past the first sentence in `text`, or -1 until the words after its mark
 * begin. A mark inside speech markup (`<break time="0.5s"/>`, a tag opening with a
 * letter or "/", so "I <3 that." is words) or a number ("1.5") ends nothing.
 */
function firstSentenceEnd(text: string): number {
  let inTag = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '<' && (next === undefined || /[A-Za-z/]/.test(next))) inTag = true;
    else if (c === '>') inTag = false;
    else if (!inTag && (c === '.' || c === '!' || c === '?') && next !== undefined) {
      if (/["”’)]/.test(next)) return i + 2;
      if (/[\s<]/.test(next)) return i + 1;
    }
  }
  return -1;
}

/**
 * PAUSE_REQUEST_WAIT=on: a reply to a request carrying the pause note keeps only its
 * first sentence ("Sure, take your time."). The reply ends as soon as the next words
 * begin, and the model's generation is cancelled, so the caller gets the quiet they
 * asked for. Until then, tool calls and other chunks pass through.
 * Any other request, or the flag off, gets the reply untouched. First in the reply
 * guards (action-claim-guard.ts withActionClaimCheck), so they check what is said.
 */
export async function withPauseReplyCap<T>(
  reply: Promise<T> | T,
  request: { items: readonly unknown[] },
  env: Env = process.env
): Promise<T> {
  const stream = await reply;
  if (!isReplyStream(stream)) return stream;
  if (!flagOn('PAUSE_REQUEST_WAIT', env) || !carriesPauseNote(request)) return stream;
  const reader = stream.getReader();
  let said = ''; // the reply's words so far
  let sent = 0; // how much of `said` has gone on
  const piece = (chunk: ReplyChunk, text: string): ReplyChunk =>
    typeof chunk === 'string'
      ? text
      : {
          ...(chunk as llm.ChatChunk),
          delta: { ...(chunk as llm.ChatChunk).delta, content: text },
        };
  return new ReadableStream<ReplyChunk>({
    // Reads until it has something to send: a pull that sends nothing would stall the reader.
    async pull(controller) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        const text = contentOf(value);
        if (!text || hasToolCall(value)) {
          controller.enqueue(value);
          return;
        }
        said += text;
        const end = firstSentenceEnd(said);
        const out = said.slice(sent, end >= 0 ? end : said.length);
        sent += out.length;
        if (out) controller.enqueue(piece(value, out));
        if (end >= 0) {
          // The first sentence is out: end the reply now, not when the model stops.
          log.info({ keptChars: sent, droppedChars: said.length - sent }, 'PAUSE_REPLY_CAPPED');
          controller.close();
          reader.cancel('pause reply capped').catch((error: unknown) => {
            log.warn({ error: String(error) }, 'PAUSE_REPLY_CAPPED: cancelling the model failed');
          });
          return;
        }
        if (out) return;
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  }) as T;
}

/** A reply stream to read (a null reply, or anything else, passes through as is). */
function isReplyStream(x: unknown): x is ReadableStream<ReplyChunk> {
  return typeof (x as { getReader?: unknown } | null)?.getReader === 'function';
}
