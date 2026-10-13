/**
 * A friend's referral code, kept from the moment they open the link until the
 * server accepts it after their first conversation.
 *
 * The code used to be read from the URL only after the sign-in gate and the
 * waitlist check, so a waitlisted friend never kept it. It is now captured on
 * first load, and the server also keeps it on their waitlist record
 * (/api/waitlist/check), which hands it back once they are approved, on
 * whatever device they come back on. Storage can throw (private browsing, blocked
 * site data); every read and write here survives that.
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('ReferralPending');

const PENDING_KEY = 'ferni_pending_referral';
const STATE_KEY = 'ferni_referral_state'; // { referredBy }

/** The server's code shape (seeds-routes.ts generateReferralCode): `k3j9x2-meadow`. */
export const REFERRAL_CODE_PATTERN = /^[a-z0-9]+-[a-z]+$/;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    log.warn('Referral storage unreadable', { key, error: String(error) });
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch (error) {
    log.warn('Referral storage unwritable', { key, error: String(error) });
  }
}

/** Whose code the server accepted for this person, if any. */
export function getReferredBy(): string | null {
  try {
    const saved = JSON.parse(read(STATE_KEY) ?? '{}') as { referredBy?: string };
    return saved.referredBy ?? null;
  } catch {
    return null;
  }
}

export function setReferredBy(code: string): void {
  write(STATE_KEY, JSON.stringify({ referredBy: code }));
}

export function getPendingReferral(): string | null {
  return read(PENDING_KEY);
}

/**
 * Keep a code until the server registers it. The first code wins, and nothing is
 * kept once this person has been referred. Returns whether it was kept.
 */
export function rememberReferral(code: unknown): boolean {
  if (typeof code !== 'string' || !REFERRAL_CODE_PATTERN.test(code)) return false;
  if (getReferredBy() || getPendingReferral()) return false;
  write(PENDING_KEY, code);
  return true;
}

export function clearPendingReferral(): void {
  write(PENDING_KEY, null);
}
