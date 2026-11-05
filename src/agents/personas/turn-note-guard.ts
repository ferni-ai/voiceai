/**
 * Each note on a turn's reminder is built behind its own catch, so one builder that throws drops
 * only its own note (#3077; #3061 put one catch around all of them, which also dropped the notes
 * that guard who is speaking). When a note about who the speaker is or what may be shared can't be
 * built, the turn gets UNVERIFIED_SPEAKER_NOTE instead of nothing: the safe default shares less.
 * That turn's request then carries no owner-only context either (#3091): only notes marked SAFE
 * (an allowlist: a builder not marked SAFE never rides), no world facts or context packet
 * (unverifiedReminder), and no call report (requestSent).
 * With UNVERIFIED_TURN_TOOLS=on it is also offered only the tools unverified-turn-tools.ts allows,
 * read off the request (requestIsUnverified) (#3305).
 *
 * The rule: an unverified turn carries only safety guidance and who is speaking. SAFE is these 7
 * builders and no others (turn-notes-guarded.ts): minorCare and sexualBoundary (the safety notes),
 * teammateIdentity and personaVoice (which persona speaks, and how), returningFlow (a yes/no, no
 * text), style (`text` only) and ferniState (`note` only). A builder joins SAFE only with a test
 * proving its text carries no data and no action steer, and the pinned set in
 * turn-reminder-unverified-safe-set.test.ts updated on purpose. Crisis guidance is added after
 * all this by gatedReply.
 *
 * withTurnReminder is synchronous, so the turn in flight is module state (guardedTurn sets it;
 * turn-notes-guarded.ts wraps the builders with `guarded`).
 */

import type { llm } from '@livekit/agents';

import type { createLogger } from '../../utils/safe-logger.js';
import { withoutStaleTurnContext } from '../multi-agent/turn-intelligence.js';
import { noteCallReportReached, withoutReport } from './turn-call-report.js';
import { withTurnStyleReminder } from './turn-style.js';

/** Stands in for the identity, owner and privacy notes when one of them can't be built. */
export const UNVERIFIED_SPEAKER_NOTE =
  "Treat this speaker as UNVERIFIED: you can't confirm who they are. Share nothing private or account-specific (other people's details, memories, messages, calendar or contacts), take no action on anyone's behalf, and say you can't do that until they're verified.";

/** What a note is, for the guard. */
export interface NoteMarks {
  /** The speaker's check rests on it: when it can't be built, the turn is unverified. */
  identity?: boolean;
  /** Its text never holds data about the owner or anyone else: it may ride an unverified turn. */
  safe?: boolean;
}
export const IDENTITY: NoteMarks = { identity: true };
export const SAFE: NoteMarks = { safe: true };
export const IDENTITY_SAFE: NoteMarks = { identity: true, safe: true };

/** Every builder marked SAFE so far, by name: the set the safe-set test pins. */
const safeBuilders = new Set<string>();
export const safeBuilderNames = (): string[] => [...safeBuilders].sort();

type Log = ReturnType<typeof createLogger>;
interface TurnState {
  log: Log;
  sessionId: string | undefined;
  dropped: number;
  identityDropped: boolean;
  /** What the SAFE notes built this turn: all an unverified turn keeps of its notes. */
  safeNotes: Set<string>;
}
let active: TurnState | undefined;

const errorName = (error: unknown): string => (error instanceof Error ? error.name : typeof error);

/**
 * The note text a builder returned: a string, strings in a list, or an object's `text` or `note`
 * (style, Ferni state). Never its other fields: Ferni state's `last` re-quotes his own earlier
 * lines, so it is not SAFE.
 */
function textsOf(built: unknown): string[] {
  const { text, note } = (built ?? {}) as { text?: unknown; note?: unknown };
  const parts = Array.isArray(built)
    ? (built as unknown[])
    : typeof built === 'object'
      ? [text, note]
      : [built];
  return parts.filter((part): part is string => typeof part === 'string' && part !== '');
}

