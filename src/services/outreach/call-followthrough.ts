/**
 * Call follow-through: closing the loop after Ferni calls someone for the user.
 *
 * When an on-behalf call ends, this works out how it went (a person answered,
 * voicemail, no answer, or they hung up early), writes a short report in
 * Ferni's voice with any message for the user, and stores it through the
 * normal call-result capture. From there the user hears about it when their
 * next session opens and gets an in-app notification.
 *
 * Off unless CALL_FOLLOWTHROUGH=on.
 *
 * @module services/outreach/call-followthrough
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { CallOutcome, OnBehalfCallRequest } from '../../tools/domains/telephony/types.js';
import { parseOnBehalfDispatch } from './on-behalf-dispatch.js';

const log = getLogger().child({ service: 'call-followthrough' });

export type FollowthroughOutcome = 'answered' | 'voicemail' | 'no_answer' | 'hung_up_early';

export interface CallTurn {
  /** 'user' is the person Ferni called; 'assistant' is Ferni. */
  role: string;
  content: string;
}

export interface FollowthroughCall {
  callId: string;
  request: OnBehalfCallRequest;
}

export interface CallReport {
  summary?: string;
  messageForUser?: string | null;
}

export interface FollowthroughDeps {
  summarize?: (prompt: string) => Promise<CallReport | null>;
}

export interface FollowthroughResult {
  outcome: FollowthroughOutcome;
  summary: string;
  messageForUser: string | null;
}

export function isCallFollowthroughEnabled(): boolean {
  return process.env.CALL_FOLLOWTHROUGH === 'on';
}

// ============================================================================
// OUTCOME
// ============================================================================

/** Phrases from voicemail greetings; only checked when the "person" said one or two things. */
const VOICEMAIL_CUES =
  /\b(leave (me )?a message|after the (tone|beep)|voice ?mail|mailbox|record your message|can't come to the phone|not available right now)\b/i;
/** A real conversation has at least two replies from the person and lasts a little while. */
const MIN_REPLIES = 2;
const MIN_ANSWERED_SECONDS = 20;

export function classifyCallOutcome(
  turns: CallTurn[],
  durationSeconds: number
): FollowthroughOutcome {
  const replies = turns.filter((t) => t.role === 'user' && t.content.trim());
  if (replies.length === 0) return 'no_answer';
  if (replies.length <= 2 && replies.some((t) => VOICEMAIL_CUES.test(t.content)))
    return 'voicemail';
  if (replies.length < MIN_REPLIES || durationSeconds < MIN_ANSWERED_SECONDS)
    return 'hung_up_early';
  return 'answered';
}

// ============================================================================
// REPORT IN FERNI'S VOICE
// ============================================================================

const SUMMARY_TIMEOUT_MS = 8000;

function fallbackSummary(outcome: FollowthroughOutcome, name: string): string {
  switch (outcome) {
    case 'answered':
      return `I talked with ${name} for you.`;
    case 'hung_up_early':
      return `I reached ${name}, but they had to go before we really got to talk.`;
    case 'voicemail':
      return `I got ${name}'s voicemail.`;
    case 'no_answer':
      return `I tried ${name}, but they didn't pick up.`;
  }
}

function buildReportPrompt(call: FollowthroughCall, turns: CallTurn[]): string {
  const { request } = call;
  const name = contactName(request);
  const relationship = request.resolvedContact?.relationship;
  const transcript = turns
    .map((t) => `${t.role === 'user' ? name : 'Ferni'}: ${t.content}`)
    .join('\n');
  return `You are Ferni. ${request.userName} asked you to call ${name}${relationship ? ` (their ${relationship})` : ''}: ${request.purpose}

The call:
${transcript}

Tell ${request.userName} how it went, the way a close friend would after making a call for them: two or three short sentences, first person, warm and plain. Say how ${name} seemed. Only say what the call shows; never invent details. If ${name} asked you to pass something on, end the summary with it the way you'd say it out loud, and also put it in messageForUser as a few plain words written to ${request.userName} (like "call her about Sunday"); otherwise messageForUser is null.
Reply with JSON only: {"summary": "...", "messageForUser": "..." | null}`;
}

async function defaultSummarize(prompt: string): Promise<CallReport | null> {
  const { callLLMForJSON } = await import('../llm-utils.js');
  return callLLMForJSON<CallReport>(prompt, { temperature: 0.4, maxTokens: 300 });
}

async function reportCall(
  call: FollowthroughCall,
  outcome: FollowthroughOutcome,
  turns: CallTurn[],
  summarize: (prompt: string) => Promise<CallReport | null>
): Promise<{ summary: string; messageForUser: string | null }> {
  const fallback = {
    summary: fallbackSummary(outcome, contactName(call.request)),
    messageForUser: null,
  };
  if (outcome !== 'answered' && outcome !== 'hung_up_early') return fallback;
  try {
    const report = await Promise.race([
      summarize(buildReportPrompt(call, turns)),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), SUMMARY_TIMEOUT_MS);
      }),
    ]);
    const summary = report?.summary?.trim();
    if (!summary) return fallback;
    return { summary, messageForUser: report?.messageForUser?.trim() || null };
  } catch (error) {
    log.warn(
      { error: String(error), callId: call.callId },
      'Call report failed, using plain summary'
    );
    return fallback;
  }
}

