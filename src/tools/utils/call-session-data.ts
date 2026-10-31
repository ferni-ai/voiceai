/**
 * The live call's session data from a tool run's options (`execute(args, opts)`:
 * LiveKit hands every tool `opts.ctx.userData`). One object per AgentSession, so
 * it keys per-call state in a WeakMap: nothing carries into the next call, and
 * the entry goes when the session does.
 *
 * @module tools/utils/call-session-data
 */

/** The call session's userData, or undefined (no session, or the SDK throws: userData not set). */
export function callSessionData(opts: unknown): object | undefined {
  try {
    const data = (opts as { ctx?: { userData?: unknown } } | undefined)?.ctx?.userData;
    return typeof data === 'object' && data !== null ? data : undefined;
  } catch {
    return undefined;
  }
}
