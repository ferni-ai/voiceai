/**
 * Why a sign-in popup failed, in words a person can act on.
 *
 * Firebase errors carry a stable `code`; their `message` is English and can
 * include addresses, so it is never shown. Each code maps to one of a few
 * reasons, and each reason has its own localized message.
 *
 * @module services/sign-in-error
 */

import { t } from '../i18n/index.js';

export type SignInFailureReason =
  'popup-blocked' | 'provider-unavailable' | 'network' | 'closed' | 'unknown';

const REASON_BY_CODE: Readonly<Record<string, SignInFailureReason>> = {
  'auth/popup-blocked': 'popup-blocked',
  'auth/operation-not-allowed': 'provider-unavailable',
  'auth/operation-not-supported-in-this-environment': 'provider-unavailable',
  'auth/unauthorized-domain': 'provider-unavailable',
  'auth/invalid-oauth-provider': 'provider-unavailable',
  'auth/invalid-oauth-client-id': 'provider-unavailable',
  'auth/admin-restricted-operation': 'provider-unavailable',
  'auth/network-request-failed': 'network',
  'auth/timeout': 'network',
  'auth/popup-closed-by-user': 'closed',
  'auth/cancelled-popup-request': 'closed',
  'auth/user-cancelled': 'closed',
};

export function signInFailureReason(error: unknown): SignInFailureReason {
  const code =
    error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code
      : '';
  return REASON_BY_CODE[code] ?? 'unknown';
}

/** The message for a failed sign-in. `providerName` is shown as-is ("Google", "Apple"). */
export function signInFailureMessage(error: unknown, providerName: string): string {
  switch (signInFailureReason(error)) {
    case 'popup-blocked':
      return t('auth.signInPopupBlocked');
    case 'provider-unavailable':
      return t('auth.signInProviderUnavailable', { provider: providerName });
    case 'network':
      return t('auth.signInNetwork');
    case 'closed':
      return t('auth.signInClosed');
    default:
      return t('auth.signInError');
  }
}
