/**
 * Agent Presence
 *
 * Waits for the voice agent to be in the room. The agent may join before or after
 * we do, so this checks the participants already present first and only then
 * listens for new arrivals. A call isn't "connected" until this resolves.
 */

import { ConnectStepError } from './connect-failure.js';

/** Default wait for the agent once the room is joined. */
export const AGENT_JOIN_TIMEOUT_MS = 15_000;
/** Shorter wait when the server already told us the dispatch failed. */
export const AGENT_JOIN_TIMEOUT_AFTER_FAILED_DISPATCH_MS = 6_000;

/** LiveKit's ParticipantInfo.Kind.AGENT. */
const PARTICIPANT_KIND_AGENT = 4;

export interface PresenceParticipant {
  identity: string;
  isLocal?: boolean;
  isAgent?: boolean;
  kind?: number | string;
}

export interface PresenceRoom {
  remoteParticipants: Map<string, PresenceParticipant>;
  on(event: 'participantConnected' | 'disconnected', cb: (p: PresenceParticipant) => void): unknown;
  off(
    event: 'participantConnected' | 'disconnected',
    cb: (p: PresenceParticipant) => void
  ): unknown;
}

/**
 * Whether a remote participant is the voice agent.
 * LiveKit marks agents with `isAgent` / kind AGENT; older SDKs expose neither,
 * in which case any remote participant counts (the room only holds caller + agent).
 */
export function isAgentParticipant(participant: PresenceParticipant): boolean {
  if (participant.isLocal) return false;
  if (typeof participant.isAgent === 'boolean') return participant.isAgent;
  if (participant.kind !== undefined) {
    return participant.kind === PARTICIPANT_KIND_AGENT || participant.kind === 'agent';
  }
  return true;
}

/** The agent already in the room, if any. */
export function findAgentParticipant(room: PresenceRoom): PresenceParticipant | null {
  for (const participant of room.remoteParticipants.values()) {
    if (isAgentParticipant(participant)) return participant;
  }
  return null;
}

/**
 * Resolve with the agent's identity once it is in the room.
 * Rejects with ConnectStepError('agent_timeout') after `timeoutMs`,
 * ConnectStepError('dropped') as soon as the room disconnects,
 * or ConnectStepError('cancelled') if `signal` aborts first.
 */
export function waitForAgent(
  room: PresenceRoom,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<string> {
  const present = findAgentParticipant(room);
  if (present) return Promise.resolve(present.identity);

  return new Promise<string>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (): void => {
      if (timer) clearTimeout(timer);
      room.off('participantConnected', onJoin);
      room.off('disconnected', onDrop);
      signal?.removeEventListener('abort', onAbort);
    };
    const onJoin = (participant: PresenceParticipant): void => {
      if (!isAgentParticipant(participant)) return;
      finish();
      resolve(participant.identity);
    };
    const onAbort = (): void => {
      finish();
      reject(new ConnectStepError('cancelled'));
    };
    const onDrop = (): void => {
      finish();
      reject(new ConnectStepError('dropped'));
    };

    if (signal?.aborted) {
      reject(new ConnectStepError('cancelled'));
      return;
    }
    room.on('participantConnected', onJoin);
    room.on('disconnected', onDrop);
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => {
      finish();
      reject(new ConnectStepError('agent_timeout'));
    }, timeoutMs);
  });
}
