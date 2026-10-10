/**
 * One retry for a missed on-behalf call (no answer or voicemail): the next
 * day, at a time the recipient can be called. Scheduled as a scheduled-outreach
 * item with channel 'on_behalf_call'; the scheduled-outreach job places it.
 *
 * Part of call follow-through (CALL_FOLLOWTHROUGH=on): the agent job that ran
 * the call schedules the retry when it reports the result
 * (agents/outbound-call/on-behalf-call-lifecycle.ts).
 *
 * @module services/outreach/call-retry
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { OnBehalfCallRequest } from '../../tools/domains/telephony/types.js';

const log = getLogger().child({ service: 'call-retry' });

export interface CallRecipient {
  name?: string;
  phone?: string;
  timezone?: string;
}

/**
 * May Ferni call this person at this time? The calling-hours guard
 * (CALL_HOURS_GUARD) plugs in here; until then every time is allowed.
 */
export type CallTimeGuard = (recipient: CallRecipient, at: Date) => boolean | Promise<boolean>;

export interface CallRetryDeps {
  isAllowedCallTime?: CallTimeGuard;
  now?: () => Date;
}

/** Call follow-through (outcome detail and the one retry) is off unless CALL_FOLLOWTHROUGH=on. */
export function isCallFollowthroughEnabled(): boolean {
  return process.env.CALL_FOLLOWTHROUGH === 'on';
}

const allowAnyTime: CallTimeGuard = () => true;

/** Next-day slots to try, local time, in order. */
const RETRY_SLOTS: Array<[number, number]> = [
  [10, 30],
  [12, 30],
  [15, 0],
  [17, 30],
];

function zoneParts(at: Date, timeZone: string): number[] {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return [get('year'), get('month'), get('day'), get('hour'), get('minute')];
}

/** The instant that is `hour:minute` local time in `timeZone`, `daysAhead` days after `from`. */
export function localTimeAfter(
  from: Date,
  timeZone: string,
  daysAhead: number,
  hour: number,
  minute: number
): Date {
  const [y, m, d] = zoneParts(from, timeZone);
  const guess = Date.UTC(y, m - 1, d + daysAhead, hour, minute);
  const [gy, gm, gd, gh, gmin] = zoneParts(new Date(guess), timeZone);
  const offset = Date.UTC(gy, gm - 1, gd, gh, gmin) - guess;
  return new Date(guess - offset);
}

function recipientOf(request: OnBehalfCallRequest): CallRecipient {
  return {
    name: request.resolvedContact?.name,
    phone: request.resolvedContact?.phone,
    timezone: request.userTimezone,
  };
}

/**
 * Schedule the one retry of a missed call. The document id comes from the
 * missed call and `create` fails if it exists, so a call is never retried
 * twice; a call that is itself a retry is never retried at all.
 */
export async function scheduleCallRetry(
  callId: string,
  request: OnBehalfCallRequest,
  deps: CallRetryDeps = {}
): Promise<Date | null> {
  const phone = request.resolvedContact?.phone;
  if (request.retryOf || !phone) return null;

  const timeZone = request.userTimezone || 'America/Los_Angeles';
  const now = deps.now?.() ?? new Date();
  const guard = deps.isAllowedCallTime ?? allowAnyTime;
  let at: Date | null = null;
  for (const [hour, minute] of RETRY_SLOTS) {
    const slot = localTimeAfter(now, timeZone, 1, hour, minute);
    if (await guard(recipientOf(request), slot)) {
      at = slot;
      break;
    }
  }
  if (!at) return null;

  const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
  const db = getFirestoreDb();
  if (!db) return null;
  const id = `retry_${callId}`;
  try {
    await db
      .collection('bogle_users')
      .doc(request.userId)
      .collection('scheduled_outreach')
      .doc(id)
      .create({
        id,
        userId: request.userId,
        personaId: 'ferni',
        status: 'pending',
        // A Date, not an ISO string: the scheduled-outreach job queries scheduledFor as a timestamp.
        scheduledFor: at,
        createdAt: now,
        updatedAt: now,
        retryCount: 0,
        maxRetries: 0,
        target: {
          contact: request.contactQuery,
          purpose: request.purpose,
          channel: 'on_behalf_call',
          resolvedContactId: request.resolvedContact?.id ?? '',
          resolvedContactName: request.resolvedContact?.name ?? request.contactQuery,
          resolvedPhone: phone,
          onBehalfRequest: JSON.parse(JSON.stringify({ ...request, retryOf: callId })),
        },
      });
    log.info({ callId, retryAt: at.toISOString() }, 'Scheduled one retry for a missed call');
    return at;
  } catch (error) {
    log.info(
      { error: String(error), callId },
      'Retry not scheduled (already exists or write failed)'
    );
    return null;
  }
}

/** Place a scheduled retry. Run by the scheduled-outreach job; never throws. */
export async function placeCallRetry(
  onBehalfRequest: unknown,
  deps: CallRetryDeps = {}
): Promise<{ success: boolean; error?: string }> {
  if (!isCallFollowthroughEnabled()) {
    return { success: false, error: 'CALL_FOLLOWTHROUGH is off' };
  }
  const request = onBehalfRequest as OnBehalfCallRequest | undefined;
  if (!request?.resolvedContact?.phone || !request.retryOf) {
    return { success: false, error: 'Not a call retry' };
  }
  // Without the SIP trunk the orchestrator falls back to a one-way Twilio call.
  if (!process.env.SIP_TRUNK_ID) {
    return { success: false, error: 'No SIP trunk for a conversational call' };
  }
  const guard = deps.isAllowedCallTime ?? allowAnyTime;
  if (!(await guard(recipientOf(request), deps.now?.() ?? new Date()))) {
    return { success: false, error: 'Outside calling hours' };
  }
  try {
    const { getOnBehalfCallOrchestrator } = await import('./on-behalf-call-orchestrator.js');
    await getOnBehalfCallOrchestrator().initiateCall(request);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
