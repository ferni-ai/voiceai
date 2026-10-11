/**
 * Who is talking on a call, read from the LiveKit room.
 *
 * - Ferni: the agent participant's `lk.agent.state` attribute, set by the
 *   LiveKit agents SDK (initializing, listening, thinking, speaking).
 * - You: the room's active speakers, with your mic level (0 to 1).
 * - Tap to interrupt: the agent sets `ferni.tap_interrupt` to "on" only once
 *   it handles the `user_interrupt` data message, so the client never offers
 *   a button that does nothing.
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('SpeakerCuesSignals');

export type AgentState = 'initializing' | 'listening' | 'thinking' | 'speaking' | 'unknown';

export interface SpeakerSignals {
  agentState: AgentState;
  userSpeaking: boolean;
  userLevel: number;
  canInterrupt: boolean;
}

/** The slice of a livekit-client Room the cues use. */
export interface CueRoom {
  localParticipant: {
    identity: string;
    publishData(data: Uint8Array, options?: { reliable?: boolean }): Promise<void>;
  };
  remoteParticipants: Map<string, unknown>;
  on(event: string, callback: (...args: unknown[]) => void): unknown;
  off(event: string, callback: (...args: unknown[]) => void): unknown;
}

const AGENT_STATES: readonly AgentState[] = ['initializing', 'listening', 'thinking', 'speaking'];

function field(participant: unknown, key: string): unknown {
  return typeof participant === 'object' && participant !== null
    ? (participant as Record<string, unknown>)[key]
    : undefined;
}

function agentSignals(room: CueRoom): Pick<SpeakerSignals, 'agentState' | 'canInterrupt'> {
  for (const participant of room.remoteParticipants.values()) {
    const attrs = field(participant, 'attributes');
    const state = field(attrs, 'lk.agent.state');
    if (typeof state !== 'string') continue;
    return {
      agentState: AGENT_STATES.find((s) => s === state) ?? 'unknown',
      canInterrupt: field(attrs, 'ferni.tap_interrupt') === 'on',
    };
  }
  return { agentState: 'unknown', canInterrupt: false };
}

/** Calls onChange now and whenever who is talking changes. Returns a stop function. */
export function watchSpeakerSignals(
  room: CueRoom,
  onChange: (signals: SpeakerSignals) => void
): () => void {
  let current: SpeakerSignals = { ...agentSignals(room), userSpeaking: false, userLevel: 0 };
  const publish = (next: SpeakerSignals): void => {
    const keys = Object.keys(next) as Array<keyof SpeakerSignals>;
    if (keys.every((k) => next[k] === current[k])) return;
    current = next;
    onChange(current);
  };

  const onAgentChange = (): void => publish({ ...current, ...agentSignals(room) });
  const onActiveSpeakers = (speakers: unknown): void => {
    const me = (Array.isArray(speakers) ? (speakers as unknown[]) : []).find(
      (p) => field(p, 'identity') === room.localParticipant.identity
    );
    const level = field(me, 'audioLevel');
    publish({
      ...current,
      userSpeaking: me !== undefined,
      userLevel: typeof level === 'number' ? Math.round(Math.min(1, level) * 20) / 20 : 0,
    });
  };

  room.on('participantAttributesChanged', onAgentChange);
  room.on('participantDisconnected', onAgentChange);
  room.on('activeSpeakersChanged', onActiveSpeakers);
  onChange(current);
  return () => {
    room.off('participantAttributesChanged', onAgentChange);
    room.off('participantDisconnected', onAgentChange);
    room.off('activeSpeakersChanged', onActiveSpeakers);
  };
}

export type InterruptResult = 'sent' | 'no-call' | 'failed';

/** Ask the agent to stop talking now (its `user_interrupt` handler). */
export async function sendInterrupt(room: CueRoom | null): Promise<InterruptResult> {
  if (!room) return 'no-call';
  const message = JSON.stringify({ type: 'user_interrupt', timestamp: Date.now() });
  try {
    await room.localParticipant.publishData(new TextEncoder().encode(message), { reliable: true });
    return 'sent';
  } catch (error) {
    log.warn('Interrupt not sent', { error: String(error) });
    return 'failed';
  }
}
