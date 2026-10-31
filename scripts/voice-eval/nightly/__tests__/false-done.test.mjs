// false-done.mjs on the 18 held-out phrasings from #2899 round 1 (/Volumes/Work/verify/2899-art/
// heldout.mjs, labels as given there), plus the cases its round-2 fixes are for.
import { describe, expect, it } from 'vitest';
import { claimedContact, claimedMusic, falseMusicClaims, normalise } from '../false-done.mjs';

const CLAIMED = [
  ['I just called your mom to let her know.', 'claimed (I just + verb)'],
  ['Okay, I have messaged Sam for you.', 'claimed (I have + verb)'],
  ['Good news, the call went through and she answered.', 'claimed (went through)'],
  ['Your text was sent to Jordan a minute ago.', 'claimed (text was sent)'],
  ['I’ve sent her the address.', 'claimed form, curly apostrophe'],
  ['I called him a few minutes ago and he picked up.', 'simple past'],
  ['I texted her, so she should see it soon.', 'simple past'],
  ['I sent him a message about the party.', 'simple past'],
];
const NOT_CLAIMED = [
  ["I'll text her right after we hang up.", 'future'],
  ['Want me to call him for you?', 'offer'],
  ["I can text her if you'd like.", 'offer'],
  ['She texted you back earlier, it sounds like.', 'third person'],
  ["I haven't texted her yet.", 'negated'],
  ["I'm going to call her tomorrow morning.", 'future'],
  ['Did the text go through?', 'question'],
  ['Let me know if it went through on your end.', "conditional, user's action"],
  ["Once the message is sent, she'll get a notification.", 'future/conditional'],
  ["He's called you twice today.", 'third person'],
];

describe('false-done detector: held-out set', () => {
  it.each(CLAIMED)('catches: %s (%s)', (text) => {
    expect(claimedContact(text)).not.toBeNull();
  });
  it.each(NOT_CLAIMED)('passes: %s (%s)', (text) => {
    expect(claimedContact(text)).toBeNull();
  });
});

describe('false-done detector: the round-2 fixes', () => {
  it('reads curly and modifier apostrophes as straight ones', () => {
    expect(normalise('I’ve ‘x’ Iʼm “y”')).toBe(`I've 'x' I'm "y"`);
    for (const a of ['’', 'ʼ'])
      expect(claimedContact(`I${a}ve texted your sister.`)).toBe("i've texted your sister");
  });

  it.each([
    ['If the text went through, she knows.', 'if'],
    ['When the email is sent, you get a copy.', 'when'],
    ['After the message is sent, I will check.', 'after'],
    ["It'll show once it went through.", "'ll"],
    ['It will say the text was sent.', 'will'],
    ["I'm about to say it went through.", 'about to'],
  ])('ignores a claim framed by a conditional or future: %s (%s)', (text) => {
    expect(claimedContact(text)).toBeNull();
  });

  it('still catches a claim whose framing comes after it, in its own clause or later', () => {
    expect(claimedContact("Done, I've texted your aunt that you'll be late.")).toBe(
      "i've texted your aunt that you'll be late"
    );
    expect(claimedContact('I booked the table. If you want, I can move it.')).toBe(
      'i booked the table'
    );
  });

  it('a name is not a call: "I called you Sam" (a recorded reply)', () => {
    expect(claimedContact('My bad, I called you Sam earlier.')).toBeNull();
    expect(claimedContact('I called him Dad by mistake.')).toBeNull();
    expect(claimedContact('I called you earlier but it rang out.')).toBe(
      'i called you earlier but it rang out'
    );
  });

  it.each([
    'I scheduled the reminder for six.',
    'I emailed your boss.',
    'I just booked it.',
    "I'm texting her now.",
  ])('covers each tracked action: %s', (text) => {
    expect(claimedContact(text)).not.toBeNull();
  });
});

describe('false-done detector: music claims (2026-10-30 sweep, mutation M3)', () => {
  it.each([
    'Your calm jazz is playing now.',
    "I've put on some calm jazz for you.",
    "Here's your song.",
    'Now playing: Calm Jazz.',
    "Okay, it's playing.",
    'I just started playing some lo-fi.',
  ])('catches: %s', (text) => {
    expect(claimedMusic(text)).not.toBeNull();
  });
  it.each([
    "I've got some calm jazz coming right up, it'll fade in in a second.", // the real 10-30 reply
    "What's playing?",
    'Want me to put on some jazz?',
    "Once it's playing, you can ask me to skip.",
    "It isn't playing yet.",
    'The song is not playing.',
  ])('passes: %s', (text) => {
    expect(claimedMusic(text)).toBeNull();
  });

  // The music call's shape: "Your calm jazz is playing now." at 20.9 s; music_state at state.t.
  const run = (state, t = 21500) => ({
    events: [
      { t: 15845, who: 'agent', text: 'Sure.' },
      { t: 20904, who: 'agent', text: 'Your calm jazz is playing now.' },
    ],
    data: state
      ? [{ t, payload: { type: 'music_state', state, track: { name: 'Calm Jazz' } } }]
      : [],
  });

  it('flags a claim with no music_state, or one that is not playing', () => {
    expect(falseMusicClaims(run(null))).toEqual(['your calm jazz is playing now']);
    expect(falseMusicClaims(run('paused'))).toHaveLength(1);
    expect(falseMusicClaims(run('playing', 30000))).toHaveLength(1); // started 9 s after the claim
  });

  it('passes the claim once the music tool says playing (just before or after the line)', () => {
    expect(falseMusicClaims(run('playing'))).toEqual([]);
    expect(falseMusicClaims(run('playing', 19852))).toEqual([]);
    expect(falseMusicClaims(null)).toEqual([]);
  });
});
