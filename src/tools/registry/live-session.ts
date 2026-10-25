/**
 * Which live call a tool ran in, by its real session id, so a call Ferni
 * places for the owner can report back into that call.
 *
 * Prod 2026-10-24 (phone-calls audit, row 12): callOnBehalf was built by the
 * tool orchestrator with no sessionId (tool-orchestrator.ts, builder.ts and
 * the per-process tool gateway all build without one), so the request stored
 * originalSessionId = ctx.agentId ("ferni") and the result never found the
 * owner's call. LiveKit hands every tool call its run context, whose
 * `session` is the call's AgentSession, so the id is read there at run time,
 * whichever path built the tool.
 *
 * The map is per process: a result captured in another worker finds nothing
 * and falls back to While You Were Away.
 *
 * @module tools/registry/live-session
 */
import type { Tool, ToolContext } from './types.js';

interface Runnable {
  execute: (args: unknown, opts: unknown) => unknown;
}

/** One registration: a persona handoff re-notes the same session, so each release owns its own. */
interface Entry {
  session: object;
  sessionId: string;
}

const entryBySession = new WeakMap<object, Entry>();
const entryById = new Map<string, Entry>();

/**
 * Session setup: this call's AgentSession is live under `sessionId`. Returns the
 * release, which removes only this registration: after a handoff re-notes the
 * session, the old persona's late cleanup leaves the new one in place.
 */
export function noteLiveSession(session: object, sessionId: string): () => void {
  const entry: Entry = { session, sessionId };
  entryBySession.set(session, entry);
  entryById.set(sessionId, entry);
  return () => {
    if (entryById.get(sessionId) === entry) entryById.delete(sessionId);
    if (entryBySession.get(session) === entry) entryBySession.delete(session);
  };
}

/** The live AgentSession with this id in this process, if the call is still on. */
export function liveSessionFor(sessionId: string | undefined): object | undefined {
  return sessionId ? entryById.get(sessionId)?.session : undefined;
}

/** The real session id of the call a tool is running in (LiveKit's `opts.ctx.session`). */
export function liveSessionIdOf(opts: unknown): string | undefined {
  const session: unknown = (opts as { ctx?: { session?: unknown } } | undefined)?.ctx?.session;
  return typeof session === 'object' && session !== null
    ? entryBySession.get(session)?.sessionId
    : undefined;
}

/**
 * The tool, built again on each call with the session id of the call running it
 * (falling back to the id it was built with). Never an agent id.
 */
export function withLiveSessionId(ctx: ToolContext, make: (c: ToolContext) => Tool): Tool {
  const shared = make(ctx) as Partial<Runnable> | undefined;
  if (typeof shared?.execute !== 'function') return shared;
  return {
    ...shared,
    execute: (args: unknown, opts: unknown): unknown => {
      const sessionId = liveSessionIdOf(opts) ?? ctx.sessionId;
      return (make({ ...ctx, sessionId }) as Runnable).execute(args, opts);
    },
  };
}
