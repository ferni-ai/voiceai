/**
 * Identity carry-over on sign-in.
 *
 * Before signing in we note who the browser was: an anonymous Firebase
 * session (if one is still persisted) and the persistent device id. After a
 * successful sign-in we ask the server to fold that earlier memory into the
 * account, proving the anonymous side with its own ID token. Best-effort: a
 * failure never blocks sign-in, and the server makes repeats harmless.
 *
 * @module IdentityLinkService
 */

import type { User } from 'firebase/auth';
import { STORAGE_KEYS } from '../config/storage-keys.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('IdentityLink');

export const IDENTITY_LINK_PATH = '/api/identity/link';

export interface PriorIdentity {
  /** ID token of the anonymous Firebase user signed in before, if any. */
  anonymousIdToken?: string;
  /** The browser's persistent device id. */
  deviceId?: string;
}

function readDeviceId(): string | undefined {
  try {
    return localStorage.getItem(STORAGE_KEYS.DEVICE_ID) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Capture the identity in use right before a sign-in attempt. */
export async function capturePriorIdentity(current: User | null): Promise<PriorIdentity> {
  const prior: PriorIdentity = { deviceId: readDeviceId() };
  if (current?.isAnonymous) {
    try {
      prior.anonymousIdToken = await current.getIdToken();
    } catch (error) {
      log.warn('Could not read the anonymous session token', error);
    }
  }
  return prior;
}

/** After sign-in, ask the server to carry the earlier memory into the account. */
export async function linkPriorIdentity(prior: PriorIdentity, signedIn: User): Promise<void> {
  if (signedIn.isAnonymous) return;
  if (!prior.anonymousIdToken && !prior.deviceId) return;
  try {
    const token = await signedIn.getIdToken();
    const response = await fetch(IDENTITY_LINK_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(prior),
    });
    if (!response.ok && response.status !== 409) {
      log.warn('Identity link request failed', { status: response.status });
      return;
    }
    log.info('Earlier conversations linked to this account', { status: response.status });
  } catch (error) {
    log.warn('Identity link request errored', error);
  }
}
