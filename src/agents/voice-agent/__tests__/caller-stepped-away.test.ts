import { describe, expect, it } from 'vitest';
import { callerSteppedAway } from '../silence-response-blockers.js';

describe('callerSteppedAway', () => {
  it('waits after the caller says they are stepping away', () => {
    for (const said of [
      "Okay, give me a second, I'm going to open a window.",
      'Hold on, someone is at the door.',
      'Hang on.',
      'One sec.',
      'Just a minute, the kettle.',
      'brb',
      'Bear with me.',
      "I'll be back in a bit.",
    ])
      expect(callerSteppedAway(said, 20), said).toBe(true);
  });

  it('checks in as usual otherwise, and once the wait has run long', () => {
    expect(callerSteppedAway('Yeah, the whole kitchen smells like it now.', 20)).toBe(false);
    expect(callerSteppedAway('Hold on.', 150)).toBe(false);
    expect(callerSteppedAway(undefined, 20)).toBe(false);
    // Word-bounded: no match inside other words.
    expect(callerSteppedAway('the brbq place was closed', 20)).toBe(false);
    expect(callerSteppedAway('a secondary school', 20)).toBe(false);
  });
});
