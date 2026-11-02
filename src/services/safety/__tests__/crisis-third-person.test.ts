/**
 * Reported speech about someone else reads as a crisis about them (#3345, the family check-in
 * summary reads it through crisisRead). The shared reader is the crisis guard's
 * THIRD_PARTY_PATTERNS, so every caller of detectCrisis gets the same read: a third-party risk,
 * never the caller's own, and never the 988 override (third party tops out below the block).
 * Someone else down and not getting up is the exception: imminent, and the reply leads with 911.
 *
 * Every line here is invented.
 */
import { describe, expect, it } from 'vitest';

import { crisisRead } from '../../outreach/caller-text.js';
import { applyClassifierVerdict, detectCrisis, guardFromDetection } from '../crisis-guard.js';
import { EMERGENCY_FOR_THEM } from '../crisis-guard-replies.js';

/** Each shape, said about she / he / they / my mom / my brother (and other relatives). */
const SHAPES: Record<string, string[]> = {
  'does not want to be here': [
    "she said she doesn't want to be here anymore",
    'he told me he does not want to be alive anymore',
    "my mom said she doesn't want to be here anymore",
    "my brother doesn't want to live anymore",
    "they said she didn't want to wake up again",
  ],
  'talked about ending it': [
    'he talked about ending it',
    "she's been talking about ending it all",
    'they talked about ending it',
    'my mom keeps talking about ending it',
    'my brother mentioned ending it',
    'he keeps talking about not being here anymore',
  ],
  'hurting themselves': [
    'she has been hurting herself',
    'he keeps hurting himself',
    "they've been hurting themselves",
    'my mom has been hurting herself',
    'my brother started burning himself',
    "she's been self-harming again",
  ],
  'means saved up': [
    'she mentioned she has pills saved up',
    'he has pills stockpiled',
    'they have a lot of meds hidden away',
    'my mom has been stockpiling her pills',
    "my brother said he's been saving up his meds",
  ],
  'better off without them': [
    'my cousin keeps saying everyone would be better off without her',
    "he told me they'd be better off without him",
    'she said her family would be better off without her',
    'my mom thinks we would be better off without her, and she means it',
    "my brother's been saying the world is better off without him",
  ],
  'no point going on': [
    "my brother told me he doesn't see the point of going on",
    "she can't see the point in living anymore",
    "they don't see any point in going on",
    "my mom said she doesn't see the point of life",
    "he doesn't see the point in trying anymore",
  ],
  'goodbye letters': [
    'my roommate sent us farewell videos last night',
    "he's been writing goodbye messages to everyone",
    'my sister left farewell letters for all of us',
    'my mom wrote us goodbye notes',
    'they sent me a goodbye message out of nowhere',
  ],
  'giving things away': [
    "he's been giving all his things away",
    'my aunt is giving everything away',
    'they gave most of their belongings away this week',
    'my brother gave all his stuff away and stopped answering',
    "she's been giving all of her possessions away",
  ],
};

/** A neutral opening, so each risk line is also read mid-call, after an earlier turn. */
const OPENER = 'hey, can I tell you about something going on with my family?';

/** The same words about something else: never a crisis read. */
const NEAR_MISSES = [
  "she said she doesn't want to be here, the party's boring",
  'he talked about ending it with his girlfriend',
  'she talked about ending it at work, the project is a mess',
  'my brother mentioned ending it before the holidays',
  "she fell asleep and can't get up early",
  "my dad's killing it at work",
  'she keeps hurting herself at the gym',
  'he has been hurting himself playing soccer',
  'my mom keeps hurting herself by accident',
  'she has pills saved in her travel bag',
  "she's saving up for a car",
  'he talked about ending the lease',
  "she doesn't want to live in that neighborhood",
  'they talked about ending it early this year',
  'she said the band would be better off without his drumming',
  'my uncle jokes the office would be better off without the printer',
  "he doesn't see the point of the weekly status meeting",
  "she doesn't see the point in going on this trip",
  "my brother doesn't see the point in living in the city",
  'my neighbor wrote farewell notes to the staff since she is retiring',
  "he sent goodbye messages to his team because it's his last day",
  'my aunt is giving all her things away before she moves to the coast',
  "they've been giving their old stuff away to charity",
  'my grandpa collapsed into his armchair and napped all afternoon',
  'she fell off the swing and got right back up giggling',
];

