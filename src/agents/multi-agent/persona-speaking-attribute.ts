/**
 * Who is speaking, for the app's name chip: participant attributes `ferni.persona`
 * (canonical persona id) and `ferni.persona_name` (display name) on the agent.
 * PERSONA_SPEAKING_ATTRIBUTE=on (default off). Contract: docs/api/persona-attribute.md.
 *
 * The app only learned who was on from handoff_started (sent before the goodbye) or
 * handoff_complete (sent after the greeting), so on iOS the chip said "Ferni" for about
 * 2 s while Maya talked. These attributes change when a persona's audio starts: the SDK
 * moves the agent to `speaking` on a speech's first audio frame, and the persona is the
 * one `userData.personaId` names, the same field that picks the voice (persona-swap.ts
 * sets it only after the outgoing persona's speech has drained). So the goodbye carries
 * the old name and the new one appears with the new voice.
 *
 * @module agents/multi-agent/persona-speaking-attribute
 */
import { voice } from '@livekit/agents';
import { flagOn } from '../../config/env-flag.js';
import { getCanonicalPersonaId, getPersonaDisplayName } from '../../personas/voice-registry.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'persona-speaking-attribute' });

export const PERSONA_ATTRIBUTE = 'ferni.persona';
export const PERSONA_NAME_ATTRIBUTE = 'ferni.persona_name';

type Env = Record<string, string | undefined>;

/** The parts of the LiveKit room this needs. */
export interface PersonaAttributeRoom {
  localParticipant?: { setAttributes: (attributes: Record<string, string>) => Promise<void> };
}

/** The parts of the AgentSession this needs. */
export interface SpeakingSession {
  on: (
    event: voice.AgentSessionEventTypes.AgentStateChanged,
    handler: (event: voice.AgentStateChangedEvent) => void
  ) => unknown;
}

/** Per call (room): the persona last written, and whether the call's first persona was shown. */
const callState = new WeakMap<object, { shown?: string; started: boolean }>();

function stateOf(room: object): { shown?: string; started: boolean } {
  let state = callState.get(room);
  if (!state) callState.set(room, (state = { started: false }));
  return state;
}

/** Write the attributes for `personaId`, only when they change. */
function show(room: PersonaAttributeRoom, personaId: string): void {
  const participant = room.localParticipant;
  if (!participant) return;
  const id = getCanonicalPersonaId(personaId);
  const state = stateOf(room);
  if (state.shown === id) return;
  state.shown = id;
  participant
    .setAttributes({ [PERSONA_ATTRIBUTE]: id, [PERSONA_NAME_ATTRIBUTE]: getPersonaDisplayName(id) })
    .catch((err: unknown) => {
      if (state.shown === id) state.shown = undefined; // the next speech tries again
      log.warn({ err, personaId: id }, 'Could not set the persona attribute');
    });
}

/**
 * Keep the persona attributes on `room`'s agent in step with `session`'s speech.
 * The call's first session shows its persona at once (call start); a persona with a
 * session of its own (MULTI_AGENT_SINGLE_SESSION=off) is shown from its first audio.
 * No-op, and nothing is ever written, with the flag off.
 */
export function installPersonaSpeakingAttribute(
  session: SpeakingSession,
  room: PersonaAttributeRoom | undefined,
  userData: { personaId?: string },
  env: Env = process.env
): void {
  if (!room || !flagOn('PERSONA_SPEAKING_ATTRIBUTE', env)) return;
  const state = stateOf(room);
  if (!state.started && userData.personaId) {
    state.started = true;
    show(room, userData.personaId);
  }
  session.on(voice.AgentSessionEventTypes.AgentStateChanged, (event) => {
    if (event?.newState === 'speaking' && userData.personaId) show(room, userData.personaId);
  });
}
