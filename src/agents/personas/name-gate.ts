/**
 * Say the caller's name the way a friend does: at hello, at goodbye, and
 * otherwise rarely.
 *
 * Seth: "How he calls me Seth is so... not human." A prod call (2026-10-14)
 * said his name in 16 of 24 replies ("I am, Seth.", "Yes, Seth, I'm sure.");
 * the dev voice-eval runs in 11 of 70 turns. Friends in SBCSAE address each
 * other by name in 1.3% of turns (0.7% one-to-one; the most name-heavy of 34
 * conversations, 4.2%): aggregates in voiceai-evidence/human-baselines/
 * score-targets.json (nameUseRate).
 *
 * Prompts asking for the name are gone, but the model still reaches for it,
 * so a vocative name is dropped here, before the words reach TTS, captions
 * and the saved history (the same place as opener-gate.ts):
 * - "That's rough, Sam." -> "That's rough."
 * - "Yes, Sam, I'm sure." -> "Yes, I'm sure."
 * - "Sam, really? Again?" -> "Really? Again?"
 * It stays in the call's first reply (hello), when the caller is saying
 * goodbye or the reply is one, and once NAME_EVERY replies have gone by
 * without it; never twice in a reply. Only the name addressing the caller
 * goes: "Tell Sam I said hi", "Sam's sister", "Your name is Sam." and "My
 * friend, Sam, called" stay, and a reply to a question about the caller's own
 * name is left alone.
 *
 * With NAME_FALLING_INTONATION on, a kept name that runs on into its sentence
 * ("Sam, take care.") ends its own sentence ("Sam. Take care.") so it falls:
 * the delivery #1320 measured for greetings (speech/tts-gateway/name-intonation.ts).
 *
 * NAME_GATE=off turns it off.
 *
 * @module agents/personas/name-gate
 */

import type { llm } from '@livekit/agents';
import { ReadableStream, type ReadableStreamDefaultController } from 'node:stream/web';

import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';

const log = createLogger({ module: 'NameGate' });

/**
 * Replies between kept names (hello and goodbye aside): 1 / 0.025, the
 * score-targets.json nameUseRate max (the p90 of SBCSAE friend conversations).
 */
export const NAME_EVERY = 40;

const GREETINGS = ['hey', 'hi', 'hiya', 'hello', 'oh'];
const GREETING_WORD = /^(?:hey|hi|hiya|hello|oh)\s+/i;
/** Words that open a new clause after ", Sam,": the name was addressing them. */
const CLAUSE_START = new Set(
  (
    "i i'm i'd i've i'll you you're you've you'll you'd we we're let's it it's that that's " +
    "this there there's what what's how how's why when honestly seriously listen look come " +
    'but so because ' +
    'please trust believe go take tell just'
  ).split(' ')
);
/**
 * A goodbye closes its sentence: "Take care, Sam." and "See you tomorrow!"
 * do; "I see you" and "I have to go to the doctor" don't.
 */
