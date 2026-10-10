/**
 * On-behalf call lifecycle, run inside the agent job that places the call.
 *
 * The dispatch payload carries everything needed to report back (requester,
 * contact, purpose), so the job that heard the call also closes it: when the
 * call starts it opens a transcript, and when the session ends, on any exit
 * path, it reports the outcome to the requester exactly once through
 * captureCallResult (live session, push, email, While You Were Away).
 *
 * The outcome rules are pure and exported for tests; transcript access, the
 * LLM analysis and delivery are injected ports.
 *
 * @module agents/outbound-call/on-behalf-call-lifecycle
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { CallOutcome, OnBehalfCallRequest } from '../../tools/domains/telephony/types.js';
import type {
  CallTranscriptTurn,
  SuperhumanCallResult,
} from '../../services/outreach/call-transcript-intelligence.js';
import {
  onBehalfRequestFromDispatch,
  type OnBehalfDispatch,
} from '../../services/outreach/on-behalf-dispatch.js';
import { screenedCallerText } from '../../services/outreach/caller-text.js';
import { isCallFollowthroughEnabled } from '../../services/outreach/call-retry.js';

const log = createLogger({ module: 'on-behalf-call-lifecycle' });

export interface CallLifecyclePorts {
  /** The turns captured so far, or null when capture never started. */
  readTranscript: (callId: string) => CallTranscriptTurn[] | null;
  analyze: (
    callId: string,
    durationSeconds: number,
    purpose: string,
    userName: string
  ) => Promise<SuperhumanCallResult | null>;
  report: (callId: string, outcome: CallOutcome, request: OnBehalfCallRequest) => Promise<void>;
  /** Schedules the one next-day retry of a missed call (CALL_FOLLOWTHROUGH); null if none. */
  scheduleRetry?: (call: OnBehalfDispatch) => Promise<Date | null>;
  /** Puts the number on the do-not-call list when the person asks not to be called again. */
  recordOptOut?: (call: OnBehalfDispatch) => Promise<unknown>;
}

export const toOnBehalfCallRequest = onBehalfRequestFromDispatch;

