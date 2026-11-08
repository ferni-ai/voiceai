/**
 * PERSONA_GROWTH's note in the chat (persona-growth-recall.ts): added on its
 * own under GROWTH_NOTE_ID when recall decided it, and taken back out the
 * moment a crisis signal shows on the call, from the same transcript event
 * that re-checks recall's notes for forgotten topics (turn-packet.ts
 * sendRecall). That runs before the reply to those words, so the reply never
 * reads it; a classifier-only crisis found during the reply is kept from it by
 * crisis-gate.ts (withoutGrowthNote). Any error takes the note out.
 *
 * @module agents/personas/persona-growth-note
 */

import {
  addRecallNote,
  dropGrowthNote,
  GROWTH_NOTE_ID,
  type RecallAgent,
} from '../multi-agent/recall-note.js';
import { createLogger } from '../../utils/safe-logger.js';
import { growthOf, personaGrowthEnabled } from './persona-growth-recall.js';

const log = createLogger({ module: 'PersonaGrowthRecall' });

/** On each transcript recall sees: the growth note in, or (on a crisis signal) back out. */
export function sendGrowth(agent: RecallAgent, recall: object, said?: string): void {
  const growth = growthOf(recall);
  if (!growth || !personaGrowthEnabled()) return; // flag off: nothing read, nothing written
  try {
    if (growth.crisisNow(said)) {
      if (dropGrowthNote(agent, said) > 0) log.info({}, 'PERSONA_GROWTH_TAKEN_BACK');
      return;
    }
    const note = growth.take();
    if (note) addRecallNote(agent, note, said, GROWTH_NOTE_ID);
  } catch (error) {
    log.warn({ error: String(error) }, 'Persona growth note check failed; taking it out');
    try {
      dropGrowthNote(agent, said);
    } catch {
      // Nothing more to do: the crisis gate still keeps it from a guided reply.
    }
  }
}
