/**
 * Call results stored the way a real call stores them: a dispatch (on-behalf-dispatch.ts), its
 * outcome from what the person said (on-behalf-call-lifecycle.ts buildCallOutcome), and
 * captureCallResult (call-result-capture.ts), with Firestore off so they land in the in-memory
 * store its own reader (getRecentCallResults) serves. The test file must mock
 * services/superhuman/firestore-utils.js to return no database. Fictional people only.
 */
import {
  buildCallOutcome,
  toOnBehalfCallRequest,
} from '../../outbound-call/on-behalf-call-lifecycle.js';
import { captureCallResult } from '../../../services/outreach/call-result-capture.js';
import { buildOnBehalfDispatch } from '../../../services/outreach/on-behalf-dispatch.js';
import type { CallOutcome } from '../../../tools/domains/telephony/types.js';
import type { CallDisposition } from '../../outbound-call/call-control.js';

export interface StoredCall {
  name: string;
  relationship?: string;
  status: CallOutcome['status'];
  /** What the person said on the call, turn by turn. */
  heard?: string[];
}

/** How the call ended for the statuses the words alone don't produce (busy and no answer: no words). */
const ENDED: Partial<Record<CallOutcome['status'], CallDisposition>> = {
  voicemail: 'voicemail_left',
  failed: 'wrong_number',
};
let n = 0;
const records = new WeakMap<object, StoredCall[]>();

/** Store one call result for `userId` through the real capture path. */
export async function storeCall(userId: string, call: StoredCall): Promise<void> {
  n += 1;
  const dispatch = buildOnBehalfDispatch({
    callId: `call-${userId}-${n}`,
    requester: {
      userId,
      name: 'Sam',
      timezone: 'America/New_York',
      originalSessionId: `gone-${userId}`,
    },
    contact: {
      name: call.name,
      phone: `+1555555${String(100 + n).padStart(4, '0')}`,
      relationship: call.relationship,
    },
    purpose: 'check in on them',
    objective: 'check_in',
    callType: 'personal',
  });
  const turns = [
    { role: 'agent' as const, content: "Hi, it's Ferni, calling for Sam." },
    // An answered call has their words; without any, the lifecycle reads it as no answer.
    ...(call.heard ?? (call.status === 'completed' ? ['Oh hi, good to hear from you.'] : [])).map(
      (content) => ({ role: 'recipient' as const, content })
    ),
  ];
  const outcome = buildCallOutcome(dispatch, turns, null, ENDED[call.status], 66);
  await captureCallResult(dispatch.callId, outcome, toOnBehalfCallRequest(dispatch));
}

/** A chat item that stands for stored call results: `storeFor` writes them before the reply. */
export function withStored<T extends object>(item: T, ...calls: StoredCall[]): T {
  records.set(item, calls);
  return item;
}

/** Store every call result the items stand for, for `userId`. */
export async function storeFor(userId: string, items: readonly unknown[]): Promise<void> {
  for (const item of items)
    for (const call of records.get(item as object) ?? []) await storeCall(userId, call);
}