// ============================================================================
// RECORD
// ============================================================================

const STATUS: Record<FollowthroughOutcome, CallOutcome['status']> = {
  answered: 'completed',
  hung_up_early: 'completed',
  voicemail: 'voicemail',
  no_answer: 'no_answer',
};

function contactName(request: OnBehalfCallRequest): string {
  return request.resolvedContact?.name || request.contactQuery || 'them';
}

/** The call to follow through on, from the agent's dispatch metadata; null if no one to tell. */
export function followthroughCallFromDispatch(
  metadata: Record<string, unknown>
): FollowthroughCall | null {
  const dispatch = parseOnBehalfDispatch(metadata);
  if (!dispatch) return null;
  const { requester, contact } = dispatch;
  return {
    callId: dispatch.callId,
    request: {
      contactQuery: contact.name,
      resolvedContact: {
        name: contact.name,
        phone: contact.phone,
        relationship: contact.relationship,
      },
      purpose: dispatch.purpose,
      objective: dispatch.objective,
      callType: dispatch.callType,
      originalSessionId: requester.originalSessionId,
      userId: requester.userId,
      userTimezone: requester.timezone,
      userName: requester.name,
      recordingConsent: false,
    },
  };
}

/**
 * Record how an on-behalf call went and tell the user. Never throws: a failed
 * follow-through must not break session cleanup.
 */
export async function recordCallFollowthrough(
  call: FollowthroughCall,
  turns: CallTurn[],
  durationSeconds: number,
  deps: FollowthroughDeps = {}
): Promise<FollowthroughResult | null> {
  try {
    const name = contactName(call.request);
    const outcome = classifyCallOutcome(turns, durationSeconds);
    const { summary, messageForUser } = await reportCall(
      call,
      outcome,
      turns,
      deps.summarize ?? defaultSummarize
    );
    const missed = outcome === 'no_answer' || outcome === 'voicemail';
    const message = messageForUser ? `Message from ${name}: ${messageForUser}` : null;

    const result: FollowthroughResult = {
      outcome,
      summary,
      messageForUser,
    };
    const callOutcome: CallOutcome & { followthrough: FollowthroughResult } = {
      callId: call.callId,
      status: STATUS[outcome],
      objectiveAchieved: outcome === 'answered',
      outcome: summary,
      // Shown under the headline when the user's next session opens.
      transcriptSummary: [missed ? summary : null, message].filter(Boolean).join(' ') || undefined,
      callbackRequired: false,
      followthrough: result,
    };

    const { captureCallResult } = await import('./call-result-capture.js');
    // The unified result sends the in-app notification; no email or calendar event.
    await captureCallResult(call.callId, callOutcome, call.request, {
      push: false,
      email: false,
      calendar: false,
    });
    log.info({ callId: call.callId, outcome }, 'Call follow-through recorded');
    return result;
  } catch (error) {
    log.error({ error: String(error), callId: call.callId }, 'Call follow-through failed');
    return null;
  }
}
