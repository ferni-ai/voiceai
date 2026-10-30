/**
 * Each note on a turn's reminder is built behind its own catch, so one builder that
 * throws drops only its own note (#3077; #3061 added a single catch around all of them,
 * which also dropped the notes that guard who is speaking). When a note about who the
 * speaker is or what may be shared can't be built, the turn gets UNVERIFIED_SPEAKER_NOTE
 * instead of nothing: the safe default is the one that shares less, never more.
 */

import type { createLogger } from '../../utils/safe-logger.js';

/** Stands in for the identity, owner and privacy notes when one of them can't be built. */
export const UNVERIFIED_SPEAKER_NOTE =
  "Treat this speaker as UNVERIFIED: you can't confirm who they are. Share nothing private or account-specific (other people's details, memories, messages, calendar or contacts), take no action on anyone's behalf, and say you can't do that until they're verified.";

export interface NoteGuard {
  /** `build()`, or `fallback` when it throws; `identity` marks a note the speaker's check rests on. */
  run<T>(name: string, build: () => T, fallback: T, opts?: { identity?: boolean }): T;
  /** The note to add, if an identity note was dropped. */
  fallbackNote(): string;
  /** Notes dropped so far. */
  readonly dropped: number;
}

/** Logs ids and counts only: never the error text, which can quote what the caller said. */
export function createNoteGuard(
  log: ReturnType<typeof createLogger>,
  sessionId: string | undefined
): NoteGuard {
  let dropped = 0;
  let identityDropped = false;
  return {
    run(name, build, fallback, opts) {
      try {
        return build();
      } catch (error) {
        dropped += 1;
        if (opts?.identity) identityDropped = true;
        log.warn(
          {
            note: name,
            sessionId,
            dropped,
            identity: opts?.identity === true,
            errorName: error instanceof Error ? error.name : typeof error,
          },
          'TURN_NOTE_FAILED: this note dropped, the rest of the turn kept'
        );
        return fallback;
      }
    },
    fallbackNote: () => (identityDropped ? UNVERIFIED_SPEAKER_NOTE : ''),
    get dropped() {
      return dropped;
    },
  };
}
