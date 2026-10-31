/**
 * Whose bank a Plaid tool reads, and what it may honestly say about it.
 *
 * PRIVACY: the Plaid tools used to take `userId` from the model's arguments, so
 * one caller could ask for another person's balances and transactions. A Plaid
 * tool now runs only as the call's own caller: LiveKit's `opts.ctx.userData.userId`
 * when the call carries one, else the factory ctx's `userId` (perCallerTool sets
 * it from the same opts; the finance executor sets it from the dispatcher's
 * session). A `userId` in the arguments is never read. Anyone who is not a
 * member (anon:, onbehalf:, the placeholders) has no bank here, and their call
 * reads no store at all.
 *
 * Every read ends in one typed outcome, so a failure is never spoken as
 * "$0 spent" or "no transactions": data, not_connected, needs_reauth (Plaid's
 * ITEM_LOGIN_REQUIRED) or unreachable (5xx, timeout, network, unread store).
 *
 * @module tools/domains/finance/plaid-caller
 */

import { isMemberIdentity } from '../../../services/identity/member-identity.js';
import { noteLinkedTokenUse } from '../../../utils/linked-token-use.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { getStoredAccessToken, getTokenData } from './plaid-items.js';

type PlaidFailure = 'not_connected' | 'needs_reauth' | 'unreachable';
type PlaidOutcome<T> = { outcome: 'data'; data: T } | { outcome: PlaidFailure };
/** One Plaid API read: not_connected comes from the link, never from Plaid. */
export type PlaidRead<T> =
  { outcome: 'data'; data: T } | { outcome: 'needs_reauth' | 'unreachable' };

/** The caller's half of a tool's factory ctx; a ToolContext fits. */
export interface PlaidToolCtx {
  userId?: string;
}

/** What each failure honestly means; not_connected is the tool's own offer to link. */
export const PLAID_LINES = {
  needs_reauth:
    "Your bank wants you to sign in again before I can see anything, so I don't have your numbers right now. Want me to send you a link to reconnect?",
  unreachable:
    "I couldn't reach your bank just now, so I don't know your numbers yet. Want me to try again in a bit?",
} as const;

/** The call's own caller when they are a member; undefined for anyone else. */
export function plaidCaller(ctx: PlaidToolCtx | undefined, opts: unknown): string | undefined {
  const live = (opts as { ctx?: { userData?: { userId?: unknown } } } | undefined)?.ctx?.userData
    ?.userId;
  const id = typeof live === 'string' && live.trim() ? live : ctx?.userId;
  return isMemberIdentity(id) ? id.trim() : undefined;
}

/** The caller's first linked Item (null: none); throws when the store can't be read. */
export async function callerTokenData(
  caller: string | undefined
): Promise<Awaited<ReturnType<typeof getTokenData>>> {
  if (!caller) return null;
  const data = await getTokenData(caller);
  noteLinkedTokenUse('plaid', caller, data?.access_token ? 'connected' : 'not_connected');
  return data;
}

/**
 * The caller's access token as an outcome. No caller: not_connected and no read.
 * A store read that throws is unreachable, never "not linked".
 */
async function callerAccessToken(
  ctx: PlaidToolCtx | undefined,
  opts: unknown
): Promise<PlaidOutcome<{ caller: string; accessToken: string }>> {
  const caller = plaidCaller(ctx, opts);
  if (!caller) return { outcome: 'not_connected' };
  try {
    const accessToken = await getStoredAccessToken(caller);
    noteLinkedTokenUse('plaid', caller, accessToken ? 'connected' : 'not_connected');
    return accessToken
      ? { outcome: 'data', data: { caller, accessToken } }
      : { outcome: 'not_connected' };
  } catch (error) {
    getLogger().warn({ error: String(error) }, 'Plaid link could not be read');
    return { outcome: 'unreachable' };
  }
}

/**
 * The caller's token, then one Plaid read with it: the data, or the honest line
 * saying why not (`notLinked` is the tool's own offer to link).
 */
export async function readCallerBank<T>(
  ctx: PlaidToolCtx | undefined,
  opts: unknown,
  notLinked: string,
  read: (accessToken: string) => Promise<PlaidRead<T>>
): Promise<{ line: string } | { caller: string; data: T }> {
  const link = await callerAccessToken(ctx, opts);
  if (link.outcome === 'not_connected') return { line: notLinked };
  if (link.outcome !== 'data') return { line: PLAID_LINES[link.outcome] };
  const { caller, accessToken } = link.data;
  const result = await read(accessToken);
  if (result.outcome === 'data') return { caller, data: result.data };
  if (result.outcome === 'needs_reauth') noteLinkedTokenUse('plaid', caller, 'needs_reauth');
  return { line: PLAID_LINES[result.outcome] };
}
