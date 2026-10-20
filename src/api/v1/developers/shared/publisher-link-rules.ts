/**
 * The rules that decide whether a Firebase account may act for a publisher:
 * not anonymous, a verified email, and that email equal to the publisher
 * record's email (ignoring case). One copy, shared by the per-request token
 * check (resolvePublisher), the API key check and the unlink script, so the
 * three cannot drift apart.
 *
 * @module api/v1/developers/shared/publisher-link-rules
 */

export interface LinkedAccount {
  email?: string;
  emailVerified: boolean;
  anonymous: boolean;
}

/** Why this account may never act as a publisher, or null. */
export function accountProblem(account: LinkedAccount): string | null {
  if (account.anonymous) return 'linked account is anonymous';
  if (!account.email) return 'linked account has no email';
  if (!account.emailVerified) return 'linked account email is not verified';
  return null;
}

/** Why this account may not act for a publisher with this email, or null when it may. */
export function linkProblem(publisherEmail: unknown, account: LinkedAccount): string | null {
  const problem = accountProblem(account);
  if (problem) return problem;
  const email = (account.email ?? '').toLowerCase();
  if (typeof publisherEmail !== 'string' || publisherEmail.toLowerCase() !== email) {
    return 'linked account email differs from the publisher record';
  }
  return null;
}

/** The facts the rules need, from a Firebase Admin user record. */
export function accountFromUser(user: {
  email?: string;
  emailVerified?: boolean;
  providerData: readonly unknown[];
}): LinkedAccount {
  return {
    email: user.email,
    emailVerified: user.emailVerified === true,
    anonymous: user.providerData.length === 0,
  };
}
