/**
 * Ferni never speaks the caller's side of the call.
 *
 * Dev 2026-10-17 (keys-check, synthetic caller): Ferni asked "Whereabouts are
 * you? I need your city..." and, in the same reply, went on as if the caller
 * had answered: "I'm in Manhattan, New York. 10011." The scenario never gave a
 * location, so the model wrote the caller's turn and the voice spoke it. The
 * cause was in the prompt: the unknown-caller guidance (inbound-call-context.ts)
 * carried a Caller:/You: example, and the model copied its shape. That is fixed
 * there. This guard is the backstop on every reply (withActionClaimCheck in
 * action-claim-guard.ts).
 *
 * After a sentence that asks the caller something, the next ANSWER_WINDOW
 * sentences are held. If one of them answers that question in Ferni's own voice
 * ("I'm in Manhattan", "My name is Linda", "Yeah, I live in...", a bare zip
 * code), the reply is cut there: the sentences before it go out, the answer and
 * everything after it do not. Otherwise the held sentences go out as written.
 * A reply with no question streams untouched and holds nothing, so normal turns
 * add no latency. CALLER_VOICE_GUARD=off turns it off. Logs carry the reason,
 * never words.
 *
 * @module agents/personas/caller-voice-guard
 */
import type { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';

import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CallerVoiceGuard' });

type Chunk = llm.ChatChunk | string | object;

/** Sentences after a question in which the caller's answer can land. */
const ANSWER_WINDOW = 2;

export function callerVoiceGuardEnabled(env: Env = process.env): boolean {
  return flagOn('CALLER_VOICE_GUARD', env);
}

/**
 * Ferni answering for the caller, in the first person. Each pattern is narrow on
 * purpose: a lowercase "I'm in the garden" never matches, and neither does a
 * feeling after "Yeah, I'm".
 */
const SELF_ANSWER: readonly RegExp[] = [
  /^I(?:'m|’m| am) (?:in|from|at) [A-Z]/,
  /^My name(?:'s| is) [A-Z]/,
  /^I (?:live|grew up|work) (?:in|at|on|near|up) [A-Z\d]/,
  /^(?:yeah|yes|yep|yup|sure|no|nope)[,.!]? I(?:'m| am| live| lived| work| grew| have| was)\b(?! (?:glad|happy|sorry|here|good|sure|not|really|too|so|fine|ready|down|up)\b)/i,
  /^\d{5}(?:-\d{4})?[.!]?$/,
];

const isSelfAnswer = (sentence: string): boolean =>
  SELF_ANSWER.some((pattern) => pattern.test(sentence.trim()));

const isQuestion = (sentence: string): boolean => sentence.trim().endsWith('?');

/** Length of the first whole sentence in the text, with its trailing space; 0 if none yet. */
function sentenceEnd(text: string): number {
  const m = text.match(/[.!?]+(?:\s|(?=[A-Z]))/);
  return m?.index === undefined ? 0 : m.index + m[0].length;
}

function contentOf(chunk: Chunk): string | undefined {
  if (typeof chunk === 'string') return chunk;
  const delta = (chunk as Partial<llm.ChatChunk> | null)?.delta;
  if (delta === undefined || (delta.toolCalls?.length ?? 0) > 0) return undefined;
  return delta.content ?? '';
}

function hasToolCall(chunk: Chunk): boolean {
  if (typeof chunk !== 'object' || chunk === null) return false;
  return ((chunk as { delta?: { toolCalls?: unknown[] } }).delta?.toolCalls?.length ?? 0) > 0;
}

/**
 * The model's reply, cut where it starts speaking for the caller. Text streams as it
 * arrives until a question is complete; then the next sentences are held until the window
 * closes.
 */
export async function withCallerVoiceGuard<T>(reply: Promise<T> | T, env: Env = process.env): Promise<T> {
  const stream = await reply;
  if (stream === null || stream === undefined || !callerVoiceGuardEnabled(env)) return stream;
  const reader = (stream as unknown as ReadableStream<Chunk>).getReader();
  let id = '';
  let stringChunks = true;
  const out = (text: string): Chunk =>
    stringChunks ? text : { id, delta: { role: 'assistant', content: text } };
  const guarded = new ReadableStream<Chunk>({
    async start(controller) {
      let pending = ''; // the sentence being read, not yet decided
      let passed = 0; // how much of pending already streamed out (only while no window is open)
      let window = 0; // sentences left in which the caller's answer can land
      let held: string[] = []; // sentences held while the window is open
      const emit = (text: string): void => {
        if (text) controller.enqueue(out(text));
      };
      const release = (): void => {
        emit(held.join(''));
        held = [];
      };
      /** Decides one sentence (or the unfinished tail). True when the reply was cut. */
      const decide = (sentence: string): boolean => {
        if (window === 0) {
          emit(sentence.slice(passed));
          if (isQuestion(sentence)) window = ANSWER_WINDOW;
          return false;
        }
        if (isSelfAnswer(sentence)) {
          log.warn({ reason: 'self_answer' }, 'CALLER_VOICE_CUT');
          release(); // the held sentences are Ferni's own words, before the answer
          return true;
        }
        held.push(sentence);
        window -= 1;
        if (isQuestion(sentence)) window = ANSWER_WINDOW;
        if (window === 0) release();
        return false;
      };
      const stop = async (): Promise<void> => {
        await reader.cancel('caller voice cut').catch((error: unknown) => {
          log.debug({ error: String(error) }, 'reply cancel after the caller voice cut failed');
        });
        controller.close();
      };
      try {
        for (let next = await reader.read(); !next.done; next = await reader.read()) {
          const chunk = next.value;
          const content = contentOf(chunk);
          if (content === undefined) {
            // A tool call goes out after the words before it, and no text is held across it.
            if (hasToolCall(chunk)) {
              emit(held.join(''));
              held = [];
              emit(pending.slice(passed));
              pending = '';
              passed = 0;
              window = 0;
            }
            controller.enqueue(chunk);
            continue;
          }
          if (typeof chunk !== 'string') {
            stringChunks = false;
            id = (chunk as llm.ChatChunk).id ?? id;
          }
          pending += content;
          for (let end = sentenceEnd(pending); end > 0; end = sentenceEnd(pending)) {
            const sentence = pending.slice(0, end);
            pending = pending.slice(end);
            const cut = decide(sentence);
            passed = 0;
            if (cut) {
              await stop();
              return;
            }
          }
          // A question still open ("...are you?") waits for its boundary, so its end is never streamed early.
          if (window === 0 && !pending.trimEnd().endsWith('?')) {
            emit(pending.slice(passed));
            passed = pending.length;
          }
        }
        if (pending && decide(pending)) {
          await stop();
          return;
        }
        release();
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason).catch((error: unknown) => {
        log.debug({ error: String(error) }, 'reply cancel after the caller voice guard failed');
      });
    },
  });
  return guarded as unknown as T;
}
