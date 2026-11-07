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
import { reachesHelp } from '../../services/safety/index.js';
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

/**
 * Nouns that can name a help line or the people on one (pointsBack): a line named
 * as help, counselors, other staff, people, a plain line or number, and a chat.
 */
type HelpNoun = 'named' | 'counselor' | 'staff' | 'people' | 'line' | 'service';
const HELP_NOUNS = new Map<string, HelpNoun>(
  [
    ['hotline helpline', 'named'],
    ['counselor counsellor', 'counselor'],
    ['volunteer responder', 'staff'],
    ['line number', 'line'],
    ['service chat', 'service'],
  ].flatMap(([words, kind]) =>
    words.split(' ').flatMap((w) => [w, `${w}s`].map((form) => [form, kind as HelpNoun] as const))
  )
);
HELP_NOUNS.set('people', 'people').set('folks', 'people');
/** "crisis line", "text service": a line named as help says it on its own. */
const HELP_KIND = new Set(['crisis', 'help', 'text', 'chat', 'suicide', 'support']);
const LINE_LIKE = new Set<HelpNoun>(['named', 'line', 'service']);
const DEMONSTRATIVE = new Set(['that', 'those', 'this', 'these']);
const OWNER = new Set(['my', 'our', 'his', 'her', 'their', 'its']);
const BACK_IN_TIME = [
  ['from', 'before'],
  ['earlier'],
  ['reaching', 'out', 'to'],
  ['reach', 'out', 'to'],
];
const BACK_SUBJECT = /^(?:i|we|i've|we've)$/;
const BACK_VERB = /^(?:gave|given|mentioned|shared|sent|told|talked|brought)$/;
/**
 * Words allowed between a help noun and the words pointing back to it. "I gave",
 * "we talked about" after the noun must follow it at once ("the number I gave
 * you", "the line that I mentioned"): further on they point back at something
 * else ("The bus line downtown is something I mentioned").
 */
const BACK_WINDOW = 3;
const SAID_AFTER_WINDOW = 1;

interface BackRef {
  from: number;
  to: number;
  /** "I gave", "we talked about", not only "earlier". */
  said: boolean;
}

/** Each phrase in `words` that refers back to something said before. */
function backRefs(words: string[]): BackRef[] {
  const found: BackRef[] = [];
  words.forEach((w, i) => {
    for (const phrase of BACK_IN_TIME)
      if (phrase.every((p, k) => words[i + k] === p))
        found.push({ from: i, to: i + phrase.length - 1, said: false });
    const verb = ['just', 'already'].includes(words[i + 1] ?? '') ? i + 2 : i + 1;
    if (BACK_SUBJECT.test(w) && BACK_VERB.test(words[verb] ?? ''))
      found.push({ from: i, to: verb, said: true });
  });
  return found;
}

/** Each help noun in `words`, and whether "that" or "those" stands just before it. */
function helpNouns(words: string[]): Array<{ at: number; kind: HelpNoun; pointed: boolean }> {
  return words.flatMap((w, i) => {
    const named =
      /^(?:lines?|numbers?|services?|chats?)$/.test(w) && HELP_KIND.has(words[i - 1] ?? '');
    const kind = named ? 'named' : HELP_NOUNS.get(w);
    const before = words.slice(Math.max(0, i - 2), i);
    // "the line of thinking", "my phone number", "I was in line".
    if (!kind || words[i + 1] === 'of' || before.some((b) => OWNER.has(b))) return [];
    if (kind === 'line' && words[i - 1] === 'in') return [];
    return [{ at: i, kind, pointed: before.some((b) => DEMONSTRATIVE.has(b)) }];
  });
}

/** What sits near one help noun in a sentence. */
interface NounContext {
  /** Words pointing back within the window ("earlier", "I gave", "from before"). */
  referred: boolean;
  /** "that" or "those" just before it. */
  pointed: boolean;
  /** A hotline, a line named as help, or a plain line or number nearby. */
  lineNear: boolean;
  othersNear: boolean;
  /** "I mentioned", "we talked about" within the window, and right after it. */
  saidNear: boolean;
  saidAfter: boolean;
}

const POINTS_BACK_BY_KIND: Record<HelpNoun, (c: NounContext) => boolean> = {
  named: (c) => c.referred || c.pointed,
  counselor: (c) => c.referred || c.pointed || c.lineNear,
  staff: (c) => c.referred || c.lineNear,
  line: (c) => c.referred || (c.pointed && c.othersNear),
  // "the service I mentioned", "that chat we talked about"; not "We talked about the service at that diner".
  service: (c) => c.saidAfter || (c.pointed && (c.saidNear || c.othersNear)),
  people: (c) => c.pointed && (c.referred || c.lineNear),
};

/**
 * A sentence pointing back to a help line Ferni already gave, in any word order
 * ("I gave you a number earlier", "Those counselors I mentioned", "Remember the
 * line from earlier"). It names no line itself, so the safety readers miss it, but
 * the caller may still need to hear it. A help noun counts with words pointing back
 * ("from before", "earlier", "I gave", "I mentioned", "we talked about", "reaching
 * out to") within a few words on either side. "that" or "those" just before it is
 * enough for a hotline or a line named as help ("that text service") and for
 * counselors; a plain line or number needs a second help noun nearby too ("The
 * people on that line"), as do people. Not "the line at the coffee shop", "the
 * number of finches", "my phone number from before", or "I mentioned the people at
 * work".
 */
function pointsBack(text: string): boolean {
  const words = plainWords(text).trim().split(' ');
  const refs = backRefs(words);
  const nouns = helpNouns(words);
  return nouns.some(({ at, kind, pointed }) => {
    const gap = (from: number, to: number): number => Math.max(from - at, at - to) - 1;
    const near = (r: BackRef): boolean =>
      gap(r.from, r.to) <= (r.said && r.from > at ? SAID_AFTER_WINDOW : BACK_WINDOW);
    const said = refs.filter((r) => r.said && near(r));
    const others = nouns.filter((n) => n.at !== at && gap(n.at, n.at) <= BACK_WINDOW);
    return POINTS_BACK_BY_KIND[kind]({
      referred: refs.some(near),
      pointed,
      lineNear: others.some((n) => LINE_LIKE.has(n.kind)),
      othersNear: others.length > 0,
      saidNear: said.length > 0,
      saidAfter: said.some((r) => r.from > at),
    });
  });
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
