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
 * A question that asks the caller where they are or who they are. Only after one of
 * these is a first-person answer a caller's answer. "Where did you grow up?" counts,
 * and so does "Who told you about me?"; "Did I find anything?" does not.
 */
const ASKS_CALLER =
  /\b(?:where (?:are|do|did|were|have|is) you|where (?:you|your)|whereabouts|your name|what'?s your name|what should i call you|who are you|who (?:told|sent|referred|gave) you|who (?:is|'s) (?:this|calling|speaking)|who am i (?:talking|speaking) (?:to|with)|who do i have|and (?:you|who) are\??|your city|what city|which city|what town|zip|postcode|post code|(?:do|are|did) you (?:still )?(?:live|located|from|in|at|near|staying)|your (?:area|town|home|address))\b/i;

/** A lead-in a person says before the answer: "Hi,", "Um,", "Okay,". */
const LEAD_IN =
  '(?:(?:[Hh]i|[Hh]ey|[Oo]h|[Uu]m|[Uu]h|[Oo]kay|[Oo]k|[Ww]ell|[Yy]eah|[Yy]es|[Ss]ure|[Ss]o|[Aa]ctually|[Hh]onestly)[,.!]?\\s+)?';
const NOT_FERNI = '(?!Ferni\\b)';

/**
 * Ferni answering for the caller, in the first person, as a caller would. Narrow on
 * purpose: "Yes, I have three options" never matches, and neither does "I grew up in ...".
 * Case-sensitive on purpose: a lowercase "I'm in the garden" is never a place answer.
 */
const SELF_ANSWER: readonly RegExp[] = [
  new RegExp(`^${LEAD_IN}I(?:'m|’m| am)(?: (?:currently|just|calling|over|originally|right now))* (?:in|from|at|near|over in|calling from) (?:downtown |the )?[A-Z]`), // I'm in Manhattan
  new RegExp(`^${LEAD_IN}I(?:'m|’m| am) ${NOT_FERNI}(?!Sorry|Glad|Happy|Sure|Good|Fine|Ready|Here|Okay|Not|Really|Afraid|Curious|Thrilled|Excited|Thinking|Honestly|Sad|Tired|Busy|Also|Just|So|Very|Still|Going|Trying|Hoping)[A-Z][a-z]+(?=[,.!]|$)`), // I'm Linda, her mom.
  new RegExp(`^${LEAD_IN}(?:My name(?:'s| is)|Name's|This is|Call me) ${NOT_FERNI}[A-Z][a-z]+`), // My name is Linda; This is Linda.
  new RegExp(`^${LEAD_IN}I (?:live|am living) (?:in|at|on|near) [A-Z\\d]`), // I live in Ohio
  /^In [A-Z][a-z]+\.?$/, // In Manhattan.
  /^\d{5}(?:-\d{4})?[.!]?$/, // a bare zip code
  /^[A-Z][a-z]+(?: [A-Z][a-z]+)*,? (?:[A-Z]{2}|New York|New Jersey|Pennsylvania|California|Massachusetts|Florida|Texas|Ohio|Illinois|Colorado|Oregon|Washington|Michigan|Georgia|Virginia)(?:,? \d{5}(?:-\d{4})?)?\.?$/, // Manhattan, New York, 10011.
];

/**
 * Ferni's own canon places (identity/biography-core.md: "I grew up in Wyoming"). An answer
 * that names one is his own life, so it is never a caller's answer. Keep this in step with
 * his biography.
 */
const FERNI_OWN_PLACE = /\bWyoming\b/;

/** Quotes and a "Caller:" label a transcript puts in front of the words. */
const SPEAKER_FRAME = /^(?:["“‘']+\s*|(?:caller|user)\s*:\s*)+/i;

const isSelfAnswer = (sentence: string): boolean => {
  const text = sentence.trim().replace(SPEAKER_FRAME, '');
  if (FERNI_OWN_PLACE.test(text)) return false;
  return SELF_ANSWER.some((pattern) => pattern.test(text));
};

/** A sentence that asks something: a question mark, then any closing quote or bracket. */
const QUESTION_END = /\?[!.]*["”’')\]]*$/;
const isQuestion = (sentence: string): boolean => QUESTION_END.test(sentence.trim());

/** A question that asks the caller for something: the only kind that opens the answer window. */
const isCallerQuestion = (sentence: string): boolean => isQuestion(sentence) && ASKS_CALLER.test(sentence);

/**
 * Length of the first whole sentence in the text, with its trailing space; 0 if none yet.
 * "St." and "Dr." do not end a sentence, so they cannot use up the answer window.
 */
function sentenceEnd(text: string): number {
  const m = text.match(/(?<!\b(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|vs|etc))[.!?]+["”’')\]]*(?:\s|(?=[A-Z]))/);
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
        if (window > 0 && isSelfAnswer(sentence)) {
          log.warn({ reason: 'self_answer' }, 'CALLER_VOICE_CUT');
          release(); // the held sentences are Ferni's own words, before the answer
          return true;
        }
        if (window === 0) {
          emit(sentence.slice(passed));
        } else {
          held.push(sentence);
          window -= 1;
        }
        if (isCallerQuestion(sentence)) window = ANSWER_WINDOW;
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
            // A tool call goes out after the words before it, checked like any sentence.
            if (hasToolCall(chunk)) {
              if (pending && decide(pending)) {
                await stop();
                return;
              }
              pending = '';
              passed = 0;
              release();
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
          if (window === 0 && !isQuestion(pending)) {
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
