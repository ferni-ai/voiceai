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
 * TOLD_THIS_CALL=off turns it off.
 *
 * @module agents/personas/told-this-call
 */

import type { Line } from './director-notes.js';

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

function quote(sentence: string): string {
  return sentence.length > MAX_QUOTE_CHARS
    ? `${sentence.slice(0, MAX_QUOTE_CHARS - 3)}...`
    : sentence;
}

/** The record for a call so far, from its spoken lines (oldest first). */
export function toldThisCall(lines: Line[], userName?: string): Told {
  const userWords = new Set(
    lines
      .filter((l) => l.speaker === 'user')
      .flatMap((l) => wordsOf(l.text.toLowerCase()))
      .concat(userName ? wordsOf(userName.toLowerCase()) : [])
  );
  const replies = lines.filter((l) => l.speaker === 'ferni').map((l) => sentencesOf(l.text));

  const counts = new Map<string, number>();
  namesBySentence(replies).forEach((reply) => {
    const inReply = new Set(
      reply.flat().filter(
        (n) =>
          !n
            .toLowerCase()
            .split(' ')
            .every((w) => userWords.has(w))
      )
    );
    inReply.forEach((n) => counts.set(n, (counts.get(n) ?? 0) + 1));
  });
  const names = [...counts]
    .map(([name, n]) => ({ name, replies: n }))
    .sort((a, b) => b.replies - a.replies)
    .slice(0, MAX_NAMES);

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
  return parts.length ? `[Already said this call: ${parts.join(' ')}]` : '';
}

/** The note for the next reply from the call's lines so far. */
export function toldThisCallNote(lines: Line[], userName?: string): string {
  return formatTold(toldThisCall(lines, userName));
}
