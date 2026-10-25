/**
 * The contact-info rules behind /api/user/contact (user-routes.ts).
 *
 * A blank phone or email (a form that never loaded the stored value) must not
 * erase what's stored: only clearPhone / clearEmail do. Phones are stored as
 * E.164, the form they're texted and compared in, or refused.
 *
 * @module api/user-contact
 */
import { getFirebaseUser } from '../services/identity/firebase-auth.js';
import { toE164 } from '../services/outreach/checkin-replies.js';
import {
  readOutreachConsent,
  smsDisclosureRefusal,
  writeOutreachConsent,
} from '../services/outreach/outreach-consent.js';
import type { DeliveryChannel } from '../services/outreach/unified-delivery.js';
import { verifiedPhoneOf } from '../services/outreach/user-reach.js';
import { getFirestoreDb } from '../services/superhuman/firestore-utils.js';
import type { UserProfile } from '../types/user-profile.js';
import type { AuthContext } from './auth-middleware.js';

export interface ContactInfoUpdate {
  phone?: string;
  email?: string;
  clearPhone?: boolean;
  clearEmail?: boolean;
  preferredName?: string;
  timezone?: string;
}

type ContactInfo = NonNullable<UserProfile['contactInfo']>;

const trimmed = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** True when the body names a phone that isn't one (the route answers 400). */
export function hasInvalidPhone(body: ContactInfoUpdate | null | undefined): boolean {
  const phone = trimmed(body?.phone);
  return phone !== '' && toE164(phone) === null;
}

/** The stored contact info after this update. Call hasInvalidPhone first. */
export function nextContactInfo(
  body: ContactInfoUpdate | null | undefined,
  old: ContactInfo | undefined
): ContactInfo {
  const phone = toE164(trimmed(body?.phone));
  const email = trimmed(body?.email);
  return {
    ...old,
    phone: body?.clearPhone === true ? '' : (phone ?? old?.phone),
    email: body?.clearEmail === true ? '' : email || old?.email,
    timezone: body?.timezone ?? old?.timezone,
  };
}

/**
 * The number the signed-in account proved it owns: put on its Firebase account
 * by a texted code (verify-phone confirm, the only writer), or a `phone:`
 * account id / linked identifier. Never contactInfo.phone, which anyone (the
 * model, this route) can write. Gates texts/calls consent and the "Verified" badge.
 */
const PHONE_CHANNELS: readonly DeliveryChannel[] = ['sms', 'voice_call'];
const isPhoneChannel = (c: DeliveryChannel): boolean => PHONE_CHANNELS.includes(c);

/**
 * Why turning on these check-in channels is refused, or null. Only channels
 * being ADDED count, so opting out is never refused; adding texts or calls
 * needs a verified number. An unreadable consent counts as nothing on (fails closed).
 * `known` is the stored channels when the caller already read them.
 */
export async function phoneChannelRefusal(
  auth: AuthContext,
  requested: DeliveryChannel[] | undefined,
  known?: DeliveryChannel[]
): Promise<string | null> {
  if (!requested?.some(isPhoneChannel)) return null;
  const current = known ?? (await readOutreachConsent(auth.userId)).channels;
  const added = requested.filter((c) => isPhoneChannel(c) && !current.includes(c));
  if (added.length === 0 || (await verifiedPhoneFor(auth))) return null;
  return 'Verify your phone number before turning on texts or calls.';
}

/**
 * Why this channel change is refused, or null: phoneChannelRefusal, then texts
 * only with the disclosure version the screen showed (smsDisclosureRefusal).
 */
export async function channelConsentRefusal(
  auth: AuthContext,
  requested: DeliveryChannel[] | undefined,
  disclosureVersion: unknown
): Promise<string | null> {
  if (!requested) return null;
  const current = (await readOutreachConsent(auth.userId)).channels;
  return (
    (await phoneChannelRefusal(auth, requested, current)) ??
    smsDisclosureRefusal(current, requested, disclosureVersion)
  );
}

/**
 * Clearing the phone also withdraws text and call consent, in the same request,
 * so nothing keeps texting a number the user took away (the verified number on
 * the account stays for sign-in and caller recognition). True if any was on.
 */
export async function dropPhoneChannels(userId: string): Promise<boolean> {
  const { channels } = await readOutreachConsent(userId);
  if (!channels.some(isPhoneChannel)) return false;
  await writeOutreachConsent(userId, { channels: channels.filter((c) => !isPhoneChannel(c)) });
  return true;
}

export async function verifiedPhoneFor(auth: AuthContext): Promise<string | null> {
  const user = auth.authMethod === 'firebase' ? await getFirebaseUser(auth.userId) : null;
  if (user?.phoneNumber) return user.phoneNumber;
  const doc = await getFirestoreDb()?.collection('bogle_users').doc(auth.userId).get();
  const data = doc?.exists ? (doc.data() as Record<string, unknown> | undefined) : undefined;
  return verifiedPhoneOf(auth.userId, data) ?? null;
}
