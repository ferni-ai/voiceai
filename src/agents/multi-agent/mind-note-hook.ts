/**
 * Puts what Ferni understands about the caller (intelligence/theory-of-mind)
 * into the live agent's context, behind THEORY_OF_MIND=on.
 *
 * Same timing as memory recall (memory-recall-hook.ts): the note is added in
 * the transcript event's own tick, before the SDK starts preemptive
 * generation, so it reaches the first reply and costs it nothing.
 *
 * @module agents/multi-agent/mind-note-hook
 */

import { createMindNote, type MindNoteDeps } from '../../intelligence/theory-of-mind/note.js';
import { addRecallNote, type RecallAgent } from './memory-recall-hook.js';

export { theoryOfMindMode } from '../../intelligence/theory-of-mind/after-call.js';

interface SessionEvents {
  on(event: string, listener: (event: unknown) => void): unknown;
  off?(event: string, listener: (event: unknown) => void): unknown;
}

/** Starts loading the caller's model and listens for their words. Returns the detach. */
export function attachMindNote(
  session: SessionEvents,
  agent: RecallAgent,
  deps: MindNoteDeps
): { ready: Promise<void>; detach: () => void } {
  const mind = createMindNote(deps);
  const onTranscript = (event: unknown) => {
    const transcript = (event as { transcript?: string }).transcript;
    const note = transcript ? mind.noteFor(transcript) : null;
    if (note) addRecallNote(agent, note);
  };
  const onAgentState = (event: unknown) => {
    if ((event as { newState?: string }).newState === 'speaking') mind.newTurn();
  };
  session.on('user_input_transcribed', onTranscript);
  session.on('agent_state_changed', onAgentState);
  return {
    ready: mind.ready,
    detach: () => {
      session.off?.('user_input_transcribed', onTranscript);
      session.off?.('agent_state_changed', onAgentState);
    },
  };
}
