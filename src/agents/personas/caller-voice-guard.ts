/**
 * Ferni never speaks the caller's side of the call.
 *
 * Dev 2026-10-17 (synthetic caller): Ferni asked where the caller was and, in the
 * same reply, went on as if they had answered with a made-up city and zip code.
 * The cause was in the prompt: the unknown-caller guidance carried a Caller:/You:
 * example, which the model copied (fixed in inbound-call-context.ts). This guard
 * is the backstop, on every persona's reply (withActionClaimCheck in
 * action-claim-guard.ts).
 *
 * Modes, from CALLER_VOICE_GUARD (flag-manifest.ts):
 * - off (default): nothing.
 * - shadow: the reply streams untouched. Where a sentence would have been cut,
 *   the log says so (persona, the shape id, never the words), so the rate can be
 *   measured on dev before anyone turns the guard into a cut.
 * - on: after a sentence that asks the caller where they are or who they are,
 *   the next ANSWER_WINDOW sentences are held. If one of them answers in the
 *   speaker's own voice ("I'm in Manhattan", "My name is Linda", a bare zip code),
 *   the reply is cut there: the sentences before it go out, the answer and what
 *   follows do not.
 *
 * A reply with no caller question streams untouched and holds nothing, so normal
 * turns add no latency. Each persona's own name and canon places are exempt, so
 * a teammate's intro or hometown is never a would-cut. Logs carry the persona and
 * the shape id, never words.
 *
 * @module agents/personas/caller-voice-guard
 */
