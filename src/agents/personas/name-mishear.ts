/**
 * STT mishearings of Ferni's name, put right where the transcript enters.
 *
 * Prod call 2026-10-12 (AJ_4NnxgzjEHHX8): ink-2 heard "Ferni" as "Freddy"
 * ("How are you doing, Freddy?") and "Fern" ("Hey, Fern.") even with Ferni as
 * a keyterm. The director then wrote five notes about a name mix-up, memory
 * stored a person called Freddy, and Ferni asked "Who's Freddy?".
 *
 * Only a name that addresses Ferni is changed: a greeting ("Hey Fern"), a
 * vocative closing a clause ("today, Fern?"), or the whole utterance
 * ("Fern?"). "My friend Freddy", "Freddy Mercury", "I saw a fern" and
 * "Fernando" stay as they are. A name STT got right is never touched. Wrapping the STT stream fixes every reader at
 * once: the SDK builds the committed user message (LLM, director) and
 * user_input_transcribed (memory, observers) from these events.
 * NAME_MISHEAR_NORMALIZE=on turns it on.
 *
 * @module agents/personas/name-mishear
 */
import { stt } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'NameMishear' });

const MISHEARD = /\b(freddy|fernie|ferny|furny|fern)\b/gi;
/** The name ends its clause: punctuation or the end of the utterance follows. */
const CLOSES = /^\s*(?:[.!?,;:]|$)/;
/** "Hey Fern how are you": what follows is said to the one greeted. */
const SAID_TO =
  /^\s+(?:how|what|what's|whats|can|could|would|will|do|are|you|i|i'm|let's|guess|quick)\b/i;
/** A greeting that opens a sentence, right before the name. */
const GREETING =
  /(?:^|[.!?]\s*)(?:hey|hi|hiya|hello|yo|thanks|thank you|morning|good morning|night|good night|bye|goodbye|okay|ok)\s*,?\s*$/i;
/** "with my buddy, Freddy." names someone else ("How's your day, Fern?" doesn't). */
const APPOSITIVE =
  /\b(?:friend|buddy|pal|brother|sister|cousin|son|daughter|dad|father|mom|mother|uncle|aunt|boss|coworker|colleague|neighbou?r|guy|husband|wife|partner|boyfriend|girlfriend|kid|dog|cat)s?\s*,\s*$/i;
/** "Sam, Freddy and Jo": a list, not a call. */
const LIST = /^\s*,?\s*(?:and|or)\b/i;

function addressesFerni(before: string, after: string): boolean {
  // "Hey Freddy came over" and "Hey Freddy Mercury" are about someone else.
  if (GREETING.test(before)) return CLOSES.test(after) || SAID_TO.test(after);
  const prev = before.trimEnd();
  if (prev.endsWith(',')) return CLOSES.test(after) && !LIST.test(after) && !APPOSITIVE.test(prev);
  return (prev === '' || /[.!?]$/.test(prev)) && CLOSES.test(after) && !LIST.test(after);
}

/** The text put right, and the variants changed ("Freddy→Ferni"), never the text itself. */
function fixName(text: string): { text: string; fixed: string[] } {
  const fixed: string[] = [];
  const out = text.replace(MISHEARD, (word, _w: string, at: number) => {
    if (!addressesFerni(text.slice(0, at), text.slice(at + word.length))) return word;
    fixed.push(`${word}→Ferni`);
    return 'Ferni';
  });
  return { text: out, fixed };
}

/** The text with mishearings of Ferni's name that address Ferni put right. */
export function normalizeNameMishear(text: string): string {
  return fixName(text).text;
}

const TRANSCRIPTS = new Set([
  stt.SpeechEventType.INTERIM_TRANSCRIPT,
  stt.SpeechEventType.PREFLIGHT_TRANSCRIPT,
  stt.SpeechEventType.FINAL_TRANSCRIPT,
]);

function fixEvent<E>(ev: E): E {
  if (typeof ev !== 'object' || ev === null) return ev;
  const event = ev as unknown as stt.SpeechEvent;
  const alt = event.alternatives?.[0];
  if (!TRANSCRIPTS.has(event.type) || alt === undefined) return ev;
  const { text, fixed } = fixName(alt.text);
  if (fixed.length === 0) return ev;
  if (event.type === stt.SpeechEventType.FINAL_TRANSCRIPT) {
    // Never the caller's words: only which name was changed, and how often.
    log.info({ variants: fixed, count: fixed.length }, 'NAME_MISHEAR fixed');
  }
  const rest = event.alternatives?.slice(1) ?? [];
  return { ...event, alternatives: [{ ...alt, text }, ...rest] } as unknown as E;
}

interface SessionLike {
  readonly userData?: unknown;
}

/** The persona speaking now; a swap sets userData.personaId (persona-swap.ts). */
function personaOf(session: SessionLike | undefined): string {
  return (
    ((session?.userData as { personaId?: string } | undefined)?.personaId as string) || 'ferni'
  );
}

/**
 * The agent's STT events with Ferni's name put right while Ferni is the
 * persona on the call. Unchanged when NAME_MISHEAR_NORMALIZE is off.
 */
export async function sttWithNameFix<E>(
  session: SessionLike | undefined,
  events: Promise<ReadableStream<E> | null>,
  env: Env = process.env
): Promise<ReadableStream<E> | null> {
  const stream = await events;
  if (!stream || !flagOn('NAME_MISHEAR_NORMALIZE', env)) return stream;
  const reader = stream.getReader();
  return new ReadableStream<E>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) return controller.close();
      controller.enqueue(personaOf(session) === 'ferni' ? fixEvent(value) : value);
    },
    async cancel(reason) {
      return reader.cancel(reason);
    },
  });
}
