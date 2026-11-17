/**
 * Where guests' consents are kept, one record per owner and phone hash. The
 * Firestore adapter is adapters/firestore-guest-consent-store.ts; tests use an
 * in-memory one.
 *
 * @module services/messaging/guest-consent/ports/guest-consent-store
 */
import type { GuestConsent } from '../domain/guest-consent.js';

export interface GuestConsentStore {
  /**
   * The owner's record for this phone hash; null when there is none, it is malformed,
   * or the owner's account is gone or being erased. Throws when unreadable.
   */
  read: (ownerUid: string, phoneHash: string) => Promise<GuestConsent | null>;
  /**
   * Read-modify-write of one record, atomic where the store allows. `change`
   * returns the record to write, or null to write nothing. When the owner's account
   * is gone or being erased (read in the same transaction), a yes writes nothing and
   * a revoke deletes a standing yes (an already-revoked record is left for the
   * erasure). Throws when it can't be saved.
   */
  update: (
    ownerUid: string,
    phoneHash: string,
    change: (prev: GuestConsent | null) => GuestConsent | null
  ) => Promise<void>;
}
