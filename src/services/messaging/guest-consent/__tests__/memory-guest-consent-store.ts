/**
 * An in-memory GuestConsentStore for tests: records by "{ownerUid}/{phoneHash}",
 * as the Firestore adapter keys them under bogle_users/{uid}/guest_consents.
 */
import type { GuestConsent } from '../domain/guest-consent.js';
import type { GuestConsentStore } from '../ports/guest-consent-store.js';

export interface MemoryGuestConsentStore {
  store: GuestConsentStore;
  docs: Map<string, GuestConsent>;
  /** failReads: every read rejects, as an unreachable store would. */
  state: { failReads: boolean };
}

export function memoryGuestConsentStore(): MemoryGuestConsentStore {
  const docs = new Map<string, GuestConsent>();
  const state = { failReads: false };
  const key = (uid: string, hash: string): string => `${uid}/${hash}`;
  const store: GuestConsentStore = {
    async read(uid, hash) {
      if (state.failReads) return Promise.reject(new Error('store unavailable'));
      return Promise.resolve(structuredClone(docs.get(key(uid, hash)) ?? null));
    },
    async update(uid, hash, change) {
      const next = change(structuredClone(docs.get(key(uid, hash)) ?? null));
      if (next) docs.set(key(uid, hash), structuredClone(next));
      return Promise.resolve();
    },
  };
  return { store, docs, state };
}
