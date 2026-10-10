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
import type { OnBehalfDispatch } from '../../services/outreach/on-behalf-dispatch.js';
import type { CallDisposition } from './call-control.js';

const log = createLogger({ module: 'on-behalf-call-lifecycle' });

export interface CallLifecyclePorts {
  /** How Ferni said the call ended when it hung up itself (see call-control). */
  readDisposition: (callId: string) => CallDisposition | undefined;
  /** The turns captured so far, or null when capture never started. */
  readTranscript: (callId: string) => CallTranscriptTurn[] | null;
  analyze: (
    callId: string,
    durationSeconds: number,
    purpose: string,
    userName: string
  ) => Promise<SuperhumanCallResult | null>;
  report: (callId: string, outcome: CallOutcome, request: OnBehalfCallRequest) => Promise<void>;
}

export function toOnBehalfCallRequest(call: OnBehalfDispatch): OnBehalfCallRequest {
  return {
    contactQuery: call.contact.name,
    resolvedContact: { ...call.contact },
    purpose: call.purpose,
    objective: call.objective,
    callType: call.callType,
    originalSessionId: call.requester.originalSessionId,
    userId: call.requester.userId,
    userTimezone: call.requester.timezone,
    userName: call.requester.name,
    recordingConsent: false,
  };
}

/**
 * What the requester is told. `turns` is the raw transcript (null if capture
 * never started); `analysis` is the LLM's read of it (null if that failed).
 */
export function buildCallOutcome(
  call: OnBehalfDispatch,
  turns: CallTranscriptTurn[] | null,
  analysis: SuperhumanCallResult | null,
  disposition?: CallDisposition
): CallOutcome {
  const name = call.contact.name;
  // What Ferni knew when it hung up beats what the transcript suggests: a
  // voicemail greeting is transcribed as the other side talking.
  if (disposition === 'voicemail_left') {
    return {
      callId: call.callId,
      status: 'voicemail',
      objectiveAchieved: false,
      outcome: `I got ${name}'s voicemail and left a message letting them know you were thinking of them.`,
      callbackRequired: false,
    };
  }
  if (disposition === 'wrong_number') {
    return {
      callId: call.callId,
      status: 'failed',
      objectiveAchieved: false,
      outcome: `The number I have for ${name} reached someone else. Can you double-check it?`,
      callbackRequired: false,
    };
  }
  if (disposition === 'refused') {
    return {
      callId: call.callId,
      status: 'completed',
      objectiveAchieved: false,
      outcome: `${name} picked up but didn't want to talk with me. It might be better coming from you.`,
      callbackRequired: true,
    };
  }
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

  if (!analysis) {
    const quote = heard.slice(-2).join(' ');
    return {
      callId: call.callId,
      status: 'completed',
      objectiveAchieved: false,
      outcome: `I talked with ${name}. I couldn't put together a proper summary, but the last thing they said was: "${quote}"`,
      transcriptSummary: heard.join(' '),
    };
  }

  const { insights, friendlyReport } = analysis;
  const actionItems = [
    ...insights.messagesForUser.map((m) => `${name} said: ${m}`),
    ...insights.actionItems,
  ];
  return {
    callId: call.callId,
    status: 'completed',
    objectiveAchieved: insights.objectiveAchieved,
    outcome: friendlyReport || insights.summary,
    transcriptSummary: insights.detailedSummary || insights.summary,
    callbackRequired: insights.callbackRequested,
    callbackTime: insights.callbackDetails,
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
  const control = await import('./call-control.js');
  return {
    readDisposition: control.takeCallDisposition,
    readTranscript: (callId) => transcripts.getActiveTranscript(callId)?.turns.slice() ?? null,
    analyze: transcripts.analyzeCompletedCall,
    report: captureCallResult,
  };
}

const reportedCalls = new Set<string>();

/**
 * Report the finished call to the requester. `trusted` says the dispatch was
 * signed by our server (verifyOnBehalfDispatch); a forged one never reports.
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
  if (reportedCalls.has(call.callId)) return null;
  reportedCalls.add(call.callId);

  try {
    if (!trusted) {
      log.warn(
        { callId: call.callId, requesterUserId: call.requester.userId },
        'Unsigned on-behalf dispatch; not reporting to the named requester'
      );
      return null;
    }
    const { readDisposition, readTranscript, analyze, report } = ports ?? (await defaultPorts());
    const disposition = readDisposition(call.callId);
    const turns = readTranscript(call.callId);
    let analysis: SuperhumanCallResult | null = null;
    const talked = disposition === undefined || disposition === 'completed';
    if (talked && turns?.some((t) => t.role === 'recipient')) {
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

    const outcome = buildCallOutcome(call, turns, analysis, disposition);
    await report(call.callId, outcome, toOnBehalfCallRequest(call));
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
    const { forgetOnBehalfCallRoom } = await import('./call-control.js');
    forgetOnBehalfCallRoom(sessionId);
    const transcripts = await import('../../services/outreach/call-transcript-intelligence.js');
    cleanupOnBehalfCapture(sessionId);
    if (transcripts.hasActiveTranscript(call.callId))
      transcripts.finalizeTranscript(call.callId, durationSeconds);
  }
}
