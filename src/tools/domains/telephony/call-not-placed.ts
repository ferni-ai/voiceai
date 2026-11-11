/**
 * The on-behalf initiator rejects with this code when Ferni's agent never
 * joined the call's room, so nothing was dialled (services/outreach/agent-join.ts).
 * callOnBehalf then says so plainly, never "I'm calling her now".
 *
 * @module tools/domains/telephony/call-not-placed
 */

/** The error code for "no agent joined, nothing rang". */
export const AGENT_NOT_JOINED = 'agent_not_joined';

/** What callOnBehalf answers when no agent joined. */
export const NO_AGENT_REPLY =
  "I couldn't place that call just now, so it didn't ring. Want me to try again in a minute?";

/** Whether `error` is the initiator's "no agent joined" rejection (matched by code). */
export function isAgentNotJoined(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === AGENT_NOT_JOINED;
}