/** Phrases from voicemail greetings. */
const VOICEMAIL_CUES =
  /\b(leave (me )?a message|after the (tone|beep)|voice ?mail|mailbox|record your message|can't come to the phone|not available right now)\b/i;
/** The person asked not to be called again: never retried, and the number is put on the do-not-call list. */
const OPT_OUT_CUES =
  /\b((don'?t|do not|never) (ever )?call (me|us|here|this number)( again)?|stop calling|do not call|(remove|take) (me|us|this number) off)\b/i;
/** The person said no: never retried. */
const DECLINE_CUES = /\b(not interested|wrong number|no thank(s| you)|leave me alone)\b/i;
/** A real conversation has at least two replies from the person and lasts a little while. */
const MIN_REPLIES = 2;
const MIN_TALK_SECONDS = 20;

/**
 * How a call the person picked up went, from what they said. A voicemail
 * greeting is one or two "replies"; fewer than two replies, or a very short
 * call, means they hung up before Ferni really got to talk with them.
 */
export function classifyAnsweredCall(
  heard: string[],
  durationSeconds: number
): 'opted_out' | 'declined' | 'voicemail' | 'hung_up_early' | 'answered' {
  // A person saying no outranks anything that looks like a voicemail greeting.
  if (heard.some((h) => OPT_OUT_CUES.test(h))) return 'opted_out';
  if (heard.some((h) => DECLINE_CUES.test(h))) return 'declined';
  if (heard.length <= 2 && heard.some((h) => VOICEMAIL_CUES.test(h))) return 'voicemail';
  if (heard.length < MIN_REPLIES || durationSeconds < MIN_TALK_SECONDS) return 'hung_up_early';
  return 'answered';
}

/**
 * What the requester is told. `turns` is the raw transcript (null if capture
 * never started); `analysis` is the LLM's read of it (null if that failed).
 * Everything that came from the call (the other person's words and the model's
 * read of them) is untrusted and goes through screenedCallerText before it
 * reaches the requester's prompt, push, email or calendar.
 */
export function buildCallOutcome(
  call: OnBehalfDispatch,
  turns: CallTranscriptTurn[] | null,
  analysis: SuperhumanCallResult | null,
  durationSeconds = Infinity
): CallOutcome {
  const name = call.contact.name;
  if (turns === null) {
    return {
      callId: call.callId,
      status: 'failed',
      objectiveAchieved: false,
      outcome: `I called ${name}, but something went wrong on my end and I lost track of how it went. Want me to try again?`,
      callbackRequired: true,
    };
  }

  const heard = turns.filter((t) => t.role === 'recipient').map((t) => t.content);
  if (heard.length === 0) {
    return {
      callId: call.callId,
      status: 'no_answer',
      objectiveAchieved: false,
      outcome: `I called ${name} but couldn't reach them. Want me to try again later?`,
      callbackRequired: true,
    };
  }

  const quote = screenedCallerText(heard.slice(-2).join(' '), name, 200);
  if (isCallFollowthroughEnabled()) {
    const how = classifyAnsweredCall(heard, durationSeconds);
    if (how === 'voicemail') {
      return {
        callId: call.callId,
        status: 'voicemail',
        objectiveAchieved: false,
        outcome: `I got ${name}'s voicemail. Want me to try again later?`,
        callbackRequired: true,
      };
    }
    if (how === 'opted_out' || how === 'declined') {
      const promise =
        how === 'opted_out' ? " and asked not to be called again, so I won't call them" : '';
      return {
        callId: call.callId,
        status: 'completed',
        objectiveAchieved: false,
        outcome: `I reached ${name}, but they didn't want to talk${promise}.`,
      };
    }
    if (how === 'hung_up_early') {
      return {
        callId: call.callId,
        status: 'completed',
        objectiveAchieved: false,
        outcome: `I reached ${name}, but they had to go before we really got to talk. They said: "${quote}"`,
        transcriptSummary: screenedCallerText(heard.join(' '), name, 600),
      };
    }
  }

  if (!analysis) {
    return {
      callId: call.callId,
      status: 'completed',
      objectiveAchieved: false,
      outcome: `I talked with ${name}. I couldn't put together a proper summary, but the last thing they said was: "${quote}"`,
      transcriptSummary: screenedCallerText(heard.join(' '), name, 600),
    };
  }

  const { insights, friendlyReport } = analysis;
  const clean = (items: string[] | undefined) =>
    (items ?? []).map((item) => screenedCallerText(item, name, 200)).filter(Boolean);
  const actionItems = [
    ...clean(insights.messagesForUser).map((m) => `${name} said: ${m}`),
    ...clean(insights.actionItems),
  ];
  return {
    callId: call.callId,
    status: 'completed',
    objectiveAchieved: insights.objectiveAchieved,
    outcome: screenedCallerText(friendlyReport || insights.summary, name, 500),
    transcriptSummary: screenedCallerText(insights.detailedSummary || insights.summary, name, 600),
    callbackRequired: insights.callbackRequested,
    callbackTime: screenedCallerText(insights.callbackDetails, name, 100) || undefined,
    actionItems: actionItems.length > 0 ? actionItems : undefined,
  };
}

/** Start capturing the call's transcript. Call once the outbound context is set. */
export async function beginOnBehalfCall(sessionId: string, call: OnBehalfDispatch): Promise<void> {
  const { initializeTranscriptCapture } =
    await import('../../services/outreach/call-transcript-intelligence.js');
  const { initializeOnBehalfCapture } =
    await import('../integrations/on-behalf-transcript-capture.js');

  initializeTranscriptCapture(call.callId, call.contact.name, call.contact.relationship);
  if (!initializeOnBehalfCapture(sessionId)) {
    log.warn({ sessionId, callId: call.callId }, 'No outbound context; turns will not be captured');
  }
}

async function defaultPorts(): Promise<CallLifecyclePorts> {
  const transcripts = await import('../../services/outreach/call-transcript-intelligence.js');
  const { captureCallResult } = await import('../../services/outreach/call-result-capture.js');
  const { scheduleCallRetry, recordCallOptOut } =
    await import('../../services/outreach/call-retry.js');
  return {
    readTranscript: (callId) => transcripts.getActiveTranscript(callId)?.turns.slice() ?? null,
    analyze: transcripts.analyzeCompletedCall,
    report: captureCallResult,
    scheduleRetry: (call) => scheduleCallRetry(call),
    recordOptOut: (call) =>
      recordCallOptOut(call.contact.phone, {
        callId: call.callId,
        requesterUserId: call.requester.userId,
      }),
  };
}

const reportedCalls = new Set<string>();

/**
 * Report the finished call to the requester. `trusted` says the dispatch was
 * signed by our server (verifyOnBehalfDispatch); a forged one never reports
 * and never touches state belonging to the callId it names.
 * Safe to call from every session exit path: only the first call for a callId
 * reports. Never throws.
 */
export async function completeOnBehalfCall(
  sessionId: string,
  call: OnBehalfDispatch,
  durationSeconds: number,
  trusted: boolean,
  ports?: CallLifecyclePorts
): Promise<CallOutcome | null> {
  // An unsigned dispatch names a callId someone else chose: touch nothing keyed
  // by it (another call's report guard or transcript), only this session.
  if (!trusted) {
    log.warn(
      { callId: call.callId, requesterUserId: call.requester.userId },
      'Unsigned on-behalf dispatch; not reporting to the named requester'
    );
    const { cleanupOnBehalfCapture } =
      await import('../integrations/on-behalf-transcript-capture.js');
    cleanupOnBehalfCapture(sessionId);
    return null;
  }
  if (reportedCalls.has(call.callId)) return null;
  reportedCalls.add(call.callId);

  try {
    const { readTranscript, analyze, report, scheduleRetry, recordOptOut } =
      ports ?? (await defaultPorts());
    const turns = readTranscript(call.callId);
    const heard = turns?.filter((t) => t.role === 'recipient').map((t) => t.content) ?? [];
    const talked =
      heard.length > 0 &&
      (!isCallFollowthroughEnabled() ||
        classifyAnsweredCall(heard, durationSeconds) === 'answered');
    let analysis: SuperhumanCallResult | null = null;
    if (talked) {
      analysis = await analyze(
        call.callId,
        durationSeconds,
        call.purpose,
        call.requester.name
      ).catch((error: unknown) => {
        log.warn(
          { error: String(error), callId: call.callId },
          'Call analysis failed; reporting raw'
        );
        return null;
      });
    }

    const request = toOnBehalfCallRequest(call);
    let outcome = buildCallOutcome(call, turns, analysis, durationSeconds);
    const followthrough = isCallFollowthroughEnabled();
    if (followthrough && classifyAnsweredCall(heard, durationSeconds) === 'opted_out') {
      await recordOptOut?.(call);
    }
    // Only a call nobody answered, or that reached voicemail, is retried.
    const missed = outcome.status === 'no_answer' || outcome.status === 'voicemail';
    if (followthrough && missed && scheduleRetry) {
      const retryAt = await scheduleRetry(call);
      if (retryAt) {
        const what =
          outcome.status === 'voicemail'
            ? `got ${call.contact.name}'s voicemail`
            : `couldn't reach ${call.contact.name}`;
        outcome = {
          ...outcome,
          outcome: `I ${what}, so I'll try again tomorrow.`,
          callbackRequired: false,
        };
      }
    }
    await report(call.callId, outcome, request);
    log.info(
      { callId: call.callId, status: outcome.status, objectiveAchieved: outcome.objectiveAchieved },
      'On-behalf call reported to requester'
    );
    return outcome;
  } catch (error) {
    log.error({ error: String(error), callId: call.callId }, 'Failed to report on-behalf call');
    return null;
  } finally {
    const { cleanupOnBehalfCapture } =
      await import('../integrations/on-behalf-transcript-capture.js');
    const transcripts = await import('../../services/outreach/call-transcript-intelligence.js');
    cleanupOnBehalfCapture(sessionId);
    if (transcripts.hasActiveTranscript(call.callId))
      transcripts.finalizeTranscript(call.callId, durationSeconds);
  }
}
