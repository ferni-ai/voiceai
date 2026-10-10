/**
 * Conversation Starter
 *
 * Several surfaces (the hub's Talk button and persona buttons, Chronicle's
 * "switch to voice", the proactive-message and outreach cards) ask the app to
 * start a voice conversation by dispatching an event. This is the one place
 * that answers them, doing what the home Connect button does.
 *
 * There is no channel to hand a topic to the agent at connect time, so the
 * context an event carries (outreach id, message reason) is logged, not sent.
 */

import { appState } from '../state/app.state.js';
import { isValidPersonaId, type PersonaId } from '../types/persona.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ConversationStarter');

/** Events that mean "start (or move to) a voice conversation". */
export const START_CONVERSATION_EVENTS = {
  window: ['ferni:start-conversation', 'ferni:start-journal-voice'],
  /** dispatched on document without bubbling, so window never sees it */
  document: ['ferni:outreach-respond'],
} as const;

export interface ConversationHost {
  /** What the Connect button runs */
  connect(): Promise<void>;
  selectPersona(personaId: PersonaId): void;
}

interface StartDetail {
  personaId?: unknown;
  outreachId?: unknown;
}

export function createConversationStarter(host: ConversationHost): EventListener {
  return (event: Event) => {
    const detail: StartDetail = (event as CustomEvent<StartDetail | null>).detail ?? {};
    const connection = appState.get('connection');
    log.debug({ event: event.type, connection, outreachId: detail.outreachId }, 'start requested');

    // A persona button while connected is a handoff; while idle it just picks who answers
    if (isValidPersonaId(detail.personaId)) host.selectPersona(detail.personaId);

    // Already in a call, or one is starting: nothing more to start
    if (connection !== 'disconnected') return;
    void host.connect();
  };
}
