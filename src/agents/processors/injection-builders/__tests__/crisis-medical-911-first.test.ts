/**
 * CRISIS_MEDICAL_911_FIRST (#4249, off by default): the transfer awareness context for the
 * caller's own medical emergency leads with 911, and alone gets no crisis-line push.
 *
 * Runs the real transfer injection (buildHumanTransferInjections: the transfer classifier, its
 * decision and buildTransferAwarenessContext) on invented lines, flag off then on.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => null,
}));

import { names911, names988 } from '../../../../services/safety/crisis-line-speech.js';
import { buildHumanTransferInjections } from '../better-than-human-builders.js';

const HEART = "I think I'm having a heart attack";
const BREATHE = "I can't breathe";
const CHEST_ARM = "I'm having chest pain and my left arm is numb";
const BLEEDING_SELF_HARM = "I cut myself and I'm bleeding a lot";
const BLEEDING_OTHERS = "I'm bleeding and I want to hurt someone";
const BRIDGE = "I'm standing on the bridge right now and I'm going to jump";
const OWN = 'I want to die, I cannot do this anymore';
const COUGH = 'my chest hurts when I cough';

const ALWAYS_988 = 'CRITICAL: Always mention 988 (call or text) for crisis support.';

const on = () => vi.stubEnv('CRISIS_MEDICAL_911_FIRST', 'on');
afterEach(() => vi.unstubAllEnvs());

const transfer = async (text: string) => (await buildHumanTransferInjections(text))?.content ?? '';
/** Where 911 and 988 first appear in the context (-1: not there). */
const firsts = (content: string) => [content.search(/\b911\b/), content.search(/\b988\b/)];

/** A medical emergency alone, flag on: 911 right now, first, and no 988 anywhere. */
async function expectAlone(text: string) {
  on();
  const content = await transfer(text);
  expect(content).toMatch(
    /medical emergency\. Tell them to call 911 right now, before anything else/
  );
  expect(names911(content)).toBe(true);
  expect(names988(content)).toBe(false);
}

/** A medical emergency with a risk signal, flag on: 911 first, then main's 988 line. */
async function expectWithRisk(text: string) {
  on();
  const content = await transfer(text);
  const [at911, at988] = firsts(content);
  expect(at911).not.toBe(-1);
  expect(at988).toBeGreaterThan(at911);
  expect(content.split('\n')).toContain(ALWAYS_988);
}

describe('CRISIS_MEDICAL_911_FIRST off', () => {
  it('off: a medical emergency gets the line main gives', async () => {
    for (const text of [HEART, BREATHE, CHEST_ARM, BLEEDING_SELF_HARM]) {
      const content = await transfer(text);
      expect(content.split('\n'), text).toContain(ALWAYS_988);
      expect(names911(content), text).toBe(false);
    }
  });
});

describe('CRISIS_MEDICAL_911_FIRST on', () => {
  it('a heart attack: 911 first, no 988', async () => {
    await expectAlone(HEART);
  });

  it("I can't breathe: 911 first, no 988", async () => {
    await expectAlone(BREATHE);
  });

  it('chest pain with a numb arm: 911 first, no 988', async () => {
    await expectAlone(CHEST_ARM);
  });

  it('a medical emergency with self-harm: 911 first, then 988', async () => {
    await expectWithRisk(BLEEDING_SELF_HARM);
  });

  it('a medical emergency with danger to others: 911 first, then 988', async () => {
    await expectWithRisk(BLEEDING_OTHERS);
  });

  it('a self-harm imminent line and an own crisis line: unchanged', async () => {
    for (const text of [BRIDGE, OWN]) {
      const off = await transfer(text);
      on();
      expect(await transfer(text), text).toBe(off);
      vi.unstubAllEnvs();
    }
    expect((await transfer(OWN)).split('\n')).toContain(ALWAYS_988);
  });

  it('a chest that hurts on a cough: no emergency line', async () => {
    on();
    const content = await transfer(COUGH);
    expect(names911(content)).toBe(false);
    expect(content).not.toMatch(/medical emergency/i);
  });

  it('never lower: every 911 off is still there on, and every 988 but on a medical emergency alone', async () => {
    const alone = new Set([HEART, BREATHE, CHEST_ARM]);
    const lines = [
      HEART,
      BREATHE,
      CHEST_ARM,
      BLEEDING_SELF_HARM,
      BLEEDING_OTHERS,
      BRIDGE,
      OWN,
      COUGH,
    ];
    const lost: string[] = [];
    for (const text of lines) {
      vi.unstubAllEnvs();
      const off = await transfer(text);
      on();
      const now = await transfer(text);
      if (names911(off) && !names911(now)) lost.push(`${text}: 911`);
      if (names988(off) && !names988(now) && !(alone.has(text) && names911(now)))
        lost.push(`${text}: 988`);
    }
    expect(lost).toEqual([]);
  });
});
