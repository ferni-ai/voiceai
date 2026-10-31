/**
 * "Ferni can reach out" off (How I reach you, POST /api/outreach/pause): what it stops.
 *
 * Seth, 2026-10-25: off pauses check-ins and anything Ferni starts on its own. Reminders the
 * person set, calls they asked for or scheduled, and anything asked for just now still come
 * through. Texts: sendGuardedText (`askedNow`, `personSet`). Calls: callWithPersonaVoice
 * (`askedFor`) and scheduleProactiveCall (their own "call me", or a deferral of one). Someone
 * else's number is not theirs to pause, and an unreadable record pauses nothing, so a member
 * who hasn't paused gets exactly what they got before.
 *
 * @module services/outreach/outreach-pause
 */
import { createLogger } from '../../utils/safe-logger.js';
import { isOwnCallMe } from './held-call.js';

const log = createLogger({ module: 'outreach-pause' });

/** Outreach is off and `phone` is the member's own verified number. */
export async function outreachPausedFor(
  userId: string | undefined,
  phone: string,
  deps?: Pick<import('./guarded-text.js').TextDeps, 'store' | 'authPhone'>
): Promise<boolean> {
  if (!userId || userId.startsWith('sponsored_')) return false;
  const { defaultTextDeps, isOwnVerifiedPhone } = await import('./guarded-text.js');
  const d = deps ?? defaultTextDeps();
  const doc = await Promise.resolve()
    .then(() => d.store.userDoc(userId))
    .catch(() => undefined);
  const prefs = (doc?.outreachPreferences ?? {}) as { enabled?: unknown };
  if (prefs.enabled !== false) return false;
  return isOwnVerifiedPhone(userId, phone, d).catch(() => false);
}

/** Outreach is off for this member (any channel): Ferni's own scheduled outreach waits. */
export async function outreachPaused(userId: string, what: string): Promise<boolean> {
  const { readOutreachConsent } = await import('./outreach-consent.js');
  const enabled = await readOutreachConsent(userId).then(
    (c) => c.enabled,
    () => true
  );
  if (!enabled) log.info({ what }, 'Outreach paused: not sent');
  return !enabled;
}

interface CallAsk {
  userId: string;
  phoneNumber: string;
  /** Set by code only, never the model: a call they asked for or set. */
  askedFor?: boolean;
}

/** A proactive call that must not ring: Ferni's own, to their number, while paused. */
export async function pausedCall(request: CallAsk): Promise<boolean> {
  if (isOwnCallMe(request) || request.askedFor === true) return false;
  return outreachPausedFor(request.userId, request.phoneNumber);
}

/** The request a call-hours deferral saves: their own "call me" stays theirs when it rings later. */
export function deferredCallRequest<T extends CallAsk>(request: T & { scheduledFor?: Date }): T {
  return { ...request, scheduledFor: undefined, ...(isOwnCallMe(request) && { askedFor: true }) };
}