const GOODBYE =
  /\b(?:bye(?:-bye)?|goodbye|good ?night|talk (?:to you )?(?:soon|later|tomorrow)|(?<!\bi )see (?:you|ya)(?: (?:soon|later|tomorrow|then|next time|around))?|take care(?: of yourself)?|(?:gotta|got to|have to|need to) (?:go|run|hop off)|catch you later|let you go)\s*(?:,\s*[\p{L}'’-]+\s*)?(?:[.!?…]|$)/iu;
/** The caller asking about, or giving, their own name: the reply may need it. */
const ASKS_OWN_NAME =
  /\b(?:what(?:'s| is) my name|(?:know|remember|forgot|forget|say|said|got|spell) my name|my name(?:'s| is)|what (?:do|should|would) you call me|what am i called)\b/i;
/** "Just call me Sam" (a capital, so not "call me tomorrow"). */
const GIVES_NAME = /\b(?:[Yy]ou can|[Jj]ust|[Pp]lease) call me \p{Lu}/u;
/** "my friend, Sam" renames someone; it doesn't address the caller. */
const APPOSITIVE = new RegExp(
  `\\b(?:my|your|his|her|their|our|the|a|an|this|that)\\s+(?:[\\p{L}'’-]+\\s+)?(?:${(
    'friend friends brother sister son daughter mom mum dad mother father wife husband partner ' +
    'boss cousin uncle aunt kid kids boy girl guy coworker colleague neighbor neighbour roommate ' +
    'buddy teacher doctor nephew niece grandson granddaughter grandma grandpa boyfriend ' +
    'mentor pastor priest rabbi landlord trainer sponsor counselor client student classmate teammate ' +
    'girlfriend fiance fiancee manager baby child nurse dog cat puppy coach therapist ex'
  )
    .split(' ')
    .join('|')})\\s*$`,
  'iu'
);
/** Words that open a sentence and then address someone ("Yes, Sam"), not a list ("Alex, Sam"). */
const DISCOURSE = new Set(
  (
    'yes yeah yep no nope okay ok well oh hey hi right sure so but and really honestly ' +
    'seriously look listen alright aw ah wow man thanks sorry good great fair true wait ' +
    'hmm hm mm come fine totally exactly absolutely see'
  ).split(' ')
);
/**
 * Names that are also ordinary words ("Rich, isn't it?", "Hope. That's what
 * keeps you going."): at a sentence start they go only when a clause that
 * addresses the caller follows ("Will, you did great").
 */
const WORD_NAMES = new Set(
  (
    'will hope grace joy mark rich faith rose dawn bill pat sue art amber ruby jack sky hunter ' +
    'chance chase grant june may april summer autumn winter august rob drew guy sunny ' +
    'honey holly ivy lily iris daisy jade pearl ray rusty sandy stormy taylor victor'
  ).split(' ')
);
/** After a question, "Sam, you did great" still addresses them; "Sam, I think." answers. */
const ADDRESSING = new Set(
  "you you're you've you'll you'd your i've i'm i'll i'd listen look honestly seriously come please".split(
    ' '
  )
);

/** A caller named May or June: "April, May, June" is the calendar. */
const CALENDAR = new Set(
  'january february march april may june july august september october november december monday tuesday wednesday thursday friday saturday sunday'.split(
    ' '
  )
);
/** The words either side of `start`..`end` include a month or weekday. */
function inCalendarList(text: string, start: number, end: number): boolean {
  const before = text.slice(0, start).match(/([\p{L}]+)[\s,]*$/u)?.[1] ?? '';
  const after = text.slice(end).match(/^[\s,]*([\p{L}]+)/u)?.[1] ?? '';
  return CALENDAR.has(before.toLowerCase()) || CALENDAR.has(after.toLowerCase());
}

/** A full stop after these doesn't end a sentence ("Dr. Will"). */
const ABBREVIATION = /\b(?:dr|mr|mrs|ms|st|jr|sr|prof|mt)\.\s+$/i;
const LETTER = /\p{L}/u;
/** Characters a name may wait for its sentence to end (a goodbye is shorter). */
const GOODBYE_WAIT = 40;
const LEAD = /^(?:\s|<[^>]*>|\[[^\]]*\])*/;

/** A stretch of the reply that addresses the caller by name. */
export interface Vocative {
  start: number;
  end: number;
  /** What replaces it when it goes ("" or ","). */
  with: string;
  /** Capitalise the first letter after it when it goes (the name opened a sentence). */
  capNext: boolean;
  /** Where the name ends when it runs on into its sentence (for a falling name). */
  fallAt?: number;
}

/**
 * Sentence starts (past any markup): the reply's first spoken character and
 * after . ! ? … plus space, but not after "Dr.". `afterQuestion`: the
 * sentence before asked something, so a name here may be the answer.
 */
function sentenceStarts(text: string): Array<{ at: number; afterQuestion: boolean }> {
  const lead = (i: number): number => i + (text.slice(i).match(LEAD)?.[0].length ?? 0);
  const starts = [{ at: lead(0), afterQuestion: false }];
  for (const m of text.matchAll(/[.!?…]+["')\]]?\s+/g)) {
    const end = m.index + m[0].length;
    if (ABBREVIATION.test(text.slice(Math.max(0, end - 8), end))) continue;
    starts.push({ at: lead(end), afterQuestion: m[0].includes('?') });
  }
  return starts;
}

/**
 * Vocative uses of `name` in `text`, and the first position whose answer
 * still depends on text not here yet (null when everything is decided).
 * `final`: no more text is coming, so the end of `text` ends the reply.
 */
export function findVocatives(
  text: string,
  name: string,
  final: boolean
): { found: Vocative[]; undecidedAt: number | null } {
  const found: Vocative[] = [];
  let undecidedAt: number | null = null;
  const undecided = (i: number): void => {
    undecidedAt = undecidedAt === null ? i : Math.min(undecidedAt, i);
  };
  /** What follows the name ending at `i`. */
  const follow = (i: number): 'word' | 'space' | 'punct' | 'end' | 'wait' => {
    const c = text.charAt(i);
    if (c === '') return final ? 'end' : 'wait';
    if (LETTER.test(c) || /[\d'’]/.test(c)) return 'word';
    if (c === '-') {
      // "Mary-Kate" is another name; "Sam - " is a dash.
      const next = text.charAt(i + 1);
      if (next === '') return final ? 'punct' : 'wait';
      if (LETTER.test(next)) return 'word';
    }
    if (/\s/.test(c)) {
      const after = text.slice(i);
      if (/^\s+[—–]/.test(after)) return 'punct'; // "Sam — I hear you"
      if (!final && /^\s+$/.test(after)) return 'wait';
      return 'space';
    }
    return 'punct';
  };
  // The model sometimes writes "sam"; a name that is also a word must match as written.
  const wordName = WORD_NAMES.has(name.toLowerCase());
  const norm = (t: string): string => (wordName ? t : t.toLowerCase());
  const isName = (rest: string): boolean => norm(rest.slice(0, name.length)) === norm(name);
  /** A start of the name that more text could complete. */
  const partialName = (rest: string): boolean =>
    !final && rest.length < name.length && norm(name).startsWith(norm(rest));
  /** The word after ", " at `i`, lowercased; null when not here yet, '' when not a word. */
  const nextWord = (i: number): string | null => {
    const after = text.slice(i).replace(/^\s*[,—–]?\s*/, '');
    if (after === '') return final ? '' : null;
    if (!LETTER.test(after.charAt(0))) return '';
    const word = after.match(/^([\p{L}'’]+)([\s\S]?)/u);
    if (!word || (word[2] === '' && !final)) return null;
    return word[1].toLowerCase().replace('’', "'");
  };

  // ", Sam." | ", Sam" ending the reply | ", Sam, I'm sure"
  for (const m of text.matchAll(/,\s*/g)) {
    const at = m.index;
    const nameAt = at + m[0].length;
    const rest = text.slice(nameAt);
    if (partialName(rest)) {
      undecided(at);
      continue;
    }
    if (!isName(rest)) continue;
    const end = nameAt + name.length;
    const f = follow(end);
    if (f === 'wait') {
      undecided(at);
      continue;
    }
    if (f === 'word' || f === 'space') continue; // ", Sam said", ", Sam and I"
    if (CALENDAR.has(name.toLowerCase()) && inCalendarList(text, nameAt, end)) continue;
    // "my friend, Sam" and "Alex, Jo, Sam" name someone.
    const before = text.slice(0, at);
    const clause = before.slice(
      Math.max(...[',', '.', '!', '?', '…'].map((p) => before.lastIndexOf(p))) + 1
    );
    if (APPOSITIVE.test(clause)) continue;
    const listed = clause.trim().match(/^\p{Lu}[\p{L}'’-]*$/u);
    const delimiter = before.charAt(before.length - clause.length - 1);
    if (listed && delimiter === ',' && !DISCOURSE.has(listed[0].toLowerCase())) continue;
    if (f === 'end' || /^\s*[.!?…—–;:]/.test(text.slice(end))) {
      // "What got you through? Honestly, Faith." may be the word answering it.
      if (wordName && /\?[^.!?]*$/.test(text.slice(0, at))) continue;

      found.push({ start: at, end, with: '', capNext: false });
      continue;
    }
    if (text.charAt(end) !== ',') continue;
    // ", Sam, I'm sure" addresses them; ", Sam, called" or ", Sam, [laughter]" isn't clear.
    const word = nextWord(end);
    if (word === null) {
      undecided(at);
      continue;
    }
    if (CLAUSE_START.has(word)) {
      found.push({ start: at, end: end + 1, with: ',', capNext: false, fallAt: end });
    }
  }

  // "Sam, really?" | "Hey Sam, ..." | "… Sam" ending the reply
  for (const { at: s, afterQuestion } of sentenceStarts(text)) {
    let rest = text.slice(s);
    if (
      !final &&
      /^[a-z]*$/i.test(rest) &&
      GREETINGS.some((g) => g.startsWith(rest.toLowerCase()))
    ) {
      undecided(s); // "", "He", "Hey": a greeting may still be coming
      continue;
    }
    const greet = rest.match(GREETING_WORD)?.[0] ?? '';
    rest = rest.slice(greet.length);
    if (partialName(rest)) {
      undecided(s);
      continue;
    }
    if (!isName(rest)) continue;
    const nameAt = s + greet.length;
    const end = nameAt + name.length;
    const f = follow(end);
    if (f === 'wait') {
      undecided(s);
      continue;
    }
    if (f === 'word' || f === 'space') continue; // "Sam's", "Sam and I"
    // After a question ("Who goes first? Sam.") or for a name that is also a word
    // ("Hope. That's what..."), only "Sam, you did great" addresses them.
    if (afterQuestion || wordName) {
      const word = nextWord(end);
      if (word === null) {
        undecided(s);
        continue;
      }
      if (!/^\s*[,—–]/.test(text.slice(end))) continue;
      if (!(afterQuestion ? ADDRESSING : CLAUSE_START).has(word)) continue;
    }
    if (CALENDAR.has(name.toLowerCase()) && inCalendarList(text, nameAt, end)) continue;
    if (/^oh\s/i.test(greet)) {
      // "Oh Sam, that's awful" -> "Oh, that's awful": the "Oh" is the reaction, not a hello.
      found.push({ start: nameAt - 1, end, with: '', capNext: false });
      continue;
    }
    // The name goes with its comma or dash (a hello before it goes too: "Hey Sam,"
    // mid-call is a second hello); a sentence that was only the name goes whole.
    const tail = text.slice(end).match(/^(?:\s*[,—–]\s*|[.!?…]+\s*)?/)?.[0] ?? '';
    const runsOn = f !== 'end' && /^\s*[,—–]/.test(tail);
    found.push({
      start: greet ? s : nameAt,
      end: end + tail.length,
      with: '',
      capNext: true,
      fallAt: runsOn ? end : undefined,
    });
  }
  found.sort((a, b) => a.start - b.start);
  const merged: Vocative[] = []; // a stretch found from both sides counts once
  for (const v of found)
    if (!merged.length || v.start >= merged[merged.length - 1].end) merged.push(v);
  return { found: merged, undecidedAt };
}

/**
 * Apply the decisions to `text`: the first vocative `mayKeep` accepts stays
 * (ending its own sentence when `falling`); every other one goes.
 */
export function applyVocatives(
  text: string,
  found: readonly Vocative[],
  mayKeep: (v: Vocative) => boolean,
  falling: boolean
): string {
  let out = '';
  let at = 0;
  let kept = false;
  let cap = false;
  const emit = (s: string): void => {
    if (cap) {
      const i = s.search(LETTER);
      if (i >= 0) {
        s = s.slice(0, i) + s.charAt(i).toUpperCase() + s.slice(i + 1);
        cap = false;
      }
    }
    out += s;
  };
  for (const v of found) {
    emit(text.slice(at, v.start));
    const said = text.slice(v.start, v.end);
    if (!kept && mayKeep(v)) {
      kept = true;
      if (falling && v.fallAt !== undefined) {
        // "Sam, take care" -> "Sam. Take care": the name ends its own sentence.
        const cut = v.fallAt - v.start;
        emit(`${said.slice(0, cut)}.${said.slice(cut).replace(/^\s*[,—–]/, '')}`);
        cap = true;
      } else emit(said);
    } else {
      emit(v.with);
      if (v.capNext) cap = true;
    }
    at = v.end;
  }
  emit(text.slice(at));
  return out;
}

type Chunk = llm.ChatChunk | string | object;
export interface HistoryItem {
  type?: string;
  role?: string;
  textContent?: string;
}

function contentOf(chunk: Chunk): string | undefined {
  if (typeof chunk === 'string') return chunk;
  const c = chunk as llm.ChatChunk;
  if (c && typeof c === 'object' && 'delta' in c && c.delta && !c.delta.toolCalls?.length) {
    return c.delta.content ?? '';
  }
  return undefined; // tool calls, usage, flush sentinels: not reply text
}

/** The caller's first name as said ("Seth" from "seth ford"); null if there isn't a usable one. */
export function firstNameOf(userName: unknown): string | null {
  if (typeof userName !== 'string') return null;
  const first = userName.trim().split(/\s+/)[0] ?? '';
  if (first.length < 2 || !/^\p{L}[\p{L}'’-]*$/u.test(first)) return null;
  // "O'Neil", "McKenzie" as written; "SETH" and "seth" become "Seth".
  if (first !== first.toLowerCase() && first !== first.toUpperCase()) return first;
  return first
    .toLowerCase()
    .replace(/(^|['’-])(\p{L})/gu, (_, p: string, c: string) => p + c.toUpperCase());
}

const messagesOf = (items: readonly HistoryItem[]): HistoryItem[] =>
  items.filter(
    (i) =>
      (i.type === undefined || i.type === 'message') &&
      !(i.textContent ?? '').startsWith(TURN_CONTEXT_HEADER)
  );
const lastCallerWords = (items: readonly HistoryItem[]): string =>
  [...messagesOf(items)].reverse().find((i) => i.role === 'user')?.textContent ?? '';

/**
 * Whether this reply may say the name: the call's first reply (hello), a
 * goodbye from the caller, or NAME_EVERY replies since Ferni last said it
 * (or since the call began, when it hasn't).
 */
export function mayUseName(items: readonly HistoryItem[], name: string): boolean {
  const said = { test: (t: string): boolean => findVocatives(t, name, true).found.length > 0 };
  const replies = messagesOf(items).filter((i) => i.role === 'assistant');
  if (replies.length === 0) return true;
  if (GOODBYE.test(lastCallerWords(items))) return true;
  let since = 0;
  for (let i = replies.length - 1; i >= 0 && !said.test(replies[i].textContent ?? ''); i--) since++;
  return since >= NAME_EVERY;
}

/**
 * One reply's LLM stream with the caller's vocative name limited. Text passes
 * straight through except where a vocative might be starting (after a comma
 * or at a sentence start); that waits only until the next few characters
 * decide it.
 */
export function withNameGate(
  input: ReadableStream<Chunk>,
  opts: { name: string | null; history: readonly HistoryItem[]; env?: Env }
): ReadableStream<Chunk> {
  const env = opts.env ?? process.env;
  const { name, history } = opts;
  if (!name || !flagOn('NAME_GATE', env)) return input;
  const caller = lastCallerWords(history);
  if (ASKS_OWN_NAME.test(caller) || GIVES_NAME.test(caller)) return input;
  const allowed = mayUseName(history, name);
  const falling = flagOn('NAME_FALLING_INTONATION', env);
  let raw = '';
  let sent = '';
  let template: Chunk | null = null;

  const render = (final: boolean): string => {
    const { found, undecidedAt } = findVocatives(raw, name, final);
    let upTo = final ? raw.length : (undecidedAt ?? raw.length);
    // Outside hello, a name is kept only in a goodbye ("Sam, take care."), so
    // it waits for its sentence to end before that is decided.
    const keep = new Set<Vocative>();
    for (const v of found) {
      if (v.start >= upTo || keep.size > 0) break;
      if (allowed) {
        keep.add(v);
        break;
      }
      // Goodbyes are short: past GOODBYE_WAIT characters it isn't one.
      const stop = raw.slice(v.end).search(/[.!?…]/);
      if (stop < 0 && !final && raw.length - v.end < GOODBYE_WAIT) {
        upTo = v.start;
        break;
      }
      const from =
        Math.max(...['.', '!', '?', '…'].map((p) => raw.lastIndexOf(p, v.start - 1))) + 1;
      const sentence = raw.slice(from, stop < 0 ? raw.length : v.end + stop + 1);
      if (GOODBYE.test(sentence)) keep.add(v);
    }
    for (const v of found) if (v.start < upTo && v.end > upTo) upTo = v.start; // waits whole
    const done = found.filter((v) => v.end <= upTo);
    const out = applyVocatives(raw.slice(0, upTo), done, (v) => keep.has(v), falling);
    // A reply that was only the name ("Sam?") is said as it came.
    if (final && sent === '' && !LETTER.test(out)) return raw;
    return out;
  };
  const enqueue = (controller: ReadableStreamDefaultController<Chunk>, text: string): void => {
    if (!text) return;
    if (typeof template === 'string' || template === null) controller.enqueue(text);
    else {
      const c = template as llm.ChatChunk;
      controller.enqueue({
        ...c,
        delta: { ...c.delta, role: c.delta?.role ?? 'assistant', content: text },
      });
    }
  };
  const flush = (controller: ReadableStreamDefaultController<Chunk>, final: boolean): void => {
    const out = render(final);
    // Decisions are final once made, so what was sent stays a prefix.
    if (out.startsWith(sent)) {
      enqueue(controller, out.slice(sent.length));
      sent = out;
    } else if (final) {
      // Never expected; say the rest rather than lose it.
      let same = 0;
      while (same < sent.length && out[same] === sent[same]) same++;
      log.warn({ sent: sent.length, same }, 'Name gate output diverged; sending the rest as is');
      enqueue(controller, out.slice(same));
    }
  };

  return new ReadableStream<Chunk>({
    async start(controller) {
      try {
        for await (const chunk of input as unknown as AsyncIterable<Chunk>) {
          const content = contentOf(chunk);
          if (content === undefined) {
            flush(controller, false);
            controller.enqueue(chunk);
            continue;
          }
          raw += content;
          template = chunk;
          flush(controller, false);
        }
        flush(controller, true);
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
