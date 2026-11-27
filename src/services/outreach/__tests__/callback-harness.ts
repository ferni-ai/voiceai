/**
 * Shared by callback-means-asked.test.ts and callback-wording.test.ts: Sam (user), Linda
 * (called), the real capture and read paths, and the reset each row starts from. A suite
 * mocks Firestore, push, texts, the calendar and the saved zone, then calls
 * useCallbackHarness with those fakes; this module is imported after the mocks.
 */
import { afterEach, beforeEach, vi } from 'vitest';
import type { EmailSendResult, EmailSender, OutgoingEmail } from '../../../types/email-sender.js';
import type { CallOutcome } from '../../../tools/domains/telephony/types.js';
import type { CallTranscriptTurn, SuperhumanCallResult } from '../call-transcript-intelligence.js';
import { setEmailSenderForTests } from '../../email-transport/index.js';
import { captureCallResult } from '../call-result-capture.js';
import { resetToldClaimsForTests } from '../call-result-claims.js';
import { liveReportMessage } from '../call-result-live.js';
import { spokenOutcome } from '../../background-agents/call-follow-up/index.js';
import { toOnBehalfCallRequest } from '../../../agents/outbound-call/on-behalf-call-lifecycle.js';
import { twilioStatusToOutcome } from '../../../servers/api/routes/twilio-call-status.js';
import { buildOnBehalfDispatch } from '../on-behalf-dispatch.js';
import {
  buildAllPendingResultsContext,
  buildPendingCallResultsContext,
} from '../../../intelligence/context-builders/external/pending-call-results.js';
import { callReportInjection } from '../../../intelligence/context-builders/external/call-report.js';

