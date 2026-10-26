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
import { callerIdFor } from '../../services/identity/call-caller-id.js';
import type { Tool, ToolContext, ToolDefinition } from './types.js';

/**
 * The caller a tool call runs as: the call's own `opts.ctx.userData.userId`
 * when it is a member or a minted anon:/onbehalf: id; otherwise one anon: id
 * per session, keyed by the call's server-created AgentSession (or its
 * userData), so an id-less caller keeps their own state for the call and no
 * one else's. A `userId` anywhere else (args, `opts.userId`) is never read.
 */
export function toolCallerId(opts: unknown): string {
  const run = (opts as { ctx?: { userData?: { userId?: unknown }; session?: unknown } } | undefined)
    ?.ctx;
  const session = [run?.session, run?.userData].find((v) => v && typeof v === 'object') ?? null;
  return callerIdFor(run?.userData?.userId, session);
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
