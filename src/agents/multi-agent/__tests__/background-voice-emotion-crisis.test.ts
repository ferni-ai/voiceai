/**
 * BACKGROUND_VOICE_EMOTION and the turn crisis read. With the flag on, the
 * background turn carries the caller's voice, and the existing amplifier
 * (services/safety/crisis-guard.ts, voice_moderate_distress) can RAISE a read on
 * an anxious or sad voice. Voice never lowers a read, never changes its subject,
 * and with no voice the read is the text-only read. Every count here is pinned:
 * a change that moves one must update the PR's disclosure. Fictional lines and
 * synthetic voices only.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  analyzerReading,
  backgroundCrisis,
  backgroundTurn,
  crisisOf,
  FLAT,
  VOICES,
} from './background-voice-fixtures.js';

afterEach(() => vi.unstubAllEnvs());

const CRISIS = [
  'i want to kill myself',
  'i keep thinking about ending my life',
  "i don't want to be alive anymore",
  'everyone would be better off without me',
  "i don't see the point in living",
  'i wish i could just disappear forever',
  "i've been thinking about suicide",
  "i can't do this anymore, i want it all to end",
  "there's no reason for me to keep going",
  'i want to die',
  "i'm going to end it tonight",
  'i have a plan to kill myself',
  'nobody would even notice if i was gone',
  "i'm a burden to everyone around me",
  'i feel hopeless and trapped',
  "i don't think i can keep living like this",
  'sometimes i wish i would just not wake up',
  "i've been hurting myself again",
  'i want to hurt myself',
  "what's the point of anything, i should just end it",
  "i'm so tired of being alive",
  "i can't see a future for myself",
  // about someone else, with the caller's own softened words
  'my friend wants to kill herself and honestly i get why',
  'my brother talks about suicide and sometimes i feel the same',
  'my roommate said she wants to die, i kind of do too',
];

const ORDINARY = [
  "i'm so tired today",
  'work was a nightmare, my boss is killing me',
  'ugh, worst day ever, i just want to go to bed',
  'this meeting could have been an email, kill me now',
  "i'm exhausted, the week has been endless",
  "my code broke again, i'm going to scream",
  "honestly i'm just venting, the commute was awful",
  'i could sleep for a hundred years',
  "if i have to sit through one more standup i'll lose it",
  "i'm fine, just a long day",
  'great, another deadline moved up, love that for me',
  'my manager wants the report yesterday, i am dead',
  "i'm drowning in emails",
  "today was rough but i'll survive",
  "i'm over it, the printer jammed again",
  'my feet are killing me after that shift',
  "i'm burnt out on this project",
  'i hate mondays so much',
  "i've had it with this traffic",
  'that presentation went so badly i want to crawl under a rock',
  "i'm stressed about the exam tomorrow",
  "nothing's going right this week",
  "i can't do this anymore, my inbox is out of control",
  "i'm so done with everything today",
  "what's even the point of this meeting",
  'i give up on this spreadsheet',
  'i just want this week to be over',
  "i'm so over it, nothing matters at this job",
  "i can't take it anymore, the neighbours are drilling again",
  'honestly i want to disappear until friday',
];

type Read = Awaited<ReturnType<typeof crisisOf>>;
const block = (r: Read) => r.shouldBlock;
const crisis = (r: Read) => r.resolved.isCrisis;

/** Every line x voice, flag off and on; returns the pairs the flag raised, as "voice | line". */
async function sweep(lines: string[]) {
  const raised: string[] = [];
  let pairs = 0;
  for (const line of lines)
    for (const [name, prosody] of Object.entries(VOICES)) {
      pairs += 1;
      const off = await backgroundCrisis(line, analyzerReading(prosody), '');
      const on = await backgroundCrisis(line, analyzerReading(prosody), 'on');
      expect(off.voiceSeen).toBe(false);
      expect(on.voiceSeen).toBe(true);
      // never lowers, never changes the subject
      if (off.patterns.isCrisis) expect(on.patterns.isCrisis, `${name} | ${line}`).toBe(true);
      if (crisis(off)) expect(crisis(on), `${name} | ${line}`).toBe(true);
      if (block(off)) expect(block(on), `${name} | ${line}`).toBe(true);
      expect(on.patterns.severity, `${name} | ${line}`).toBeGreaterThanOrEqual(
        off.patterns.severity
      );
      expect(on.resolved.severity, `${name} | ${line}`).toBeGreaterThanOrEqual(
        off.resolved.severity
      );
      expect(on.patterns.subject, `${name} | ${line}`).toBe(off.patterns.subject);
      expect(on.resolved.subject, `${name} | ${line}`).toBe(off.resolved.subject);
      if ((!crisis(off) && crisis(on)) || (!block(off) && block(on)))
        raised.push(`${name} | ${line}`);
    }
  return { pairs, raised };
}

