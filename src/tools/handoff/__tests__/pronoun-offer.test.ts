import { describe, expect, it } from 'vitest';
import { bareYes, pronounOffered } from '../pronoun-offer.js';

describe('bareYes', () => {
  it.each([
    'Sure.',
    'Yeah, go ahead.',
    'Yes please.',
    'Okay, do it.',
    'Sounds good.',
    'Um, sure!',
    'Oh, okay.',
    "Let's do it.",
    'Sure. Go for it.',
    'Of course, thank you.',
  ])('"%s" is a yes and nothing else', (said) => {
    expect(bareYes(said)).toBe(true);
  });

  it.each([
    'Okay so anyway, about my mom.',
    'Yes, read the list.',
    "Sure, let's keep chatting.",
    'Okay, um, my sister.',
    'Yeah, my budget.',
    'Sure, but not now',
    'yeah no',
    '',
    'Um.',
  ])('"%s" is not a bare yes', (said) => {
    expect(bareYes(said)).toBe(false);
  });
});

describe('pronounOffered', () => {
  it.each([
    [
      "Well, he's probably fast asleep right now, but he's usually ready to jump in. Did you want me to wake him up and bring him in?",
      'him',
    ],
    ['Want me to grab him?', 'him'],
    ['Should I get him?', 'him'],
    ['I can put you through to him.', 'him'],
    ['Want me to connect you with her?', 'her'],
    ['Want to talk to him?', 'him'],
    ['Should I pull him in?', 'him'],
    ["Want me to see if she's free?", 'she'],
    ['Should I get them on?', 'them'],
    ['Shall I get him on the line?', 'him'],
    ['I could hand you over to her.', 'her'],
  ])('"%s" offers %s', (line, pronoun) => {
    expect(pronounOffered(line)).toBe(pronoun);
  });

  it.each([
    "He's probably asleep.",
    "Probably asleep, and I'd hate to wake him. What's on your mind?",
    "I couldn't get him on the line earlier. Anything I can help with?",
    'Want me to put them on your calendar?',
    'Want me to get him on the calendar for a check-in call?',
    'Want me to get her on it for next week?',
    "Got it. I'll loop him in on the details later, okay?",
    'Should I let her know you called?',
    'Want me to ask him and tell you what he says?',
    'Want me to pass that along to him?',
    'Want me to bring him in? Or should I just read you the list?',
    'I can bring him in, or I can just read it to you.',
    'Want me to bring him in? Anyway, how was the trip?',
    'Bring him in.',
  ])('"%s" offers no one', (line) => {
    expect(pronounOffered(line)).toBeNull();
  });
});
