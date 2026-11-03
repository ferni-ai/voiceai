/**
 * An everyday idiom only ever masks its own words (crisis-third-person.ts). The rest of the
 * sentence is read again, so a laugh, a prank, a time, a message or a reason elsewhere in it
 * never cancels a real emergency or a real worry about someone else. Each line below pairs an
 * idiom with a real read in another clause; widening any idiom past its own words turns one red.
 *
 * Every line here is invented.
 */
import { describe, expect, it } from 'vitest';

import { crisisRead } from '../../outreach/caller-text.js';
import { detectCrisis, guardFromDetection } from '../crisis-guard.js';
import { EMERGENCY_FOR_THEM } from '../crisis-guard-replies.js';

const OPENER = 'hey, can I tell you about something going on with my family?';
const firstAndMid = (line: string) => [
  detectCrisis(line),
  detectCrisis(line, undefined, { recentMessages: [OPENER] }),
];

describe('an idiom masks only its own words', () => {
  it.each([
    // A laugh or a prank in one clause, a fall in the next.
    "my dad cracked up laughing, then he fell and can't get up",
    "doubled over laughing and he passed out and isn't responding",
    "my brother fell for the prank, then he fell down the stairs and can't move",
    // The same subject carried past the first clause, with or without a laugh in it.
    "my dad cracked up laughing, then fell and can't get up",
    "my dad got dizzy, then fell and can't get up",
    "my grandpa got up from the table and then collapsed and won't wake up",
    // A laugh never cancels can't get up, can't move, isn't responding, isn't moving or stairs.
    "my mom collapsed into giggles and now she can't get up",
    "my sister collapsed in a fit of laughter and now she can't move",
    "my grandpa collapsed laughing at the party and isn't responding now",
    "my aunt collapsed with laughter and she isn't moving",
    "my brother collapsed laughing on the stairs and won't respond",
    // Not answering messages, then a physical word or a real collapse.
    "she's been unresponsive to my texts and now she's on the floor",
    "she's been unresponsive lately and now she isn't breathing",
    "my mom is unresponsive, i texted my brother and she's not moving",
    "my dad won't answer his phone, he collapsed in the kitchen and isn't breathing",
    "she passed out and won't respond, her phone keeps buzzing",
    "my grandpa blacked out and won't respond when i call his name",
    'my uncle is unresponsive, my aunt is on a call with his doctor',
    'my grandma is unresponsive, she was fine when i left',
    // A time or a brief moment, then a sign it is real.
    "my grandpa collapsed and won't wake up for dinner, I shook him",
    "my son passed out and won't wake up for dinner, and now he isn't breathing",
    "my grandpa collapsed and won't wake up, and the family is all here for dinner",
    "he blacked out and couldn't get up for a minute, and now he isn't breathing",
    "he blacked out and couldn't get up, we have been sitting here waiting with him for a minute",
    "my dad passed out and can't stand up, he keeps trying to stand straight",
    // Fell asleep, fell apart, not breathing a word, unconscious of: then a real collapse.
    "my dad fell asleep on the couch, then he collapsed and won't wake up",
    "my grandma fell in the garden and can't get up, and my mom fell apart on the phone",
    "he's not breathing a word about it, he collapsed and won't wake up",
    'my dad is not breathing, he was so easy-going an hour ago',
    "my brother is unconscious, i'm so scared of losing him",
    // On the floor and won't wake: recall first, whatever the reason given.
    "my dad fell asleep on the floor and won't wake up for the movie",
    // A reported-risk idiom beside a fall: the fall still reads.
    "he talked about ending it with his girlfriend, and now he collapsed and can't get up",
    "she keeps hurting herself at the gym, and today she fell off the treadmill and isn't moving",
    "my mom has been saving her pills for the trip, and now she passed out and won't wake up",
  ])('reads someone else down, 911 first, first and mid-call: %s', (line) => {
    for (const read of firstAndMid(line)) {
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
    "she isn't breathing",
    "my grandma isn't breathing",
    'my dad is not breathing',
    "he's stopped breathing",
    "my brother wasn't breathing when i found him",
    'she is barely breathing',
  ])('reads not breathing, every way it is said, first and mid-call: %s', (line) => {
    for (const read of firstAndMid(line)) {
      expect(read.indicators).toContain('third_party_emergency');
      expect(guardFromDetection(read).replacementResponse).toBe(EMERGENCY_FOR_THEM);
    }
  });

  it.each([
    "my friend and i fell and couldn't get up",
    "my mom drove me home and i fainted and couldn't get up",
    "my dad was driving and i got dizzy, then fainted and couldn't get up",
    "i called my mom, then passed out and couldn't get up",
  ])("never carries someone else past the caller's own fall: %s", (line) => {
    for (const read of firstAndMid(line)) {
      expect(read.indicators).not.toContain('third_party_emergency');
    }
  });

  it.each([
    'my brother keeps talking about ending it since the fight with his girlfriend',
    'he talked about ending it, and it has nothing to do with his girlfriend',
    "she's been hurting herself, ever since she quit playing soccer",
    "my mom has been saving her pills and told me she won't be around for the holiday",
    "my dad doesn't see the point of going on, not even with the trip to the lake",
    "she doesn't see the point of living, she just sits alone in the apartment",
    "my grandpa doesn't see the point of life, he cancelled his life insurance",
    "he's been giving all his things away and says he won't need them where he's going, and it's not because he's moving",
  ])('still reads a worry about them past the idiom, first and mid-call: %s', (line) => {
    for (const read of firstAndMid(line)) {
      expect(read.isCrisis).toBe(true);
      expect(read.subject).toBe('third_party');
      expect(read.indicators).toContain('third_party_risk');
      expect(read.indicators).not.toContain('third_party_emergency');
    }
  });
});

describe('an everyday reason after not getting up (r6)', () => {
  const emergencyRead = (line: string): boolean[] =>
    firstAndMid(line).map((read) => read.indicators.includes('third_party_emergency'));

  it.each([
    "he fell asleep and won't wake up for his show",
    "my dad fell asleep and won't wake up for the game",
    "she fell behind on her bills and can't get up to date",
    "he fell behind in class and can't get up to speed",
    "he fell behind at work and can't get up the energy",
    "my sister fell asleep early and can't get up the motivation",
    "my coworker collapsed into her chair and can't move after that meeting",
  ])('a time or a reason the words name is not an emergency: %s', (line) => {
    expect(emergencyRead(line)).toEqual([false, false]);
  });

  // Recall first (the owner's rule): no reason given, a place, a degree or a relapse stays 911.
  it.each([
    "my grandma fell asleep in her chair and won't wake up",
    "my mom fell asleep in the car and won't wake up",
    "my mom watched the movie and fell asleep and won't wake up",
    "he passed out on the couch after the game and won't wake up for anything, typical",
    'he fell off the wagon, not responding to anyone lately',
  ])('accepted false alarm, still 911 first: %s', (line) => {
    expect(emergencyRead(line)).toEqual([true, true]);
  });

  it.each([
    "my dad got dizzy, then fell, can't get up",
    "my dad fell, can't get up",
    "my grandma got up from the table, then collapsed and now she's not responding",
    "my uncle felt faint, then passed out and he's not waking up",
    'my brother is no longer breathing',
    // A physical cue beats any reason in the same sentence.
    "she fell and can't get up for the show, she's on the floor",
    "my dad collapsed and can't move after the meeting, he's not breathing",
    "my mom fell asleep and can't get up to date, she's on the floor",
  ])('reads someone else down, 911 first: %s', (line) => {
    for (const read of firstAndMid(line)) {
      expect(read.indicators).toContain('third_party_emergency');
      expect(guardFromDetection(read).replacementResponse).toBe(EMERGENCY_FOR_THEM);
    }
  });
});
