/**
 * The store side of confirm-thread's port (tools/domains/communication/outreach/confirm-thread.ts):
 * read-backs waiting on the owner's yes are kept in the follow-through store, due in the
 * owner's own zone.
 *
 * @module services/outreach/confirm-thread-adapter
 */
import {
  setConfirmThreadPort,
  type ConfirmThreadPort,
} from '../../tools/domains/communication/outreach/confirm-thread.js';
import { firestoreFollowUpStore } from '../stores/follow-through-store.js';
import { getUserContactInfo } from './user-contact.js';

export const confirmThreadAdapter: ConfirmThreadPort = {
  store: firestoreFollowUpStore,
  zoneOf: async (userId) => (await getUserContactInfo(userId))?.timezone || 'Etc/UTC',
};

/** Install the adapter; safe to call on every call. */
export function installConfirmThreadPort(): void {
  setConfirmThreadPort(confirmThreadAdapter);
}