/** `build()`, or `fallback` when it throws. Outside guardedTurn it is just `build()`. */
export function attempt<T>(name: string, build: () => T, fallback: T, marks: NoteMarks = {}): T {
  const turn = active;
  if (!turn) return build();
  const identity = marks.identity === true;
  if (marks.safe) safeBuilders.add(name);
  try {
    const built = build();
    if (marks.safe) for (const note of textsOf(built)) turn.safeNotes.add(note);
    return built;
  } catch (error) {
    turn.dropped += 1;
    turn.identityDropped ||= identity;
    // Ids and counts only: the error text can quote what the caller said.
    const { sessionId, dropped } = turn;
    turn.log.warn(
      { note: name, sessionId, dropped, identity, errorName: errorName(error) },
      'TURN_NOTE_FAILED: this note dropped, the rest of the turn kept'
    );
    return fallback;
  }
}

/** `fn` with its own catch, same signature, marked as `marks` says (NoteMarks). */
export function guarded<F extends (...args: never[]) => unknown>(
  name: string,
  fn: F,
  fallback: ReturnType<F>,
  marks: NoteMarks = {}
): F {
  if (marks.safe) safeBuilders.add(name);
  return ((...args: Parameters<F>) => attempt(name, () => fn(...args), fallback, marks)) as F;
}

/**
 * The reminder for a turn whose speaker is unverified (an identity note was dropped), or
 * undefined when every identity note held. It is the unverified default, then only the turn's
 * notes built by a SAFE builder, and nothing else: no world facts, no context packet (#3091).
 */
export function unverifiedReminder(notes: readonly string[]): string | undefined {
  const turn = active;
  if (!turn?.identityDropped) return undefined;
  const kept = notes.filter((note) => turn.safeNotes.has(note));
  return [UNVERIFIED_SPEAKER_NOTE, ...kept].join(' ');
}

/**
 * Whether this request is an unverified turn's: its caller message carries UNVERIFIED_SPEAKER_NOTE
 * as the reminder withTurnStyleReminder appends ("\n\n(...)"), from unverifiedReminder or
 * guardedTurn's fallback. Read off the request, not module state: a crisis-guided re-ask copies the
 * request and builds its own reminder (crisis-gate.ts), so each request answers for itself.
 */
export function requestIsUnverified(request: llm.ChatContext): boolean {
  const marker = `\n\n(${UNVERIFIED_SPEAKER_NOTE}`;
  const callers = request.items.filter((i) => i.type === 'message' && i.role === 'user');
  const caller = callers[callers.length - 1];
  const parts: unknown[] = caller?.type === 'message' ? caller.content : [];
  return parts.some((part) => typeof part === 'string' && part.startsWith(marker));
}

/**
 * The request the model gets. An unverified turn's carries no call report (the owner's news) and
 * marks none delivered; otherwise a report it carries is marked delivered once its reply is
 * released (turn-call-report.ts). Decided last, once every note of the turn has been built.
 */
export function requestSent(
  request: llm.ChatContext,
  sessionId: string | undefined,
  turn: Parameters<typeof noteCallReportReached>[2]
): llm.ChatContext {
  if (active?.identityDropped) return withoutReport(request);
  noteCallReportReached(sessionId, request, turn);
  return request;
}

/**
 * `build()` with the turn's notes guarded. A failure outside every note still leaves the request
 * without stale turn context or the call report, and with the unverified default; if even that
 * fails, the request without the call report: a throwing builder never costs the turn its reply.
 */
export function guardedTurn(
  log: Log,
  sessionId: string | undefined,
  request: llm.ChatContext,
  build: () => llm.ChatContext
): llm.ChatContext {
  const outer = active;
  active = { log, sessionId, dropped: 0, identityDropped: false, safeNotes: new Set() };
  try {
    return build();
  } catch (error) {
    log.warn({ sessionId, errorName: errorName(error) }, 'TURN_REMINDER_FAILED: default only');
    try {
      return withTurnStyleReminder(
        withoutReport(withoutStaleTurnContext(request)),
        UNVERIFIED_SPEAKER_NOTE
      );
    } catch {
      return withoutReport(request); // never throws (turn-call-report.ts)
    }
  } finally {
    active = outer;
  }
}
