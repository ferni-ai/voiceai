/**
 * guarded-text.ts's production edges, kept apart so that file stays under the
 * 500-line limit: the Firestore store (feature_checkins records and their send
 * locks) and the Twilio send. Moved unchanged.
 *
 * @module services/outreach/guarded-text-store
 */
import { createLogger } from '../../utils/safe-logger.js';
import {
  ALREADY_EXISTS,
  CHECKINS,
  checkinDb,
  firestoreReplyStore,
  toStoredCheckin,
} from './checkin-replies.js';
import type { SMSDeliveryResult, SMSMessage } from './delivery/sms-delivery.js';
import type { TextStore } from './guarded-text.js';
import { sponsoredPhoneOf } from './user-reach.js';
import { readConsentDoc } from './text-consent.js';

const log = createLogger({ module: 'guarded-text' });
/** Send locks (lockedSend), kept apart from the records so no query reads them. */
const TEXT_LOCKS = 'feature_checkin_locks';

export const firestoreTextStore: TextStore = {
  ...firestoreReplyStore,
  consentDoc: readConsentDoc,
  async forUser(userId) {
    // userId equality only; the gap window is filtered in memory to avoid a composite index.
    const snap = await checkinDb().collection(CHECKINS).where('userId', '==', userId).get();
    return snap.docs.map((d) => toStoredCheckin(d.id, d.data()));
  },
  async add(record) {
    return (await checkinDb().collection(CHECKINS).add(record)).id;
  },
  async lock(id, at) {
    try {
      await checkinDb().collection(TEXT_LOCKS).doc(id).create({ at });
      return true;
    } catch (error) {
      if ((error as { code?: unknown }).code === ALREADY_EXISTS) return false;
      throw error;
    }
  },
  async lockedAt(id) {
    const doc = await checkinDb().collection(TEXT_LOCKS).doc(id).get();
    const at: unknown = doc.exists ? doc.data()?.at : undefined;
    return typeof at === 'string' ? at : undefined;
  },
  async unlock(id) {
    await checkinDb().collection(TEXT_LOCKS).doc(id).delete();
  },
  async userDoc(userId) {
    const doc = await checkinDb().collection('bogle_users').doc(userId).get();
    return doc.exists ? (doc.data() as Record<string, unknown>) : undefined;
  },
  async legacySmsChannels(userId) {
    const doc = await checkinDb().collection('outreach_profiles').doc(userId).get();
    const state = (doc.exists ? doc.data()?.state : undefined) as
      { allowedChannels?: unknown } | undefined;
    return state?.allowedChannels;
  },
  async sponsoredPhone(userId) {
    const doc = await checkinDb().collection('sponsored_identities').doc(userId).get();
    return sponsoredPhoneOf(doc.exists ? doc.data() : undefined);
  },
};

/** sendSMS reports "not initialized" until delivery is set up, which the voice agent never does itself. */
export async function sendSms(message: SMSMessage): Promise<SMSDeliveryResult> {
  const sms = await import('./delivery/sms-delivery.js');
  const {
    TWILIO_ACCOUNT_SID: sid,
    TWILIO_AUTH_TOKEN: token,
    TWILIO_PHONE_NUMBER: from,
  } = process.env;
  if (!sms.isSMSDeliveryAvailable() && sid && token && from) {
    try {
      sms.initializeSMSDelivery({
        twilioAccountSid: sid,
        twilioAuthToken: token,
        twilioPhoneNumber: from,
      });
    } catch (error) {
      log.warn({ error: String(error) }, 'SMS delivery could not be set up');
    }
  }
  return sms.sendSMS(message);
}
