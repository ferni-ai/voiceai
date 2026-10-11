/**
 * Records who answered a call Ferni placed: a person, or voicemail (where
 * Ferni left one message and hung up). It lands where that call's result is
 * kept: bogle_users/{uid}/on_behalf_calls for on-behalf calls (a voicemail is
 * a finished call, so the user hears about it like any other result), and the
 * check-in call record for family check-ins.
 *
 * @module services/outreach/answered-by
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'AnsweredBy' });

export interface AnsweredCall {
  callId: string;
  /** The user the call was placed for; nothing is recorded without one. */
  requesterUserId?: string;
  kind?: 'on_behalf' | 'family_checkin';
  recipientName: string;
  recipientPhone: string;
  purpose: string;
  callType: string;
  userName: string;
  originalSessionId: string;
}

export async function recordAnsweredBy(
  call: AnsweredCall,
  answerer: 'human' | 'voicemail'
): Promise<void> {
  const userId = call.requesterUserId;
  log.info({ callId: call.callId, kind: call.kind, answerer }, 'Call answered');
  if (!userId || !call.callId) return;

  if (call.kind === 'family_checkin') {
    if (answerer !== 'voicemail') return; // the call's own completion records the rest
    const { completeCallRecord } = await import('../family/proactive-family-checkin.js');
    await completeCallRecord(userId, call.callId, { status: 'voicemail' });
    return;
  }

  if (answerer === 'human') {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    await getFirestoreDb()
      ?.collection('bogle_users')
      .doc(userId)
      .collection('on_behalf_calls')
      .doc(call.callId)
      .set({ answeredBy: 'human', answeredAt: new Date().toISOString() }, { merge: true });
    return;
  }

  const { captureCallResult } = await import('./call-result-capture.js');
  const name = call.recipientName;
  await captureCallResult(
    call.callId,
    {
      callId: call.callId,
      status: 'voicemail',
      objectiveAchieved: false,
      outcome: `Got ${name}'s voicemail, so I left a short message saying who I was and that there's no need to call back.`,
      callbackRequired: false,
    },
    {
      contactQuery: name,
      resolvedContact: { name, phone: call.recipientPhone },
      purpose: call.purpose,
      objective: 'general',
      callType: call.callType === 'personal' ? 'personal' : 'business',
      originalSessionId: call.originalSessionId,
      userId,
      userTimezone: '',
      userName: call.userName,
      recordingConsent: false,
    }
  );
}