import type { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';

import { flagModeOf, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { contentOf, hasToolCall, type ReplyChunk as Chunk } from './reply-chunks.js';

const log = createLogger({ module: 'CallerVoiceGuard' });

export type CallerVoiceMode = 'off' | 'shadow' | 'on';

/** Sentences after a caller question in which the caller's answer can land. */
const ANSWER_WINDOW = 2;

export function callerVoiceGuardMode(env: Env = process.env): CallerVoiceMode {
  return flagModeOf('CALLER_VOICE_GUARD', env);
}

/**
 * A question that asks the caller where they are or who they are. Only after one of
 * these is a first-person answer a caller's answer. "Where did you grow up?" counts,
 * and so does "Who told you about me?"; "Did I find anything?" does not.
 */
const ASKS_CALLER =
  /\b(?:where (?:are|do|did|were|have|is) you|where (?:you|your)|whereabouts|your name|what'?s your name|what should i call you|who are you|who (?:told|sent|referred|gave) you|who(?: is|'s|’s) (?:this|calling|speaking)|who am i (?:talking|speaking) (?:to|with)|who do i have|and (?:you|who) are\??|your city|what city|which city|what town|zip|postcode|post code|(?:do|are|did) you (?:still )?(?:live|located|from|in|at|near|staying)|your (?:area|town|home|address))\b/i;

/** A lead-in a person says before the answer: "Hi,", "Um,", "Okay,". */
const LEAD_IN =
  '(?:(?:[Hh]i|[Hh]ey|[Oo]h|[Uu]m|[Uu]h|[Oo]kay|[Oo]k|[Ww]ell|[Yy]eah|[Yy]es|[Ss]ure|[Ss]o|[Aa]ctually|[Hh]onestly)[,.!]?\\s+)?';
const NOT_AN_INTRO =
  'Sorry|Glad|Happy|Sure|Good|Fine|Ready|Here|Okay|Not|Really|Afraid|Curious|Thrilled|Excited|Thinking|Honestly|Sad|Tired|Busy|Also|Just|So|Very|Still|Going|Trying|Hoping';

interface Shape {
  id: string;
  re: RegExp;
}

/**
 * A first-person answer in a speaker's own voice, by shape. Narrow on purpose: "Yes, I
 * have three options" never matches, and neither does "I grew up in ...". Case-sensitive
 * on purpose: a lowercase "I'm in the garden" is never a place answer.
 */
const SELF_ANSWER: readonly Shape[] = [
  {
    id: 'place',
    re: new RegExp(
      `^${LEAD_IN}I(?:'m|’m| am)(?: (?:currently|just|calling|over|originally|right now))* (?:in|from|at|near|over in|calling from) (?:downtown |the )?[A-Z]`
    ),
  },
  {
    id: 'name-intro',
    re: new RegExp(`^${LEAD_IN}I(?:'m|’m| am) (?!(?:${NOT_AN_INTRO})\\b)[A-Z][a-z]+(?=[,.!]|$)`),
  },
  {
    id: 'my-name',
    re: new RegExp(
      `^${LEAD_IN}(?:[Mm]y name(?:'s| is)|[Nn]ame's|[Tt]his is|[Cc]all me) [A-Z][a-z]+`
    ),
  },
  { id: 'lives-in', re: new RegExp(`^${LEAD_IN}I (?:live|am living) (?:in|at|on|near) [A-Z\\d]`) },
  { id: 'in-place', re: /^In [A-Z][a-z]+\.?$/ },
  { id: 'zip', re: /^\d{5}(?:-\d{4})?[.!]?$/ },
  {
    id: 'city-state',
    re: /^[A-Z][a-z]+(?: [A-Z][a-z]+)*,? (?:[A-Z]{2}|New York|New Jersey|Pennsylvania|California|Massachusetts|Florida|Texas|Ohio|Illinois|Colorado|Oregon|Washington|Michigan|Georgia|Virginia)(?:,? \d{5}(?:-\d{4})?)?\.?$/,
  },
];

/**
 * Each persona's canon places (src/personas/bundles/<persona>/identity). An answer that
 * names one is that persona's own life, so it is never a caller's answer. Keep in step
 * with the bundles.
 */
const OWN_CANON: Readonly<Record<string, readonly string[]>> = {
  ferni: ['Wyoming', 'Big Sky', 'Jackson Hole', 'Yellowstone', 'Japan', 'Kyoto'],
  'maya-santos': ['Stockton', 'Philippines'],
  'nayan-patel': ['Vadodara', 'Gujarat', 'India'],
  'alex-chen': ['Oakland', "Chen's Garden", 'Rockridge'],
  'peter-john': ['Pawtucket', 'Rhode Island'],
  'jordan-taylor': [],
};

const ownWordsCache = new Map<string, RegExp>();

/** The persona's own first name and canon places: an answer naming them is not the caller's. */
function ownWords(persona: string): RegExp {
  let re = ownWordsCache.get(persona);
  if (!re) {
    const first = persona.split('-')[0];
    const names = [first.charAt(0).toUpperCase() + first.slice(1), ...(OWN_CANON[persona] ?? [])];
    re = new RegExp(`\\b(?:${names.join('|')})\\b`);
    ownWordsCache.set(persona, re);
  }
  return re;
}

/** Quotes and a "Caller:" label a transcript puts in front of the words. */
const SPEAKER_FRAME = /^(?:["“‘']+\s*|(?:caller|user)\s*:\s*)+/i;

/**
 * The shape id of a sentence that answers a caller question in the speaker's own voice,
 * or undefined. Exported for the tests and the shadow log.
 */
export function answerShapeOf(sentence: string, persona = 'ferni'): string | undefined {
  const text = sentence.trim().replace(SPEAKER_FRAME, '');
  if (ownWords(persona).test(text)) return undefined;
  return SELF_ANSWER.find((shape) => shape.re.test(text))?.id;
}

/** A sentence that asks something: a question mark, then any closing quote or bracket. */
const QUESTION_END = /\?[!.]*["”’')\]]*$/;
const isQuestion = (sentence: string): boolean => QUESTION_END.test(sentence.trim());

/** A question that asks the caller for something: the only kind that opens the answer window. */
const isCallerQuestion = (sentence: string): boolean =>
  isQuestion(sentence) && ASKS_CALLER.test(sentence);

/**
 * Length of the first whole sentence in the text, with its trailing space; 0 if none yet.
 * "St." and "Dr." do not end a sentence, so they cannot use up the answer window.
 */
function sentenceEnd(text: string): number {
  const m = text.match(/(?<!\b(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|vs|etc))[.!?]+["”’')\]]*(?:\s|(?=[A-Z]))/);
  return m?.index === undefined ? 0 : m.index + m[0].length;
}

/**
 * The model's reply, checked for a caller's answer in the speaker's voice. In `on` mode
 * the sentences after a caller question are held until the window closes; in `shadow`
 * mode nothing is held and a would-be cut is only logged.
 */
export async function withCallerVoiceGuard<T>(
  reply: Promise<T> | T,
  env: Env = process.env,
  persona = 'ferni'
): Promise<T> {
  const stream = await reply;
  const mode = callerVoiceGuardMode(env);
  if (stream === null || stream === undefined || mode === 'off') return stream;
  const hold = mode === 'on';
  const reader = (stream as unknown as ReadableStream<Chunk>).getReader();
  let id = '';
  let stringChunks = true;
  const out = (text: string): Chunk =>
    stringChunks ? text : { id, delta: { role: 'assistant', content: text } };
  const guarded = new ReadableStream<Chunk>({
    async start(controller) {
      let pending = ''; // the sentence being read, not yet decided
      let passed = 0; // how much of pending already streamed out
      let window = 0; // sentences left in which the caller's answer can land
      let held: string[] = []; // sentences held while the window is open (on mode only)
      // Shadow never emits: the model's own chunks go out untouched (below).
      const emit = (text: string): void => {
        if (hold && text) controller.enqueue(out(text));
      };
      const release = (): void => {
        emit(held.join(''));
        held = [];
      };
      /** Decides one sentence (or the unfinished tail). True when the reply was cut. */
      const decide = (sentence: string): boolean => {
        const shape = window > 0 ? answerShapeOf(sentence, persona) : undefined;
        if (shape && hold) {
          log.warn({ reason: 'self_answer', persona, shape }, 'CALLER_VOICE_CUT');
          release(); // the held sentences are the speaker's own words, before the answer
          return true;
        }
        if (shape) log.info({ persona, shape, mode }, 'CALLER_VOICE_WOULD_CUT');
        if (window === 0 || !hold) {
          emit(sentence.slice(passed));
        } else {
          held.push(sentence);
        }
        if (window > 0) window -= 1;
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
          if (!hold) controller.enqueue(chunk); // shadow: the model's own chunk, untouched
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
          // With no caller question open, the unfinished sentence streams as it arrives.
          if (hold && window === 0) {
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
