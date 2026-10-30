/**
 * Each note on a turn's reminder is built behind its own catch, so one builder that throws drops
 * only its own note (#3077; #3061 put one catch around all of them, which also dropped the notes
 * that guard who is speaking). When a note about who the speaker is or what may be shared can't be
 * built, the turn gets UNVERIFIED_SPEAKER_NOTE instead of nothing: the safe default shares less.
 *
 * withTurnReminder is synchronous, so the guard for the turn in flight is module state, set by
 * withNoteGuard and read by attempt/guarded (turn-notes-guarded.ts wraps the builders with them).
 */

import type { createLogger } from '../../utils/safe-logger.js';

/** Stands in for the identity, owner and privacy notes when one of them can't be built. */
export const UNVERIFIED_SPEAKER_NOTE =
  "Treat this speaker as UNVERIFIED: you can't confirm who they are. Share nothing private or account-specific (other people's details, memories, messages, calendar or contacts), take no action on anyone's behalf, and say you can't do that until they're verified.";

export interface NoteGuard {
  readonly dropped: number;
  readonly identityDropped: boolean;
  record: (name: string, error: unknown, identity: boolean) => void;
}

/** Logs ids and counts only: never the error text, which can quote what the caller said. */
export function createNoteGuard(
  log: ReturnType<typeof createLogger>,
  sessionId: string | undefined
): NoteGuard {
  let dropped = 0;
  let identityDropped = false;
  return {
    get dropped() {
      return dropped;
    },
    get identityDropped() {
      return identityDropped;
    },
    record(note, error, identity) {
      dropped += 1;
      identityDropped ||= identity;
      log.warn(
        {
          note,
          sessionId,
          dropped,
          identity,
          errorName: error instanceof Error ? error.name : typeof error,
        },
        'TURN_NOTE_FAILED: this note dropped, the rest of the turn kept'
      );
    },
  };
}

let active: NoteGuard | undefined;

/** Runs `build` with `guard` as the turn's guard; synchronous, so turns never overlap. */
export function withNoteGuard<T>(guard: NoteGuard, build: () => T): T {
  const outer = active;
  active = guard;
  try {
    return build();
  } finally {
    active = outer;
  }
}

/** `build()`, or `fallback` when it throws. Outside withNoteGuard it is just `build()`. */
export function attempt<T>(name: string, build: () => T, fallback: T, identity = false): T {
  if (!active) return build();
  try {
    return build();
  } catch (error) {
    active.record(name, error, identity);
    return fallback;
  }
}

/** `fn` with its own catch, same signature. `identity` marks a note the speaker's check rests on. */
export function guarded<F extends (...args: never[]) => unknown>(
  name: string,
  fn: F,
  fallback: ReturnType<F>,
  identity = false
): F {
  return ((...args: Parameters<F>) => attempt(name, () => fn(...args), fallback, identity)) as F;
}

/** The default for the turn so far: the unverified note if an identity note was dropped. */
export const fallbackNote = (): string => (active?.identityDropped ? UNVERIFIED_SPEAKER_NOTE : '');
