/**
 * What Ferni has already told about himself on this call, kept so he doesn't
 * tell it again.
 *
 * On the 2026-10-03 dev call Ferni brought up Tanaka-san in five replies in
 * about five minutes and Wyoming in three, told six stories about himself,
 * and said "the quiet hum of a winter night still feels like coming home" in
 * back-to-back replies. The director had noticed ("You've mentioned Tanaka-san
 * twice") but its notes are hints a model writes when it has time. This record
 * is kept in code from the call's own lines: the names Ferni brought up that
 * the caller didn't, how many stories about himself he's told, sentences he
 * repeated, and his recent distinctive lines. The next request carries it as a
 * note (the director computes it on every reply; see turn-request.ts).
 *
 * TOLD_THIS_CALL=off turns it off. PHRASE_LOOP_GUARD=on adds the stock phrases he
 * keeps reusing (phrase-loops.ts).
 *
 * @module agents/personas/told-this-call
 */

import { crisisRiskNoted } from '../../services/safety/crisis-call-risk.js';
import { reachesHelp } from '../safety/crisis-guard.js';
import type { Line } from './director-notes.js';
import {
  formatPhraseLoops,
  isSafetyLine,
  phraseLoopGuardOn,
  phraseLoops,
  type PhraseLoop,
} from './phrase-loops.js';

export function toldThisCallEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.TOLD_THIS_CALL !== 'off';
}

export interface Told {
  /** Names Ferni brought up and the caller never said, with the number of replies that mention each. */
  names: Array<{ name: string; replies: number }>;
  /** Ferni's replies that tell a story about himself. */
  selfStories: number;
  /** Sentences of Ferni's that share a six-word run with a sentence from another of his replies. */
  repeated: string[];
  /** Ferni's recent long statements, newest first. */
  recentLines: string[];
  /** The caller's latest words ask for a story or about Ferni himself. */
  askedAboutFerni: boolean;
  /** PHRASE_LOOP_GUARD=on: stock phrases in two or more recent replies; absent when off. */
  loops?: PhraseLoop[];
}

/** Capitalized words that are grammar or filler, not something Ferni brought up. */
const NOT_NAMES =
  /^(I|I'm|I've|I'd|I'll|Ferni|OK|Okay|Mm|Hm|Hmm|Oh|Yeah|Hey|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December)$/;

/** First-person storytelling: "I remember", "my old neighbor", "taught me", "after Tanaka-san passed". */
const SELF_STORY =
  /\b(I remember|I used to|when I was|back when|back in|my old|taught me|reminds me of|I grew up|I lived|I spent|there was this|after [\w-]+ (passed|died))\b/i;

/** Asking for a story or about Ferni's own life, where telling one is the answer. */
const ASKS_ABOUT_FERNI =
  /\b(stor(y|ies)|about (you|yourself)|your (life|day|childhood|past|family|wife|team)|tell me more)\b/i;

const RECENT_LINE_WORDS = 8;
const RUN_WORDS = 6;
const MAX_NAMES = 5;
const MAX_QUOTES = 3;
const MAX_QUOTE_CHARS = 90;

