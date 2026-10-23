/**
 * semantic-router detectEmotionalState (shared-vocabulary.ts) matched crisis
 * terms as bare substrings. With SAFETY_WHOLE_WORD_SITES=on it reads them
 * through saysRiskPhrase (#2645): STT spellings and suffixed forms now count
 * too, and a term found only inside a listed everyday word ("send it", "diet",
 * "online") is 'soft', which still counts as crisis. A crisis reading drives
 * analyzeHolisticContext's overallUrgency 'critical' and sentiment 'crisis', so
 * the flag never reads lower than main. The router's context boost (matcher.ts)
 * is tested in crisis-context-boost-whole-word.test.ts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  analyzeHolisticContext,
  detectEmotionalState,
} from '../../../tools/semantic-router/shared-vocabulary.js';
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

describe('detectEmotionalState: a soft crisis term stays crisis, as with the flag off', () => {
  it.each(SOFT)('off: %j is crisis, as today', (line) => {
    flag('off');
    expect(read(line)).toBe('crisis|critical');
  });
  it.each(SOFT)('on: %j is crisis (a soft match never lowers)', (line) => {
    flag('on');
    expect(read(line)).toBe('crisis|critical');
    expect(detectEmotionalState(line)?.valence).toBe('crisis');
  });
  it.each(SOFT)('on: analyzeHolisticContext(%j) reads as with the flag off', (line) => {
    flag('off');
    const off = analyzeHolisticContext(line);
    flag('on');
    const on = analyzeHolisticContext(line);
    expect(on.overallUrgency).toBe('critical');
    expect(on.sentiment).toBe('crisis');
    expect([on.overallUrgency, on.sentiment]).toEqual([off.overallUrgency, off.sentiment]);
    expect([...on.domainBoosts]).toEqual([...off.domainBoosts]);
  });
  it('on: a hit anywhere in the line wins over a soft match', () => {
    flag('on');
    expect(read('i spend it all and i want to end it all')).toBe('crisis|critical');
  });
  it('shadow: decides as off', () => {
    flag('shadow');
    for (const line of SOFT) expect(read(line)).toBe('crisis|critical');
  });
  it('shadow: decides as off where on differs ("selfharm" is crisis only on)', () => {
    const line = 'I have been thinking about selfharm';
    flag('off');
    const off = read(line);
    flag('on');
    expect(read(line)).toBe('crisis|critical');
    expect(off).not.toBe('crisis|critical');
    flag('shadow');
    expect(read(line)).toBe(off);
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
  it('on: a line that is crisis off is crisis on', () => {
    const lowered: string[] = [];
    for (const line of riskCorpus()) {
      flag('off');
      const off = read(line);
      flag('on');
      const on = read(line);
      if (off === 'crisis|critical' && on !== 'crisis|critical') lowered.push(`${line}: ${on}`);
    }
    expect(lowered).toEqual([]);
  });
});
