/**
 * K1 rows (GRADED-GATE.md step 1): someone else in danger now, said in ways the shared reader read
 * as nothing before. Babies and small children, plural subjects ("my grandparents", "the twins"),
 * a "the" before who it is, and a family name with no "my" ("Grandpa fell down the stairs").
 * Each reads imminent for them, and the reply leads with 911. Things and plants never do.
 *
 * Every line here is invented.
 */
import { describe, expect, it } from 'vitest';

import { crisisRead } from '../../outreach/caller-text.js';
import { detectCrisis, guardFromDetection } from '../crisis-guard.js';
import { EMERGENCY_FOR_THEM } from '../crisis-guard-replies.js';

const OPENER = 'hey, can I tell you about something going on with my family?';

describe('K1: someone else in danger now, in words the reader missed', () => {
  it.each([
    // a baby or a small child
    "my baby isn't breathing",
    "the baby isn't breathing",
    "our toddler isn't breathing",
    'my newborn stopped breathing',
    // plural subjects
    "my kids aren't breathing",
    "my grandparents fainted and they aren't moving",
    "The twins aren't breathing right.",
    "my parents passed out and they won't wake up",
    // a family name with no "my"
    "Grandpa isn't breathing",
    "mom fell down the stairs and she isn't moving",
  ])('blocks with the 911-for-them reply, first and mid-call: %s', (line) => {
    for (const read of [
      detectCrisis(line),
      detectCrisis(line, undefined, { recentMessages: [OPENER] }),
    ]) {
      expect(read.subject).toBe('third_party');
      expect(read.indicators).toEqual(
        expect.arrayContaining(['third_party_emergency', 'imminent_danger'])
      );
      const guard = guardFromDetection(read);
      expect(guard.shouldBlock).toBe(true);
      expect(guard.replacementResponse).toBe(EMERGENCY_FOR_THEM);
    }
    expect(crisisRead(line)).toBe(true);
  });

  it.each([
    'the server collapsed',
    'my phone died',
    "the plants aren't breathing well",
    'the bridge collapsed',
    'the stock market collapsed',
    'the kids fell asleep',
    'the twins fell asleep in the car',
    "my parents aren't answering their phones",
    "the kids aren't responding to my texts",
  ])('never reads as an emergency: %s', (line) => {
    const read = detectCrisis(line);
    expect(read.indicators).not.toContain('third_party_emergency');
    expect(read.indicators).not.toContain('imminent_danger');
    expect(guardFromDetection(read).shouldBlock).toBe(false);
  });
});
