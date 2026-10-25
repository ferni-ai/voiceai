/**
 * Stock phrases Ferni keeps reusing on a call, so the next reply can drop them
 * (PHRASE_LOOP_GUARD=on, off by default).
 *
 * Prod call 2026-10-22 (AJ_EKcqk2pyFZBP): "you got me there, fair and square"
 * in six replies in about ninety seconds, in loose variants ("You've got me
 * there", "you got me fair and square", "I got burned fair and square").
 * 2026-10-24 (AJ_keoumeHJ4gzf): "Glad to hear it" five times across four
 * personas. The told-this-call record (told-this-call.ts) only counts a
 * repeated six-word run and quotes sentences of eight words or more, so a
 * three-to-five word catchphrase slips through it.
 *
 * This ledger reads Ferni's last REPLY_WINDOW replies and counts, once per
 * reply, every lead-in (the start of his first clause), closer (the end of his
 * last clause) and three-to-six word run inside a clause. A phrase in two or
 * more replies is a loop unless it is only function words ("and I was"), or
 * every content word in it came from the caller (their topic, not his tic).
 * The told-this-call note carries the loops, so the next request asks for
 * something fresh. Nothing he says is rewritten: the note is free (no model
 * call, nothing held on the TTS path), and a rewrite of a streamed reply would
 * cut words mid-sentence.
 *
 * Crisis replies (988, 911, a hotline, the screening question) are never in
 * the ledger, so no phrase from one is ever named as something to avoid.
 *
 * @module agents/personas/phrase-loops
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import type { Line } from './director-notes.js';
import { mentionsCrisisResource } from './listen-offer.js';

export function phraseLoopGuardOn(env: Env = process.env): boolean {
  return flagOn('PHRASE_LOOP_GUARD', env);
}

export interface PhraseLoop {
  phrase: string;
  /** Replies, of the last REPLY_WINDOW, that said it. */
  replies: number;
}

const REPLY_WINDOW = 8;
const MIN_REPLIES = 2;
const MIN_RUN = 3;
const MAX_RUN = 6;
const EDGE_WORDS = 5;
const MAX_LOOPS = 3;

/**
 * Words that alone make no stock phrase: "and I was", "I think that", "if you want
 * to", "a bit of", "it sounds like". Grammar and light verbs, never an
 * adjective or a reaction word (glad, fair, caught, mind, hear).
 */
const FUNCTION_WORDS = new Set(
  `a an the and or but so if then than that this these those it it's its i i'm i've i'd i'll me my
  you you're you've you'd you'll your we we're our us he he's him his she she's her they they're
  them their there there's here is am are was were be been being do does did done have has had
  having will would can could should might must shall may not no to of in on at by for with from
  up down out about into over just really very too also all some any what when where who how why
  which as like well oh ah um uh mm hm yeah yes ok okay know think mean go going gonna
  lot kind sort thing things way one what's that's let's can't don't i'm want need let make try
  see say tell take give come keep look put bit little rest more much now then even sounds sound`.split(
    /\s+/
  )
);

/** A reply's clauses, as lowercase words: markup and [laughter] tags removed. */
function clausesOf(text: string): string[][] {
  return text
    .replace(/\[[^\]]*\]|<[^>]+>/g, ' ')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .split(/[,;:.!?…—–()"“”]+|\s-\s/)
    .map((clause) =>
      clause
        .split(/\s+/)
        .map((w) => w.replace(/^[^a-z0-9]+|[^a-z0-9']+$/g, '').replace(/'+$/, ''))
        .filter(Boolean)
    )
    .filter((words) => words.length > 0);
}

/** Every phrase one reply offers to the ledger, each once. */
function phrasesOf(text: string): Set<string> {
  const clauses = clausesOf(text);
  const phrases = new Set<string>();
  const lead = clauses.find((c) => c.length >= 2);
  if (lead) phrases.add(lead.slice(0, EDGE_WORDS).join(' '));
  const close = [...clauses].reverse().find((c) => c.length >= 2);
  if (close) phrases.add(close.slice(-EDGE_WORDS).join(' '));
  for (const words of clauses)
    for (let n = MIN_RUN; n <= MAX_RUN; n++)
      for (let i = 0; i + n <= words.length; i++) phrases.add(words.slice(i, i + n).join(' '));
  return phrases;
}

const contentWords = (phrase: string): string[] =>
  phrase.split(' ').filter((w) => !FUNCTION_WORDS.has(w));

/** Whether one phrase holds the other, word for word. */
const overlaps = (a: string, b: string): boolean =>
  ` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `);

/**
 * The stock phrases Ferni has said in two or more of his last replies, most
 * repeated first. Of two phrases where one holds the other, only the more
 * repeated (then the longer) is kept: "fair and square" ×6 over "you got me
 * fair and square" ×2, "glad to hear it" over "glad to hear".
 */
export function phraseLoops(lines: Line[]): PhraseLoop[] {
  const callerWords = new Set(
    lines.filter((l) => l.speaker === 'user').flatMap((l) => clausesOf(l.text).flat())
  );
  const replies = lines
    .filter((l) => l.speaker === 'ferni' && !mentionsCrisisResource(l.text))
    .slice(-REPLY_WINDOW);
  const counts = new Map<string, number>();
  for (const reply of replies)
    for (const phrase of phrasesOf(reply.text)) counts.set(phrase, (counts.get(phrase) ?? 0) + 1);

  const candidates = [...counts]
    .filter(([phrase, n]) => {
      if (n < MIN_REPLIES) return false;
      const content = contentWords(phrase);
      return content.length > 0 && !content.every((w) => callerWords.has(w));
    })
    .map(([phrase, replies]) => ({ phrase, replies }))
    .sort((a, b) => b.replies - a.replies || b.phrase.length - a.phrase.length);
  const loops: PhraseLoop[] = [];
  for (const c of candidates) {
    if (loops.some((kept) => overlaps(kept.phrase, c.phrase))) continue;
    loops.push(c);
    if (loops.length === MAX_LOOPS) break;
  }
  return loops;
}

/** The loops as a sentence of the told-this-call note, or '' when there are none. */
export function formatPhraseLoops(loops: readonly PhraseLoop[]): string {
  if (!loops.length) return '';
  const list = loops.map((l) => `"${l.phrase}" (${l.replies} replies)`).join(', ');
  return `You keep reusing ${list}. Don't say ${loops.length === 1 ? 'it' : 'them'} again; say it fresh or not at all.`;
}
