/**
 * The owner's email address, read from OWNER_EMAIL (Secret Manager secret
 * `owner-email`, mounted on the production web server). This repo is public:
 * never write the address into code, tests, docs or logs.
 *
 * Unset, callers fail closed: no waitlist bypass for the owner, and emails meant
 * only for the owner (daily admin report) are skipped with a log line.
 *
 * @module config/owner-email
 */

/** The owner's address, or undefined when OWNER_EMAIL is unset or blank. */
export function ownerEmail(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env.OWNER_EMAIL?.trim();
  return value ? value : undefined;
}

/**
 * Lowercased, and for Gmail the local part without dots: Gmail delivers
 * first.last@ and firstlast@ to the same mailbox.
 */
export function canonicalEmail(email: string): string {
  const lower = email.trim().toLowerCase();
  const at = lower.lastIndexOf('@');
  if (at <= 0) return lower;
  const domain = lower.slice(at + 1);
  if (domain !== 'gmail.com' && domain !== 'googlemail.com') return lower;
  return `${lower.slice(0, at).replace(/\./g, '')}@gmail.com`;
}

/** True when `email` is the owner's address. Always false while OWNER_EMAIL is unset. */
export function isOwnerEmail(
  email: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const owner = ownerEmail(env);
  if (!owner || !email) return false;
  return canonicalEmail(email) === canonicalEmail(owner);
}
