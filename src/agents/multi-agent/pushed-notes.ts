/**
 * Safety guidance in the pushed turn-context note (turn-intelligence.ts) is
 * never cut (#2618). The note is capped at MAX_PUSHED_CONTEXT_CHARS; a raw
 * slice of the joined notes cut crisis_response mid-sentence and dropped the
 * safety injection whenever a note added earlier in the turn (the cross-domain
 * correlations note) sat ahead of it.
 *
 * Safety notes are the ones marked by safety-note.ts (carriesSafety). They go
 * first, in full; the other notes keep their order and get what budget is
 * left. A turn with no safety note is cut exactly as before.
 *
 * Nor is it lost later (#2642): safety notes still waiting are carried into the
 * next held note, and a note the stale drop removes keeps its safety part.
 *
 * @module agents/multi-agent/pushed-notes
 */
import { carriesSafety } from '../processors/turn-processor/safety-note.js';
import { createLogger } from '../../utils/safe-logger.js';
import { MAX_PUSHED_CONTEXT_CHARS } from './turn-context-header.js';

const log = createLogger({ module: 'PushedNotes' });

export interface TurnNote {
  /** It carries crisis or safety guidance (safety-note.ts carriesSafety). */
  safety?: boolean;
  text: string;
  /** The turn whose build wrote it. */
  turn?: number;
}

/** The notes a turn's pass added to its chat context, in order; empty ones dropped. */
export const turnNotes = (items: readonly object[], turn?: number): TurnNote[] =>
  items
    .map((item) => ({
      safety: carriesSafety(item as never),
      text: (item as { textContent?: string }).textContent?.trim() ?? '',
      turn,
    }))
    .filter((note) => note.text !== '');

/** The safety guidance among these notes, whole, in order. */
export const safetyText = (notes: readonly TurnNote[]): string =>
  notes
    .filter((note) => note.safety)
    .map((note) => note.text)
    .join('\n\n');

/** The body of the pushed note: safety notes first and whole, the rest cut to the budget left. */
export function pushedNotesText(
  notes: readonly TurnNote[],
  maxChars = MAX_PUSHED_CONTEXT_CHARS
): string {
  const rest = notes
    .filter((note) => !note.safety)
    .map((note) => note.text)
    .join('\n\n');
  const kept = safetyText(notes);
  if (kept === '') return rest.slice(0, maxChars);

  const room = maxChars - kept.length - 2;
  if (room < 0) {
    log.warn(
      { safetyChars: kept.length, maxChars },
      'Safety notes exceed the pushed-note cap; kept whole'
    );
  }
  return rest && room > 0 ? `${kept}\n\n${rest.slice(0, room)}` : kept;
}

/** The safety notes still waiting go ahead of a later note's, each once (#2642). */
export function withHeldSafety(held: readonly string[], notes: readonly TurnNote[]): TurnNote[] {
  const fresh = new Set(notes.filter((note) => note.safety).map((note) => note.text));
  const carried = held.filter((text) => !fresh.has(text)).map((text) => ({ safety: true, text }));
  return [...carried, ...notes];
}

/**
 * The notes waiting for the next push. The fresh ones come first, as the newest,
 * so the budget cuts the end. A turn's fresh notes replace its own older ones.
 * With `keepFirstTurn`, a waiting turn-1 note stays behind them (a released
 * turn-1 note that turn 2's words overtook); turn 1 is the only deferred turn.
 * Else the others are replaced, as before. Safety guidance still waiting is
 * never replaced (#2642).
 */
export function queuedNotes(
  queued: readonly TurnNote[],
  fresh: readonly TurnNote[],
  keepFirstTurn: boolean
): TurnNote[] {
  const firstTurnFresh = fresh.some((note) => note.turn === 1);
  const rest =
    keepFirstTurn && !firstTurnFresh
      ? queued.filter((note) => !note.safety && note.turn === 1)
      : [];
  return withHeldSafety(
    queued.filter((note) => note.safety).map((note) => note.text),
    [...fresh, ...rest]
  );
}

/** One segment's build: its run id, its turn, and the words it was built for. */
export interface Run {
  id: number;
  turn: number;
  forText: string;
}

/**
 * What a turn-context pusher holds between builds and pushes: the notes waiting
 * for the next push, and the note the chat context holds now. With `carry`
 * (reply_end, a deferred turn 1), a turn-1 note whose build ends after turn 2's
 * words merges into turn 2's note, which is pushed again, not lost.
 */
export class NoteQueue {
  private turnText = '';
  private runs = 0;
  private turnNo = 0;
  private readonly lastRunOf = new Map<number, number>();
  private queued: TurnNote[] = [];
  private queuedFor = '';
  private pushed: TurnNote[] = [];
  private pushedFor = '';

  constructor(private readonly carry: boolean) {}

  /** A final transcript segment starts a run; segments of one turn accumulate. */
  begin(transcript: string): Run {
    if (!this.turnText) this.turnNo++; // the last turn ended: its reply cleared turnText
    this.turnText = `${this.turnText} ${transcript.trim()}`.trim();
    const run = { id: ++this.runs, turn: this.turnNo, forText: this.turnText };
    this.lastRunOf.set(run.turn, run.id);
    return run;
  }

  /** Ferni started or ended a reply: the next segment is a new turn. */
  endTurn(): void {
    this.turnText = '';
  }

  /** A finished build's notes; true when a push may now go out. */
  settle(run: Run, notes: TurnNote[]): boolean {
    if (run.id !== this.runs) {
      // A later segment rebuilds this turn: only turn 1's last run carries on.
      const carries = this.carry && run.turn === 1 && this.lastRunOf.get(1) === run.id;
      if (!carries || notes.length === 0) {
        log.info({ notes: notes.length }, 'Superseded turn context dropped');
        return false;
      }
      if (this.queued.length === 0) this.queuedFor = this.pushedFor || run.forText;
      this.queued = queuedNotes(notes, this.queued.length > 0 ? this.queued : this.pushed, true);
      return true;
    }
    if (notes.length === 0) return false;
    if (!this.carry && this.queued.some((note) => !note.safety)) {
      log.info('Unpushed note replaced');
    }
    this.queuedFor = run.forText;
    this.queued = queuedNotes(this.queued, notes, this.carry);
    return true;
  }

  waiting(): boolean {
    return this.queued.length > 0;
  }

  safetyWaiting(): string {
    return safetyText(this.queued);
  }

  /** The waiting notes, as they go out now; they become the note the chat holds. */
  take(): { text: string; forText: string; safety: string } {
    const taken = {
      text: pushedNotesText(this.queued),
      forText: this.queuedFor,
      safety: this.safetyWaiting(),
    };
    this.pushed = this.queued;
    this.pushedFor = this.queuedFor;
    this.queued = [];
    return taken;
  }
}

/** The key, in a pushed note's `extra`, of its safety guidance, whole. */
export const TURN_CONTEXT_SAFETY = 'turnContextSafety';

/**
 * A stale pushed note cut down to its header and its safety guidance, or
 * undefined when it carries none (withoutStaleTurnContext, #2642). A copy: the
 * request's items are the agent's own (ChatContext.copy shares them).
 */
export function safetyOnlyNote<T extends { extra?: Record<string, unknown> }>(
  note: T,
  header: string
): T | undefined {
  const safety = note.extra?.[TURN_CONTEXT_SAFETY];
  if (typeof safety !== 'string' || safety === '') return undefined;
  const copy = Object.create(Object.getPrototypeOf(note) as object) as T;
  return Object.assign(copy, note, { content: [`${header}\n${safety}`] });
}
