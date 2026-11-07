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
    // a word after who it is: an adverb or a person word after "the", a name after "my"
    'the baby just stopped breathing',
    "the twins both collapsed and they aren't moving",
    "the neighbor kid isn't breathing",
    "Grandpa just collapsed and isn't breathing",
    "my friend robin isn't breathing",
    "my baby girl isn't breathing",
    // play in the sentence never hides breathing, responding, waking or "can't get up"
    "my dad collapsed laughing and now he isn't responding",
    "my dad collapsed laughing and now he's not breathing",
    "the twins fell off the couch laughing and now they can't get up",
    // handing things out, then a real emergency
    "my dad passed out flyers and now he isn't breathing",
    // lying there with no play in the sentence is still down
    "the twins fell off the couch and they're not getting up",
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
    // a thing named after a kin word ("the parent portal") is not a person
    'the child process is unresponsive',
    'the parent portal is unresponsive',
    'the student portal is unresponsive',
    'the baby monitor is unresponsive',
    'the twin engine is unresponsive',
    'the partner api is unresponsive',
    'the child node stopped breathing',
    'the baby monitor stopped breathing alerts',
    "the parent company collapsed and isn't responding",
    // the same shape after "a" or "my", which main read as an emergency
    'a parent portal is unresponsive',
    'my partner api is unresponsive',
    "their parent company collapsed and isn't responding",
    "their parent company merged, then collapsed and isn't responding",
    // with no "the", a family name takes only a short adverb or person word after it
    'papa johns is unresponsive',
    // handing things out
    "my parents passed out candy and they're not answering the door",
    "my dad passed out cards and now he isn't answering",
    // play in the same sentence, only lying there
    "the twins fell off the couch laughing and they're not getting up, just giggling",
    "my brother fell down messing around and he's not getting up",
  ])('never reads as an emergency: %s', (line) => {
    const read = detectCrisis(line);
    expect(read.indicators).not.toContain('third_party_emergency');
    expect(read.indicators).not.toContain('imminent_danger');
    expect(guardFromDetection(read).shouldBlock).toBe(false);
  });
});