export const NOW = new Date('2026-11-26T20:00:00Z'); // 12:00 in Los Angeles
export const LINDA = 'Linda';
/** Every way a report puts a call back in Linda's mouth: main's words, and the email's. */
export const SAID_SHE_ASKED =
  /they(?: want| mentioned wanting|'d like you to) (?:a )?call ?back|asked you to call (?:\w+ )?back/i;
/** The retry offer by name (live, next call, the copy) and by her saved relationship (email). */
export const OFFER = `Want me to try again later, or would you rather call ${LINDA} yourself?`;
export const OFFER_HER = 'Want me to try her again later, or would you rather call her yourself?';
/** Either offer's choice, which every report gives at most once. */
export const CHOICE = /would you rather call (?:her|Linda) yourself/;
export const TRY = /\btry (?:her )?again\b/;
/** Main's "them" for the person called ("couldn't reach them", "call them yourself"). */
export const THEM = /(?:reach|call) them\b/i;
/** A friend's hand-back for a call Linda (saved as Sam's mother) picked up and said no to. */
export const HANDED_BACK = `I got hold of ${LINDA}, but it wasn't a good time for her. She might like hearing from you directly.`; // prettier-ignore
export const NOBODY = /nobody/i; // a retry offer never claims what nobody said
export const count = (text: string, re: RegExp): number =>
  text.match(new RegExp(re, 'gi'))?.length ?? 0;

interface Fakes {
  store: { docs: Map<string, Record<string, unknown>> };
  calendar: { createEvent: { mock: { calls: Array<[string, { startTime: Date }]> }; mockClear: () => void } }; // prettier-ignore
  saved: { zone: string | undefined };
}

export const send = vi.fn(async (_e: OutgoingEmail): Promise<EmailSendResult> => ({ ok: true, provider: 'gmail', messageId: 'gm-1' })); // prettier-ignore
const fakeGmail: EmailSender = { provider: 'gmail', isConfigured: () => true, send };

export const AGENT_ONLY: CallTranscriptTurn[] = [
  { role: 'agent', content: "Hi, it's Ferni for Sam." },
];
export const TALKED: CallTranscriptTurn[] = [
  ...AGENT_ONLY,
  { role: 'recipient', content: 'Oh hi. Have Sam call me tonight.' },
];

export function lindaAsked(): SuperhumanCallResult {
  return {
    transcript: { callId: 'c', contactName: LINDA, turns: TALKED, duration: 60, capturedAt: '' },
    friendlyReport: 'Linda was glad to hear from Sam.',
    insights: {
      summary: 'Linda was glad to hear from Sam.',
      detailedSummary: 'Linda was glad to hear from Sam and would like a call tonight.',
      keyPoints: [],
      emotionalTone: { recipientMood: 'happy', overallSentiment: 'positive', notableEmotions: [] },
      actionItems: [],
      messagesForUser: [],
      callbackRequested: true,
      callbackDetails: 'tonight',
      relationshipSignals: [],
      topicsMentioned: [],
      objectiveAchieved: false,
      callQuality: 'good',
    },
  };
}

export type Payload = Parameters<typeof twilioStatusToOutcome>[0];
export type Pending = Parameters<typeof twilioStatusToOutcome>[1];

/** The row helpers over a suite's fakes; also registers the reset every row starts from. */
export function useCallbackHarness({ store, calendar, saved }: Fakes) {
  let seq = 0;
  function placed(timezone = 'America/Los_Angeles') {
    const userId = `u-sam-${++seq}`;
    store.docs.set(`bogle_users/${userId}`, { email: 'sam.example@example.com' });
    const call = buildOnBehalfDispatch({
      callId: `call-${seq}`,
      requester: { userId, name: 'Sam', timezone, originalSessionId: `s-${seq}` },
      contact: { name: LINDA, phone: '+15555550100', relationship: 'mother' },
      purpose: 'check in on her',
      objective: 'check_in',
      callType: 'personal',
    });
    return { call, userId, request: toOnBehalfCallRequest(call) };
  }

  /** What Sam's next call reads from both stores; nothing is marked delivered while reading. */
  async function nextCall(userId: string, tag: string) {
    vi.stubEnv('CALL_REPORT_REACHES_YOU', 'on');
    const next = (await buildPendingCallResultsContext(userId)) ?? '';
    const all = (await buildAllPendingResultsContext(userId)) ?? '';
    const report = await callReportInjection({ userId, sessionId: `next-${tag}`, turnCount: 0, crisis: false, timeoutMs: 1000 }); // prettier-ignore
    vi.stubEnv('CALL_REPORT_REACHES_YOU', 'off');
    return { next, all, report: report?.content ?? '' };
  }

  /** Capture the call and read back everything Sam is told about it. */
  async function toldSam(outcome: CallOutcome, at = placed()) {
    await captureCallResult(outcome.callId, outcome, at.request);
    const email = send.mock.calls.map(([e]) => e.text ?? '').join('\n'); // the html says it again
    // The live report gets the outcome as captureCallResult hands it on.
    const live = liveReportMessage(LINDA, spokenOutcome(outcome, LINDA));
    return { live, email, ...(await nextCall(at.userId, outcome.callId)) };
  }

  const twilio = (fields: Record<string, string>, call = { callId: 'tw-1', contactName: LINDA }) =>
    twilioStatusToOutcome({ CallSid: 'CA-1', To: '+15555550100', Direction: 'outbound-api', ...fields } as Payload, call as Pending); // prettier-ignore

  const eventStarts = (): string[] =>
    calendar.createEvent.mock.calls.map(([, event]) => event.startTime.toISOString());

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    store.docs.clear();
    resetToldClaimsForTests();
    send.mockClear();
    calendar.createEvent.mockClear();
    setEmailSenderForTests(fakeGmail);
    saved.zone = 'America/Los_Angeles';
    vi.stubEnv('CALLBACK_MEANS_ASKED', 'on');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    setEmailSenderForTests(null);
  });

  return { placed, nextCall, toldSam, twilio, eventStarts };
}

export type Call = ReturnType<ReturnType<typeof useCallbackHarness>['placed']>['call'];
