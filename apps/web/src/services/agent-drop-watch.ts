/**
 * Agent Drop Watch
 *
 * Notices when Ferni's side of a call ends while the caller is still in the
 * room, so the app can offer to reconnect instead of leaving them on a silent
 * line. Prod 2026-10-13: the agent session closed on an error and the caller
 * stayed connected, alone, for 15+ minutes with nothing on screen.
 *
 * Two signals:
 * 1. `agent_session_ended` on the data channel: an agent that says its
 *    session closed (the voice agent no longer sends it; signal 2 covers that).
 * 2. The agent participant leaves and no agent is back within a short grace.
 *    Covers a crashed pod that never sends anything. Persona handoffs keep the
 *    same agent participant, and an agent swap rejoins within the grace.
 *
 * 3. With call wrap-up on, a `conversation_end` that isn't a planned goodbye
 *    (planned-goodbye.ts): silence, repeated failures. The agent may stay in
 *    the room ("let me reconnect"), so this fires at once.
 *
 * Never fires once the user is hanging up, after the room drops, or after a
 * `conversation_end` that ends the call. Fires at most once.
 * Off unless the agent-drop prompt flag or call wrap-up is on (planned-goodbye.ts).
 */

import { conversationEndEndsCall, reconnectPromptOn } from './planned-goodbye.js';
import { createLogger } from '../utils/logger.js';
import { isAgentParticipant, type PresenceParticipant } from './agent-presence.js';

const log = createLogger('AgentDropWatch');

/** How long the agent may be gone before we call it a drop (handoff / agent swap). */
export const AGENT_DROP_GRACE_MS = 3_000;

export type AgentLostReason = 'session_ended' | 'agent_left' | 'ended_without_goodbye';

type ParticipantEvent = 'participantConnected' | 'participantDisconnected';

export interface AgentDropRoom {
  state: string;
  remoteParticipants: Map<string, PresenceParticipant>;
  on(event: 'dataReceived', callback: (payload: Uint8Array) => void): unknown;
  on(event: ParticipantEvent, callback: (participant: PresenceParticipant) => void): unknown;
  off(event: 'dataReceived', callback: (payload: Uint8Array) => void): unknown;
  off(event: ParticipantEvent, callback: (participant: PresenceParticipant) => void): unknown;
}

export interface AgentDropDeps {
  /** True once the user has started hanging up. */
  userHangingUp: () => boolean;
  /** Ferni's side ended with the caller still here. */
  onAgentLost: (reason: AgentLostReason) => void;
  graceMs?: number;
  enabled?: () => boolean;
}

function parseMessage(payload: Uint8Array): { type: unknown; reason?: unknown } | null {
  try {
    return JSON.parse(new TextDecoder().decode(payload)) as { type: unknown; reason?: unknown };
  } catch {
    return null; // not JSON: connection.service logs unparseable messages
  }
}

/**
 * Watch `room` for the agent dropping off. Returns the cleanup function; the
 * connection service runs it on hang-up and on every room teardown.
 */
export function watchAgentDrop(room: AgentDropRoom, deps: AgentDropDeps): () => void {
  if (!(deps.enabled ?? reconnectPromptOn)()) return () => undefined;
  const graceMs = deps.graceMs ?? AGENT_DROP_GRACE_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let done = false;

  const cancelTimer = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const stillOnTheLine = (): boolean =>
    !done && !deps.userHangingUp() && room.state === 'connected';
  const lost = (reason: AgentLostReason): void => {
    cancelTimer();
    if (!stillOnTheLine()) return;
    done = true;
    log.warn('Ferni dropped off the call; offering to reconnect', { reason });
    deps.onAgentLost(reason);
  };

  const onData = (payload: Uint8Array): void => {
    const message = parseMessage(payload);
    if (message?.type === 'agent_session_ended') return lost('session_ended');
    if (message?.type !== 'conversation_end') return;
    if (!conversationEndEndsCall(message.reason)) return lost('ended_without_goodbye');
    done = true; // a goodbye that ends the call: the app hangs up on its own
    cancelTimer();
  };
  const onLeave = (participant: PresenceParticipant): void => {
    if (done || !isAgentParticipant(participant)) return;
    cancelTimer();
    timer = setTimeout(() => {
      timer = null;
      if (![...room.remoteParticipants.values()].some(isAgentParticipant)) lost('agent_left');
    }, graceMs);
  };
  const onJoin = (participant: PresenceParticipant): void => {
    if (isAgentParticipant(participant)) cancelTimer();
  };

  room.on('dataReceived', onData);
  room.on('participantDisconnected', onLeave);
  room.on('participantConnected', onJoin);
  return () => {
    cancelTimer();
    done = true;
    room.off('dataReceived', onData);
    room.off('participantDisconnected', onLeave);
    room.off('participantConnected', onJoin);
  };
}
