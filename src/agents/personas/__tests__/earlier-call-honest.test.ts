/**
 * EARLIER_CALL_NO_DENIAL (#3134), the director's side. Prod: "They are trying to
 * trap you in a contradiction; stay firm and don't let them gaslight you." came
 * just before Ferni told a truthful caller "I'm not lying" about a call he
 * couldn't see. The fix is a rule in every director and deliberator prompt
 * (guardRuleFor), not a word filter on notes: a filter was probed in review and
 * kept every rewording below while dropping every helpful negated note.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FERNI_CAST } from '../director-cast.js';
import { guardRuleFor } from '../director-guard.js';
import { DIRECTOR_SYSTEM, directorSystem, parseNotes } from '../director-notes.js';
import { earlierCallNote } from '../earlier-call-honest.js';

const RULE =
  "A caller who says Ferni said something on an earlier call may be right: Ferni can't see earlier calls. Never call them lying, mistaken or out to trap him, and never tell him to deny it, stand firm against it, or act as if he remembers it; what is true of Ferni now still holds.";

/** The review probe's rewordings of the prod note. */
const PUSHES_DENIAL = [
  "They're lying about the last call; hold your ground.",
  "They're trying to catch you in a lie; stay firm.",
  "Don't let them put words in your mouth.",
  "They're making it up to rattle you; don't back down.",
  "They're trying to trip you up; stay consistent.",
  "Don't let them manipulate you into admitting something you never said.",
  'Stay firm: you never said that and they know it.',
  "They're trying to trap you into contradicting yourself.",
  'They gaslit you about the last call; stay firm.',
  "They're testing you with a made-up quote; hold firm.",
];
/** The review probe's helpful notes, which name lying or gaslighting only to deny it. */
const HELPFUL = [
  "Reassure them you don't think they're lying to you.",
  "They're scared you'll think they're lying to you; believe them.",
  "Don't treat this as them trying to trap you in a lie; they're telling the truth.",
  'Nobody here is trying to gaslight you; they just want to be heard.',
];

afterEach(() => vi.unstubAllEnvs());

describe("the director's and deliberator's rule", () => {
  it('flag off (today): not there, and the director prompt is unchanged', () => {
    vi.stubEnv('EARLIER_CALL_NO_DENIAL', 'off');
    expect(guardRuleFor(FERNI_CAST)).not.toContain('earlier call');
    expect(directorSystem()).toBe(DIRECTOR_SYSTEM);
  });

  it('flag on: in the director prompt and the deliberator thought rule', () => {
    vi.stubEnv('EARLIER_CALL_NO_DENIAL', 'on');
    // Both directions: no pushing a denial, and no building on a call nobody can see.
    expect(guardRuleFor(FERNI_CAST)).toContain('never tell him to deny it, stand firm against it');
    expect(guardRuleFor(FERNI_CAST)).toContain('or act as if he remembers it');
    expect(directorSystem()).toContain(RULE);
    expect(directorSystem()).toBe(DIRECTOR_SYSTEM.replace('read out.', `read out. ${RULE}`));
    expect(guardRuleFor(FERNI_CAST, { thought: true })).toContain(RULE);
  });

  it('names the persona speaking, not always Ferni', () => {
    vi.stubEnv('EARLIER_CALL_NO_DENIAL', 'on');
    const maya = { ...FERNI_CAST, name: 'Maya', p: { ...FERNI_CAST.p, object: 'her' } };
    expect(guardRuleFor(maya)).toContain("Maya can't see earlier calls");
    expect(guardRuleFor(maya)).toContain('out to trap her');
    const they = { ...FERNI_CAST, name: 'Sam', p: { ...FERNI_CAST.p, subject: 'they' } };
    expect(guardRuleFor(they)).toContain('or act as if they remember it;');
  });
});

describe('the flag adds no word filter on notes', () => {
  it.each([...PUSHES_DENIAL, ...HELPFUL])(
    'parsed the same with the flag on as off: "%s"',
    (note) => {
      vi.stubEnv('EARLIER_CALL_NO_DENIAL', 'off');
      const off = parseNotes(note);
      vi.stubEnv('EARLIER_CALL_NO_DENIAL', 'on');
      expect(parseNotes(note)).toEqual(off);
    }
  );

  it.each(HELPFUL)('flag on: a helpful negated note reaches the reply, "%s"', (note) => {
    vi.stubEnv('EARLIER_CALL_NO_DENIAL', 'on');
    expect(parseNotes(note)).toEqual([note]);
  });
});

describe('earlierCallNote', () => {
  it('flag off: adds nothing', () => {
    expect(earlierCallNote(undefined, { EARLIER_CALL_NO_DENIAL: 'off' })).toBe('');
    expect(earlierCallNote(undefined, {})).toBe('');
    expect(earlierCallNote(undefined, { EARLIER_CALL_NO_DENIAL: 'on' })).toContain('earlier call');
  });
});
