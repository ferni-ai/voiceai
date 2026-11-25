/**
 * The on-behalf initiator rejects with this code when Ferni's agent never
 * joined the call's room, so nothing was dialled (services/outreach/agent-join.ts).
 * callOnBehalf then says so plainly, never "I'm calling her now".
 *
 * ON_BEHALF_JOIN_WAIT (off): the wait for the agent can run to 30 s on a cold
 * worker, so while the call is still being placed the member hears one fixed line
 * at STILL_CONNECTING_AFTER_MS, once per call attempt (whileConnecting). Tools (L3)
 * can't read the live call's crisis state (L4), so the live call installs who says
 * it (agents/multi-agent/still-connecting.ts), and that stays quiet on a crisis turn.
 * A call that still didn't connect is answered with NO_AGENT_REPLY as the reply
 * itself, as a held call's reply is, so the model is handed the sentence to say,
 * not an error to explain.
 *
 * @module tools/domains/telephony/call-not-placed
 */
import { flagOn } from '../../../config/env-flag.js';
import { liveSessionIdOf } from '../../registry/live-session.js';

/** The error code for "no agent joined, nothing rang". */
export const AGENT_NOT_JOINED = 'agent_not_joined';

/** What callOnBehalf answers when no agent joined. */
export const NO_AGENT_REPLY =
  "I couldn't place that call just now, so it didn't ring. Want me to try again in a minute?";

/** Whether `error` is the initiator's "no agent joined" rejection (matched by code). */
export function isAgentNotJoined(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === AGENT_NOT_JOINED;
}

/** callOnBehalf's answer when no agent joined: with ON_BEHALF_JOIN_WAIT, the reply text itself. */
export function noAgentReply(): string | { success: false; error: string } {
  return flagOn('ON_BEHALF_JOIN_WAIT') ? NO_AGENT_REPLY : { success: false, error: NO_AGENT_REPLY };
}

/** What the member hears while a confirmed call is still being placed (ON_BEHALF_JOIN_WAIT). */
const STILL_CONNECTING_LINE = 'Still connecting, one moment.';
/** How long a call may take to place before the member hears STILL_CONNECTING_LINE. */
const STILL_CONNECTING_AFTER_MS = 3_000;

/**
 * Says `line` in the call the tool runs in, or stays quiet: `opts` is the tool's execute() second
 * argument ({ ctx, ... }), `sessionId` that call's real session id when known.
 */
type StillConnectingPort = (opts: unknown, sessionId: string | undefined, line: string) => void;

let port: StillConnectingPort | undefined;

/** Installed by each live call (agents/multi-agent/still-connecting.ts); undefined clears it. */
export function setStillConnectingPort(next: StillConnectingPort | undefined): void {
  port = next;
}

/** `placing`, with STILL_CONNECTING_LINE said once if it hasn't settled in time (flag on). */
export async function whileConnecting<T>(opts: unknown, placing: Promise<T>): Promise<T> {
  if (!flagOn('ON_BEHALF_JOIN_WAIT')) return placing;
  const say = (): void => port?.(opts, liveSessionIdOf(opts), STILL_CONNECTING_LINE);
  const timer = setTimeout(say, STILL_CONNECTING_AFTER_MS);
  try {
    return await placing;
  } finally {
    clearTimeout(timer);
  }
}
