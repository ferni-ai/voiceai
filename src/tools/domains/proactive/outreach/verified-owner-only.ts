/**
 * Tools that send the account owner a message the model wrote (a text, an
 * email or a call, now or scheduled) run only for a caller the server verified
 * on this call (`userData.verifiedCaller`, services/identity/verified-caller.ts).
 *
 * The destination was already safe: these tools reach only the verified phone
 * or email on the account. The content was not. A session matched to a member
 * by caller ID alone, which can be spoofed, could have Ferni deliver words of
 * the caller's choosing to the real member's phone, under Ferni's name. Now
 * anyone who is not the verified owner of the account gets one honest line,
 * and nothing runs: no send, no schedule, no store read.
 *
 * @module tools/domains/proactive/outreach/verified-owner-only
 */

import { verifiedCallerId } from '../../../../services/identity/verified-caller.js';
import type { Tool, ToolContext, ToolDefinition } from '../../../registry/types.js';

/** Who an owner-only tool may send to on this call. */
export type OwnerReach = { outcome: 'verified'; id: string } | { outcome: 'needs_verification' };

/** What a caller the server did not verify hears; nothing was sent. */
export const OWNER_NEEDS_VERIFICATION =
  "Nothing was sent: I can only text, email or call you once you've verified it's you in the Ferni app.";

/** The tool's owner (`ownerId`) when this run's caller is that owner, verified on this call. */
export function ownerReach(ownerId: string, opts: unknown): OwnerReach {
  const userData = (opts as { ctx?: { userData?: unknown } } | undefined)?.ctx?.userData;
  const caller = verifiedCallerId(userData);
  return caller !== null && caller === ownerId
    ? { outcome: 'verified', id: caller }
    : { outcome: 'needs_verification' };
}

/** The definition, wrapped to run only for the verified owner of `ctx.userId`. */
export function verifiedOwnerOnly(def: ToolDefinition): ToolDefinition {
  return {
    ...def,
    create: (ctx: ToolContext): Tool => {
      const tool = def.create(ctx);
      type Execute = (args: unknown, opts?: unknown) => Promise<unknown>;
      const execute = (tool as { execute: Execute }).execute.bind(tool);
      const run = async (args: unknown, opts?: unknown): Promise<unknown> =>
        ownerReach(ctx.userId, opts).outcome === 'verified'
          ? execute(args, opts)
          : OWNER_NEEDS_VERIFICATION;
      return { ...tool, execute: run } as Tool;
    },
  };
}
