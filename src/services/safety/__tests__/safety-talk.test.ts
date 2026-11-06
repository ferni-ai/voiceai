/** Care wording and ways to reach help, read from the kernel's resources. Fictional lines. */
import { describe, expect, it } from 'vitest';

import { CRISIS_RESOURCES } from '../crisis-response.js';
import { EMERGENCY_NUMBER } from '../emergency-number.js';
import { isCareTalk, reachesHelp } from '../safety-talk.js';

describe('reachesHelp', () => {
  it('knows every resource on the kernel list by name and by number', () => {
    for (const r of Object.values(CRISIS_RESOURCES).flat()) {
      expect(reachesHelp(`Have you heard of ${r.name}?`), r.name).toBe(true);
      if (r.phone && /\d/.test(r.phone))
        expect(reachesHelp(`It's ${r.phone}.`), r.phone).toBe(true);
    }
    expect(reachesHelp(`It's ${EMERGENCY_NUMBER}.`)).toBe(true);
  });

  it('catches a number on no list by its shape', () => {
    for (const line of [
      'Please call 999 right now.',
      'Call 112 if you need to.',
      'Dial 000.',
      'You can ring 111 for advice.',
      'Text SHOUT to 85258.',
      'Samaritans are on 116 123.',
      'You can call 13 11 14.',
    ]) {
      expect(reachesHelp(line), line).toBe(true);
    }
  });

  it('leaves everyday lines alone', () => {
    for (const line of ['The kiln sounds wonderful.', 'I ran 5 miles.', 'Glaze takes patience.']) {
      expect(reachesHelp(line), line).toBe(false);
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
