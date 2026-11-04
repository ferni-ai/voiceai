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
import { thirdPartyEmergency } from '../crisis-third-person.js';

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
    // On the floor and won't wake, with no time or reason given: recall first.
    "my dad fell asleep on the floor and won't wake up",
    "my dad fell asleep on the floor and won't wake up when I shake him",
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
    // A trip in another clause is no reason to keep them.
    "my sister has been saving her pills, we're packing for the trip",
    'my dad has been saving his meds; we leave for the trip friday',
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
    "she fell behind on her bills and can't get up to date",
    "he fell behind in class and can't get up to speed",
    "he fell behind at work and can't get up the energy",
    "my sister fell asleep early and can't get up the motivation",
    "my coworker collapsed into her chair and can't move after that meeting",
    "my mom fell behind on her bills and can't get up to date",
    "my brother fell for her and can't get up the nerve to ask",
    // A "fell" idiom is never a fall, even when the sentence is read again unmasked.
    "my mom fell and can't get up to date",
    "my sister fell out with her boss and can't move on",
    "my dad fell out with his brother and won't answer the question",
    "my mom fell off the diet and can't stand vegetables now",
    "my son fell out of love with soccer and can't move past it",
    "my friend fell in the rankings and can't get up there again",
    "my son fell in the standings and can't move up",
    "my dad fell off his diet and can't stand salad",
  ])('a time or a reason the words name is not an emergency: %s', (line) => {
    expect(emergencyRead(line)).toEqual([false, false]);
  });

  // Recall first (the owner's rule): no reason given, a place, a degree or a relapse stays 911.
  // Sleep gets no clearance at all: in doubt, recall wins, whatever reason is given.
  it.each([
    "he fell asleep and won't wake up for his show",
    "my dad fell asleep and won't wake up for the game",
    "my dad fell asleep watching tv and won't wake up for his show",
    "my son fell asleep on the floor of his room and won't wake up for school",
    "my dad fell asleep on the floor and won't wake up for the movie",
    "my son fell asleep on the couch and won't wake up for school. typical teenager",
    "my grandma fell asleep in her chair and won't wake up",
    "my mom fell asleep in the car and won't wake up",
    "my daughter fell asleep in the car and won't wake up",
    "my dad passed out and won't wake up in the car",
    "my mom watched the movie and fell asleep and won't wake up",
    "he passed out on the couch after the game and won't wake up for anything, typical",
    'he fell off the wagon, not responding to anyone lately',
    // A collapse, then not waking: a reason after it never clears it.
    "my son passed out after practice and won't wake up for dinner",
    "my grandpa passed out on the couch and won't wake up until noon",
    "my kid passed out from exhaustion after the party and won't wake up till noon",
    "my mom fell asleep and can't get up to date, she's on the floor",
    // A place or "for anything" is no reason.
    "my dad fell asleep and won't wake up in the car",
    "my mom fell asleep and won't wake up for anything",
  ])('accepted false alarm, still 911 first: %s', (line) => {
    expect(emergencyRead(line)).toEqual([true, true]);
  });

  it.each([
    "my dad got dizzy, then fell, can't get up",
    "my dad fell, can't get up",
    "my grandma got up from the table, then collapsed and now she's not responding",
    "my uncle felt faint, then passed out and he's not waking up",
    'my brother is no longer breathing',
    // Not, is not, still not, with every not-getting-up word.
    "my mom collapsed and she's not answering",
    'my dad passed out and is not getting up',
    "my grandpa fainted and he's still not moving",
    "my mom and my dad fainted and they aren't moving",
    "she fell over laughing and now she's not responding",
    // A physical fall after the same words as an idiom.
    "my dad tripped and fell and can't move his arm",
    "my grandpa fell and can't get up off the floor",
    "my dad fell through the ice and can't get up",
    "my grandma fell out of bed and can't get up",
    "she fell behind the couch and can't get up",
    "my dad fell for the third time today and can't get up",
    "he fell silent and isn't responding",
    // A reason after breathing, responding or waking from a collapse is never everyday.
    "my dad collapsed and isn't breathing after the game",
    "she fainted and won't wake up after the movie",
    "my grandpa passed out and isn't responding for the show",
    // Sleep with a reason, beside any sign or try, stays 911 (sleep has no clearance).
    "my dad fell asleep on the couch and won't wake up, and he has a game after the movie",
    "my son fell asleep and won't wake up for school, I shook him",
    "my dad fell asleep and won't wake up for dinner, he's breathing really weird",
    "my son fell asleep and won't wake up for school, his lips are blue",
    "my dad fell asleep on the couch, he collapsed and won't wake up for the movie",
    "my mom fell asleep and won't wake up for dinner and she isn't breathing",
    // No collapse before, inside or after the sleep.
    "my dad fell asleep and then he collapsed and won't wake up for the show",
    "my dad fell asleep and he collapsed and won't wake up for the show",
    "my mom fell asleep and my dad passed out and won't wake up for dinner",
    "my dad collapsed and then fell asleep and won't wake up for dinner",
    // Sleep beside every everyday way of going down.
    "my dad fell asleep and he went down and won't wake up for dinner",
    "my mom fell asleep and she dropped and won't wake up for work",
    "my grandpa fell asleep and he keeled over and won't wake up for lunch",
    "my uncle fell asleep and he slumped over and won't wake up for the movie",
    "my aunt fell asleep and she hit the floor and won't wake up for church",
    "my brother fell asleep and he is down and won't wake up for school",
    "my sister fell asleep and she's face down and won't wake up for practice",
    "my grandma fell asleep and she went limp and won't wake up for dinner",
    "my dad fell asleep and he dropped to the ground and won't wake up for the game",
    "my dad went limp and then fell asleep and won't wake up for dinner",
    // Fail closed: any other sign in the sentence keeps it 911.
    "my dad fell asleep and won't wake up for dinner, he isn't moving",
    "my mom fell asleep at the bottom of the stairs and won't wake up for work",
    "my son fell asleep and won't wake up for school, he's unresponsive",
    "my mom fell asleep and won't wake up for work, she won't respond",
    "my dad fell asleep and won't wake up for dinner, he can't stand up",
    // Sleep with the reason in another clause.
    "my dad fell asleep, the tv is on, and won't wake up for dinner",
    "my mom fell asleep, she was tired, and won't wake up for work",
    // A real fall, then an everyday sleep in another clause.
    "my dad fell down the stairs and can't get up, he fell asleep before the game",
    // "Not" forms after a down word.
    "my mom fell, she can't get up",
    "my mom collapsed, she's not responding",
    "my dad passed out and he's not waking up",
    "my grandpa fainted and they're not moving",
    "my mom collapsed and she's still not answering",
    "my dad and my uncle collapsed and they aren't breathing",
    // Every way of trying to wake them.
    "my son fell asleep and won't wake up for school, I tried waking him",
    "my mom fell asleep and won't wake up for dinner, I'm trying to wake her",
    "my dad fell asleep and won't wake up for dinner, I can't wake him",
    "my son fell asleep and won't wake up for school, I shook his shoulder",
    // Trying counts anywhere in the message, not just in the same sentence.
    "my dad fell asleep and won't wake up for dinner. I shook him and he's blue.",
    "my mom fell asleep and won't wake up for work. I couldn't wake her",
    "my son fell asleep and won't wake up for school! I tried to wake him",
    // Sleep after pills, drink, a crash or a hit head, or in the car.
    "after all those pills my dad fell asleep and won't wake up for work",
    "my mom drank a whole bottle of wine and fell asleep and won't wake up for work",
    "my son crashed his bike and fell asleep and won't wake up for school",
    "my brother hit his head and fell asleep and won't wake up for dinner",
    "my dad fell asleep in the car and won't wake up for dinner",
    // Anything alarm-shaped in another sentence keeps it 911, after a period or a "!".
    "my dad fell asleep and won't wake up for dinner. he isn't moving",
    "my dad fell asleep and won't wake up for dinner! he isn't moving",
    "my mom fell asleep and won't wake up for work. she won't respond",
    "my mom fell asleep and won't wake up for work! she won't respond",
    "my son fell asleep and won't wake up for school. he's unresponsive",
    "my son fell asleep and won't wake up for school! he's unresponsive",
    "my dad fell asleep and won't wake up for dinner. he can't stand up",
    "my dad fell asleep and won't wake up for dinner! he's not breathing",
    "my dad fell asleep and won't wake up for dinner. he's breathing really weird",
    "my son fell asleep and won't wake up for school! his lips are blue",
    "my mom fell asleep and won't wake up for dinner. she's on the floor",
    "my dad fell asleep and won't wake up for dinner. then he collapsed",
    "my mom was drinking all night. she fell asleep and won't wake up for work",
    "my son crashed his bike. he fell asleep and won't wake up for school",
    "my brother hit his head! he fell asleep and won't wake up for dinner",
    // Any try to wake, rouse or get them up, said any way.
    "my dad fell asleep and won't wake up for dinner. i could not wake him",
    "my mom fell asleep and won't wake up for work. i can not wake her",
    "my son fell asleep and won't wake up for school. i can't get him to wake",
    "my dad fell asleep and won't wake up for dinner. she tries to rouse him",
    "my mom fell asleep and won't wake up for work. i've shaken her twice",
    "my dad fell asleep and won't wake up for dinner. i tried everything",
    "my son fell asleep and won't wake up for school. i can't get him up",
    "my dad fell asleep and won't wake up for dinner. no rousing him",
    "my dad fell asleep and won't wake up for dinner. he isn't rousable",
    // A sign that reads nothing alone, in another sentence.
    "my dad fell asleep and won't wake up for dinner. this feels like an emergency",
    "my mom fell asleep and won't wake up for work. she's at the bottom of the stairs",
    // A reason later in the sentence never masks a not-getting-up said before it.
    "my grandma fell and can't move, she was getting ready for church",
    "my mom fell and can't get up, she was trying to get ready for work",
    // A physical cue beats any reason in the same sentence, unless it was sleep.
    "she fell and can't get up for the show, she's on the floor",
    "my dad collapsed and can't move after the meeting, he's not breathing",
    "my dad passed out and can't get up for school, I shook him",
  ])('reads someone else down, 911 first: %s', (line) => {
    for (const read of firstAndMid(line)) {
      expect(read.indicators).toContain('third_party_emergency');
      expect(guardFromDetection(read).replacementResponse).toBe(EMERGENCY_FOR_THEM);
    }
  });

  // Sleep with an alarm the reader has no word for stays 911 first, as high as round 5 or
  // higher: a hit head, drinking, vomit and cold, gurgling. No word list can clear these.
  it.each([
    "my son fell asleep on the floor of his room and won't wake up for school. he banged his head on the desk",
    "my dad fell asleep on the couch and won't wake up for work. he was drinking all night",
    "my son fell asleep on the floor and won't wake up for school. he threw up and he's cold",
    "my mom fell asleep on the couch and won't wake up for work. she threw up and she feels cold",
    "my dad fell asleep on the couch and won't wake up for dinner. he's making a gurgling sound",
  ])('reads sleep beside an alarm as an emergency: %s', (line) => {
    for (const read of firstAndMid(line)) {
      expect(read.indicators).toContain('third_party_emergency');
      expect(guardFromDetection(read).replacementResponse).toBe(EMERGENCY_FOR_THEM);
    }
  });

  // Pills before the sleep never clear it. The shared read gives "took a bunch of pills" to the
  // caller's own overdose first (imminent, blocking; a known follow-up), so this pins the reader.
  it.each([
    "my dad took a bunch of pills and fell asleep and won't wake up for work",
    "my dad took a bunch of pills. he fell asleep and won't wake up for work",
  ])('reads pills, then sleep, as an emergency: %s', (line) => {
    expect(thirdPartyEmergency(line)).toBe(true);
    for (const read of firstAndMid(line)) expect(read.indicators).toContain('imminent_danger');
  });

  // Can't breathe after an idiom always reads the sentence again. The shared read still gives
  // "he can't breathe" to the caller's own distress first (a known follow-up), so this pins the reader.
  it("reads can't breathe past a laughing fit", () => {
    expect(thirdPartyEmergency("my dad collapsed laughing and now he can't breathe")).toBe(true);
  });
});
