/**
 * life-coaching assessSafety (safety-guards.ts) matched risk phrases as bare
 * substrings. SAFETY_WHOLE_WORD_SITES=on moves it onto whole words in STT
 * spelling. Through the real function: off keeps today's result, on drops the
 * in-word false positive and keeps (or gains) the real phrase, inflected forms
 * included ("self-harming", "hopelessness", "dieee").
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const shadow = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/safe-logger.js', async (actual) => {
  const real = await actual<typeof import('../../../utils/safe-logger.js')>();
  return {
    ...real,
    createLogger: (b: Record<string, unknown>) =>
      b.module === 'SafetyPhraseShadow'
        ? { info: shadow, warn: shadow, debug: shadow, error: shadow }
        : real.createLogger(b),
  };
});

import { assessSafety } from '../../../tools/domains/life-coaching-shared/safety-guards.js';

afterEach(() => {
  vi.unstubAllEnvs();
  shadow.mockClear();
});
const flag = (v: 'on' | 'off' | 'shadow') => vi.stubEnv('SAFETY_WHOLE_WORD_SITES', v);

// [everyday line that held a phrase inside a word, real line]
type Case = [string, string];

describe('life-coaching assessSafety (crisis = immediate referral + 988)', () => {
  const CASES: Case[] = [
    ['just spend it all on yourself', 'I want to end it all'],
    ["I can't go online at work", "I can't go on"],
    ['I want to skill them up', 'I want to kill them'],
    ['the self-harmony workshop', 'I keep thinking about self-harm'],
  ];
  it.each(CASES)('off: %j is crisis, as today', (everyday) => {
    flag('off');
    expect(assessSafety(everyday).level).toBe('crisis');
  });
  it.each(CASES)('on: %j is not crisis; %j still is', (everyday, real) => {
    flag('on');
    expect(assessSafety(everyday).level).not.toBe('crisis');
    expect(assessSafety(real).level).toBe('crisis');
  });
  it('on: the STT spelling "i cant go on" becomes crisis', () => {
    flag('off');
    expect(assessSafety('i cant go on').level).not.toBe('crisis');
    flag('on');
    expect(assessSafety('i cant go on').level).toBe('crisis');
  });
  it('on: "number" no longer counts as "numb"', () => {
    flag('off');
    expect(assessSafety('my phone number changed').level).toBe('concerning');
    flag('on');
    expect(assessSafety('my phone number changed').level).toBe('safe');
    expect(assessSafety('I feel numb').level).toBe('concerning');
  });
});

describe('inflected real-risk forms stay matched (whole-word mode is a superset on them)', () => {
  const CRISIS = [
    "I've been self-harming",
    'I self-harmed last night',
    'I been self harming',
    'thinking of suicides',
    'I feel suicidally low',
    'I want to dieee',
    'want to die2',
    'I want to kill myself,',
  ];
  it.each(CRISIS)('assessSafety: %j is crisis off and on', (line) => {
    flag('off');
    const off = assessSafety(line).level;
    flag('on');
    expect(assessSafety(line).level).toBe('crisis');
    if (line !== 'I been self harming') expect(off).toBe('crisis');
  });
  it.each(['such hopelessness', 'hopelessly lost', 'feeling numbness', 'my worthlessness'])(
    'assessSafety: %j stays concerning',
    (line) => {
      flag('off');
      expect(assessSafety(line).level).toBe('concerning');
      flag('on');
      expect(assessSafety(line).level).toBe('concerning');
    }
  );
});

describe('negation guard on "suicidal"', () => {
  it.each([
    "I'm not suicidal",
    'I was never suicidal',
    "I'm not really suicidal",
    'it isn’t suicidal',
  ])('on: %j is not crisis', (line) => {
    flag('on');
    expect(assessSafety(line).level).not.toBe('crisis');
  });
  it.each(["I'm suicidal", "I'm not okay, I'm suicidal", 'I feel suicidal'])(
    'on: %j is crisis',
    (line) => {
      flag('on');
      expect(assessSafety(line).level).toBe('crisis');
    }
  );
});

describe('shadow and the flag split', () => {
  it('shadow: logs where on would differ, decides as off', () => {
    flag('shadow');
    expect(assessSafety('just spend it all on yourself').level).toBe('crisis');
    expect(shadow).toHaveBeenCalledWith(
      expect.objectContaining({ flag: 'SAFETY_WHOLE_WORD_SITES', phrase: 'end it all' }),
      expect.any(String)
    );
  });
  it('the STT forms flag alone leaves every site as it is', () => {
    vi.stubEnv('EARLY_WARNING_STT_FORMS', 'on');
    expect(assessSafety('just spend it all on yourself').level).toBe('crisis');
  });
});
