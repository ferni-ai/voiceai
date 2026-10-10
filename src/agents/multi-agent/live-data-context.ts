/**
 * In-call controls for a multi-agent call (the production path).
 *
 * The app's in-call messages (music play/pause, starting a game or a practice, approving
 * or rejecting an action, feedback, voice packs) are handled by setupDataChannelHandler,
 * which only single-agent calls registered, so in a live call they reached nothing.
 *
 * A multi-agent call replaces its agent and session on every handoff, so the handlers get
 * a context whose session and persona are read when each message arrives: always the
 * agent that's speaking now. Handoffs stay with the multi-agent call's own handler.
 */
import { forwardCameoReveals } from '../voice-agent/cameo-reveal.js';
import {
  setupDataChannelHandler,
  type DataChannelContext,
} from '../voice-agent/data-channel-handler.js';

interface LiveAgents {
  getActiveAgent(): { personaId: string; session: unknown } | null | undefined;
  getCurrentPersonaId(): string | null | undefined;
}

type StaticParts = Pick<
  DataChannelContext,
  'room' | 'ctx' | 'services' | 'userId' | 'sessionId' | 'sessionPersona'
>;

export function liveDataChannelContext(base: StaticParts, agents: LiveAgents): DataChannelContext {
  return {
    room: base.room,
    ctx: base.ctx,
    services: base.services,
    userId: base.userId,
    sessionId: base.sessionId,
    skipHandoffs: true,
    get session() {
      return agents.getActiveAgent()?.session as DataChannelContext['session'];
    },
    // The handlers read the persona's id; the rest stays the call's starting persona
    get sessionPersona() {
      const id = agents.getCurrentPersonaId();
      return id && id !== base.sessionPersona.id
        ? { ...base.sessionPersona, id }
        : base.sessionPersona;
    },
  };
}

/**
 * Everything a multi-agent call listens for or forwards besides handoffs: the app's
 * in-call controls, and Ferni's teammate introductions (setupFrontendPublisher does that
 * for single-agent calls, which a multi-agent call skips). Returns the cleanup.
 */
export function startInCallChannels(
  parts: Omit<StaticParts, 'room' | 'sessionPersona'> & {
    room?: StaticParts['room'];
    sessionPersona: unknown;
  },
  agents: LiveAgents
): () => void {
  if (!parts.room) return () => undefined;
  const base = {
    ...parts,
    room: parts.room,
    sessionPersona: parts.sessionPersona as StaticParts['sessionPersona'],
  };
  const controls = setupDataChannelHandler(liveDataChannelContext(base, agents));
  const stopCameoReveals = forwardCameoReveals(base.room, base.sessionId);
  return () => {
    controls.cleanup();
    stopCameoReveals();
  };
}