describe('BACKGROUND_VOICE_EMOTION and the crisis read', () => {
  it('voice never lowers a crisis read; it raises 14 of 175 pairs, all on an anxious or sad voice', async () => {
    const { pairs, raised } = await sweep(CRISIS);
    expect(pairs).toBe(175);
    expect(raised).toEqual([
      'anxious | i wish i could just disappear forever',
      'sad | i wish i could just disappear forever',
      "anxious | i can't do this anymore, i want it all to end",
      "sad | i can't do this anymore, i want it all to end",
      'anxious | nobody would even notice if i was gone',
      'sad | nobody would even notice if i was gone',
      "anxious | i'm a burden to everyone around me",
      "sad | i'm a burden to everyone around me",
      "anxious | what's the point of anything, i should just end it",
      "sad | what's the point of anything, i should just end it",
      "anxious | i'm so tired of being alive",
      "sad | i'm so tired of being alive",
      "anxious | i can't see a future for myself",
      "sad | i can't see a future for myself",
    ]);
  }, 60_000);

  it('raise: a sad voice turns "so tired of being alive" into a reply-replacing read', async () => {
    const line = "i'm so tired of being alive";
    const off = await backgroundCrisis(line, analyzerReading(VOICES.sad), '');
    const on = await backgroundCrisis(line, analyzerReading(VOICES.sad), 'on');
    expect(off.resolved).toMatchObject({ isCrisis: true, subject: 'self' });
    expect(off.resolved.severity).toBeCloseTo(0.75);
    expect(off.shouldBlock).toBe(false);
    expect(on.resolved).toMatchObject({ isCrisis: true, subject: 'self' });
    expect(on.resolved.severity).toBeCloseTo(0.9);
    expect(on.resolved.indicators).toContain('voice_moderate_distress');
    expect(on.shouldBlock).toBe(true);
  });

  it('raise: an anxious voice makes "a burden to everyone" a crisis read', async () => {
    const line = "i'm a burden to everyone around me";
    const off = await backgroundCrisis(line, analyzerReading(VOICES.anxious), '');
    const on = await backgroundCrisis(line, analyzerReading(VOICES.anxious), 'on');
    expect(off.resolved).toMatchObject({ isCrisis: false, subject: 'self' });
    expect(off.resolved.severity).toBeCloseTo(0.6);
    expect(on.resolved).toMatchObject({ isCrisis: true, subject: 'self' });
    expect(on.resolved.severity).toBeCloseTo(0.75);
    expect(on.resolved.indicators).toContain('voice_moderate_distress');
    expect(on.shouldBlock).toBe(false);
  });

  it('over-triggers on ordinary lines: 8 of 210 pairs go false -> true (owner decision before flag-on)', async () => {
    const { pairs, raised } = await sweep(ORDINARY);
    expect(pairs).toBe(210);
    expect(raised).toEqual([
      "anxious | i can't do this anymore, my inbox is out of control",
      "sad | i can't do this anymore, my inbox is out of control",
      "anxious | what's even the point of this meeting",
      "sad | what's even the point of this meeting",
      "anxious | i can't take it anymore, the neighbours are drilling again",
      "sad | i can't take it anymore, the neighbours are drilling again",
      'anxious | honestly i want to disappear until friday',
      'sad | honestly i want to disappear until friday',
    ]);
  }, 60_000);

  it('with no voice, or a reading with no prosody, the read is the text-only read, flag off and on', async () => {
    const { prosody: _none, ...noProsody } = analyzerReading(FLAT);
    for (const line of CRISIS) {
      const textOnly = JSON.stringify(await crisisOf(line, undefined));
      for (const voice of [undefined, null, noProsody])
        for (const flag of ['', 'on'] as const) {
          const ctx = await backgroundTurn(line, voice, flag);
          expect(ctx.userData.voiceEmotion, `${flag} | ${line}`).toBeUndefined();
          expect(JSON.stringify(await crisisOf(line, ctx.userData)), `${flag} | ${line}`).toBe(
            textOnly
          );
        }
    }
  }, 60_000);
});
