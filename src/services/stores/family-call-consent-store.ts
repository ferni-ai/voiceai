/**
 * Firestore store for family members' consent to check-in calls:
 * family_call_consent/{sponsoredIdentityId}.
 *
 * Implements the FamilyConsentStore port (services/family/family-call-consent.ts).
 * The rule for when a call may ring lives there; this only reads and writes.
 * No database or a failed read gives null, which the rule treats as no consent.
 *
 * @module services/stores/family-call-consent-store
 */

import type {
  FamilyCallConsent,
  FamilyCallConsentSource,
  FamilyConsentStore,
} from '../family/family-call-consent.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'family-call-consent-store' });

const COLLECTION = 'family_call_consent';

function isConsent(data: unknown): data is FamilyCallConsent {
  const d = data as Partial<FamilyCallConsent> | undefined;
  return typeof d?.sponsoredIdentityId === 'string' && typeof d.consentedAt === 'string';
}

export function createFamilyConsentStore(): FamilyConsentStore {
  return {
    async get(sponsoredIdentityId: string) {
      const db = getFirestoreDb();
      if (!db) return null;
      try {
        const doc = await db.collection(COLLECTION).doc(sponsoredIdentityId).get();
        const data: unknown = doc.exists ? doc.data() : undefined;
        if (doc.exists && !isConsent(data))
          log.warn({ sponsoredIdentityId }, 'Consent record is malformed; treating as no consent');
        return isConsent(data) ? data : null;
      } catch (error) {
        log.warn(
          { sponsoredIdentityId, error: String(error) },
          'Could not read family call consent'
        );
        return null;
      }
    },

    async record(sponsoredIdentityId: string, source: FamilyCallConsentSource, now: Date) {
      const db = getFirestoreDb();
      if (!db) return false;
      const consent: FamilyCallConsent = {
        sponsoredIdentityId,
        consentedAt: now.toISOString(),
        source,
      };
      try {
        await db.collection(COLLECTION).doc(sponsoredIdentityId).set(consent);
        log.info({ sponsoredIdentityId, source }, 'Family member agreed to check-in calls');
        return true;
      } catch (error) {
        log.error(
          { sponsoredIdentityId, error: String(error) },
          'Could not save family call consent'
        );
        return false;
      }
    },

    async withdraw(sponsoredIdentityId: string, now: Date) {
      const db = getFirestoreDb();
      if (!db) return false;
      try {
        await db
          .collection(COLLECTION)
          .doc(sponsoredIdentityId)
          .set({ withdrawnAt: now.toISOString() }, { merge: true });
        log.info({ sponsoredIdentityId }, 'Family member withdrew consent to check-in calls');
        return true;
      } catch (error) {
        log.error(
          { sponsoredIdentityId, error: String(error) },
          'Could not save consent withdrawal'
        );
        return false;
      }
    },
  };
}
