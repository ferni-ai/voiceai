/**
 * Where engagement notifications (Maya's habit nudges) may reach the user: only
 * the account's verified phone and email, never profile.contactInfo, which
 * saveContactInfo writes from whatever the model heard.
 *
 * services/engagement may not import services/outreach (a layer up), so the
 * outreach side installs the lookup here (call-user-adapter.ts installs it with
 * the call-user port). Not installed in this process: no address, nothing sent.
 *
 * @module services/engagement/engagement-reach-port
 */

export interface EngagementReachPort {
  /** The verified phone on the account, or undefined. */
  verifiedPhone(userId: string): Promise<string | undefined>;
  /** The email Firebase verified, or undefined. */
  verifiedEmail(userId: string): Promise<string | undefined>;
}

let port: EngagementReachPort | undefined;

export function setEngagementReachPort(next: EngagementReachPort | undefined): void {
  port = next;
}

/** The verified address for `method`, or undefined (no port, or nothing verified). */
export async function verifiedAddressFor(
  userId: string,
  method: 'sms' | 'email'
): Promise<string | undefined> {
  if (!port) return undefined;
  return method === 'sms' ? port.verifiedPhone(userId) : port.verifiedEmail(userId);
}
