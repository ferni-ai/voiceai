/**
 * Where guests' consents are kept, one record per owner and phone hash. The
 * Firestore adapter is adapters/firestore-guest-consent-store.ts; tests use an
 * in-memory one.
 *
 * @module services/messaging/guest-consent/ports/guest-consent-store
 */
import type { GuestConsent } from '../domain/guest-consent.js';

export interface GuestConsentStore {
  /** The owner's record for this phone hash; null when there is none (or it is malformed). Throws when unreadable. */
  read: (ownerUid: string, phoneHash: string) => Promise<GuestConsent | null>;
  /**
   * Read-modify-write of one record, atomic where the store allows. `change`
   * returns the record to write, or null to write nothing. Throws when it can't be saved.
   */
  update: (
    ownerUid: string,
    phoneHash: string,
    change: (prev: GuestConsent | null) => GuestConsent | null
  ) => Promise<void>;
}
