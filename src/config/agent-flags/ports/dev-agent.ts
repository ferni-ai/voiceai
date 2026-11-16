/**
 * The dev voice agent as the switchboard sees it: when each flag secret last changed, and
 * which rooms have someone in them (an update restarts the agent and drops live calls).
 * adapters/livekit-dev-agent.ts implements it on LiveKit Cloud.
 *
 * @module config/agent-flags/ports/dev-agent
 */

export interface DevAgent {
  /** Flag name to the RFC 3339 time its secret was last updated; LiveKit never returns values. */
  flagSecretTimes: () => Promise<Record<string, string>>;
  /** The dev project's rooms with at least one participant; rejects after 10 s. */
  occupiedRooms: () => Promise<Array<{ name: string; participants: number }>>;
}
