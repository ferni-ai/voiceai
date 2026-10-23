/**
 * A tool built once and shared across calls, that still runs as each call's
 * own caller.
 *
 * PRIVACY: the Tier-0 tool gateway and the fast-path essential tools are built
 * once per process with a placeholder ctx (`userId: 'gateway'` / `'shared'`)
 * and handed to every session. A tool that keys data by its factory
 * `ctx.userId` (Spotify rooms, favourite teams, watchlist, info preferences)
 * then put every caller in one bucket. perCallerTool keeps the shared instance
 * for its name, description and schema, and on each call builds the tool again
 * for the caller LiveKit names in `opts.ctx.userData.userId`.
 *
 * @module tools/registry/per-caller-tool
 */
import { isMemberIdentity } from '../../services/identity/member-identity.js';
import { newAnonymousId } from '../../services/identity/anonymous-session-id.js';
import { nonAccountPrefixOf } from '../../utils/synthetic-user.js';
import type { Tool, ToolContext, ToolDefinition } from './types.js';

/**
 * The caller a tool call runs as: the call's own `opts.ctx.userData.userId`
 * when it is a member or a per-call anon:/onbehalf: id. A missing id or a
 * placeholder (`unknown`, `anonymous`, ...) gets a fresh anon: id, so the call
 * keeps its state to itself instead of sharing one bucket with every id-less
 * caller. A `userId` anywhere else (args, `opts.userId`) is never read.
 */
export function toolCallerId(opts: unknown): string {
  const raw = (opts as { ctx?: { userData?: { userId?: unknown } } } | undefined)?.ctx?.userData
    ?.userId;
  return ownOrEphemeralId(typeof raw === 'string' ? raw : undefined);
}

/** A member's or a per-call anon:/onbehalf: id as given; anything else, a fresh anon: id. */
export function ownOrEphemeralId(userId: string | undefined): string {
  const id = userId?.trim();
  return id && (isMemberIdentity(id) || nonAccountPrefixOf(id)) ? id : newAnonymousId();
}

/** The shared tool, whose execute builds a fresh instance for each call's caller. */
export function perCallerTool(def: ToolDefinition, base: Omit<ToolContext, 'userId'>): Tool {
  // Never executed: it only lends the shared tool its name, description and schema.
  const shared: Tool = def.create({ ...base, userId: 'gateway' });
  if (!shared || typeof shared.execute !== 'function') return shared;
  return {
    ...shared,
    execute: (args: unknown, opts: unknown): unknown => {
      const own: Tool = def.create({ ...base, userId: toolCallerId(opts) });
      return own.execute(args, opts);
    },
  };
}
