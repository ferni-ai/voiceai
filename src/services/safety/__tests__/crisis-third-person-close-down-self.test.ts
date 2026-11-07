/**
 * Someone close went down, and the caller also said something about themselves in the same turn
 * (#3587 round 2, owner 2026-11-07). The reply carries both: 911 for the person who went down
 * first, then 988 for the caller, even when the caller's words were negated or softened ("I'm not
 * suicidal"). The caller's own session weight and K0 level never read lower than main.
 *
 * Every line here is invented.
 */
import { describe, expect, it } from 'vitest';

import { detectCrisis, guardFromDetection, sessionSeverityOf } from '../crisis-guard.js';
import { EMERGENCY_AND_YOU, EMERGENCY_FOR_THEM } from '../crisis-guard-replies.js';
import { someoneCloseWentDown, spokeOfSelf, thirdPartyEmergency } from '../crisis-third-person.js';
import { performSafetyCheck } from '../index.js';

const CALL_911 = EMERGENCY_FOR_THEM.split('\n\n')[0];
const K0_RANK = {
  none: 0,
  gentle_suggestion: 1,
  warm_recommendation: 2,
  urgent_referral: 3,
  emergency: 4,
};
const k0Rank = (line: string) =>
  K0_RANK[
    performSafetyCheck(line, { userId: 'u', personaId: 'ferni' }).escalation
      .level as keyof typeof K0_RANK
  ];
const replyTo = (line: string) => guardFromDetection(detectCrisis(line));

/** 911 for them first, then 988: the reply is replaced and leads with the call for them. */
const expect911Then988 = (line: string) => {
  const guard = replyTo(line);
  expect(guard.shouldBlock, line).toBe(true);
  const reply = guard.replacementResponse ?? '';
  expect(reply.startsWith(CALL_911), line).toBe(true);
  expect(reply.indexOf('911'), line).toBeLessThan(reply.indexOf('988'));
};

const WENT_DOWN = ['my dad collapsed', 'my mom fell', 'my wife fainted', 'my son passed out'];

describe('the twelve lines that lost 988 in round 1', () => {
  // [what the caller said, its session weight on main]
  const OWN: Array<[string, number]> = [
    ["i'm not suicidal", 0],
    ["i used to want to die but i'm better now", 0.6],
    ["i don't want to die", 0.6],
  ];
  it.each(
    WENT_DOWN.flatMap((down) =>
      OWN.map(([own, sess]): [string, number] => [`${down} and ${own}`, sess])
    )
  )('%s: 911 for them, then 988 for the caller', (line, sess) => {
    expect(replyTo(line).replacementResponse, line).toBe(EMERGENCY_AND_YOU);
    expect(sessionSeverityOf(line), line).toBe(sess);
  });
});

describe('a negated or softened word of their own, beside someone close going down', () => {
  const DOWN = [
    ...WENT_DOWN,
    'my dad just collapsed on the floor',
    'my grandma fell in the bathroom',
    'my brother blacked out',
    'my husband just fainted',
  ];
  // [what the caller said, its session weight on main, the lowest K0 level main gives it]
  const OWN: Array<[string, number, keyof typeof K0_RANK]> = [
    ["i'm not suicidal", 0, 'none'],
    ['i was suicidal years ago', 0, 'none'],
    ["i'm not going to do anything stupid", 0, 'none'],
    ["i'm so stressed i could die", 0, 'none'],
    ['i feel hopeless', 0, 'none'],
    ['i feel like a burden', 0, 'none'],
    ["i've been cutting again", 0, 'none'],
    ["lol i'm gonna die of stress", 0, 'none'],
    ["i used to want to die but i'm better now", 0.6, 'none'],
    ["i don't want to die", 0.6, 'none'],
    ['i would never kill myself', 0.6, 'gentle_suggestion'],
    ["i'm not thinking about ending it", 0.6, 'gentle_suggestion'],
    ["i'm not trying to kill myself", 0.6, 'gentle_suggestion'],
    ["i can't do this anymore", 0.6, 'gentle_suggestion'],
    ["i'm not going to hurt myself", 0.6, 'gentle_suggestion'],
    ["i don't want to be here anymore", 0.75, 'urgent_referral'],
    ['i want to kill myself', 0.9, 'emergency'],
    ['i want to die', 0.9, 'emergency'],
  ];
  const JOINS = [' and ', '. ', ', '];

  it.each(OWN)('%s (session %s, K0 at least %s)', (own, sess, k0) => {
    for (const down of DOWN) {
      for (const line of [...JOINS.map((join) => `${down}${join}${own}`), `${own} but ${down}`]) {
        expect911Then988(line);
        expect(sessionSeverityOf(line), line).toBe(sess);
        expect(k0Rank(line), line).toBeGreaterThanOrEqual(K0_RANK[k0]);
      }
    }
  });

  it('still says nothing of 988 when every word is about the person who went down', () => {
    for (const line of [
      'my dad collapsed and i think he could die',
      'my mom fell and she is not moving',
      'my dad collapsed',
    ]) {
      expect(spokeOfSelf(line), line).toBe(false);
      expect(replyTo(line).replacementResponse, line).toBe(EMERGENCY_FOR_THEM);
    }
  });
});

describe("a kin chain names someone else's relative, as main reads it (#3558)", () => {
  it.each(["my son's my dad collapsed", "my friend's my dad fell", "her son's my brother fainted"])(
    '%s',
    (line) => {
      const read = detectCrisis(line);
      expect(read.severity, line).toBe(0);
      expect(read.indicators, line).toEqual([]);
    }
  );
});

describe('pending the owner call: what head reads today', () => {
  // [line, what head reads]; main reads nothing for every one. Pinned so a change is seen.
  it.each([
    ['the baby went down for a nap', 'nothing'],
    ['my dad fell. lol', '911'],
    ['we were laughing and then he collapsed laughing', 'nothing'],
    ['my roommate passed out', '911'],
    ['my roommate passed out after the party', 'nothing'],
  ])('%s: %s', (line, reads) => {
    const guard = replyTo(line);
    expect(guard.replacementResponse ?? 'nothing', line).toBe(
      reads === '911' ? EMERGENCY_FOR_THEM : 'nothing'
    );
  });
});

describe('a long message reads in time linear in its length (#3587 round 1 ReDoS)', () => {
  const fill = (unit: string, tail: string) =>
    unit.repeat(Math.ceil(100_000 / unit.length)).slice(0, 100_000 - tail.length) + tail;
  const best = (read: () => unknown) => {
    let fastest = Infinity;
    for (let run = 0; run < 3; run++) {
      const start = performance.now();
      read();
      fastest = Math.min(fastest, performance.now() - start);
    }
    return fastest;
  };

  // Main's own third-person reader on the same text is the yardstick: at most twice its time.
  it.each([
    ['an idiom at the end', fill('my dad fell and ', "can't get up to date")],
    [
      'places and times',
      `my dad fell${fill(' on the kitchen floor just now', " and can't get up").slice(11)}`,
    ],
    ['a recovery at the end', fill('my dad fell and ', "he's fine now")],
    ['self words that never finish', fill('my dad fell and i i ', 'x')],
  ])('%s', (_name, text) => {
    expect(text.length).toBe(100_000);
    const yardstick = best(() => thirdPartyEmergency(text));
    expect(best(() => someoneCloseWentDown(text))).toBeLessThanOrEqual(2 * yardstick + 5);
    expect(best(() => spokeOfSelf(text))).toBeLessThanOrEqual(2 * yardstick + 5);
  });
});
