/**
 * Show a guest her invite's wording and take her yes, no or "forget me", once.
 * (Minting one and texting the link is task 9c's invite tool.) Her answer spends
 * the invite first (read and delete in one transaction), so of two racing answers
 * only one acts; if saving it fails, the invite is put back. Her yes is stamped
 * here when it arrives, at the wording in force: the page sends neither.
 *
 * @module services/messaging/guest-consent/use-cases/guest-invite
 */
import { sha256Hex } from '../../../stores/single-use-records.js';
import { createLogger } from '../../../../utils/safe-logger.js';
import { GUEST_CONSENT_WORDING_VERSION as VERSION } from '../domain/guest-consent.js';
import {
  guestInviteWording,
  inviteOwnerName,
  isInviteToken,
  isLiveInvite,
  type GuestInvite,
  type GuestInviteAnswer,
} from '../domain/guest-invite.js';
import type { GuestInviteStore } from '../ports/guest-invite-store.js';
import {
  forgetGuestConsentByKey,
  ownerTag,
  recordGuestConsentByKey,
  revokeGuestConsentByKey,
  type GuestConsentDeps,
} from './guest-consent.js';

const log = createLogger({ module: 'guest-invite' });

export interface GuestInviteDeps {
  invites: GuestInviteStore;
  consent: GuestConsentDeps;
  /** The owner's name as their account holds it (unchecked). */
  ownerName: (uid: string) => Promise<unknown>;
  now: () => Date;
}

/** What the guest's page shows: never her number, the owner's uid or any hash. */
export interface GuestInviteView {
  ownerFirstName: string;
  wording: string;
  wordingVersion: number;
}

/** The page's wording for a live invite; null for an unknown, used or expired one. */
export async function viewGuestInvite(
  token: unknown,
  deps: GuestInviteDeps
): Promise<GuestInviteView | null> {
  if (!isInviteToken(token)) return null;
  const invite = await deps.invites.get(sha256Hex(token));
  if (!isLiveInvite(invite, deps.now().getTime())) return null;
  const name = inviteOwnerName(await deps.ownerName(invite.uid));
  return {
    ownerFirstName: name ?? 'Your friend',
    wording: guestInviteWording(name),
    wordingVersion: VERSION,
  };
}

/**
 * The guest's answer. Spends the invite, then: yes records her consent, stamped
 * now; no withdraws an earlier yes (kept, revoked); forget deletes her consent
 * for this owner. False for an unknown, used or expired invite (nothing changes).
 * Throws when the answer couldn't be saved, with the invite put back.
 */
export async function answerGuestInvite(
  token: unknown,
  answer: GuestInviteAnswer,
  deps: GuestInviteDeps
): Promise<boolean> {
  const saidAt = deps.now();
  if (!isInviteToken(token)) return false;
  const key = sha256Hex(token);
  const invite = await deps.invites.take(key);
  if (!isLiveInvite(invite, saidAt.getTime())) return false;
  const { uid, phoneHash } = invite;
  try {
    if (answer === 'yes')
      await recordGuestConsentByKey(uid, phoneHash, VERSION, deps.consent, saidAt);
    if (answer === 'no') await revokeGuestConsentByKey(uid, phoneHash, deps.consent);
    if (answer === 'forget') await forgetGuestConsentByKey(uid, phoneHash, deps.consent);
  } catch (error) {
    await putBack(key, invite, deps);
    throw error;
  }
  log.info({ ownerTag: ownerTag(uid, deps.consent.env), answer }, 'Guest answered an invite');
  return true;
}

async function putBack(key: string, invite: GuestInvite, deps: GuestInviteDeps): Promise<void> {
  try {
    await deps.invites.putUnlessErased(key, invite);
  } catch (error) {
    const tag = ownerTag(invite.uid, deps.consent.env);
    log.error({ error: String(error), ownerTag: tag }, 'Guest invite not put back');
  }
}
