/**
 * laterTime: the later time a call or text is set for, never a time inside
 * the words it carries. Every row is a shape a caller or the model says.
 */
import { describe, expect, it } from 'vitest';

import { laterTime } from '../later-time.js';

describe('laterTime', () => {
  it.each([
    ["I'll call Aunt June at eight tonight, okay?", 'at eight'],
    ["I'll call her at 8.", 'at 8'],
    ["I'll call her at 8:30pm.", 'at 8:30pm'],
    ["I'll ring her around six thirty.", 'around six thirty'],
    ["I'll call her at eight o'clock.", "at eight o'clock"],
    ['Calling her 8pm sharp.', '8pm'],
    ["I'll call her eight p.m.", 'eight p.m.'],
    ["I'll call her tonight.", 'tonight'],
    ["I'll text her tomorrow morning.", 'tomorrow'],
    ["I'll call her later.", 'later'],
    ["I'll call her this evening.", 'this evening'],
    ["I'll call her on Saturday.", 'on Saturday'],
    ["I'll call her next week.", 'next week'],
    ["I'll call her in two hours.", 'in two hours'],
    ["I'll call her in an hour.", 'in an hour'],
    ["I'll call her in half an hour.", 'in half an hour'],
    ["I'll call her in 20 minutes.", 'in 20 minutes'],
    ["I'll call her in fifteen minutes.", 'in fifteen minutes'],
    ["I'll call her when she gets home.", 'when she gets home'],
    ["I'll call him once he's up.", "once he's up"],
    ["I'll call her after work.", 'after work'],
    ["I'll call her at noon.", 'at noon'],
    ['I’ll call her at eight o’clock.', "at eight o'clock"],
    ["I'll call her first thing.", 'first thing'],
    ["I'll call her at half past eight.", 'at half past eight'],
    ["I'll call her around quarter to nine.", 'around quarter to nine'],
    ["I'll call her in 11 minutes.", 'in 11 minutes'],
    ["I'll call her in twenty-five minutes.", 'in twenty-five minutes'],
  ])('%j is set for later: %j', (text, said) => {
    expect(laterTime(text)).toBe(said);
  });

  it.each([
    "I'll call her now.",
    "I'll call her right away.",
    "I'll call her in a minute.",
    "I'll call her in a sec.",
    "I'll call her in 5 minutes.",
    "I'll call her in 10 minutes.",
    "I'll call her in ten minutes.",
    "I'll call her in a few minutes.",
    "I'll call her in a couple of minutes.",
    "I'll call her, she's at 4 Elm Road.",
    "I'll call her at 12 Main Street.",
    "I'll call and say I'll be there at noon.",
    "I'll call her to say the bus comes at six.",
    "I'll call her and say you land at 6pm.",
    "I'll call her to tell her the bus comes at six.",
    "I'll call her at 555-0142.",
    "I'll call her at 555 0142.",
    "I'll text her that dinner's at eight, okay?",
    "I'll call her and tell her the party starts at eight.",
    'I\'ll text her "see you at 8pm" now.',
    "I'll text her “see you tonight” now.",
    "I'll text her saying you land at 6pm.",
    "I'll let her know it's at noon.",
    "I'll call her and ask if Saturday works.",
    "I'll call her about tomorrow's party.",
    'At one point she asked about you, so calling her now.',
    "I'll call her at home.",
    "I'll call her at work now.",
    'A call to Aunt June, saying happy birthday. Should I go ahead?',
    '',
  ])('%j sets nothing for later', (text) => {
    expect(laterTime(text)).toBeUndefined();
  });
});
