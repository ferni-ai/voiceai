/**
 * Mishear repair: when the caller's words look misheard, Ferni checks in a few
 * words instead of building on them, the way a friend says "sorry, Peter?".
 *
 * Speech-to-text on an 8 kHz phone line gets words wrong. On a prod call
 * (2026-10-11) the first thing ink heard was "Peter" (a teammate's name, and a
 * keyterm ink is biased toward), and later "You've room breakfast?". Ferni
 * answered both as if they were real.
 *
 * Ink gives no confidence to go on: the Cartesia plugin reads only the
 * transcript from each turn message and reports confidence 0. So the cues come
 * from the words, in code, in well under a millisecond (no second model call):
 *
 *   name     a name nobody has said on this call: alone as the whole turn
 *            ("Peter."), or inside a sentence when it is no name Ferni knows
 *            (the caller's, their family's, anyone in his prompt)
 *   garbled  grammar speech-to-text breaks and people don't: "you've" before a
 *            word that can't follow it ("you've room"), "the" before "I"/"we"
 *
 * The cue is a hint to the reply model, which sees the whole call and decides
 * whether the words fit. At most one per turn; none right after Ferni already
 * checked; none when the caller is venting or the words read as a crisis (and
 * crisis-gate.ts asks with repair off whenever it adds crisis guidance).
 *
 * REPAIR_MODE=on enables it.
 *
 * @module agents/personas/repair-check
 */

import type { llm } from '@livekit/agents';

import { createLogger } from '../../utils/safe-logger.js';
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';
import { detectCrisis } from '../safety/crisis-guard.js';
import { callerVenting } from './turn-extras.js';
import {
  askWhenUnclearEnabled,
  quoted,
  toolLinesOf,
  unclearCue,
  unclearNote,
} from './unclear-turn.js';

const log = createLogger({ module: 'RepairCheck' });

export function repairModeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.REPAIR_MODE === 'on';
}

export interface MishearCue {
  kind: 'name' | 'garbled';
  /** The word or phrase that looks misheard, as the caller's captions have it. */
  heard: string;
}

/** What the cue reads, beyond the caller's latest words. */
export interface CallText {
  /** Ferni's prompt (system messages): his own world, the team, what he remembers. */
  prompt: string;
  /** Earlier lines of the call, both speakers, oldest first. */
  turns: string[];
  /** Names Ferni knows for this caller: theirs and their family's. */
  names?: string[];
}

/** Words that start a turn capitalized and are never names (the prompt's vocabulary covers the rest). */
const NEVER_NAMES = new Set(
  'yeah yep yes yup no nope nah okay ok sure right really true what why how who when where which huh hm hmm mhm uh um oh ah hey hi hello thanks cool nice wow totally exactly maybe sorry good fine great well so and or but if just like anyway whatever seriously bye wait that this there these those they them it is are was were do does did have has had can could will would should not you your we our he she his her my me us the an to in on at for of with from about also even still now here today tonight tomorrow yesterday honestly basically actually literally obviously apparently luckily sadly anyway anyhow mom mum dad mother father grandma grandpa granny nana papa auntie uncle sis bro babe honey'.split(
    ' '
  )
);
/** Fillers that don't make a turn any less a lone name ("Uh, Dublin."). */
const FILLERS = new Set('uh um oh ah well so hm hmm er like'.split(' '));

