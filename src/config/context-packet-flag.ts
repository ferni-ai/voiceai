/**
 * CONTEXT_PACKET=on: one labelled, budgeted context packet per turn
 * (agents/personas/context-packet/). Off (the default): requests as before.
 * Read only in turn-request.ts and multi-agent/agent-setup.ts.
 *
 * @module config/context-packet-flag
 */

export function contextPacketEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.CONTEXT_PACKET?.trim().toLowerCase() === 'on';
}
