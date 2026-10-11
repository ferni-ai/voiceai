/**
 * The session ID of the call a tool is running in.
 *
 * Tools are built once per agent with a ToolContext whose sessionId may be
 * unset; the live call's ID is on the run context's userData. Sending to the
 * call's own session keeps app messages from reaching another caller.
 *
 * @module tools/utils/call-session
 */

import type { ToolContext } from '../registry/types.js';

/** The call's session ID from the run context, else the tool's build-time one. */
export function callSessionId(
  run: unknown,
  ctx: Pick<ToolContext, 'sessionId'>
): string | undefined {
  if (typeof run === 'object' && run !== null && 'ctx' in run) {
    const runCtx = (run as { ctx?: { userData?: unknown } }).ctx;
    const userData = runCtx?.userData;
    if (typeof userData === 'object' && userData !== null && 'services' in userData) {
      const services = (userData as { services?: { sessionId?: unknown } }).services;
      if (typeof services?.sessionId === 'string' && services.sessionId) return services.sessionId;
    }
  }
  return ctx.sessionId;
}
