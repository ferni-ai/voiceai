/**
 * FIRST_CLAUSE_FLUSH=on (off by default): a reply's first clause goes to the
 * voice as soon as it is written, not when its sentence ends.
 *
 * Latency epic #1505, step 4 (#1544). The action-claim guard
 * (action-claim-guard.ts) holds each sentence until it ends, so on every turn
 * the first words reach Cartesia only at the first full stop: 200-650 ms after
 * the model's first token on dev (2026-10-15). continuation-tts.ts already cuts
 * the first TTS piece at a clause of 12+ spoken characters, but it never got
 * one, because the guard held the clause back until the sentence ended.
 *
 * With the flag on, the guard lets the reply's first clause out early when the
 * clause on its own is safe: it uses no action word and claims no action. The
 * whole sentence is still checked when it ends. If it claims an action that no
 * tool carried out, the rest of the sentence is dropped and the honest line
 * follows the clause ("No problem at all, I can't actually send messages for
 * you..."). A first clause that has an action word in it waits for its
 * sentence, as before. Only a reply's first clause goes early; every later
 * piece is held exactly as it is today.
 *
 * The opener gate, the name gate and every later guard wrap the claim guard's
 * output, so the clause still passes through all of them. The opener gate
 * decides early with this flag on (opener-gate.ts), because its 24-character
 * wait would otherwise hold a shorter clause until the sentence ended.
 *
 * @module agents/personas/first-clause-flush
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { bareOnIt, claimedAction } from './action-claims.js';
import { promisedAction } from './action-promises.js';
import { narratesCallOutcome } from './call-narration.js';

const log = createLogger({ module: 'FirstClauseFlush' });

/**
 * Fewest spoken characters (markup removed, mark included) a first clause
 * needs before it goes early. A shorter clause ("So,", "Yeah, well,") is not
 * worth a cut. continuation-tts.ts's MIN_FIRST_CHUNK uses the same count, so
 * the clause that goes out here is the first piece Cartesia gets.
 */
export const FIRST_CLAUSE_MIN_CHARS = 12;

export function firstClauseFlushEnabled(env: Env = process.env): boolean {
  return flagOn('FIRST_CLAUSE_FLUSH', env);
}

/** Characters that will be spoken: Cartesia tags and [cues] removed. */
function spokenLength(text: string): number {
  return text.replace(/<[^>]*>|\[[^\]]*\]/g, '').trim().length;
}

/** True when `index` falls inside an unclosed <...> or [...]. */
function insideMarkup(text: string, index: number): boolean {
  return (
    text.lastIndexOf('<', index) > text.lastIndexOf('>', index) ||
    text.lastIndexOf('[', index) > text.lastIndexOf(']', index)
  );
}

/** A finished sentence before the mark: the sentence path already handles it. */
const SENTENCE_END = /[!?]|\.(?=\s)/;

/**
 * Where the first clause of `text` ends: just past its `,` `;` or `:` and any
 * space after it, or 0 when there isn't one yet. A mark counts only when:
 * - it isn't inside a number ("1,000", "3:30"): a mark right after a digit at
 *   the end of the text waits for the next character;
 * - it doesn't follow a period ("e.g.,", "i.e.,", "etc.,");
 * - it isn't inside markup (`<emotion value="..."/>`, `[laughter]`);
 * - the text up to it has at least `minChars` spoken characters, so "So," is
 *   skipped and the next mark is tried ("So, honestly," goes);
 * - no sentence ended before it (no mark at all falls back to the sentence).
 */
export function findFirstClauseEnd(text: string, minChars = FIRST_CLAUSE_MIN_CHARS): number {
  for (const m of text.matchAll(/[,;:]/g)) {
    const i = m.index ?? 0;
    if (SENTENCE_END.test(text.slice(0, i))) return 0;
    const before = text[i - 1] ?? '';
    const after = text[i + 1];
    if (after === undefined && /[0-9]/.test(before)) return 0; // "1," may become "1,000"
    if (after !== undefined && !/\s/.test(after)) continue; // "1,000", "3:30", "a,b"
    if (before === '.' || insideMarkup(text, i)) continue;
    if (spokenLength(text.slice(0, i + 1)) < minChars) continue;
    let end = i + 1;
    while (end < text.length && /\s/.test(text[end])) end++;
    return end;
  }
  return 0;
}

/**
 * The guard's sentence checks, run on the first clause alone: it goes early only
 * when none of them could drop it. No claim (nor a bare "I'm on it" on a call's
 * yes), no promise, no story of a call no result came back from, no action word.
 */
export function clauseSafeFor(
  callYes: boolean,
  unheard: { askedHow: boolean } | null,
  actionTalk: (clause: string) => boolean
): (clause: string) => boolean {
  return (clause) =>
    claimedAction(clause) === null &&
    !(callYes && bareOnIt(clause)) &&
    promisedAction(clause) === null &&
    !(unheard && narratesCallOutcome(clause, unheard.askedHow)) &&
    !actionTalk(clause);
}

/**
 * One reply's first-clause release. `take` is asked with the reply's first
 * sentence so far; it answers how much of it may go out now (0: keep holding).
 * It answers yes at most once per reply, and never after `close()`.
 */
export class FirstClauseFlush {
  private open: boolean;
  /** How much of the current sentence already went out as the first clause. */
  sent = 0;

  constructor(enabled: boolean) {
    this.open = enabled;
  }

  /**
   * `safe` is the guard's check on the clause alone. Once a first clause is
   * found the decision is final: an unsafe clause waits for its sentence, and
   * no later clause of the reply goes early.
   */
  take(pending: string, safe: (clause: string) => boolean): number {
    if (!this.open) return 0;
    const end = findFirstClauseEnd(pending);
    if (end === 0) return 0;
    this.open = false;
    const clause = pending.slice(0, end);
    if (!safe(clause)) {
      log.debug({ chars: spokenLength(clause) }, 'FIRST_CLAUSE_HELD');
      return 0;
    }
    // Once per reply, length only (never words), so dev can count how often it fires.
    log.info({ chars: spokenLength(clause) }, 'FIRST_CLAUSE_FLUSH');
    this.sent = end;
    return end;
  }

  /** The first sentence ended, or a tool call cut it, before a clause went out. */
  close(): void {
    this.open = false;
    this.sent = 0;
  }
}
