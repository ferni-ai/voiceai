/**
 * After a call by a friends-and-family cohort member, Ferni texts them one
 * question, so their reactions to a call become data instead of anecdotes.
 *
 * Runs as an after-call task (registered in after-call-checkin-register.ts)
 * only when the agent has COHORT_FLAGS=on and the caller's own cohort flags
 * (read from Firestore) have POST_CALL_CHECKIN=on. Each check-in is written to
 * feature_checkins/{id}. Replies and opt-outs are handled in checkin-replies.ts;
 * no check-in goes to a phone that opted out.
 *
 * Firestore, the caller's flags, the Firebase Auth lookup and SMS sending are
 * injected so the logic is testable without a network.
 *
 * @module services/outreach/after-call-checkin
 */
import { createLogger } from '../../utils/safe-logger.js';
import { isMemberIdentity } from '../identity/member-identity.js';
import { cohortFlagsEnabled, resolveCallerFlags } from '../platform/cohort-flags.js';
import type { AfterCallContext } from '../session/after-call-tasks.js';
import {
  defaultTextDeps,
  firestoreTextStore,
  sendGuardedText,
  type TextDeps,
  type TextSkip,
  type TextStore,
} from './guarded-text.js';

// Moved to guarded-text.ts, the one path every member text takes; re-exported for existing importers.
export {
  lastSentAt,
  recordUserId,
  redactNumbers,
  resolveCheckinPhone,
  smsTurnedOff,
} from './guarded-text.js';

const log = createLogger({ module: 'after-call-checkin' });

export const CHECKIN_QUESTION =
  "It's Ferni. Did that call feel like talking with someone who knows you? Anything feel off? Just reply here, I read every one.";
export const MIN_USER_TURNS = 4;
export const RATE_LIMIT_MS = 20 * 60 * 60 * 1000;

export type SkipReason =
  | 'not-member-call'
  | 'short-call'
  | 'recently-sent'
  | 'no-verified-phone'
  | 'sms-off'
  | 'opted-out';
export type CheckinDecision = { send: true; phone: string } | { send: false; reason: SkipReason };

export type CheckinStore = TextStore;

export interface CheckinDeps extends TextDeps {
  resolveFlags: (userId: string) => Promise<Record<string, string>>;
}

export interface CheckinOutcome {
  sent: boolean;
  reason?: SkipReason | 'gate-off' | 'flag-off' | TextSkip;
}

/** Calls placed on someone's behalf, or with no known person, are not the member's own call. */
export function isMemberCall(userId: string): boolean {
  return isMemberIdentity(userId);
}

/** The skip reasons that need no reads: whose call it was and how long it ran. */
export function callerSkipReason(userId: string, userTurns: number): SkipReason | null {
  if (!isMemberCall(userId)) return 'not-member-call';
  if (userTurns < MIN_USER_TURNS) return 'short-call';
  return null;
}

/** Whether to text this person, given everything known about the call. */
export function decideCheckin(input: {
  userId: string;
  userTurns: number;
  lastSentAt: Date | null;
  phone: string | undefined;
  now: Date;
}): CheckinDecision {
  const early = callerSkipReason(input.userId, input.userTurns);
  if (early) return { send: false, reason: early };
  const recent =
    input.lastSentAt !== null && input.now.getTime() - input.lastSentAt.getTime() < RATE_LIMIT_MS;
  if (recent) return { send: false, reason: 'recently-sent' };
  if (!input.phone) return { send: false, reason: 'no-verified-phone' };
  return { send: true, phone: input.phone };
}

/**
 * The after-call task: the check-in's own gates (whose call, how long, the
 * caller's POST_CALL_CHECKIN), then the guarded send every member text takes.
 * Never reads POST_CALL_CHECKIN from process.env.
 */
export async function runAfterCallCheckin(
  ctx: AfterCallContext,
  deps: CheckinDeps = defaultDeps()
): Promise<CheckinOutcome> {
  if (!cohortFlagsEnabled(deps.env)) return { sent: false, reason: 'gate-off' };
  const userTurns = ctx.turns.filter((t) => t.role === 'user').length;
  const early = callerSkipReason(ctx.userId, userTurns);
  if (early) return { sent: false, reason: early };

  // Read the flag from Firestore, not process.env: by now the next call may have replaced env with another caller's flags.
  const flags = await deps.resolveFlags(ctx.userId);
  if (flags.POST_CALL_CHECKIN !== 'on') return { sent: false, reason: 'flag-off' };

  const outcome = await sendGuardedText(
    {
      userId: ctx.userId,
      body: CHECKIN_QUESTION,
      kind: 'checkin',
      refId: ctx.sessionId,
      minGapMs: RATE_LIMIT_MS,
    },
    deps
  );
  if (outcome.sent) return { sent: true };
  const { reason } = outcome;
  log.info({ sessionId: ctx.sessionId, reason }, 'Check-in text not sent');
  return { sent: false, reason };
}

export const firestoreCheckinStore: CheckinStore = firestoreTextStore;

function defaultDeps(): CheckinDeps {
  return { ...defaultTextDeps(), resolveFlags: async (userId) => resolveCallerFlags(userId) };
}
