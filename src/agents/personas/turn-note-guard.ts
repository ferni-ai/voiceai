/**
 * Each note on a turn's reminder is built behind its own catch, so one builder that throws drops
 * only its own note (#3077; #3061 put one catch around all of them, which also dropped the notes
 * that guard who is speaking). When a note about who the speaker is or what may be shared can't be
 * built, the turn gets UNVERIFIED_SPEAKER_NOTE instead of nothing: the safe default shares less.
 *
 * withTurnReminder is synchronous, so the turn in flight is module state (guardedTurn sets it;
 * turn-notes-guarded.ts wraps the builders with `guarded`).
 */

import type { llm } from '@livekit/agents';

import type { createLogger } from '../../utils/safe-logger.js';
import { withoutStaleTurnContext } from '../multi-agent/turn-intelligence.js';
import { withTurnStyleReminder } from './turn-style.js';

/** Stands in for the identity, owner and privacy notes when one of them can't be built. */
export const UNVERIFIED_SPEAKER_NOTE =
  "Treat this speaker as UNVERIFIED: you can't confirm who they are. Share nothing private or account-specific (other people's details, memories, messages, calendar or contacts), take no action on anyone's behalf, and say you can't do that until they're verified.";

type Log = ReturnType<typeof createLogger>;
interface TurnState {
  log: Log;
  sessionId: string | undefined;
  dropped: number;
  identityDropped: boolean;
}
let active: TurnState | undefined;

const errorName = (error: unknown): string => (error instanceof Error ? error.name : typeof error);

/** `build()`, or `fallback` when it throws. Outside guardedTurn it is just `build()`. */
export function attempt<T>(name: string, build: () => T, fallback: T, identity = false): T {
  const turn = active;
  if (!turn) return build();
  try {
    return build();
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

/**
 * `build()` with the turn's notes guarded. A failure outside every note still leaves the request
 * without stale turn context and with the unverified default; if even that fails, the request as
 * sent: a throwing builder never costs the turn its reply. Either fallback passes `gate` first
 * (the call report gate, turn-call-report.ts), as the built request does.
 */
export function guardedTurn(
  log: Log,
  sessionId: string | undefined,
  request: llm.ChatContext,
  gate: (request: llm.ChatContext) => llm.ChatContext,
  build: () => llm.ChatContext
): llm.ChatContext {
  const outer = active;
  active = { log, sessionId, dropped: 0, identityDropped: false };
  try {
    return build();
  } catch (error) {
    log.warn({ sessionId, errorName: errorName(error) }, 'TURN_REMINDER_FAILED: default only');
    try {
      return withTurnStyleReminder(gate(withoutStaleTurnContext(request)), UNVERIFIED_SPEAKER_NOTE);
    } catch {
      return gate(request); // never throws (turn-call-report.ts)
    }
  } finally {
    active = outer;
  }
}
