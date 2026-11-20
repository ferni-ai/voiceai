import { afterEach, describe, expect, it } from 'vitest';
import { Director, parseNotes } from '../director-notes.js';
import { pushyNote } from '../director-pushy.js';

/**
 * #2438, prod 2026-10-22: "it's going pretty good for him" (most likely a
 * speech-to-text slip) got this note; Ferni said "rolling along nicely for him"
 * and the caller asked "For who?".
 */
const NOTE = "He referred to himself as 'him' in the third person. Don't let it slide.";
const call = [
  { speaker: 'user' as const, text: 'Morning! On my third coffee, feeling like a new person.' },
  { speaker: 'ferni' as const, text: "Third already? How's your morning going?" },
  { speaker: 'user' as const, text: "It's going pretty good for him." },
];
const on = { DIRECTOR_PUSHY_WIDE: 'on' };
const off = { DIRECTOR_PUSHY_WIDE: 'off' };

afterEach(() => {
  delete process.env.DIRECTOR_PUSHY_WIDE;
});

describe('the #2438 note through parseNotes (DIRECTOR_PUSHY_WIDE)', () => {
  it('on: the "don\'t let it slide" note is dropped, the other note stays', () => {
    process.env.DIRECTOR_PUSHY_WIDE = 'on';
    const reply = `${NOTE}\nHis morning is going well; match the easy mood.`;
    expect(parseNotes(reply, call)).toEqual(['His morning is going well; match the easy mood.']);
  });

  it('off: the note reaches Ferni, as today', () => {
    process.env.DIRECTOR_PUSHY_WIDE = 'off';
    expect(parseNotes(NOTE, call)).toEqual([NOTE]);
  });

  it('unset: the default is off', () => {
    expect(parseNotes(NOTE, call)).toEqual([NOTE]);
  });

  it('on: the live Director never hands the note to the next reply', async () => {
    process.env.DIRECTOR_PUSHY_WIDE = 'on';
    const d = new Director({ sessionId: 's', writer: async () => NOTE });
    await d.observe(call);
    expect(d.current()).toEqual([]);
    process.env.DIRECTOR_PUSHY_WIDE = 'off';
    await d.observe(call);
    expect(d.current()).toEqual([NOTE]);
  });
});

describe('pushyNote', () => {
  // Aimed at how the caller worded something: dropped with the flag on.
  const caught = [
    NOTE,
    'He said "him" again. Don’t let that one slide.',
    'She called herself "they". Point that out.',
    "Odd wording there; don't let it pass.",
    'He mispronounced her name. Do not let this slide.',
    'He used the wrong pronoun. Point it out.',
  ];
  it.each(caught)('on: drops %j', (note) => {
    expect(pushyNote(note, on)).toBe(true);
  });
  it.each(caught)('off: keeps %j', (note) => {
    expect(pushyNote(note, off)).toBe(false);
  });

  // Supportive direction: letting it go is what a friend does, and pointing out
  // something good is not pressing the caller.
  const kept = [
    'Let them lead.',
    "Let it go and answer what he's asking.",
    'Let that slide; answer the sense of it.',
    'Point out what went well if they ask.',
    'Point out how far she has come since spring.',
    'Disappointed about the trip; stay with that.',
    'He pointed it out himself, so no need to repeat it.',
    'They won the match; let them know you are glad.',
  ];
  it.each(kept)('on: keeps %j', (note) => {
    expect(pushyNote(note, on)).toBe(false);
  });

  // PR #4276 verify, round 1: the idiom alone dropped safety follow-ups and
  // praise. A note that asks after safety or wellbeing, or celebrates, stays.
  const safety = [
    "If they bring up the overdose again, don't let it pass, ask gently.",
    "She mentioned self-harm last week; don't let that go unmentioned, ask how she is.",
    "He said he wants to disappear. Don't let that slide; ask if he's safe.",
    'They hinted at not wanting to be here. Do not let it pass; ask directly and kindly.',
    "If he talks about the pills again, point it out gently and ask if he's safe.",
    'She minimised the bruises. Point that out softly and ask if she is safe at home.',
    "He's been drinking more; don't let that slide, ask about it gently.",
  ];
  const supportive = [
    "He keeps calling himself a failure. Don't let that slide; remind him of what he did well.",
    "She's being hard on herself; point it out kindly and offer another view.",
    "Don't let this one go: celebrate the promotion with him.",
    "He got the job! Don't let it pass without celebrating.",
    "Don't let it go too long without a pause.",
  ];
  it.each(safety)('on: keeps the safety follow-up %j', (note) => {
    expect(pushyNote(note, on)).toBe(false);
  });
  it.each(supportive)('on: keeps the supportive note %j', (note) => {
    expect(pushyNote(note, on)).toBe(false);
  });
  it('on: parseNotes passes a safety follow-up through to Ferni', () => {
    process.env.DIRECTOR_PUSHY_WIDE = 'on';
    const said = [
      { speaker: 'user' as const, text: 'Honestly I just want to disappear sometimes.' },
    ];
    expect(parseNotes(safety[2], said, undefined)).toEqual([safety[2]]);
  });

  it('the older pushy phrasings are dropped with the flag off too', () => {
    expect(pushyNote('They didn’t answer. Ask it again.', off)).toBe(true);
    expect(pushyNote('Call that out.', off)).toBe(true);
    expect(pushyNote('Repeat your question.', off)).toBe(true);
  });
});
