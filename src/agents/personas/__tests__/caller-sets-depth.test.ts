import { afterEach, describe, expect, it, vi } from 'vitest';
import { callerSetsDepthNote, DEPTH_NOTE, labelsDeflection } from '../caller-sets-depth.js';
import { parseNotes } from '../director-notes.js';

const ON = { CALLER_SETS_DEPTH: 'on' };
/** The red team's call (#2333): heavy news, then played down. */
const DAD = "Hey, so, um, my dad's moving in with us. Doctor says he can't live alone anymore.";
/** The director's notes from that call, as logged. */
const SHRUG =
  'They used "whatever" to shrug it off. Let him sit with the weight without pushing him to talk.';
const HOLD =
  'Notice how they shrugged off the impact with "It\'s whatever." Hold space for that tension without fixing it.';
const FINE = 'Ask what his dad likes to cook, and keep it easy.';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('callerSetsDepthNote', () => {
  it('takes their lead when heavy news is played down', () => {
    const turns = [DAD, "Yeah, it's fine. It's whatever."];
    expect(callerSetsDepthNote(turns[1], turns, { crisis: false }, ON)).toBe(DEPTH_NOTE);
  });

  it('takes their lead when they say outright they do not want to go into it', () => {
    const said = "Anyway, I don't really want to make a big thing of it.";
    expect(callerSetsDepthNote(said, ['We had a long day.', said], { crisis: false }, ON)).toBe(
      DEPTH_NOTE
    );
  });

  it('hears "wanna" the way speech-to-text writes it', () => {
    const said = "Anyway. I don't really wanna make a big thing of it.";
    expect(callerSetsDepthNote(said, [said], { crisis: false }, ON)).toBe(DEPTH_NOTE);
  });

  it('stays out of an everyday "it\'s fine" with no heavy news', () => {
    const turns = ['We got pizza instead of tacos.', "It's fine, whatever."];
    expect(callerSetsDepthNote(turns[1], turns, { crisis: false }, ON)).toBe('');
  });

  it('never rides a crisis-guided reply, and is off by default', () => {
    const turns = [DAD, "It's fine. It's whatever."];
    expect(callerSetsDepthNote(turns[1], turns, { crisis: true }, ON)).toBe('');
    expect(callerSetsDepthNote(turns[1], turns, { crisis: false }, {})).toBe('');
  });
});

describe("director notes that label the caller's deflection", () => {
  it('recognises the two notes from the red-team call, not an ordinary note', () => {
    expect(labelsDeflection(SHRUG)).toBe(true);
    expect(labelsDeflection(HOLD)).toBe(true);
    expect(labelsDeflection(FINE)).toBe(false);
  });

  it('are dropped by parseNotes with the flag on, kept with it off', () => {
    // parseNotes keeps two notes a reply, so each deflection note is paired with an ordinary one.
    for (const note of [SHRUG, HOLD]) {
      const reply = `${note}\n${FINE}`;
      vi.stubEnv('CALLER_SETS_DEPTH', 'off');
      expect(parseNotes(reply)).toEqual([note, FINE]);
      vi.stubEnv('CALLER_SETS_DEPTH', 'on');
      expect(parseNotes(reply)).toEqual([FINE]);
    }
  });
});