/** The other half of the owner's rule: only someone down and not getting up is imminent. */
function expectNotImminent(read: ReturnType<typeof detectCrisis>): void {
  expect(read.indicators).not.toContain('imminent_danger');
  expect(read.indicators).not.toContain('third_party_emergency');
  expect(guardFromDetection(read).shouldBlock).toBe(false);
}

describe('third-person reported crisis (#3345)', () => {
  for (const [shape, lines] of Object.entries(SHAPES)) {
    describe(shape, () => {
      it.each(lines)('reads a third-party crisis, first and mid-call: %s', (line) => {
        for (const read of [
          detectCrisis(line),
          detectCrisis(line, undefined, { recentMessages: [OPENER] }),
        ]) {
          expect(read.isCrisis).toBe(true);
          expect(read.subject).toBe('third_party');
          expect(read.indicators).toContain('third_party_risk');
          expectNotImminent(read);
        }
        expect(crisisRead(line)).toBe(true);
      });
    });
  }

  it.each(NEAR_MISSES)('stays everyday: %s', (line) => {
    const read = detectCrisis(line);
    expect(read.isCrisis).toBe(false);
    expect(read.indicators).not.toContain('third_party_risk');
    expectNotImminent(read);
    expectNotImminent(detectCrisis(line, undefined, { recentMessages: [OPENER] }));
    expect(crisisRead(line)).toBe(false);
  });

  it('never takes the 988 override for a worry about someone else', () => {
    const read = detectCrisis('she mentioned she has pills saved up', {
      primary: 'distressed',
      intensity: 0.9,
      confidence: 0.9,
    });
    expect(read.subject).toBe('third_party');
    expect(read.severity).toBeLessThan(0.85);
  });

  it("leaves the caller's own words the caller's", () => {
    // A first-person crisis beside the report stays the caller's own (never lowered).
    const read = detectCrisis(
      "I want to kill myself. she said she doesn't want to be here anymore"
    );
    expect(read.subject).toBe('self');
    expect(read.severity).toBeGreaterThanOrEqual(0.9);
    // The caller talking about themselves is not a report about someone else.
    expect(detectCrisis('I talked about ending it').indicators).not.toContain('third_party_risk');
  });

  describe('someone else down and not getting up (owner, 2026-11-02): imminent, 911 first', () => {
    it.each([
      "she fell and can't get up",
      "my grandpa collapsed and he won't wake up",
      "my mom fell in the bathroom and she can't get up",
      "he passed out in the yard and isn't responding",
      "they fainted at the bus stop and won't wake up",
      "my brother collapsed at practice and he isn't breathing",
      "my aunt has fallen down the stairs and can't move",
      "our neighbor's not breathing",
      'My dad collapsed and he is not breathing',
      "no joke, my uncle collapsed and he won't wake up",
      "I'm not kidding, she's not breathing",
      'my grandpa is unresponsive, I called 911',
      "she's unresponsive, I texted my sister and called 911",
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

    it('leads with 911 and never sends the caller to 988 for a fall', () => {
      expect(EMERGENCY_FOR_THEM.split('.')[1]).toContain('call 911');
      expect(EMERGENCY_FOR_THEM).not.toContain('988');
    });

    it('a frightened voice keeps it their emergency', () => {
      const voice = { primary: 'distressed', intensity: 0.9, confidence: 0.9 };
      const guard = guardFromDetection(
        detectCrisis("my dad passed out and isn't responding", voice)
      );
      expect(guard.shouldBlock).toBe(true);
      expect(guard.replacementResponse).toBe(EMERGENCY_FOR_THEM);
    });

    it('a classifier verdict about them keeps it; one about the caller only escalates', () => {
      const read = detectCrisis("she fell and can't get up");
      const them = applyClassifierVerdict(read, { risk: 'crisis', subject: 'third_party' });
      expect(them.suggestedResponse).toBe(EMERGENCY_FOR_THEM);
      // Never lowered: the caller's own risk takes over, still imminent and still blocking.
      const caller = applyClassifierVerdict(read, { risk: 'crisis', subject: 'self' });
      expect(caller.subject).toBe('self');
      expect(guardFromDetection(caller).shouldBlock).toBe(true);
      expect(caller.suggestedResponse).toContain('911');
    });

    it("a mixed turn keeps the caller's own crisis reply, with 988", () => {
      const line = "my mom fell and can't get up and I want to kill myself";
      for (const read of [
        detectCrisis(line),
        detectCrisis(line, undefined, { recentMessages: [OPENER] }),
      ]) {
        expect(read.subject).toBe('self');
        const guard = guardFromDetection(read);
        expect(guard.shouldBlock).toBe(true);
        expect(guard.replacementResponse).not.toBe(EMERGENCY_FOR_THEM);
        expect(guard.replacementResponse).toContain('988');
      }
    });

    it("a frightened voice that makes it the caller's own turn keeps 988", () => {
      const line = "my dad collapsed and isn't breathing. I'm not going to end my life";
      const voice = { primary: 'distressed', intensity: 0.9, confidence: 0.9 };
      for (const read of [
        detectCrisis(line, voice),
        detectCrisis(line, voice, { recentMessages: [OPENER] }),
      ]) {
        expect(read.subject).toBe('self');
        expect(read.indicators).toContain('third_party_emergency');
        const guard = guardFromDetection(read);
        expect(guard.shouldBlock).toBe(true);
        expect(guard.replacementResponse).not.toBe(EMERGENCY_FOR_THEM);
        expect(guard.replacementResponse).toContain('988');
      }
    });

    it.each([
      "she fell asleep on the train and couldn't wake up in time for her stop",
      'he fell off his bike but got right up',
      'my grandpa collapsed onto the couch and napped all afternoon',
      "my son passed out after practice and won't wake up for dinner",
      "he fell behind on homework and can't catch up",
      "she fell for him and can't stop smiling",
      "he's not breathing a word about the surprise",
      "I fell and can't get up",
      "she fell asleep during the movie and couldn't stand the ending",
      "he collapsed on the couch and won't get up",
      "he collapsed after the race and couldn't move his legs for a minute",
      "she's been unresponsive to my texts",
      'she stopped breathing for a second when she saw the bill',
    ])('stays without the emergency read: %s', (line) => {
      expectNotImminent(detectCrisis(line));
      expectNotImminent(detectCrisis(line, undefined, { recentMessages: [OPENER] }));
    });

    // A laugh, a joke, not answering messages, or an everyday reason: not someone down and not getting up.
    it.each([
      "he collapsed in laughter and couldn't breathe",
      "my wife collapsed laughing and couldn't breathe, it was so funny",
      "they collapsed into giggles and couldn't stand up",
      "my aunt collapsed laughing at the joke and couldn't breathe",
      "my grandpa fell for the prank and couldn't respond",
      "my roommate fainted when she saw the bill, we couldn't stop laughing, she can't stand up straight",
      "my coworker is unresponsive, I've emailed her five times",
      "my brother's been unresponsive on slack all day",
      'my sister is unresponsive to texts lately',
      "my neighbor is unresponsive, she hasn't replied to a single message",
      'she is so unresponsive, she never calls me back',
      'my teen is unresponsive when I ask about homework',
      "my dad passed out on the couch and won't answer his phone",
      "my mom fell asleep and won't answer her phone",
      "he passed out after the party and won't answer my calls",
      "she collapsed onto the bed and won't answer anyone's texts",
      "my son passed out playing video games and won't respond to my messages",
      "they passed out early and won't answer their phone",
      'my dad is unconscious of how loud he chews',
      'my mom has been saving her pills for the trip',
      "he doesn't see the point of life insurance",
      'my laptop collapsed',
    ])('stays everyday, first and mid-call: %s', (line) => {
      for (const read of [
        detectCrisis(line),
        detectCrisis(line, undefined, { recentMessages: [OPENER] }),
      ]) {
        expect(read.isCrisis).toBe(false);
        expectNotImminent(read);
      }
    });
  });

  describe("the caller's own disappearing (first person, 988)", () => {
    it('reads "disappear for good" as the caller\'s own crisis, first and mid-call', () => {
      const line = 'I want to disappear for good and not wake up';
      for (const read of [
        detectCrisis(line),
        detectCrisis(line, undefined, { recentMessages: [OPENER] }),
      ]) {
        expect(read.isCrisis).toBe(true);
        expect(read.subject).toBe('self');
        expect(read.suggestedResponse).toContain('988');
        expect(read.indicators).not.toContain('third_party_emergency');
      }
    });

    it('stays everyday for a weekend away, first and mid-call', () => {
      const line = 'I want to disappear for the weekend';
      expect(detectCrisis(line).isCrisis).toBe(false);
      expect(detectCrisis(line, undefined, { recentMessages: [OPENER] }).isCrisis).toBe(false);
    });
  });
});
