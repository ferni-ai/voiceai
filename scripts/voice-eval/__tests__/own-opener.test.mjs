import { describe, expect, it } from 'vitest';
import { ownOpenerAnswer } from '../transcript-checks.mjs';

/** A return call's first three lines: the greeting, the caller's hello, Ferni's reply. */
const call = (greeting, said, reply) => ({
  userSpeech: [[1000, 2000]],
  events: [
    { who: 'agent', text: greeting, t: 500 },
    { who: 'user', text: said, t: 1500 },
    { who: 'agent', text: reply, t: 3000 },
  ],
});
const flagged = (...lines) => ownOpenerAnswer(call(...lines))?.flagged;

// Dev capability sweep 2026-10-21 (voiceai-evidence/capability-sweep-2026-10-21/dev, B2).
describe('ownOpenerAnswer', () => {
  it('flags Ferni answering his own opener as the caller (the three sweep calls)', () => {
    expect(
      flagged(
        'Hey Sam, did you end up sending that resume to Dana?',
        "Hey Ferni, it's me.",
        'Yeah, I sent it over. Actually felt pretty good to finally hit send.'
      )
    ).toBe(true);
    expect(
      flagged(
        'Hey Sam, how is Pepper holding up with that cone?',
        "Hey Ferni, it's me again.",
        "She's managing, but man, the plastic guard is basically her worst enemy right now. How are you holding up with everything?"
      )
    ).toBe(true);
    expect(
      flagged(
        'Hey Sam, how’d those back-to-back cleanings go today?',
        "Hey Ferni, it's me again.",
        'My hands are still complaining about the polishing cup, honestly. How’d yours hold up through the lineup?'
      )
    ).toBe(true);
  });

  it('passes a re-ask, a hello back, or catching that it has not happened yet', () => {
    const asked = 'Hey Sam. Did you end up sending that resume to Dana?';
    for (const reply of [
      'Heh, well, look at me jumping the gun. Did you end up sending it?',
      'Hey. Glad you called.',
      "Oh, hey. I didn't expect you back so soon, but I'm glad you're here.",
      'Hey Sam. Oh man, the resume. Did you get it off to her?',
    ])
      expect(flagged(asked, "Hey Ferni, it's me.", reply), reply).toBe(false);
    expect(
      flagged(
        'Hey Sam, how is Pepper holding up with that cone?',
        "Hey Ferni, it's me again.",
        "Oh, hey. She's still stuck in the cone?"
      )
    ).toBe(false);
    expect(
      flagged(
        'Hey Sam, how did the interview go?',
        "Hey Ferni. it's me again.",
        "Ah, the interview isn't until Monday, so I'm jumping the gun a bit. How are you holding up?"
      )
    ).toBe(false);
  });

  it('is null when the call is not that shape', () => {
    // The caller answered, or the greeting asked nothing, or there is no reply yet.
    expect(ownOpenerAnswer(call('Hey Sam, did you send it?', 'Yeah, Wednesday.', 'Nice.'))).toBe(
      null
    );
    expect(ownOpenerAnswer(call('Hey Sam, evening.', "Hey Ferni, it's me.", 'Yeah, I did.'))).toBe(
      null
    );
    expect(ownOpenerAnswer({ userSpeech: [], events: [] })).toBe(null);
  });
});
