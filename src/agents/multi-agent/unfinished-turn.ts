/**
 * Don't answer half a sentence.
 *
 * Dev call, 2026-10-03: ink-2 ended the caller's turn mid-sentence and Ferni
 * answered the fragment. "We don't get" | "caught up in reviews.", "All
 * right, now to, it's not" | "yet. Hello, how does that make you feel?",
 * "When you go to sleep, what do you dream" | "of?". The caller went on
 * 0.5-0.7 s later (2.0 s after "I don't say she goes").
 *
 * Ink-2 reports no end-of-turn probability, but it punctuates a sentence it
 * hears as finished: in that call and the one before, all 20 complete finals
 * ended in . ? or !, and all 7 fragments ended in neither. So a turn without
 * end punctuation sounds unfinished, and one that also ends on a conjunction,
 * preposition, article, filler, auxiliary or comma even more so.
 *
 * Such a turn is held open (patches/@livekit__agents@1.5.1.patch,
 * UNFINISHED_TURN_HELD): it isn't committed, so when the caller goes on,
 * ink's next final joins it and Ferni answers the whole sentence once. When
 * they don't, it is answered after the hold. Turns that sound finished are
 * not delayed. UNFINISHED_TURN_HOLD=off answers every turn at once again.
 *
 * @module agents/multi-agent/unfinished-turn
 */
import { isBackchannel, words } from './barge-in-fastpath.js';
import { TURN_KEEPER_GRACE_MS } from './turn-keeper.js';

/** Hold for a turn ending on a word that needs more after it. */
export const DANGLING_HOLD_MS = 2000;
/** Hold for a turn that ink didn't punctuate as finished. */
export const UNPUNCTUATED_HOLD_MS = 1500;
/**
 * The turn keeper answers a hanging final after TURN_KEEPER_GRACE_MS of quiet;
 * the hold must end first or the keeper answers the fragment on its own.
 */
const MAX_HOLD_MS = TURN_KEEPER_GRACE_MS - 500;

/** Words a finished sentence doesn't end on. */
// prettier-ignore
const DANGLING_WORDS = new Set([
  // conjunctions and relative words
  'and', 'but', 'or', 'nor', 'so', 'because', 'cause', 'cuz', 'if', 'when', 'while',
  'although', 'though', 'unless', 'until', 'than', 'that', 'which', 'who', 'whose',
  'where', 'whether',
  // prepositions
  'to', 'of', 'in', 'on', 'at', 'for', 'with', 'about', 'from', 'by', 'into', 'onto',
  'as', 'over', 'under', 'after', 'before', 'between', 'through', 'without', 'around',
  // articles and determiners
  'a', 'an', 'the', 'my', 'your', 'his', 'her', 'our', 'their', 'its', 'this',
  'these', 'those', 'some', 'any', 'every',
  // fillers
  'um', 'uh', 'er', 'erm', 'like',
  // auxiliaries and negation
  'is', 'are', 'was', 'were', 'am', 'be', 'been', 'have', 'has', 'had', 'do', 'does',
  'did', 'will', 'would', 'can', 'could', 'should', 'might', 'must', 'gonna', 'wanna',
  'gotta', 'not', 'just', 'really',
  // a subject with nothing after it ("I", "so I")
  'i',
]);

/** Short replies that are whole turns even when ink leaves them unpunctuated. */
const WHOLE_SHORT_REPLIES = new Set(['no', 'nope', 'nah', 'hi', 'hello', 'hey', 'bye', 'thanks']);

export type Unfinishedness = 'finished' | 'dangling' | 'unpunctuated';

