/**
 * getWarningContextInjection showed only the FIRST warning at the top severity,
 * in WARNING_PATTERNS order, and crisis_risk is listed last. When
 * EARLY_WARNING_STT_FORMS lifts a sleep or hopelessness warning to urgent in
 * the same turn ("i cant sleep"), that warning took the slot and the crisis
 * guidance was dropped. Main has the same tie for listed phrases.
 *
 * Now crisis_risk, if active at any severity, is always shown first, then every
 * other warning type at the top severity in a fixed priority. Nothing the old
 * single slot showed is lost.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { WellbeingProfile } from '../index.js';
import {
  checkWarnings,
  getWarningContextInjection,
  type EarlyWarning,
  type WarningSeverity,
  type WarningType,
} from '../early-warning.js';
import { renderWarningInjection } from '../warning-injection.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

const CRISIS_GUIDANCE = 'Provide crisis resources immediately';

// Bad sleep, getting worse: sleep_quality_low (0.4) + sleep_declining (0.3).
const sleepyProfile = (userId: string) =>
  ({
    userId,
    current: { dimensions: { sleepQuality: 0.2 } },
    personalBaseline: null,
    weeklyTrends: [{ dimension: 'sleepQuality', direction: 'declining' }],
    monthlyTrends: [],
  }) as unknown as WellbeingProfile;

const SLEEP_TURNS = [
  "i haven't been sleeping well at all lately",
  'up at 3am again, i cant sleep',
  'barely slept two hours, i cant sleep',
  'sleep has been terrible all week',
  'another night lying awake for hours',
];
const CRISIS_TURN = 'i cant sleep and i just want to die';

function runSleepSequence(userId: string): string {
  const profile = sleepyProfile(userId);
  for (const t of [...SLEEP_TURNS, CRISIS_TURN]) checkWarnings(profile, { recentMessages: [t] });
  return getWarningContextInjection(userId);
}

describe('five turns of bad sleep, then "i cant sleep and i just want to die"', () => {
  it.each(['off', 'shadow', 'on'] as const)(
    'EARLY_WARNING_STT_FORMS=%s: the injection leads with Crisis Risk and its guidance',
    (mode) => {
      vi.stubEnv('EARLY_WARNING_STT_FORMS', mode);
      const text = runSleepSequence(`sleep-then-crisis-${mode}`);
      expect(text).toContain('Type: Crisis Risk');
      expect(text).toContain(CRISIS_GUIDANCE);
      expect(text.indexOf('Type: Crisis Risk')).toBe(text.indexOf('Type: '));
    }
  );
  it('on: sleep reads urgent in the same turn and is still shown, after crisis', () => {
    vi.stubEnv('EARLY_WARNING_STT_FORMS', 'on');
    const text = runSleepSequence('sleep-then-crisis-both');
    expect(text).toContain('Type: Sleep Deterioration\nSeverity: URGENT');
    expect(text.indexOf('Type: Crisis Risk')).toBeLessThan(
      text.indexOf('Type: Sleep Deterioration')
    );
  });
});

const warning = (type: WarningType, severity: WarningSeverity, forFerni = [`${type} guidance`]) =>
  ({
    id: `w-${type}-${severity}`,
    userId: 'u',
    type,
    severity,
    confidence: 0.9,
    signals: [],
    triggerScore: 1,
    detectedAt: new Date(),
    recommendations: { forUser: [], forFerni, suggestProfessional: true },
    previousOccurrences: 0,
  }) as EarlyWarning;

const OTHERS: WarningType[] = [
  'depression_risk',
  'anxiety_spike',
  'burnout_trajectory',
  'isolation_pattern',
  'sleep_deterioration',
  'motivation_collapse',
  'hopelessness_pattern',
];
const crisis = (s: WarningSeverity) => warning('crisis_risk', s, [CRISIS_GUIDANCE]);
const firstType = (text: string) => /Type: (.+)/.exec(text)?.[1];

describe('crisis_risk wins every tie, whatever the order the warnings arrive in', () => {
  it.each(OTHERS)('urgent %s vs urgent crisis_risk: crisis first, both shown', (type) => {
    for (const active of [
      [warning(type, 'urgent'), crisis('urgent')],
      [crisis('urgent'), warning(type, 'urgent')],
    ]) {
      const text = renderWarningInjection(active);
      expect(firstType(text)).toBe('Crisis Risk');
      expect(text).toContain(CRISIS_GUIDANCE);
      expect(text).toContain(`${type} guidance`);
    }
  });
  it.each(OTHERS)('urgent %s vs a lower crisis_risk: crisis is still shown, first', (type) => {
    for (const s of ['watch', 'concern'] as const) {
      const text = renderWarningInjection([warning(type, 'urgent'), crisis(s)]);
      expect(firstType(text)).toBe('Crisis Risk');
      expect(text).toContain(`${type} guidance`);
    }
  });
  it('every other type at the top severity is shown, in a fixed order', () => {
    const text = renderWarningInjection([
      warning('sleep_deterioration', 'urgent'),
      warning('anxiety_spike', 'concern'),
      warning('hopelessness_pattern', 'urgent'),
    ]);
    expect([...text.matchAll(/Type: (.+)/g)].map((m) => m[1])).toEqual([
      'Hopelessness Pattern',
      'Sleep Deterioration',
    ]);
  });
});

describe('a raised crisis_risk is added on top, never in place of another warning', () => {
  it.each(OTHERS)('crisis urgent, %s concern: both shown, crisis first', (type) => {
    const text = renderWarningInjection([warning(type, 'concern'), crisis('urgent')]);
    expect(firstType(text)).toBe('Crisis Risk');
    expect(text).toContain(`${type} guidance`);
  });
});

describe('a single warning renders exactly as before', () => {
  it('crisis only', () => {
    expect(renderWarningInjection([crisis('concern'), crisis('urgent')])).toBe(
      `[⚠️ EARLY WARNING ACTIVE]
Type: Crisis Risk
Severity: URGENT

Guidance for you:
- ${CRISIS_GUIDANCE}

⚡ Consider gently suggesting professional support`
    );
  });
  it('nothing active', () => {
    expect(renderWarningInjection([])).toBe('');
  });
});
