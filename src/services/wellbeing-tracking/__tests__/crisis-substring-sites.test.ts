/**
 * Four live crisis checks outside early-warning.ts matched risk phrases as
 * bare substrings. SAFETY_WHOLE_WORD_SITES=on moves each onto whole words in
 * STT spelling. Through each real function: off keeps today's result, on
 * drops the in-word false positive and keeps (or gains) the real phrase,
 * inflected forms included ("self-harming", "hopelessness", "dieee").
 */
import { readFileSync } from 'node:fs';
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

import type { ContextBuilderInput } from '../../../intelligence/context-builders/index.js';
import { detectPatternSignals } from '../../../intelligence/context-builders/intelligence/predictive-context.js';
import { analyzeReferralNeed } from '../../principal-alignment/human-referral.js';
import { assessSafety } from '../../../tools/domains/life-coaching-shared/safety-guards.js';
import { detectEmotionalState } from '../../../tools/semantic-router/shared-vocabulary.js';
import { saysPhrase, testWholeWords } from '../../../utils/safety-whole-word.js';

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

describe('principal-alignment analyzeReferralNeed (immediate = crisis line)', () => {
  const urgency = (m: string) => analyzeReferralNeed(m, { userId: 'u' }).urgency;
  const CASES: Case[] = [
    ['I won all the casino points', "there's no point anymore"],
    ['no pointers on this one', 'honestly no point in trying'],
    ['the suicide squad sequel', 'I feel suicidal'],
  ];
  it('off: casino points is immediate, as today', () => {
    flag('off');
    expect(urgency('I won all the casino points')).toBe('immediate');
  });
  it.each(CASES.slice(0, 2))('on: %j is not immediate; %j still is', (everyday, real) => {
    flag('on');
    expect(urgency(everyday)).not.toBe('immediate');
    expect(urgency(real)).toBe('immediate');
  });
  it('on: a whole-word everyday use still fires (an accepted false positive)', () => {
    flag('on');
    expect(urgency(CASES[2][0])).toBe('immediate');
    expect(urgency(CASES[2][1])).toBe('immediate');
  });
  it('on: curly apostrophes count', () => {
    flag('off');
    expect(urgency('I don’t want to live')).toBe('low');
    flag('on');
    expect(urgency('I don’t want to live')).toBe('immediate');
  });
  it('on: a match inside a word does not hide a later whole-word one', () => {
    flag('on');
    expect(testWholeWords(/(?:he|she) hits me/i, 'the hits me, she hits me')).toBe(true);
    expect(testWholeWords(/(?:he|she) hits me/i, 'the hits me')).toBe(false);
  });
});

describe('semantic-router detectEmotionalState (crisis valence, critical)', () => {
  const type = (m: string) => detectEmotionalState(m)?.type;
  const CASES: Case[] = [
    ['I actually did send it Wednesday', 'I just want to end it'],
    ['I want to diet before summer', 'I want to die'],
    ['I cant go online right now', 'i cant go on'],
  ];
  it.each(CASES)('off: %j is crisis, as today', (everyday) => {
    flag('off');
    expect(type(everyday)).toBe('crisis');
  });
  it.each(CASES)('on: %j is not crisis; %j still is', (everyday, real) => {
    flag('on');
    expect(type(everyday)).not.toBe('crisis');
    expect(type(real)).toBe('crisis');
  });
});

describe('predictive-context detectPatternSignals (URGENT check-in)', () => {
  const signal = (userText: string) =>
    detectPatternSignals({ userText } as unknown as ContextBuilderInput);
  const CASES: Case[] = [
    ["I'll give updates later", 'I just want to give up'],
    ['I got casino points', "there's no point"],
  ];
  it.each(CASES)('off: %j is concern, as today', (everyday) => {
    flag('off');
    expect(signal(everyday)).toBe('concern');
  });
  it.each(CASES)('on: %j is not concern; %j still is', (everyday, real) => {
    flag('on');
    expect(signal(everyday)).not.toBe('concern');
    expect(signal(real)).toBe('concern');
  });
  it('on: the STT spelling "i dont want to be here" becomes concern', () => {
    flag('off');
    expect(signal('i dont want to be here')).not.toBe('concern');
    flag('on');
    expect(signal('i dont want to be here')).toBe('concern');
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
  it.each(["I've been self-harming", 'I self-harmed last night', 'I feel suicidally low'])(
    'detectEmotionalState: %j stays crisis',
    (line) => {
      flag('on');
      expect(detectEmotionalState(line)?.type).toBe('crisis');
    }
  );
  it.each(['such hopelessness', 'hopelessly lost', 'feeling numbness', 'my worthlessness'])(
    'assessSafety: %j stays concerning',
    (line) => {
      flag('off');
      expect(assessSafety(line).level).toBe('concerning');
      flag('on');
      expect(assessSafety(line).level).toBe('concerning');
    }
  );
  it.each(['such hopelessness', 'hopelessly lost'])(
    'predictive-context: %j stays concern',
    (line) => {
      flag('on');
      const input = { userText: line } as unknown as ContextBuilderInput;
      expect(detectPatternSignals(input)).toBe('concern');
    }
  );
  it('the cuttings form still counts', () => {
    flag('on');
    expect(saysPhrase('more cuttings on my arm', 'cutting')).toBe(true);
  });
  it('inflection never reopens an in-word overlap', () => {
    flag('on');
    expect(saysPhrase('my phone number', 'numb')).toBe(false);
    expect(saysPhrase('I want to diet', 'want to die')).toBe(false);
    expect(saysPhrase('I give updates', 'give up')).toBe(false);
    expect(saysPhrase('the self-harmony workshop', 'self-harm')).toBe(false);
    expect(saysPhrase('in the end its fine', 'end it')).toBe(false);
  });
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
    expect(detectEmotionalState('I actually did send it')?.type).toBe('crisis');
  });
  it('each flag file names every site it touches', () => {
    const sites = readFileSync('src/config/flags/SAFETY_WHOLE_WORD_SITES.ts', 'utf8');
    for (const site of [
      'life-coaching-shared/safety-guards.ts',
      'principal-alignment/human-referral.ts',
      'semantic-router/shared-vocabulary.ts',
      'intelligence/predictive-context.ts',
      'semantic-router/matcher.ts',
      'safety/crisis-agreement.ts',
    ]) {
      expect(sites).toContain(site);
    }
    const stt = readFileSync('src/config/flags/EARLY_WARNING_STT_FORMS.ts', 'utf8');
    expect(stt).toContain('wellbeing-tracking/early-warning.ts');
  });
});
