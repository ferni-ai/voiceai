/**
 * Whose bank a Plaid tool reads, and what it may honestly say about it.
 *
 * PRIVACY: a Plaid tool runs only as the call's own caller, LiveKit's
 * `opts.ctx.userData.userId`, and only when the server verified that caller on
 * this call (`userData.verifiedCaller`, verified-caller.ts). A `userId` in the
 * arguments is never read. Caller ID alone can be spoofed, so a member the
 * server did not verify (a phone call matched to an account by its number, a
 * session with no verified bit) gets needs_verification: one honest line, no
 * store read and no Plaid call. Anyone who is not a member (anon:, onbehalf:,
 * the placeholders) has no bank here, and their call reads no store either.
 *
 * Every read ends in one typed outcome, so a failure is never spoken as
 * "$0 spent" or "no transactions": data, not_connected, needs_verification,
 * needs_reauth (Plaid's ITEM_LOGIN_REQUIRED) or unreachable (5xx, timeout,
 * network, unread store).
 *
 * @module tools/domains/finance/plaid-caller
 */

import { isMemberIdentity } from '../../../services/identity/member-identity.js';
import { verifiedCallerId } from '../../../services/identity/verified-caller.js';
import { noteLinkedTokenUse } from '../../../utils/linked-token-use.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { getStoredAccessToken, getTokenData } from './plaid-items.js';

type PlaidOutcome<T> =
  { outcome: 'data'; data: T } | { outcome: 'not_connected' | 'needs_reauth' | 'unreachable' };
/** One Plaid API read: not_connected comes from the link, never from Plaid. */
export type PlaidRead<T> =
  { outcome: 'data'; data: T } | { outcome: 'needs_reauth' | 'unreachable' };

/** Who a Plaid tool may act for on this call. */
export type PlaidCaller =
  | { outcome: 'verified'; id: string }
  | { outcome: 'needs_verification' } // a member the server did not verify on this call
  | { outcome: 'not_connected' }; // not a member: no bank here

/** What each failure honestly means; not_connected is the tool's own offer to link. */
export const PLAID_LINES = {
  needs_verification:
    "I can go over your bank details once you're signed in to the Ferni app, so I know it's you.",
  needs_reauth:
    "Your bank wants you to sign in again before I can see anything, so I don't have your numbers right now. Want me to send you a link to reconnect?",
  unreachable:
    "I couldn't reach your bank just now, so I don't know your numbers yet. Want me to try again in a bit?",
} as const;

/** The call's own caller: verified, a member still to verify, or nobody with a bank here. */
export function plaidCaller(opts: unknown): PlaidCaller {
  const run = (opts as { ctx?: { userId?: unknown; userData?: { userId?: unknown } } } | undefined)
    ?.ctx;
  const userData = run?.userData;
  // The finance executor's ctx names the dispatcher's user as ctx.userId with no
  // userData, so no verified bit: that caller can only ever be asked to verify.
  const named = userData ? userData.userId : run?.userId;
  const id = typeof named === 'string' ? named.trim() : undefined;
  if (!isMemberIdentity(id)) return { outcome: 'not_connected' };
  return verifiedCallerId(userData) === id
    ? { outcome: 'verified', id }
    : { outcome: 'needs_verification' };
}

/** The verified caller's first linked Item (null: none); throws when the store can't be read. */
export async function callerTokenData(
  caller: string
): Promise<Awaited<ReturnType<typeof getTokenData>>> {
  const data = await getTokenData(caller);
  noteLinkedTokenUse('plaid', caller, data?.access_token ? 'connected' : 'not_connected');
  return data;
}

/** The verified caller's access token as an outcome. A store read that throws is unreachable. */
async function callerAccessToken(caller: string): Promise<PlaidOutcome<string>> {
  try {
    const accessToken = await getStoredAccessToken(caller);
    noteLinkedTokenUse('plaid', caller, accessToken ? 'connected' : 'not_connected');
    return accessToken ? { outcome: 'data', data: accessToken } : { outcome: 'not_connected' };
  } catch (error) {
    getLogger().warn({ error: String(error) }, 'Plaid link could not be read');
    return { outcome: 'unreachable' };
  }
}

/**
 * The verified caller's token, then one Plaid read with it: the data, or the
 * honest line saying why not (`notLinked` is the tool's own offer to link).
 */
export async function readCallerBank<T>(
  opts: unknown,
  notLinked: string,
  read: (accessToken: string) => Promise<PlaidRead<T>>
): Promise<{ line: string } | { caller: string; data: T }> {
  const who = plaidCaller(opts);
  if (who.outcome === 'needs_verification') return { line: PLAID_LINES.needs_verification };
  if (who.outcome === 'not_connected') return { line: notLinked };
  const link = await callerAccessToken(who.id);
  if (link.outcome === 'not_connected') return { line: notLinked };
  if (link.outcome !== 'data') return { line: PLAID_LINES[link.outcome] };
  const result = await read(link.data);
  if (result.outcome === 'data') return { caller: who.id, data: result.data };
  if (result.outcome === 'needs_reauth') noteLinkedTokenUse('plaid', who.id, 'needs_reauth');
  return { line: PLAID_LINES[result.outcome] };
}

/** YYYY-MM-DD, the form Plaid's date ranges take. */
export const isoDay = (date: Date): string => date.toISOString().split('T')[0];
