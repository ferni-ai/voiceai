/**
 * semantic-router detectEmotionalState (shared-vocabulary.ts) matched crisis
 * terms as bare substrings. With SAFETY_WHOLE_WORD_SITES=on it reads them
 * through phraseHit (#2645): a hit is crisis, as before, and STT spellings and
 * suffixed forms now count too; a term found only inside a listed everyday
 * word ("send it", "diet", "online") is 'soft' and steps down to sad
 * (negative, medium urgency). It is never dropped. The router's context boost
 * (matcher.ts) is tested in crisis-context-boost-whole-word.test.ts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { detectEmotionalState } from '../../../tools/semantic-router/shared-vocabulary.js';
import { riskCorpus } from './crisis-corpus.js';

afterEach(() => {
  vi.unstubAllEnvs();
});
const flag = (v: 'on' | 'off' | 'shadow') => vi.stubEnv('SAFETY_WHOLE_WORD_SITES', v);
const read = (m: string) => {
  const s = detectEmotionalState(m);
  return s ? `${s.type}|${s.urgency}` : null;
};

// Lines whose only crisis-term match lies inside a listed everyday word.
const SOFT = [
  'I actually did send it Wednesday',
  'I want to diet before summer',
  'I cant go online right now',
  "i'll send it all to my sister before i go",
];

describe('detectEmotionalState: a soft crisis term steps down to sad, never dropped', () => {
  it.each(SOFT)('off: %j is crisis, as today', (line) => {
    flag('off');
    expect(read(line)).toBe('crisis|critical');
  });
  it.each(SOFT)('on: %j is sad (negative, medium)', (line) => {
    flag('on');
    expect(read(line)).toBe('sad|medium');
    expect(detectEmotionalState(line)?.valence).toBe('negative');
  });
  it('on: a hit anywhere in the line wins over a soft match', () => {
    flag('on');
    expect(read('i spend it all and i want to end it all')).toBe('crisis|critical');
  });
  it('shadow: decides as off', () => {
    flag('shadow');
    for (const line of SOFT) expect(read(line)).toBe('crisis|critical');
  });
});

describe('detectEmotionalState: real crisis lines stay crisis', () => {
  it.each([
    'I just want to end it',
    "I've been self-harming",
    'I self-harmed last night',
    'I feel suicidally low',
    'my suicidality is back',
    'I am a self-harmer',
    'it was self-harmful',
    "I'm not suicidal or anything, but I did write out my final wishes and passwords",
    'i cant go on',
    'I have been thinking about selfharm',
  ])('on: %j is crisis', (line) => {
    flag('on');
    expect(read(line)).toBe('crisis|critical');
  });
  it('the STT forms flag alone leaves this site as it is', () => {
    vi.stubEnv('EARLY_WARNING_STT_FORMS', 'on');
    expect(read('I actually did send it')).toBe('crisis|critical');
  });
});

describe('corpus: every real-risk line', () => {
  it('on: a line that is crisis off is crisis or (soft) sad on, never lower', () => {
    const lowered: string[] = [];
    for (const line of riskCorpus()) {
      flag('off');
      const off = read(line);
      flag('on');
      const on = read(line);
      if (off === 'crisis|critical' && on !== 'crisis|critical' && on !== 'sad|medium') {
        lowered.push(`${line}: ${on}`);
      }
    }
    expect(lowered).toEqual([]);
  });
});
