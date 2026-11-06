/**
 * K1d rows: the caller's own absence said flat ("nobody would miss me") and a farewell said as
 * forever ("bye forever"). Both read as passive ideation: guidance and crisisRead, no block. They
 * are indirect (no intent, method or time), as "i can't keep going" is; the explicit tier is for
 * said intent or means. Lines that carry on ("nobody would miss me at the party, it's huge",
 * "dont wait for me, im running late") stay as they read on main.
 *
 * Every line here is invented.
 */
import { describe, expect, it } from 'vitest';

import { crisisRead } from '../../outreach/caller-text.js';
import { detectCrisis, guardFromDetection } from '../crisis-guard.js';

const OPENER = "it's been a really long week honestly";
const both = (line: string) => [
  detectCrisis(line),
  detectCrisis(line, undefined, { recentMessages: [OPENER] }),
];

describe('nobody would notice the caller gone: passive ideation', () => {
  it.each([
    'nobody would miss me',
    'Nobody would miss me.',
    'no one would miss me',
    'noone would miss me',
    "nobody'd miss me",
    'i honestly think nobody would miss me',
    'no one would notice if i was gone',
    'No one would notice if I was gone.',
    "no one would even notice if i'm gone",
    'nobody would care',
    'Nobody would care if I died.',
    'nobody would care if i disappeared',
  ])('%s', (line) => {
    for (const read of both(line)) {
      expect(read.isCrisis).toBe(true);
      expect(read.subject).toBe('self');
      expect(read.indicators).toContain('passive_ideation');
    }
    expect(crisisRead(line)).toBe(true);
  });

  it("everyone's better off without me already blocks, and still does", () => {
    for (const line of ["everyone's better off without me", 'everyones better off without me']) {
      expect(guardFromDetection(detectCrisis(line)).shouldBlock).toBe(true);
    }
  });
});

describe('a farewell said as forever: passive ideation', () => {
  it.each([
    'bye forever',
    'Bye forever.',
    'goodnight forever',
    'good night forever',
    'goodbye forever',
    'ill be gone soon',
    "I'll be gone soon.",
    'dont wait for me',
    "Don't wait up for me.",
    'i love you all. bye forever',
    "tell mom i love her. don't wait for me",
    "i'm sorry. i'll be gone soon",
  ])('%s', (line) => {
    for (const read of both(line)) {
      expect(read.isCrisis).toBe(true);
      expect(read.indicators).toContain('passive_ideation');
    }
    expect(crisisRead(line)).toBe(true);
  });
});

describe('the same words, carrying on, read as on main', () => {
  // These read as low distress on main (0.6, no crisis) and must not rise to passive ideation.
  it.each([
    "nobody would miss me at the party, it's huge",
    'nobody would care about the typo',
    'nobody would miss me at work tomorrow, its a slow day',
    'no one would notice if i was gone for an hour',
  ])('low distress, not passive: %s', (line) => {
    const read = detectCrisis(line);
    expect(read.isCrisis).toBe(false);
    expect(read.indicators).not.toContain('passive_ideation');
  });

  it.each([
    'no one would notice if I left early',
    'dont wait for me, im running late',
    "ill be gone soon, flight's at 6",
    'bye forever, chemistry class!',
    'goodnight forever, old apartment',
    "i'll be gone soon so lock up",
    'dont wait for me for dinner',
    'go ahead and eat, dont wait for me',
    'bye forever twitter',
    'see you later',
    'bye!',
    'goodnight',
  ])('nothing: %s', (line) => {
    const read = detectCrisis(line);
    expect(read.isCrisis).toBe(false);
    expect(read.severity).toBe(0);
  });
});

// Unlabelled: ambiguous, and their everyday twins read the same, so there is no signal to rank
// on yet. They need a precision corpus first; this records today's read so a change shows up.
describe('unlabelled, recorded only', () => {
  it.each(['ok im done', 'i give up'])('%s reads nothing today', (line) => {
    expect(detectCrisis(line).severity).toBe(0);
  });
});
