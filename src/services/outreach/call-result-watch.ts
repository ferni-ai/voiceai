/**
 * CALL_RESULT_LIVE_REPORT across workers: the owner's call watches the call it
 * placed, so the owner hears "Your mom picked up, she said ..." whichever
 * worker captures the result.
 *
 * Audit 2026-10-29 (outreach memory, section C): the result is captured in
 * the outbound call's job, which LiveKit Cloud may run in another process or
 * pod (AGENT_JOB_EXECUTOR=process is one process per job). There
 * reportCallResultLive finds no live owner call (live-session.ts is per
 * process) and the owner heard nothing until a later call's opener.
 *
 * When callOnBehalf places a call from a live call (placeOrHold in
 * deferred-calls.ts), that call, in its own worker, reads the call record,
 * bogle_users/{uid}/on_behalf_calls/{callId}, every POLL_MS until it holds
 * a result, then tells it through the same path
 * as the in-process report (call-result-live.ts tellLiveOnce: the claim on
 * `liveReport`, the crisis hold, the alert speaker, the guarded wording). A
 * poll, not a listener: nothing in the agent holds Firestore listeners, and
 * one read every few seconds of one document, for one call, is cheap.
 *
 * It stops on the result, when the owner's call ends (its closing signal, or
 * it is no longer the live call under that id), after MAX_WATCH_MS, or on
 * stop(). Never throws.
 *
 * @module services/outreach/call-result-watch
 */
import { createLogger } from '../../utils/safe-logger.js';
import { liveSessionFor } from '../../tools/registry/live-session.js';
import { isMemberIdentity } from '../identity/member-identity.js';
import { callResultLiveReportOn, reportableOutcome, tellLiveOnce } from './call-result-live.js';
import type { reportCallResultLive } from './call-result-live.js';

/** The placed call's request, as the live report takes it. */
type OnBehalfCallRequest = Parameters<typeof reportCallResultLive>[0];

const log = createLogger({ module: 'call-result-watch' });

/** How often the call record is read. */
const POLL_MS = 5000;
/** Longest a placed call is watched: a call rings, talks and is captured well within it. */
const MAX_WATCH_MS = 30 * 60 * 1000;

interface WatchDeps {
  /** The stored call record (getCallResult), or null. */
  readCall: (userId: string, callId: string) => Promise<unknown>;
  pollMs: number;
  maxMs: number;
}

const defaultDeps: WatchDeps = {
  readCall: async (userId, callId) =>
    (await import('./call-result-capture.js')).getCallResult(callId, userId),
  pollMs: POLL_MS,
  maxMs: MAX_WATCH_MS,
};

/**
 * Start watching a call the owner's live call just placed. Returns stop, or null
 * when nothing started: the flag is off, no call id or member, or the call that
 * placed it is not live in this process (only the owner's own call watches).
 */
export function watchCallResult(
  request: OnBehalfCallRequest,
  callId: string | undefined,
  overrides: Partial<WatchDeps> = {}
): (() => void) | null {
  try {
    if (!callResultLiveReportOn()) return null;
    const { userId, originalSessionId: sessionId } = request;
    const session = liveSessionFor(sessionId);
    if (!callId || !session || !isMemberIdentity(userId?.trim())) return null;
    const deps = { ...defaultDeps, ...overrides };
    const closing = (session as { _closingSignal?: AbortSignal } | undefined)?._closingSignal;
    let stopped = false;
    let poll: ReturnType<typeof setTimeout> | undefined;

    const stop = (reason: string): void => {
      if (stopped) return;
      stopped = true;
      clearTimeout(poll);
      clearTimeout(deadline);
      closing?.removeEventListener('abort', onEnd);
      log.info({ callId, reason }, 'CALL_RESULT_WATCH_STOPPED');
    };
    const onEnd = (): void => stop('session_end');
    const fail = (error: unknown): void => {
      log.warn({ callId, error: String(error) }, 'CALL_RESULT_WATCH failed');
      stop('error');
    };
    const next = (): void => {
      poll = setTimeout(() => void tick().catch((error: unknown) => fail(error)), deps.pollMs);
      poll.unref?.();
    };
    const tick = async (): Promise<void> => {
      if (stopped) return;
      if (liveSessionFor(sessionId) !== session) return stop('session_end');
      const stored = await deps.readCall(userId, callId).catch(() => null);
      if (stopped) return;
      const outcome = reportableOutcome(stored);
      if (!outcome) return next();
      stop('result');
      const contactName = request.resolvedContact?.name || request.contactQuery;
      const told = await tellLiveOnce({ session, sessionId, userId, contactName, outcome });
      log.info({ callId, told }, 'CALL_RESULT_LIVE_REPORT (watch)');
    };

    const deadline = setTimeout(() => stop('timeout'), deps.maxMs);
    deadline.unref?.();
    closing?.addEventListener('abort', onEnd);
    if (closing?.aborted) onEnd();
    else next();
    log.info({ callId }, 'CALL_RESULT_WATCH_STARTED');
    return () => stop('stopped');
  } catch (error) {
    log.warn({ callId, error: String(error) }, 'CALL_RESULT_WATCH not started');
    return null;
  }
}
