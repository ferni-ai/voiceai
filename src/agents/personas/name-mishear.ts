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
 * "Fernando called" stay as they are. A name STT got right is never touched.
 *
 * Prod call 2026-10-20: "Hey Ferni" came through as "Hey Fred." (confidence 0);
 * Ferni answered "Fred is a new one" and memory stored a person called Fred.
 * Other prod calls heard "Hey Bernie" and "thanks, Bernie" said to Ferni. Real
 * names among the mishearings (Fred, Bernie, Ernie, Fanny, Fernando) are changed
 * only as a vocative, so "my friend Fred" and "Bernie Sanders" stay. Everyday
 * words (funny, ferry, fairy) are changed only straight after an opening
 * greeting and ending the clause ("Hey, funny."): "that's funny", "Funny." and
 * "Okay, funny." stay. Wrapping the STT stream fixes every reader at
 * once: the SDK builds the committed user message (LLM, director) and
 * user_input_transcribed (memory, observers) from these events.
 * NAME_MISHEAR_NORMALIZE=on turns it on.
 *
 * A request for Ferni is put right whoever is on the call. Prod call
 * 2026-10-17: talking to Alex, the caller said "transfer me to Fern" twice;
 * only Ferni's own turns were fixed, so Alex got "Fern", didn't call the
 * handoff and said "Ferni here" instead. Only a name that ends a transfer
 * ("transfer me to Fern", "back to Fern", "talk to Fern please") is changed:
 * "I gave water to the fern" and "we drove to Fern Creek" are not.
 * NAME_MISHEAR_HANDOFF=off turns that part off.
 *
 * @module agents/personas/name-mishear
 */
import { stt } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'NameMishear' });

/** Heard for "Ferni" and changed in a greeting, a vocative or a transfer (asksForFerni). */
const TRANSFERABLE = ['freddy', 'fernie', 'ferny', 'furny', 'fern'];
/** Also names STT hears for "Ferni": changed only as a greeting or vocative. */
const VOCATIVE_ONLY = [
  ...['fred', 'freddie', 'ferney', 'fernee', 'furni', 'furney'],
  ...['fernando', 'bernie', 'ernie', 'fanny'],
];
/** Everyday words STT hears for "Ferni": changed only in "Hey, funny." (HAILED). */
const WORDS = ['funny', 'ferry', 'fairy'];
const MISHEARD = new RegExp(
  `\\b(${[...TRANSFERABLE, ...VOCATIVE_ONLY, ...WORDS].join('|')})\\b`,
  'gi'
);
const kindOf = (word: string): 'transferable' | 'vocative' | 'word' => {
  const w = word.toLowerCase();
  if (TRANSFERABLE.includes(w)) return 'transferable';
  return WORDS.includes(w) ? 'word' : 'vocative';
};
/** The name ends its clause: punctuation or the end of the utterance follows. */
const CLOSES = /^\s*(?:[.!?,;:]|$)/;
/** "Hey Fern how are you": what follows is said to the one greeted. */
const SAID_TO =
  /^\s+(?:how|what|what's|whats|can|could|would|will|do|are|you|i|i'm|let's|guess|quick)\b/i;
/** A greeting that opens a sentence, right before the name. */
const GREETING =
  /(?:^|[.!?]\s*)(?:hey|hi|hiya|hello|yo|thanks|thank you|morning|good morning|night|good night|bye|goodbye|okay|ok)\s*,?\s*$/i;
/** An opening greeting right before the word, at the start of a sentence ("Hey, funny."). */
const HAILED = /(?:^|[.!?]\s*)(?:hey|hi|hiya|hello|yo)\s*,?\s*$/i;
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

/** "transfer me to", "switch back over to", "back to", "talk with": a transfer, right before the name. */
const TRANSFER_TO =
  /\b(?:(?:transfer|switch|pass|send|hand|put|patch|connect|talk|speak)\s+(?:me\s+|us\s+)?(?:back\s+)?(?:over\s+)?(?:to|with)|back\s+to)\s+$/i;
/** The transfer ends with the name, give or take a "please" or "now". */
const ENDS_TRANSFER = /^\s*(?:,?\s*(?:please|now|again|real quick)\b)?\s*(?:[.!?,;:]|$)/i;

/** "transfer me to Fern": the caller wants Ferni, whoever is on the call. */
function asksForFerni(before: string, after: string): boolean {
  return TRANSFER_TO.test(before) && ENDS_TRANSFER.test(after);
}

export interface NameFixScope {
  /** Ferni is on the call: a greeting or vocative is said to him. */
  vocatives: boolean;
  /** A transfer that ends with the name is a request for Ferni (NAME_MISHEAR_HANDOFF). */
  transfers: boolean;
}

const EVERYTHING: NameFixScope = { vocatives: true, transfers: true };

/** The text put right, and the variants changed ("Freddy→Ferni"), never the text itself. */
function fixName(text: string, scope: NameFixScope): { text: string; fixed: string[] } {
  const fixed: string[] = [];
  const out = text.replace(MISHEARD, (word, _w: string, at: number) => {
    const [before, after] = [text.slice(0, at), text.slice(at + word.length)];
    const kind = kindOf(word);
    const ferni =
      kind === 'word'
        ? scope.vocatives && HAILED.test(before) && CLOSES.test(after)
        : (scope.vocatives && addressesFerni(before, after)) ||
          (kind === 'transferable' && scope.transfers && asksForFerni(before, after));
    if (!ferni) return word;
    fixed.push(`${word}→Ferni`);
    return 'Ferni';
  });
  return { text: out, fixed };
}

/** The text with mishearings of Ferni's name that address or ask for Ferni put right. */
export function normalizeNameMishear(text: string, scope: NameFixScope = EVERYTHING): string {
  return fixName(text, scope).text;
}

const TRANSCRIPTS = new Set([
  stt.SpeechEventType.INTERIM_TRANSCRIPT,
  stt.SpeechEventType.PREFLIGHT_TRANSCRIPT,
  stt.SpeechEventType.FINAL_TRANSCRIPT,
]);

function fixEvent<E>(ev: E, scope: NameFixScope): E {
  if (typeof ev !== 'object' || ev === null) return ev;
  const event = ev as unknown as stt.SpeechEvent;
  const alt = event.alternatives?.[0];
  if (!TRANSCRIPTS.has(event.type) || alt === undefined) return ev;
  const { text, fixed } = fixName(alt.text, scope);
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
 * The agent's STT events with Ferni's name put right: said to him while he is
 * the persona on the call, and asked for whoever is on it. Unchanged when
 * NAME_MISHEAR_NORMALIZE is off.
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
      const scope = {
        vocatives: personaOf(session) === 'ferni',
        transfers: flagOn('NAME_MISHEAR_HANDOFF', env),
      };
      controller.enqueue(scope.vocatives || scope.transfers ? fixEvent(value, scope) : value);
    },
    async cancel(reason) {
      return reader.cancel(reason);
    },
  });
}
