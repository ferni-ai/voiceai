/**
 * DIRECTOR_STT_SLIPS (#2438). Prod AJ_9BQYeZ6PvesX: "it's going pretty good for
 * him" (a mishearing of "for me") got the note "He referred to himself as 'him' in
 * the third person. Don't let it slide.", and Ferni repeated "for him" back. The fix
 * is a rule in every director and deliberator prompt (guardRuleFor), not a word
 * filter on notes: the filter in #4276 dropped notes that matter ("She said she
 * wrote goodbye letters. Don't let that slide.") and failed review twice.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DELIBERATION_SYSTEM, deliberationSystem } from '../deliberation.js';
import { FERNI_CAST } from '../director-cast.js';
import { guardRuleFor } from '../director-guard.js';
import { DIRECTOR_SYSTEM, Director, directorSystem, parseNotes } from '../director-notes.js';

const RULE =
  'The caller\'s words reach you through speech-to-text, which mishears: "it\'s going pretty good for him" was "for me". One word that doesn\'t fit what they\'re saying (a pronoun, a name, a word that sounds like another) is a mishearing, not something they meant. Never write a note about it, and never tell him to point it out, question it or repeat it: Ferni answers what they meant.';

/** Notes that matter, which the filter in #4276 dropped; the rule adds no filter. */
const KEPT = [
  "She said she wrote goodbye letters. Don't let that slide.",
  'He said nobody would notice if he was gone. Point that out gently.',
  "She said she ran her first 5k! Don't let that pass without cheering.",
];

afterEach(() => vi.unstubAllEnvs());

describe("the director's and deliberator's rule", () => {
  it('flag off (today): not there, and both prompts are unchanged', () => {
    vi.stubEnv('DIRECTOR_STT_SLIPS', 'off');
    expect(guardRuleFor(FERNI_CAST)).not.toContain('speech-to-text');
    expect(directorSystem()).toBe(DIRECTOR_SYSTEM);
    expect(deliberationSystem(FERNI_CAST)).toBe(DELIBERATION_SYSTEM);
  });

  it('flag on: in the director prompt and the deliberator thought rule, after the guard', () => {
    vi.stubEnv('DIRECTOR_STT_SLIPS', 'on');
    expect(directorSystem()).toBe(DIRECTOR_SYSTEM.replace('read out.', `read out. ${RULE}`));
    expect(guardRuleFor(FERNI_CAST, { thought: true })).toContain(RULE);
    expect(deliberationSystem(FERNI_CAST)).toContain(RULE);
  });

  it('names the persona speaking, not always Ferni', () => {
    vi.stubEnv('DIRECTOR_STT_SLIPS', 'on');
    const maya = { ...FERNI_CAST, name: 'Maya', p: { ...FERNI_CAST.p, object: 'her' } };
    expect(guardRuleFor(maya)).toContain('never tell her to point it out');
    expect(guardRuleFor(maya)).toContain('Maya answers what they meant.');
  });

  it('reaches the model through a live Director turn only with the flag on', async () => {
    const asked = async (flag: string): Promise<string> => {
      vi.stubEnv('DIRECTOR_NOTES', 'on');
      vi.stubEnv('DIRECTOR_STT_SLIPS', flag);
      let system = '';
      const director = new Director({
        sessionId: 'stt-slips',
        writer: async (s) => {
          system = s;
          return 'NONE';
        },
      });
      await director.observe([
        { speaker: 'ferni', text: "How's your morning going?" },
        { speaker: 'user', text: "It's going pretty good for him." },
        { speaker: 'ferni', text: 'Glad to hear it.' },
      ]);
      return system;
    };
    expect(await asked('on')).toContain(RULE);
    expect(await asked('off')).not.toContain('speech-to-text');
  });
});

describe('the flag adds no word filter on notes', () => {
  it.each(KEPT)('kept with the flag on as off: "%s"', (note) => {
    vi.stubEnv('DIRECTOR_STT_SLIPS', 'off');
    const off = parseNotes(note);
    vi.stubEnv('DIRECTOR_STT_SLIPS', 'on');
    expect(parseNotes(note)).toEqual(off);
    expect(off).toEqual([note]);
  });
});