function sentencesOf(text: string): string[] {
  return text
    .replace(/\[[^\]]*\]/g, ' ') // [laughter]
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function wordsOf(sentence: string): string[] {
  return sentence
    .split(/\s+/)
    .map((w) => w.replace(/^[^A-Za-z]+|[^A-Za-z'-]+$/g, ''))
    .filter(Boolean);
}

const isCapitalized = (w: string): boolean => /^[A-Z][a-z]/.test(w) && !NOT_NAMES.test(w);

/**
 * Runs of capitalized words in Ferni's sentences. A sentence's first word is
 * capitalized by grammar, so it counts only if it's hyphenated (Tanaka-san) or
 * appears capitalized mid-sentence somewhere in the call.
 */
function namesBySentence(replies: string[][]): string[][][] {
  const midSentence = new Set<string>();
  for (const sentences of replies) {
    for (const s of sentences)
      wordsOf(s)
        .slice(1)
        .filter(isCapitalized)
        .forEach((w) => midSentence.add(w));
  }
  return replies.map((sentences) =>
    sentences.map((s) => {
      const names: string[] = [];
      const run: string[] = [];
      wordsOf(s).forEach((w, i) => {
        const name = isCapitalized(w) && (i > 0 || w.includes('-') || midSentence.has(w));
        if (name) run.push(w);
        if (!name && run.length) names.push(run.splice(0).join(' '));
      });
      if (run.length) names.push(run.join(' '));
      return names;
    })
  );
}

function runsOf(sentence: string): Set<string> {
  const words = wordsOf(sentence.toLowerCase());
  const runs = new Set<string>();
  for (let i = 0; i + RUN_WORDS <= words.length; i++)
    runs.add(words.slice(i, i + RUN_WORDS).join(' '));
  return runs;
}

/** Lowercase words between spaces, so a name or phrase can be found in a sentence. */
const plainWords = (text: string): string =>
  ` ${text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .trim()} `;

/** Function words: never what a referent is for, or the noun a referent modifies. */
const FUNCTION_WORDS = new Set(
  `i we you they he she it me us them i've we've i'd to for with on at in of about from by
  is are was were be been am can could will would should may might must do does did has have
  had just really still again right there here and or but so if when whenever who which that
  because since though now too also all as please tonight already earlier before ago`.split(/\s+/)
);
const DETERMINERS = new Set(
  'the a an that those this these some any same one other first free new only'.split(' ')
);
const POSSESSIVES = new Set(['my', 'your', 'our', 'his', 'her', 'their', 'its']);
/** A noun that can stand for a way to reach help, or the people there, without naming it. */
const REFERENTS = new Set(
  `number line chat service resource option support help people folks person counselor
  counsellor volunteer listener responder helper suggestion offer`
    .split(/\s+/)
    .flatMap((w) => [w, `${w}s`])
);
/** "the text line", "a chat service"; a name ("crisis line") is read by reachesHelp. */
const HELP_MODIFIERS = new Set(['text', 'chat', 'support']);
/** "my suggestion": Ferni's own idea; "my number" is his phone. */
const OWN_IDEAS = new Set(['suggestion', 'suggestions', 'offer', 'offers']);
/** Times, and words that place a line in this call: "at any hour", "from a few minutes ago". */
const IN_THIS_CALL = new Set(
  `start beginning night tonight day moment minute minutes hour hours time morning evening
  weekend while bit little few couple week talk call conversation phone`.split(/\s+/)
);
const PLACING_PREPOSITIONS = new Set(['for', 'about', 'at', 'from', 'of', 'with', 'on', 'in']);
/** Prepositions a verb can leave behind: "the folks I told you about", "connected you with". */
const STRANDED = new Set(['about', 'with', 'in']);
const CALLING = new Set(['call', 'calling', 'text', 'texting', 'ring', 'contact']);
/** A finite verb ends the referent's noun phrase: "the number I gave you for X is". */
const MAIN_VERBS = new Set(
  'is are was were has have will would can could should may might must does did'.split(' ')
);
const SUBJECTS = new Set(['i', 'we', "i've", "we've", "i'd", "we'd"]);
const ADVERBS = new Set(['just', 'already', 'also', 'briefly', 'actually']);
const PAST_IRREGULAR = new Set(
  `gave given told said sent read left put brought went got showed shown
  wrote written laid made`.split(/\s+/)
);
const isPast = (w = ''): boolean => PAST_IRREGULAR.has(w) || /^[a-z]{2,}[^e]ed$/.test(w);
/** Words allowed between a referent and the words pointing back to it. */
const BACK_WINDOW = 4;
const PLACING_WINDOW = 6;

/**
 * Spans of `words` that point back in the call: "I gave", "we went over", "earlier",
 * "a bit ago", "reaching out to that line", "the people on that line", "those text
 * folks".
 */
function backRefs(words: string[]): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  words.forEach((w, i) => {
    if (['earlier', 'ago', 'again', 'remember'].includes(w)) spans.push([i, i]);
    const out = words[i + 1] === 'back' ? i + 2 : i + 1;
    if (/^reach(?:es|ing|ed)?$/.test(w) && words[out] === 'out' && words[out + 1] === 'to')
      spans.push([i, out + 1]);
    const demonstrative = w === 'that' || w === 'those';
    if (demonstrative && (HELP_MODIFIERS.has(words[i + 1]) || words[i - 1] === 'on'))
      spans.push([i, i]);
    if (w === 'from' && words[i + 1] === 'before') spans.push([i, i + 1]);
    if (w === 'at' && words[i + 1] === 'the' && /^(?:start|beginning)$/.test(words[i + 2] ?? ''))
      spans.push([i, i + 2]);
    const verb = ADVERBS.has(words[i + 1] ?? '') ? i + 2 : i + 1;
    if (SUBJECTS.has(w) && isPast(words[verb])) spans.push([i, verb]);
  });
  return spans;
}

/** The content word a preposition or verb at `at` takes, past any determiner. */
function objectAt(words: string[], at: number): string | undefined {
  let k = at + 1;
  while (DETERMINERS.has(words[k]) || POSSESSIVES.has(words[k])) k++;
  const w = words[k];
  return w && !FUNCTION_WORDS.has(w) && !IN_THIS_CALL.has(w) ? w : undefined;
}

/**
 * Whether the referent at `at` belongs to something other than help: "the number
 * for the plumber", "the line at the post office", "the people I told you about
 * from the bakery", "call the vet at the number I left you".
 */
function placedElsewhere(words: string[], at: number): boolean {
  for (let j = at + 1; j <= at + PLACING_WINDOW && j < words.length; j++) {
    if (MAIN_VERBS.has(words[j])) break; // "those folks are trained for this", past the noun
    if (!PLACING_PREPOSITIONS.has(words[j])) continue;
    const afterVerb = isPast(words[j - 1]) || (isPast(words[j - 2]) && words[j - 1] === 'you');
    const next = words[j + 1] ?? '';
    if (STRANDED.has(words[j]) && afterVerb && !DETERMINERS.has(next) && !POSSESSIVES.has(next))
      continue; // "the folks I told you about answer", not "I mentioned with my neighbor"
    const object = objectAt(words, j);
    if (object && !REFERENTS.has(object)) return true;
  }
  for (let c = Math.max(0, at - PLACING_WINDOW); c < at; c++) {
    const object = CALLING.has(words[c]) ? objectAt(words, c) : undefined;
    if (object && !REFERENTS.has(object) && words.indexOf(object, c) < at) return true;
  }
  return false;
}

/**
 * Whether a word of `words` is a referent standing for help on its own: a noun
 * after a determiner, a help modifier or a help name ("that number", "the text
 * line", "warm line"), and not itself modifying a noun ("support beam", "folks next
 * door"). "the bus line", "my phone number", "the customer service line" are not.
 */
function standsForHelp(words: string[], at: number): boolean {
  const [before, noun, after] = [words[at - 1], words[at], words[at + 1]];
  if (!REFERENTS.has(noun)) return false;
  const headed = !after || FUNCTION_WORDS.has(after) || DETERMINERS.has(after) || isPast(after);
  const modified =
    !before ||
    FUNCTION_WORDS.has(before) ||
    DETERMINERS.has(before) ||
    CALLING.has(before) ||
    HELP_MODIFIERS.has(before) ||
    (before === 'my' && OWN_IDEAS.has(noun)) ||
    reachesHelp(`${before} ${noun}`);
  return headed && modified && !placedElsewhere(words, at);
}

/**
 * A sentence pointing back to a help line Ferni already gave ("The folks I told you
 * about are up all night", "Earlier I gave you a number", "Text the number from a
 * bit ago"). It names no line itself, so the safety readers miss it, but the
 * caller may still need to hear it. Read from its structure, not a phrase list: a
 * back-reference ("I" or "we" and a past verb, "earlier", "ago", "from before", "at
 * the start", "again", "remember") within a few words of a referent that stands for
 * help (standsForHelp). Not "the recipe I told you about", "the number I gave you
 * for the plumber", "the bus line I mentioned", or "those folks from the choir".
 */
function pointsBack(text: string): boolean {
  const words = plainWords(text).trim().split(' ');
  const spans = backRefs(words);
  return words.some(
    (_, at) =>
      standsForHelp(words, at) &&
      spans.some(([from, to]) => Math.max(from - at, at - to) - 1 <= BACK_WINDOW)
  );
}

/**
 * Safety wording: a way to reach help (services/safety/safety-talk.ts reachesHelp),
 * a line of the safety scripts or on safety, harm or help (phrase-loops.ts
 * isSafetyLine: "In Canada you can call Talk Suicide Canada any time."), or a
 * sentence pointing back to a help line already given. Not care wording on its
 * own (isCareTalk): it fires on everyday words like "please" and "tonight", and
 * care lines stay quotable, as on main.
 */
const isSafetyWording = (text: string): boolean =>
  reachesHelp(text) || isSafetyLine(text) || pointsBack(text);

/**
 * Whether a name or phrase is safety wording, or every sentence of Ferni's that
 * holds it is. Listed, it would ask the model to leave a help line ("You've
 * brought up Amitie", from "SOS Amitie listens day and night."). A pointer back is
 * read from the whole sentence: a phrase cut from "My phone number from before
 * changed" has lost the "My".
 */
function onlyInSafetyTalk(text: string, sentences: string[]): boolean {
  if (reachesHelp(text) || isSafetyLine(text)) return true;
  const holding = sentences.filter((s) => plainWords(s).includes(plainWords(text)));
  if (holding.length === 0) return pointsBack(text);
  return holding.every(isSafetyWording);
}

function quote(sentence: string): string {
  return sentence.length > MAX_QUOTE_CHARS
    ? `${sentence.slice(0, MAX_QUOTE_CHARS - 3)}...`
    : sentence;
}

/**
 * The record for a call so far, from its spoken lines (oldest first).
 * `speaking` (DIRECTOR_PERSONA_AWARE) is the persona on the call: a persona
 * saying its own name (a line's `by`, else `speaking`) isn't bringing someone up.
 */
export function toldThisCall(lines: Line[], userName?: string, speaking?: string): Told {
  const userWords = new Set(
    lines
      .filter((l) => l.speaker === 'user')
      .flatMap((l) => wordsOf(l.text.toLowerCase()))
      .concat(userName ? wordsOf(userName.toLowerCase()) : [])
  );
  const said = lines.filter((l) => l.speaker === 'ferni');
  const replies = said.map((l) => sentencesOf(l.text));

  const counts = new Map<string, number>();
  namesBySentence(replies).forEach((reply, i) => {
    // "Jordan" in a line by "Jordan Taylor" is her own name.
    const self = speaking ? (said[i].by ?? speaking).split(' ') : [];
    const inReply = new Set(
      reply.flat().filter(
        (n) =>
          !(self.length && n.split(' ').every((w) => self.includes(w))) &&
          !n
            .toLowerCase()
            .split(' ')
            .every((w) => userWords.has(w))
      )
    );
    inReply.forEach((n) => counts.set(n, (counts.get(n) ?? 0) + 1));
  });
  const sentences = replies.flat();
  // Capped first, so a name left out is never replaced by one more.
  const names = [...counts]
    .map(([name, n]) => ({ name, replies: n }))
    .sort((a, b) => b.replies - a.replies)
    .slice(0, MAX_NAMES)
    .filter((n) => !onlyInSafetyTalk(n.name, sentences));

  // A sentence sharing a six-word run with another reply's sentence, once per repeated run.
  const repeated: Array<{ sentence: string; runs: Set<string> }> = [];
  const runsByReply = replies.map((r) => r.map(runsOf));
  replies.forEach((reply, i) =>
    reply.forEach((sentence, j) => {
      const mine = runsByReply[i][j];
      const shares = (runs: Set<string>): boolean => [...runs].some((r) => mine.has(r));
      const elsewhere = runsByReply.some((other, k) => k !== i && other.some(shares));
      if (elsewhere && !repeated.some((q) => shares(q.runs)))
        repeated.push({ sentence, runs: mine });
    })
  );

  const recentLines = replies
    .slice(-3)
    .reverse()
    .flatMap((r) => [...r].reverse())
    .filter(
      (s) =>
        !s.endsWith('?') &&
        wordsOf(s).length >= RECENT_LINE_WORDS &&
        !repeated.some((q) => q.sentence === s)
    );

  const lastUser = [...lines].reverse().find((l) => l.speaker === 'user');
  return {
    names,
    selfStories: replies.filter((r) => r.some((s) => SELF_STORY.test(s))).length,
    repeated: repeated.map((q) => q.sentence),
    recentLines,
    askedAboutFerni: Boolean(lastUser && ASKS_ABOUT_FERNI.test(lastUser.text)),
    ...(phraseLoopGuardOn()
      ? { loops: phraseLoops(lines).filter((l) => !onlyInSafetyTalk(l.phrase, sentences)) }
      : {}),
  };
}

/** The record as the note the next request carries, or '' when there's nothing to say yet. */
export function formatTold(told: Told): string {
  const parts: string[] = [];
  if (told.names.length) {
    const list = told.names
      .map((n) => (n.replies > 1 ? `${n.name} (${n.replies} replies)` : n.name))
      .join(', ');
    parts.push(`You've brought up ${list}. Leave them unless they ask.`);
  }
  if (told.selfStories > 0) {
    const stories = told.selfStories === 1 ? 'a story' : `${told.selfStories} stories`;
    parts.push(
      told.askedAboutFerni
        ? `You've told ${stories} about yourself. They asked, so tell something you haven't told yet.`
        : `You've told ${stories} about yourself already. Keep this reply on them.`
    );
  }
  const quotes = [...told.repeated, ...told.recentLines].slice(0, MAX_QUOTES).map(quote);
  if (quotes.length) parts.push(`Don't say again: ${quotes.map((q) => `"${q}"`).join('; ')}`);
  const loops = formatPhraseLoops(told.loops ?? []);
  if (loops) parts.push(loops);
  return parts.length ? `[Already said this call: ${parts.join(' ')}]` : '';
}

/**
 * The record without the names, quotes and phrases `keep` rejects (director-notes.ts
 * told()). On a call with crisis risk noted (`sessionId`), no phrase loops and no
 * quotes at all: a crisis-guided request must never be told to drop wording
 * (crisis-call-risk.ts). A line of the safety scripts is never quoted on any call
 * (#2797: "Don't say again" had quoted "Are you somewhere safe right now?"), nor
 * is any other safety wording: a way to reach help ("You can text HOME any time."),
 * or a pointer back to a line already given, which the caller may still need to
 * hear. The quotes are only ever main's, fewer.
 */
export function keptTold(told: Told, keep: (text: string) => boolean, sessionId?: string): Told {
  const { loops: all, ...rest } = told;
  const crisis = Boolean(sessionId && crisisRiskNoted(sessionId));
  const loops = all && !crisis ? all : undefined;
  // The quotes main shows, capped first: a quote left out for safety is never
  // replaced by one main cut at the cap.
  const shown = new Set(
    [...told.repeated, ...told.recentLines]
      .filter((line) => !crisis && keep(line) && !isSafetyLine(line))
      .slice(0, MAX_QUOTES)
  );
  const quotable = (line: string): boolean => shown.has(line) && !isSafetyWording(line);
  return {
    ...rest,
    names: told.names.filter((n) => keep(n.name)),
    repeated: told.repeated.filter(quotable),
    recentLines: told.recentLines.filter(quotable),
    ...(loops ? { loops: loops.filter((l) => keep(l.phrase)) } : {}),
  };
}

/** The note for the next reply from the call's lines so far. */
export function toldThisCallNote(lines: Line[], userName?: string): string {
  return formatTold(toldThisCall(lines, userName));
}
