/**
 * CALL_LIVE_RELAY: while a call Ferni placed for the owner is going, the
 * owner's live call hears how it is going, the way a friend would say it:
 * "They picked up, I'm talking to Priya now." / "Went to voicemail, I'm leaving
 * a message." No callee words: the contact is named only by what the owner gave.
 *
 * One writer, one reader. The placed call's own job notes the progress on the
 * call record, bogle_users/{uid}/on_behalf_calls/{callId} as `progress.<kind>At`,
 * when its line screen or AMD hears a person or a machine (noteCallProgress).
 * The owner's call, in whatever worker, already reads that record every few
 * seconds for the result (call-result-watch.ts). Until a result is there it
 * tells each kind noted once (relayProgress), claimed on `progress.<kind>Told`
 * the way the end report claims `liveReport` (live-report-record.ts), so two
 * workers never both say it. It goes through the same alert speaker, at a pause,
 * never mid-sentence; on crisis risk it is dropped, not held: a late "they
 * picked up" helps nobody.
 *
 * A call that ends unanswered (no answer, busy, failed) gets no line here: the
 * end-of-call report already says "No answer: ..." once, at that moment. Once a
 * result is on the record, progress is no longer told: not claimed once the
 * result is stored, and dropped at the pause once the watch has seen it.
 *
 * Only with CALL_RESULT_LIVE_REPORT on too. Off: nothing written or said.
 * Never throws. Logs carry the call id, the kind and booleans only.
 *
 * @module services/outreach/call-progress
 */
import { createLogger } from '../../utils/safe-logger.js';
import { triggerVoiceCallback } from '../../tools/domains/simple-utilities/voice-callbacks.js';
import { isMemberIdentity } from '../identity/member-identity.js';
import { crisisRiskThisCall } from '../safety/index.js';
import { callerText } from './caller-text.js';
import { callLiveRelayOn, reportableOutcome } from './call-result-live.js';
import { claimOnCallDoc } from './live-report-record.js';

const log = createLogger({ module: 'call-progress' });

export type ProgressKind = 'answered' | 'voicemail';
const KINDS: readonly ProgressKind[] = ['answered', 'voicemail'];

/**
 * The placed call's job (its session id) heard who answered: note it on the call
 * record. Only for an on-behalf call with a signed requester. Never throws.
 */
export async function noteCallProgress(sessionId: string, kind: ProgressKind): Promise<void> {
  if (!callLiveRelayOn()) return;
  let callId: string | undefined;
  try {
    const { getOutboundCallContext } =
      await import('../../intelligence/context-builders/external/outbound-call-context.js');
    const call = getOutboundCallContext(sessionId);
    const userId = call?.requesterUserId?.trim();
    callId = call?.callId;
    if (!callId || call?.kind !== 'on_behalf' || !isMemberIdentity(userId)) return;
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) return; // no record to watch: the end-of-call report still tells it
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('on_behalf_calls')
      .doc(callId)
      .set({ progress: { [`${kind}At`]: new Date().toISOString() } }, { merge: true });
    log.info({ callId, kind }, 'CALL_PROGRESS noted');
  } catch (error) {
    log.warn({ callId, kind, error: String(error) }, 'CALL_PROGRESS not noted');
  }
}

/** The kinds noted on a stored call record, in the order they happen. */
export function progressOf(stored: unknown): ProgressKind[] {
  const progress = (stored as { progress?: Record<string, unknown> } | null | undefined)?.progress;
  return KINDS.filter((kind) => typeof progress?.[`${kind}At`] === 'string');
}

/** What Ferni is asked to say: the facts and a short line, never anything the callee said. */
export function progressMessage(kind: ProgressKind, contactName: string): string {
  const name = callerText(contactName, 60) || 'them';
  return kind === 'answered'
    ? `${name} picked up the call you placed for them, and you are talking with them now. ` +
        `One short line, like "They picked up, I'm talking to ${name} now."`
    : `the call you placed for them to ${name} went to voicemail, and you are leaving a ` +
        `message. One short line, like "Went to voicemail, I'm leaving a message."`;
}

/** The owner's live call, as its watch knows it. */
export interface WatchedCall {
  session: object;
  sessionId: string;
  userId: string;
  callId: string;
  contactName: string;
  /** True once the watch has seen the result: a line not yet said is then dropped. */
  resultSeen: () => boolean;
}

/** The owner's watch, before a result is stored: each noted kind is told once. Never throws. */
export async function relayProgress(call: WatchedCall, stored: unknown): Promise<void> {
  for (const kind of progressOf(stored)) {
    // eslint-disable-next-line no-await-in-loop -- in the order they happened
    await tellProgressOnce(call, kind);
  }
}

async function tellProgressOnce(call: WatchedCall, kind: ProgressKind): Promise<void> {
  const { session, sessionId, userId, callId } = call;
  try {
    const field = `${kind}Told`;
    const taken = (data: Record<string, unknown> | undefined): boolean =>
      (data?.progress as Record<string, unknown> | undefined)?.[field] !== undefined ||
      reportableOutcome(data) !== null;
    if (!(await claimOnCallDoc(userId, callId, `progress.${field}`, taken, 'CALL_PROGRESS'))) {
      return;
    }
    const crisis = (): boolean => crisisRiskThisCall(sessionId);
    // Held (dropped) at the pause on crisis risk, or once the result is told instead.
    const held = (): boolean => crisis() || call.resultSeen();
    if (crisis()) {
      log.info({ callId, kind, crisis: true }, 'CALL_PROGRESS dropped');
      return;
    }
    // The speaker waits for a pause; the watch goes on polling meanwhile.
    void triggerVoiceCallback({
      type: 'call_progress',
      userId,
      message: progressMessage(kind, call.contactName),
      priority: 'normal',
      session,
      holdIf: held,
    })
      .then((handed) => log.info({ callId, kind, handed }, 'CALL_PROGRESS'))
      .catch((error: unknown) => notTold(callId, kind, error));
  } catch (error) {
    notTold(callId, kind, error);
  }
}

function notTold(callId: string, kind: ProgressKind, error: unknown): void {
  log.warn({ callId, kind, error: String(error) }, 'CALL_PROGRESS not told');
}
