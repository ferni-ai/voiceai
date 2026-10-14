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

import {
  createMindNote,
  type IsForgotten,
  type MindNoteDeps,
} from '../../intelligence/theory-of-mind/note.js';
import { firestoreMindStore } from '../../memory/storage/mind-store.js';
import { forgottenTopicsOrNull, isForgotten } from '../../memory/recall/forget.js';
import { addRecallNote, type RecallAgent } from './memory-recall-hook.js';

export { theoryOfMindMode } from '../../intelligence/theory-of-mind/after-call.js';

interface SessionEvents {
  on(event: string, listener: (event: unknown) => void): unknown;
  off?(event: string, listener: (event: unknown) => void): unknown;
}

/**
 * What the caller asked Ferni to forget (forget.ts), as theory of mind takes it:
 * a filter, or null when the list can't be read. Used by the live note and the
 * after-call update (agents/theory-of-mind-register.ts), so a forgotten topic
 * stays out of both, as it does out of recall.
 */
export async function forgottenFilter(userId: string): Promise<IsForgotten | null> {
  const topics = await forgottenTopicsOrNull(userId);
  return topics && ((text: string) => isForgotten(text, topics));
}

/** Starts loading the caller's model and listens for their words. Returns the detach. */
export function attachMindNote(
  session: SessionEvents,
  agent: RecallAgent,
  deps: Omit<MindNoteDeps, 'store'> & Partial<Pick<MindNoteDeps, 'store'>>
): { ready: Promise<void>; detach: () => void } {
  const mind = createMindNote({
    forgotten: () => forgottenFilter(deps.userId),
    ...deps,
    store: deps.store ?? firestoreMindStore,
  });
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
