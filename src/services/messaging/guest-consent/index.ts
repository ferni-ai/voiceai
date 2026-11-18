/**
 * A guest's opt-in to being called into an owner's calls (three-way calls).
 * Seth's rule: Ferni only ever dials a guest who opted in beforehand, and that
 * yes is recorded. Callers import this file, which wires the use cases to the
 * Firestore store; the rules are in domain/, the store's shape in ports/.
 *
 * This is the owner-scoped yes for group calls only. Whether Ferni may reach
 * the number at all (a STOP, a do-not-call) stays with messaging/policy.ts.
 *
 * @module services/messaging/guest-consent
 */
import { getFirestoreDb } from '../../../utils/firestore-utils.js';
import { firestoreGuestConsentStore } from './adapters/firestore-guest-consent-store.js';
import {
  firestoreGuestInviteStore,
  readOwnerName,
} from './adapters/firestore-guest-invite-store.js';
import type { GuestInviteAnswer } from './domain/guest-invite.js';
import type { GuestConsentDeps } from './use-cases/guest-consent.js';
import * as invites from './use-cases/guest-invite.js';
import type { GuestInviteView } from './use-cases/guest-invite.js';

export type { GuestInviteAnswer } from './domain/guest-invite.js';
export type { GuestInviteView } from './use-cases/guest-invite.js';

function defaultGuestConsentDeps(): GuestConsentDeps {
  return {
    store: firestoreGuestConsentStore(getFirestoreDb()),
    env: process.env,
    now: () => new Date(),
  };
}

const defaultGuestInviteDeps = (): invites.GuestInviteDeps => ({
  invites: firestoreGuestInviteStore(),
  consent: defaultGuestConsentDeps(),
  ownerName: readOwnerName,
  now: () => new Date(),
});

/** The guest's page for an invite link's token; null for an unknown, used or expired one. */
export async function viewGuestInvite(token: unknown): Promise<GuestInviteView | null> {
  return invites.viewGuestInvite(token, defaultGuestInviteDeps());
}

/** The guest's answer for an invite link's token, once; false for an unknown, used or expired one. */
export async function answerGuestInvite(
  token: unknown,
  answer: GuestInviteAnswer
): Promise<boolean> {
  return invites.answerGuestInvite(token, answer, defaultGuestInviteDeps());
}
