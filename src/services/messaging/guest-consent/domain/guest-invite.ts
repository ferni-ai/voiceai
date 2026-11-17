/**
 * A guest's invite: the link Ferni texts her to say yes, no or "forget me" to
 * being called into an owner's calls. Its token is stored only as its SHA-256,
 * her phone only as its keyed hash. Good until expiresAt, for one answer. Pure.
 *
 * @module services/messaging/guest-consent/domain/guest-invite
 */
import {
  guestDisplayName,
  guestRole,
} from '../../../../agents/group-conversation/guest-display-name.js';

/** What the guest can answer on her page. */
export type GuestInviteAnswer = 'yes' | 'no' | 'forget';

/** One invite, stored under the SHA-256 of its token (guest_invites/{tokenHash}). */
export interface GuestInvite {
  /** The owner who asked for her. */
  uid: string;
  /** Her number's keyed hash: the id of her consent record under the owner. */
  phoneHash: string;
  createdAt: number;
  expiresAt: number;
}

/** 32 random bytes, base64url: 43 characters. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export const isInviteToken = (token: unknown): token is string =>
  typeof token === 'string' && TOKEN.test(token);

/** True for a stored invite with every field it needs, not yet expired at `now` (ms). */
export function isLiveInvite(invite: GuestInvite | null, now: number): invite is GuestInvite {
  return (
    invite !== null &&
    typeof invite.uid === 'string' &&
    invite.uid.trim() !== '' &&
    typeof invite.phoneHash === 'string' &&
    invite.phoneHash !== '' &&
    typeof invite.expiresAt === 'number' &&
    invite.expiresAt > now
  );
}

/**
 * The owner's first name as the guest's page shows it, or null when there is no
 * usable one. The name is from the owner's account, shown to someone else, so it
 * goes through the guest-name cleaner (guest-display-name.ts): one plain word in
 * one script, no invisibles. A name the cleaner refuses or flags is no name.
 */
export function inviteOwnerName(raw: unknown): string | null {
  const first = typeof raw === 'string' ? (raw.trim().split(/\s+/)[0] ?? '') : '';
  const name = guestDisplayName(first, '');
  return name === guestRole(name) ? null : name;
}

/**
 * The words the guest says yes to: wording version 1 (GUEST_CONSENT_WORDING_VERSION),
 * with the owner's first name, or "Your friend" without one. Any change to this
 * text must raise GUEST_CONSENT_WORDING_VERSION.
 */
export function guestInviteWording(ownerFirstName: string | null): string {
  const owner = ownerFirstName ?? 'Your friend';
  const later = ownerFirstName ?? 'your friend';
  return (
    `${owner} would like Ferni, their AI friend, to be able to bring you into their calls. ` +
    `Ferni takes notes for ${later} on those calls. ` +
    'You can say no on any call, or stop this any time.'
  );
}