/** Words "you've" can be followed by: participles that don't end -ed/-en, and adverbs. */
const AFTER_HAVE = new Set(
  'got been seen done made had heard read run come become met left lost said told thought bought brought taught caught found kept slept felt won begun sung swum put set let cut hit hurt quit shut spent sent built meant dealt learnt burnt dreamt sat stood understood held paid laid gone grown known shown thrown drawn flown worn torn sworn never always just already ever only really also still actually probably definitely both all each not no got to a an the gotta something nothing anything everything enough plenty one two three some most much many'.split(
    ' '
  )
);
const BAD_HAVE = /\b(?:I|you|we|they|could|would|should|might|must)'ve ([a-z]+)\b/gi;
const BAD_ARTICLE = /\b(?:the|a|an) (?:I|we|they)\b(?![-'’])/g;
/** Ferni asked for a name or a place, so a lone one is the answer ("What part?" "Dublin.", "Her name?"). */
const ASKED_FOR_A_NAME =
  /\b(?:who|where|which|names?|called|call (?:him|her|them|it)|what do you call|what (?:part|city|town|place|country|state|street|team|band|show|movie|book))\b/i;
/** Ferni's previous line already asked them to say it again: never twice in a row. */
const ALREADY_CHECKED =
  /\b(?:did you say|you said what|didn'?t (?:quite )?catch|say that again|come again|sorry, what)\b/i;

const lowerWords = (text: string): string[] => text.match(/\b[a-z][a-z']*\b/g) ?? [];
/** Lower-case words standing alone: "peter" in an id like peter-john doesn't make Peter a common word. */
const plainWords = (text: string): string[] => text.match(/(?<![\w-])[a-z][a-z']*(?![\w-])/g) ?? [];
const capitalized = (text: string): string[] => text.match(/\b[A-Z][a-z]+\b/g) ?? [];

interface PromptVocab {
  /** Words the prompt uses in lower case: common words, not names. */
  lower: Set<string>;
  /** Capitalized words in the prompt (lower-cased): the names Ferni knows of. */
  names: Set<string>;
}

/** The prompt is the same string all call: read it once. */
const vocabCache = new Map<string, PromptVocab>();
function promptVocab(prompt: string): PromptVocab {
  let vocab = vocabCache.get(prompt);
  if (!vocab) {
    vocab = {
      lower: new Set(plainWords(prompt)),
      names: new Set(capitalized(prompt).map((w) => w.toLowerCase())),
    };
    vocabCache.clear(); // one prompt per call; never grows
    vocabCache.set(prompt, vocab);
  }
  return vocab;
}

/** A shortening or lengthening of a name Ferni knows ("Fern" for Ferni). */
const nearName = (key: string, names: Iterable<string>): boolean =>
  key.length >= 3 &&
  [...names].some((n) => n.length >= 3 && (n.startsWith(key) || key.startsWith(n)));

/** Broken grammar in the caller's words: a short turn is quoted whole ("You've room" alone reads fine). */
function garbledCue(latest: string): MishearCue | null {
  const quote = (part: string): MishearCue => ({
    kind: 'garbled',
    heard: latest.split(/\s+/).length <= 10 ? latest.trim() : part,
  });
  for (const match of latest.matchAll(BAD_HAVE)) {
    const next = (match[1] ?? '').toLowerCase();
    // Participles (-ed, -en) and adverbs (-ly: "I've finally") are ordinary speech.
    if (!AFTER_HAVE.has(next) && !/(?:ed|en|ly)$/.test(next)) return quote(match[0]);
  }
  const article = latest.match(BAD_ARTICLE);
  return article ? quote(article[0]) : null;
}

/** The first word in the caller's latest words that looks misheard, or null. */
export function mishearCue(latest: string, call: CallText, previous = ''): MishearCue | null {
  const garbled = garbledCue(latest);
  if (garbled) return garbled;

  const { lower, names: promptNames } = promptVocab(call.prompt);
  const saidOnCall = new Set(call.turns.flatMap((t) => lowerWords(t.toLowerCase())));
  const known = new Set((call.names ?? []).flatMap((n) => lowerWords(n.toLowerCase())));
  const spoken = lowerWords(latest.toLowerCase()).filter((w) => !FILLERS.has(w));
  const alone = spoken.length <= 2;
  if (alone && ASKED_FOR_A_NAME.test(previous)) return null;
  // A common word that just starts a sentence, or a name already on the call.
  const familiar = (key: string): boolean =>
    NEVER_NAMES.has(key) || lower.has(key) || saidOnCall.has(key) || known.has(key);

  for (const word of capitalized(latest)) {
    const key = word.toLowerCase();
    if (familiar(key)) continue;
    // A lone name nobody said is suspect even when it is a teammate's (ink leans to those).
    if (alone || (!promptNames.has(key) && !nearName(key, [...promptNames, ...known])))
      return { kind: 'name', heard: word };
  }
  return null;
}

/**
 * The note for the reply model: check only if it doesn't fit, in a few words.
 * `scriptFree` (SCRIPT_FREE_REMINDER, script-free.ts): what was heard, but no line to say.
 */
export function repairNote(cue: MishearCue, scriptFree = false): string {
  const check = scriptFree ? '' : ` ("Sorry, did you say ${quoted(cue.heard)}?")`;
  const ask = scriptFree ? '' : ', the way a friend would ("Sorry, you what?")';
  return cue.kind === 'name'
    ? `Speech-to-text heard "${quoted(cue.heard)}", a name nobody has said on this call, and it often mishears names. If it doesn't fit what you were talking about, check it in a few words before building on it${check}; if it clearly fits, just carry on. If you're not sure, check before acting on any other note about ${quoted(cue.heard)} above (such as saying a teammate isn't available).`
    : `Speech-to-text heard "${quoted(cue.heard)}", which doesn't quite parse, so it may have misheard them. If you can't tell what they meant, say so in a few words and ask${ask}, instead of guessing; if the meaning is clear, just answer it.`;
}

interface MessageView {
  type?: string;
  role?: string;
  textContent?: string;
}

/** The caller's names and their family's, from the session's profile. */
export function knownNames(session: object): string[] {
  const data = (session as { userData?: unknown }).userData as
    | {
        userName?: string;
        services?: {
          userProfile?: {
            name?: string;
            preferredName?: string;
            familyMembers?: Array<{ name?: string }>;
          } | null;
        };
      }
    | undefined;
  const profile = data?.services?.userProfile;
  return [
    data?.userName,
    profile?.name,
    profile?.preferredName,
    ...(profile?.familyMembers ?? []).map((m) => m.name),
  ].filter((n): n is string => Boolean(n));
}

interface CallLines {
  /** Ferni's prompt (system messages). */
  prompt: string;
  /** Earlier lines, both speakers. */
  turns: string[];
  /** The caller's earlier lines: distress builds over turns (crisis-guard.ts). */
  earlier: string[];
  /** The caller's words this reply answers. */
  said: string;
  /** Ferni's line just before them. */
  previous: string;
}

/** The request's lines, turn notes aside. */
function linesOf(chatCtx: llm.ChatContext): CallLines {
  const prompt: string[] = [];
  const turns: string[] = [];
  const earlier: string[] = [];
  const latest: string[] = [];
  let previous = '';
  for (const item of chatCtx.items as MessageView[]) {
    const text = item.type === 'message' ? (item.textContent?.trim() ?? '') : '';
    if (!text || text.startsWith(TURN_CONTEXT_HEADER)) continue;
    if (item.role === 'system' || item.role === 'developer') prompt.push(text);
    else if (item.role === 'user') latest.push(text);
    else if (item.role === 'assistant') {
      earlier.push(...latest);
      turns.push(...latest.splice(0), text);
      previous = text;
    }
  }
  return { prompt: prompt.join('\n'), turns, earlier, said: latest.join(' '), previous };
}

/**
 * The repair note for this request, or '' when the words look heard right,
 * REPAIR_MODE is off, Ferni just checked, or the caller is having a hard time.
 */
export function repairNoteFor(
  chatCtx: llm.ChatContext,
  session: object,
  env: Record<string, string | undefined> = process.env,
  scriptFree = false
): string {
  if (!repairModeEnabled(env)) return '';
  const started = performance.now();
  const { prompt, turns, earlier, said, previous } = linesOf(chatCtx);
  if (!said || ALREADY_CHECKED.test(previous)) return '';
  if (callerVenting(said) || detectCrisis(said, undefined, { recentMessages: earlier }).isCrisis)
    return '';
  const cue =
    mishearCue(said, { prompt, turns, names: knownNames(session) }, previous) ??
    // ASK_WHEN_UNCLEAR=on: an unclear request or a cut-up turn (unclear-turn.ts).
    (askWhenUnclearEnabled(env) ? unclearCue(said, [...turns, ...toolLinesOf(chatCtx)]) : null);
  if (!cue) return '';
  // The kind and cost only: logs never carry the caller's words.
  const ms = Math.round((performance.now() - started) * 100) / 100;
  log.info({ kind: cue.kind, ms }, 'REPAIR_CHECK');
  const note = 'options' in cue ? unclearNote(cue) : repairNote(cue, scriptFree);
  // Last in the reminder (turn-request.ts), so it can say what wins over the shape line.
  return `${note} Checking like this is fine even where a line above says no question.`;
}
