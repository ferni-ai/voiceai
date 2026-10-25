/**
 * How a reply carried over at a single-session handoff is marked with who
 * said it (DIRECTOR_PERSONA_AWARE, persona-swap.ts markWhoSpoke). A chat
 * message has no speaker field the model sees, so the mark goes in the words;
 * the director's transcript reads it back off (director-notes.ts linesFromChat).
 *
 * @module agents/personas/said-by
 */
import type { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { flagOn } from '../../config/env-flag.js';
import { getDisplayName, isKnownId } from '../../personas/persona-ids.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'SaidBy' });

export const saidBy = (name: string): string => `(${name} said:) `;

/** A persona's name for a mark or a prompt line; an unknown id is its own name (not Ferni's). */
export const personaName = (id: string): string => (isKnownId(id) ? getDisplayName(id) : id);
const SAID_BY = /^\(([^()]{1,40}) said:\) /;

/** The speaker and words of a marked reply, or undefined if it isn't marked. */
export function splitSaidBy(text: string): { name: string; text: string } | undefined {
  const m = SAID_BY.exec(text);
  return m ? { name: m[1], text: text.slice(m[0].length) } : undefined;
}

// ---------------------------------------------------------------------------
// A reply must not open with a mark: the persona could copy one off the marked
// history ("(Peter said:) Coffee spend!") and the TTS would say it. With the
// flag on, a mark at the very start of a reply is cut before anything hears it.
// ---------------------------------------------------------------------------

type Chunk = llm.ChatChunk | string | object;
const LEADING_MARK = /^\s*\([^()]{1,40} said:\)\s*/;
/** Past this many characters without a closing ")" the reply can't open with a mark */
const LONGEST_MARK = 48;

export function textOf(chunk: Chunk): string | undefined {
  if (typeof chunk === 'string') return chunk;
  const c = chunk as llm.ChatChunk;
  if ('delta' in c && c.delta !== undefined && (c.delta.toolCalls?.length ?? 0) === 0) {
    return c.delta.content ?? '';
  }
  return undefined; // tool calls, usage: not reply text
}

function withText<T extends Chunk>(chunk: T, text: string): T {
  if (typeof chunk === 'string') return text as T;
  const c = chunk as llm.ChatChunk;
  return { ...c, delta: { ...c.delta, content: text } } as T;
}

/** The held chunks with the first `cut` characters of reply text removed. */
export function cutFrom<T extends Chunk>(held: T[], cut: number): T[] {
  let left = cut;
  return held.map((chunk) => {
    const text = textOf(chunk);
    if (text === undefined || left === 0) return chunk;
    const n = Math.min(left, text.length);
    left -= n;
    return withText(chunk, text.slice(n));
  });
}

/**
 * The reply with a leading "(Name said:)" cut off. Only the first few
 * characters are held, and only while the reply starts with "(".
 */
export function dropLeadingSaidBy<T extends Chunk>(
  reply: ReadableStream<T> | null
): ReadableStream<T> | null {
  if (!reply || !flagOn('DIRECTOR_PERSONA_AWARE')) return reply;
  return new ReadableStream<T>({
    async start(controller) {
      try {
        let held: T[] | undefined = [];
        let text = '';
        const release = (cut: number) => {
          for (const chunk of cutFrom(held ?? [], cut)) controller.enqueue(chunk);
          held = undefined;
        };
        for await (const chunk of reply as unknown as AsyncIterable<T>) {
          if (!held) {
            controller.enqueue(chunk);
            continue;
          }
          held.push(chunk);
          text += textOf(chunk) ?? '';
          const lead = text.trimStart();
          if (!lead) continue;
          const mark = LEADING_MARK.exec(text);
          if (mark) {
            log.warn({ mark: mark[0].trim() }, 'Reply opened with a said-by mark; cut');
            release(mark[0].length);
          } else if (!lead.startsWith('(') || lead.includes(')') || lead.length > LONGEST_MARK) {
            release(0);
          }
        }
        if (held) release(0);
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