export function unfinishedness(transcript: string): Unfinishedness {
  // Closing quotes and brackets don't change where the sentence ends.
  const text = transcript.trim().replace(/["')\]]+$/, '');
  const ws = words(text);
  if (ws.length === 0) return 'finished';
  if (/[.?!]$/.test(text) && !/\.\.\.$/.test(text)) return 'finished';
  if (/(,|-|—|…|\.\.\.)$/.test(text)) return 'dangling';
  // Before the backchannel check: "um", "uh" and "yeah, um" are backchannel
  // words too, but someone ending on them is gathering a thought.
  if (DANGLING_WORDS.has(ws[ws.length - 1])) return 'dangling';
  if (isBackchannel(ws) || ws.every((w) => WHOLE_SHORT_REPLIES.has(w))) return 'finished';
  return 'unpunctuated';
}

/** How long to wait for more before answering this turn; 0 answers at once. */
export function unfinishedTurnHoldMs(transcript: string): number {
  const kind = unfinishedness(transcript);
  if (kind === 'finished') return 0;
  return Math.min(kind === 'dangling' ? DANGLING_HOLD_MS : UNPUNCTUATED_HOLD_MS, MAX_HOLD_MS);
}

/** The hook the patched AgentActivity.onEndOfTurn reads from the session. */
export interface UnfinishedTurnHoldSession {
  unfinishedTurnHoldMs?: (transcript: string) => number;
}

/** Install the hold on a live session. Returns whether it was installed. */
export function installUnfinishedTurnHold(
  session: object,
  env: Record<string, string | undefined> = process.env
): boolean {
  if (env.UNFINISHED_TURN_HOLD === 'off') return false;
  (session as UnfinishedTurnHoldSession).unfinishedTurnHoldMs = unfinishedTurnHoldMs;
  return true;
}

/**
 * The other side of the hold: answer a turn that is clearly over sooner.
 *
 * In stt turn detection LiveKit commits a turn no sooner than its minimum
 * endpointing delay after the caller stops (turn-patience.ts: 300 ms), even
 * when ink-2 has already ended it. On 2026-10-09/10 15% (dev) and 33% (prod)
 * of turns committed at exactly that floor (eouDelayMs 300-320), i.e. ink was
 * done earlier and the floor alone held the reply back.
 *
 * ENDPOINT_FAST_FINISHED=on lowers the floor to ENDPOINT_FINISHED_MIN_MS (150)
 * while the caller's latest words read as a finished sentence of three or
 * more words (ends in . ? or !, no trailing "..."), and puts it back for
 * anything else. A short "Yeah." or "No." keeps the full wait: people often go
 * on after one. Ink still decides that the turn has ended; only the floor
 * after its decision moves. The floor is never changed while Ferni is
 * speaking (an overlapping caller's endpointing state stays untouched).
 */
export const DEFAULT_FINISHED_MIN_MS = 150;
const MIN_FINISHED_WORDS = 3;

/** The endpointing floor for a turn whose latest words are `transcript`. */
export function finishedTurnMinDelayMs(transcript: string, baseMs: number, fastMs: number): number {
  if (unfinishedness(transcript) !== 'finished') return baseMs;
  const ws = words(transcript);
  if (ws.length < MIN_FINISHED_WORDS || isBackchannel(ws)) return baseMs;
  if (!/[.?!]["')\]]*\s*$/.test(transcript.trim())) return baseMs;
  return Math.min(fastMs, baseMs);
}

interface EndpointingSession {
  on(event: string, handler: (ev: unknown) => void): unknown;
  off(event: string, handler: (ev: unknown) => void): unknown;
  agentState?: string;
  updateOptions(options: { turnHandling: { endpointing: { minDelay: number } } }): void;
}

/** Install the fast floor on a live session. Returns a detach, or null when off. */
export function installFinishedTurnEndpointing(
  session: EndpointingSession,
  baseMs: number,
  env: Record<string, string | undefined> = process.env,
  onChange: (minDelayMs: number) => void = () => undefined
): (() => void) | null {
  if (env.ENDPOINT_FAST_FINISHED !== 'on') return null;
  const raw = Number(env.ENDPOINT_FINISHED_MIN_MS ?? DEFAULT_FINISHED_MIN_MS);
  const fastMs = Number.isFinite(raw) && raw >= 50 ? raw : DEFAULT_FINISHED_MIN_MS;
  let current = baseMs;
  const onTranscript = (ev: unknown): void => {
    const transcript = (ev as { transcript?: string } | undefined)?.transcript ?? '';
    if (!transcript.trim() || session.agentState === 'speaking') return;
    const next = finishedTurnMinDelayMs(transcript, baseMs, fastMs);
    if (next === current) return;
    current = next;
    session.updateOptions({ turnHandling: { endpointing: { minDelay: next } } });
    onChange(next);
  };
  session.on('user_input_transcribed', onTranscript);
  return () => session.off('user_input_transcribed', onTranscript);
}
