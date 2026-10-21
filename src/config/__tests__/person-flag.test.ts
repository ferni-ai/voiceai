import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { personFlagOn, usePersonFlagLookup } from '../person-flag.js';

afterEach(() => usePersonFlagLookup(async () => undefined));

describe('personFlagOn', () => {
  it('unwired, the env decides, as before', async () => {
    expect(await personFlagOn('seth', 'COACH_WINS', { COACH_WINS: 'on' })).toBe(true);
    expect(await personFlagOn('seth', 'COACH_WINS', {})).toBe(false);
  });

  it("the person's own value beats the env either way; without one, the env decides", async () => {
    const own: Record<string, 'on' | 'off'> = { seth: 'on', mom: 'off' };
    usePersonFlagLookup(async (userId) => own[userId]);
    expect(await personFlagOn('seth', 'COACH_WINS', {})).toBe(true);
    expect(await personFlagOn('mom', 'COACH_WINS', { COACH_WINS: 'on' })).toBe(false);
    expect(await personFlagOn('mindy', 'COACH_WINS', {})).toBe(false);
    expect(await personFlagOn('mindy', 'COACH_WINS', { COACH_WINS: 'on' })).toBe(true);
  });

  it('a failed lookup or no user falls back to the env, never throws', async () => {
    usePersonFlagLookup(async () => {
      throw new Error('firestore down');
    });
    expect(await personFlagOn('seth', 'COACH_WINS', { COACH_WINS: 'on' })).toBe(true);
    usePersonFlagLookup(async () => 'on');
    expect(await personFlagOn(undefined, 'COACH_WINS', {})).toBe(false);
  });
});

describe('wiring', () => {
  // Unwired, a cohort can't reach these readers, and nothing else would notice.
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

  it('the UI server wires flagForUser where its scheduled jobs load', () => {
    expect(source('../../api/scheduled-jobs/index.ts')).toContain(
      'usePersonFlagLookup(flagForUser);'
    );
  });

  it('every process that runs a call wires callerFlag', () => {
    expect(source('../../agents/gce/job-executor.ts')).toContain(
      "import '../person-flag-register.js';"
    );
    expect(source('../../agents/person-flag-register.ts')).toContain(
      'usePersonFlagLookup(callerFlag);'
    );
  });
});
