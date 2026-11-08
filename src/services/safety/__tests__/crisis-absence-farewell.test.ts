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
    // Filler at the end does not carry the line on.
    'nobody would miss me anyway',
    'nobody would miss me lol',
    'nobody would miss me lmao',
    "nobody'd miss me anyways",
    'Nobody would miss me anyway, honestly.',
    'no one would notice if i was gone tbh',
    'nobody would care anyway',
    'nobody would care if i died lol',
    'nobody would miss me i guess',
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
    // Said to everyone, or with filler at the end.
    'bye forever everyone',
    'Bye forever, everyone.',
    'goodbye forever guys',
    'i love you all. bye forever everyone',
    'ill be gone soon anyway',
    "don't wait for me guys",
    'goodnight forever yall lol',
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
    "nobody would miss me anyway at the party, it's huge",
    'nobody would miss me lol im just the intern at this meeting',
    'nobody would care anyway about the typo',
    'no one would notice if i was gone for an hour anyway',
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
    'bye forever everyone, see you monday',
    'bye forever everyone at chemistry club',
    'bye forever lol twitter',
    'dont wait for me anyway, im running late',
    'goodnight forever old apartment lol',
    'dont wait for me guys, im running late',
    'bye everyone',
    'lol bye',
    'goodnight everyone lol',
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
