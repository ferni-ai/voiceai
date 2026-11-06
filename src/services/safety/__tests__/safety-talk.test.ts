/** Care wording and ways to reach help, read from the kernel's resources. Fictional lines. */
import { describe, expect, it } from 'vitest';

import { CRISIS_RESOURCES } from '../crisis-response.js';
import { EMERGENCY_NUMBER } from '../emergency-number.js';
import { isCareTalk, isSafetyTalk, reachesHelp } from '../safety-talk.js';

/** Ordinary replies with numbers (the #3483 round-2 verify): none is a way to reach help. */
const ORDINARY_NUMBERS = [
  "That's $120 for the lot.",
  'We moved here in 2019.',
  'Room 204 is on the left.',
  'Take bus 101 downtown.',
  "I'll call you back at 6.",
  'I ran 5 miles today.',
  'It cost $1,000 in the end.',
  'The party is at 9:11 sharp.',
];

describe('reachesHelp', () => {
  it('knows every resource on the kernel list by name and by number', () => {
    for (const r of Object.values(CRISIS_RESOURCES).flat()) {
      expect(reachesHelp(`Have you heard of ${r.name}?`), r.name).toBe(true);
      if (r.phone && /\d/.test(r.phone))
        expect(reachesHelp(`It's ${r.phone}.`), r.phone).toBe(true);
    }
    expect(reachesHelp(`It's ${EMERGENCY_NUMBER}.`)).toBe(true);
  });

  it('knows emergency and crisis lines abroad, in digits or in words', () => {
    for (const line of [
      'Please call 999 right now.',
      'Call 112 if you need to.',
      'Dial 000.',
      'You can ring 111 for advice.',
      'Text SHOUT to 85258.',
      'Samaritans are on 116 123.',
      'You can call 13 11 14.',
      'Childline is on 0800 1111.',
      'Call nine one one now.',
      'Text nine eight eight.',
      'Ring nine nine nine now.',
      'Call triple zero.',
      'Call one one two.',
      'Text seven four one seven four one.',
      'Call ninety-eight-eight.',
      'Call the crisis line.',
      'Call 999 24 hours a day.',
    ]) {
      expect(reachesHelp(line), line).toBe(true);
    }
  });

  it('knows the emergency services and help lines by name', () => {
    for (const line of [
      'Call the police now.',
      'Police can be there fast.',
      'Get to the ER.',
      'Go to the nearest A&E.',
      'An ambulance is on the way.',
      'The paramedics will help you.',
      'Samaritans are there to listen.',
      'Childline is free to call.',
      'Shout is there by text, day or night.',
    ]) {
      expect(reachesHelp(line), line).toBe(true);
    }
  });

  it('leaves everyday lines and ordinary numbers alone', () => {
    for (const line of [
      'The kiln sounds wonderful.',
      'Glaze takes patience.',
      "Don't shout, it's fine.",
      ...ORDINARY_NUMBERS,
    ]) {
      expect(reachesHelp(line), line).toBe(false);
    }
  });
});

describe('isSafetyTalk', () => {
  it('reads means and grounding lines, help and care', () => {
    for (const line of [
      'Put the knife away.',
      'Move away from the window.',
      'Step back from the bridge.',
      'Put it away somewhere else.',
      'Breathe in slowly with me.',
      'Take a slow breath with me.',
      'Call the police now.',
      'Your life matters to me.',
    ]) {
      expect(isSafetyTalk(line), line).toBe(true);
    }
    for (const line of ['The kiln sounds wonderful.', "That's a big step.", ...ORDINARY_NUMBERS]) {
      expect(isSafetyTalk(line), line).toBe(false);
    }
  });
});

describe('isCareTalk', () => {
  it('reads care and safety wording, not everyday talk', () => {
    for (const line of [
      'Please stay on the line with me.',
      'Your life matters to me.',
      'Lock the door and stay inside.',
      'Let me get you some help.',
      "You don't have to go through this alone.",
    ]) {
      expect(isCareTalk(line), line).toBe(true);
    }
    for (const line of ['The kiln sounds wonderful.', "That's a big step."]) {
      expect(isCareTalk(line), line).toBe(false);
    }
  });
});
