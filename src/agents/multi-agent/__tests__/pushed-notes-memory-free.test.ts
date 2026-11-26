/**
 * The pushed note's text without recalled memory (CRISIS_NO_MEMORY_RECALL): built from each
 * note's memory-free twin, and dropped from a note cut to its safety part, so a crisis request
 * never puts the cut note back as its longer text.
 */
import { describe, expect, it } from 'vitest';
import {
  memoryFreeText,
  WITHOUT_RECALLED_MEMORY,
  withoutRecalledMemory,
} from '../../processors/turn-processor/crisis-memory-recall.js';
import {
  memoryFreeNotesText,
  pushedNotesText,
  safetyOnlyNote,
  TURN_CONTEXT_SAFETY,
} from '../pushed-notes.js';

const MEMORY = "[RELEVANT MEMORIES]\n- Riley Test's dog Biscuit died in March.";
const CONTEXT = '[CONTEXT] They are making dinner.';
const SAFETY = '[SAFETY] Stay with them and ask whether they are safe right now.';

describe('memoryFreeNotesText', () => {
  it('is undefined when no note carries recalled memory', () => {
    expect(memoryFreeNotesText([{ text: CONTEXT }, { text: SAFETY, safety: true }])).toBe(
      undefined
    );
  });

  it('is the pushed text with each note that carries memory put back as its twin', () => {
    const notes = [
      { text: `${CONTEXT}\n\n${MEMORY}`, bare: CONTEXT },
      { text: SAFETY, safety: true },
    ];
    expect(pushedNotesText(notes)).toContain('Biscuit'); // precondition: the full text has it
    expect(memoryFreeNotesText(notes)).toBe(
      pushedNotesText([{ text: CONTEXT }, { text: SAFETY, safety: true }])
    );
  });

  it('leaves out a note that was only recalled memory', () => {
    const notes = [{ text: MEMORY, bare: '' }, { text: CONTEXT }];
    expect(memoryFreeNotesText(notes)).toBe(pushedNotesText([{ text: CONTEXT }]));
  });
});

describe('safetyOnlyNote', () => {
  const note = (extra: Record<string, unknown>) => ({
    content: [`[TURN CONTEXT]\n${CONTEXT}\n\n${MEMORY}\n\n${SAFETY}`],
    extra,
  });

  it('drops the memory-free twin, so the cut note is never put back as the longer text', () => {
    const full = note({
      [TURN_CONTEXT_SAFETY]: SAFETY,
      [WITHOUT_RECALLED_MEMORY]: `[TURN CONTEXT]\n${CONTEXT}\n\n${SAFETY}`,
    });
    expect(memoryFreeText(full)).toBeDefined(); // precondition: the twin is there
    const cut = safetyOnlyNote(full, '[TURN CONTEXT]')!;
    expect(cut.content).toEqual([`[TURN CONTEXT]\n${SAFETY}`]);
    expect(memoryFreeText(cut)).toBe(undefined);
    expect(withoutRecalledMemory([cut])).toEqual([cut]); // a crisis request keeps the cut
    expect(cut.extra).toEqual({ [TURN_CONTEXT_SAFETY]: SAFETY });
  });

  it('keeps the same extra object when there is no twin (flag off)', () => {
    const extra = { [TURN_CONTEXT_SAFETY]: SAFETY };
    expect(safetyOnlyNote(note(extra), '[TURN CONTEXT]')!.extra).toBe(extra);
  });
});
