/**
 * The DJ announced every song on its own ("Here's 'Guitar'." every 30s as
 * previews advanced) on top of Ferni's replies. Off unless opted in.
 */
import { describe, expect, it } from 'vitest';
import { djSpeaksOnItsOwn } from '../dj-speech-policy.js';

describe('djSpeaksOnItsOwn', () => {
  it('is off by default', () => {
    expect(djSpeaksOnItsOwn({})).toBe(false);
  });
  it('stays off even if DJ_SPOKEN_LINES is set', () => {
    expect(djSpeaksOnItsOwn({ DJ_SPOKEN_LINES: 'on' })).toBe(false);
    expect(djSpeaksOnItsOwn({ DJ_SPOKEN_LINES: 'true' })).toBe(false);
  });
});
