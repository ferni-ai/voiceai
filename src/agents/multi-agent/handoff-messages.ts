/**
 * What a multi-agent call (the production path) tells the app when a handoff starts.
 *
 * The app's "Bringing in Maya…" indicator is driven by handoff_progress, which only the
 * single-agent coordinator sent, so on live calls it never showed however long a handoff
 * took. One progress message right after handoff_started is enough: the app shows the
 * indicator once the handoff has run 700ms and clears it on complete, failed or the
 * timeout. It is sent before the handoff runs, never during it, so on the ordered data
 * channel it can't arrive after handoff_complete and bring the indicator back.
 */
import { HANDOFF_TIMING } from '../../config/handoff-timing.js';
import { getCanonicalPersonaId, isKnownPersona } from '../../personas/voice-registry.js';

export function handoffStartMessages(
  target: string,
  previousAgent: string | null | undefined
): Record<string, unknown>[] {
  const timestamp = Date.now();
  return [
    { type: 'handoff_started', target, newAgent: target, previousAgent, timestamp },
    {
      type: 'handoff_progress',
      target,
      elapsedMs: 0,
      timeoutMs: HANDOFF_TIMING.HANDOFF_TIMEOUT_MS,
      timestamp,
    },
  ];
}

/** What handleHandoffFromDataChannel says about a handoff that didn't happen. */
export interface HandoffRefusal {
  error?: string;
  /** The teammate isn't unlocked for this caller: the error is a warm decline to pass on. */
  declined?: boolean;
}

/**
 * The handoff_failed message for a refused tap, and what the agent says about it.
 *
 * A tap on a locked teammate was refused with a warm decline that went only into
 * handoff_failed.error, which the app read out to screen readers and nowhere else; the
 * agent said nothing. On dev 2026-10-11 the owner tapped Nayan and Jordan and nothing
 * visible or audible happened. A decline now goes to the caller twice: as userMessage,
 * which the app shows, and as the line the agent speaks. Other failures (a handoff
 * already running, "Already with ferni") stay technical and are neither shown nor said.
 */
export function handoffFailedMessage(
  target: string,
  refusal: HandoffRefusal,
  rollbackTo: string | null | undefined
): { message: Record<string, unknown>; say?: string } {
  const decline = refusal.declined && refusal.error ? refusal.error : undefined;
  return {
    message: {
      type: 'handoff_failed',
      // The tap's target came from the browser: send back only an id we know
      target: knownHandoffTarget(target) ?? 'unknown',
      error: refusal.error,
      ...(decline ? { userMessage: decline } : {}),
      rollbackTo,
      timestamp: Date.now(),
    },
    ...(decline ? { say: decline } : {}),
  };
}

/**
 * The canonical persona id a tap's target names, or null. The target is whatever the
 * browser sent: nothing of it goes into a reply, a spoken line or a UI message unless
 * it maps to a persona we know.
 */
export function knownHandoffTarget(raw: unknown): string | null {
  if (typeof raw !== 'string' || !isKnownPersona(raw.trim())) return null;
  return getCanonicalPersonaId(raw.trim());
}

/** Shown (never said) when a tap names no persona we know; fixed words, nothing echoed. */
export const UNKNOWN_TARGET_MESSAGE = "Couldn't tell who that was. Try tapping them again?";

/** The handoff_failed for a tap whose target is no persona we know. */
export function unknownTargetFailedMessage(
  rollbackTo: string | null | undefined
): Record<string, unknown> {
  return {
    type: 'handoff_failed',
    target: 'unknown',
    error: 'Unknown persona',
    userMessage: UNKNOWN_TARGET_MESSAGE,
    rollbackTo,
    timestamp: Date.now(),
  };
}
