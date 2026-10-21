/**
 * POST /api/jobs/follow-through: the kill switch, dry run, one guarded text per
 * person, the gap, and the per-person cohort flag. The real sendGuardedText
 * runs against an in-memory text store, so the gap is the sender's, not a stub's.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FollowUp } from '../../../services/follow-through/index.js';
import { followUp } from '../../../services/follow-through/__tests__/fixtures.js';
import type { CheckinRecord, StoredCheckin } from '../../../services/outreach/checkin-replies.js';
import type { FollowUpTextDeps } from '../../../services/outreach/follow-up-texts.js';
import {
  sendGuardedText,
  type TextDeps,
  type TextStore,
} from '../../../services/outreach/guarded-text.js';
import { atomicLocks } from '../../../services/outreach/__tests__/atomic-locks.js';
import { readFileSync } from 'fs';
import {
  followThroughFlags,
  handleFollowThrough,
  runFollowThroughJob,
} from '../background-delivery-jobs.js';
import { JOB_PATHS } from '../index.js';
import { forgetFlagCache } from '../../../services/platform/cohort-flags.js';

const NOW = new Date('2026-10-13T16:10:00Z'); // 12:10 in New York; the fixture is due at 12:00
const ON = { FOLLOW_THROUGH_JOB: 'on' };
const PHONE = '+15550000000'; // fictional

/** Follow-ups in memory, with the real store's live() and compare-and-set save(). */
function memoryStore(initial: FollowUp[]) {
  const docs = new Map(initial.map((f) => [f.id, f]));
  return {
    docs,
    store: {
      live: vi.fn(async (u: string) =>
        [...docs.values()].filter(
          (f) => f.userId === u && (f.status === 'open' || f.status === 'surfaced')
        )
      ),
      save: vi.fn(async (next: FollowUp, expected: string) => {
        if (docs.get(next.id)?.updatedAt !== expected) return false;
        docs.set(next.id, next);
        return true;
      }),
    },
  };
}

/** The guarded sender over an in-memory feature_checkins; `now` is shared with the job. */
function textWorld(clock: { now: Date }) {
  const records: StoredCheckin[] = [];
  const store: TextStore = {
    ...atomicLocks(),
    forUser: async (u: string) => records.filter((r) => r.userId === u),
    forPhoneHash: async (h: string) => records.filter((r) => r.phoneHash === h),
    add: async (r: CheckinRecord) => {
      records.push({ ...r, id: `r${records.length}` });
      return 'new';
    },
    sponsoredPhone: async () => undefined,
    isOptedOut: async () => false,
    consentDoc: async () => undefined,
    userDoc: async () => undefined,
    legacySmsChannels: async () => undefined,
  };
  const textDeps: TextDeps = {
    env: { LOG_HASH_SECRET: 'test-secret' },
    store,
    authPhone: async () => PHONE,
    send: vi.fn(async () => ({ success: true, messageSid: 'SM1' })),
    now: () => clock.now,
  };
  return { records, textDeps };
}

function world(due: FollowUp[], cohort: string[] = ['u1']) {
  const clock = { now: NOW };
  const mem = memoryStore(due);
  const texts = textWorld(clock);
  const deps: FollowUpTextDeps = {
    store: mem.store,
    optedIn: async () => [...new Set([...mem.docs.values()].map((f) => f.userId))],
    resolveFlags: vi.fn(async (u: string): Promise<Record<string, string>> =>
      cohort.includes(u) ? { FOLLOW_THROUGH_TEXTS: 'on' } : {}
    ),
    sendText: (t) => sendGuardedText(t, texts.textDeps),
    forgotten: async () => [],
  };
  const run = (dryRun = false) =>
    runFollowThroughJob({ dryRun, env: ON, deps: async () => deps, now: clock.now });
  return { clock, mem, texts, deps, run };
}

function fakeRes() {
  const out = { status: 0, body: undefined as unknown };
  const res = {
    writeHead: (s: number) => (out.status = s),
    end: (b: string) => (out.body = JSON.parse(b)),
  } as unknown as ServerResponse;
  return { out, res };
}

afterEach(() => vi.unstubAllEnvs());

describe('POST /api/jobs/follow-through', () => {
  it('is a scheduler-authenticated job path', () => {
    expect(JOB_PATHS.has('/api/jobs/follow-through')).toBe(true);
  });

  it('with FOLLOW_THROUGH_JOB off, answers 200 flag-off and never builds the store', async () => {
    vi.stubEnv('FOLLOW_THROUGH_JOB', '');
    const deps = vi.fn(async () => null);
    expect(await runFollowThroughJob({ dryRun: false, env: {}, deps })).toEqual({
      skipped: 'flag-off',
    });
    expect(deps).not.toHaveBeenCalled();

    const { out, res } = fakeRes();
    await handleFollowThrough({ url: '/api/jobs/follow-through' } as IncomingMessage, res);
    expect(out).toEqual({
      status: 200,
      body: { success: true, job: 'follow-through', skipped: 'flag-off' },
    });
  });

  it('dry run lists the due follow-up and sends and writes nothing', async () => {
    const w = world([followUp()]);
    const report = await w.run(true);
    expect(report).toMatchObject({ dryRun: true, wouldSend: 1, wouldSendIds: ['f1'], sent: 0 });
    expect(w.texts.textDeps.send).not.toHaveBeenCalled();
    expect(w.texts.records).toHaveLength(0);
    expect(w.mem.store.save).not.toHaveBeenCalled();
    expect(w.mem.docs.get('f1')?.status).toBe('open');
  });

  it('sends one guarded text, marks it surfaced, and sends nothing more within the gap', async () => {
    const w = world([followUp()]);
    expect(await w.run()).toMatchObject({ dryRun: false, sent: 1 });
    expect(w.texts.textDeps.send).toHaveBeenCalledTimes(1);
    expect(w.texts.records[0]).toMatchObject({ kind: 'follow-up', refId: 'f1', status: 'sent' });
    expect(w.mem.docs.get('f1')).toMatchObject({ status: 'surfaced', surfaced: [{ via: 'text' }] });

    // Five minutes on, a second reminder is due for the same person: the sender's gap holds it.
    w.clock.now = new Date(NOW.getTime() + 5 * 60_000);
    w.mem.docs.set('f2', followUp({ id: 'f2', dueAt: '2026-10-13T16:12:00.000Z' }));
    const second = await w.run();
    expect(second).toMatchObject({ sent: 0, held: { 'recently-sent': 1 } });
    expect(w.texts.textDeps.send).toHaveBeenCalledTimes(1);
    expect(w.mem.docs.get('f2')?.status).toBe('open');
  });

  it('sends nothing to a person without the FOLLOW_THROUGH_TEXTS cohort flag', async () => {
    const w = world([followUp()], []);
    expect(await w.run()).toMatchObject({ sent: 0, notInCohort: 1 });
    expect(w.texts.textDeps.send).not.toHaveBeenCalled();
    expect(w.mem.docs.get('f1')?.status).toBe('open');
  });

  it('reports no-firestore instead of failing where there is no store', async () => {
    expect(await runFollowThroughJob({ dryRun: false, env: ON, deps: async () => null })).toEqual({
      skipped: 'no-firestore',
    });
  });
});

describe('follow-up texts follow the shared cohort lookups', () => {
  afterEach(() => forgetFlagCache());

  /** u1 has an override turning FOLLOW_THROUGH_TEXTS on; the job runs the real cohort lookups. */
  async function runWithCohortFlags(cohortFlags: string | undefined) {
    forgetFlagCache();
    const w = world([followUp()]);
    const env = cohortFlags === undefined ? {} : { COHORT_FLAGS: cohortFlags };
    const flags = followThroughFlags({
      env,
      store: {
        cohortsFor: async () => [],
        overridesFor: async (u): Promise<Record<string, string>> =>
          u === 'u1' ? { FOLLOW_THROUGH_TEXTS: 'on' } : {},
      },
      holders: { candidatesFor: async () => ['u1'] },
    });
    const deps = { ...w.deps, ...flags };
    const report = await runFollowThroughJob({
      dryRun: false,
      env: ON,
      deps: async () => deps,
      now: NOW,
    });
    return { w, report };
  }

  it.each([
    ['unset', undefined],
    ['off', 'off'],
  ])(
    'with COHORT_FLAGS %s nobody gets a follow-up text, even with an override on',
    async (_label, value) => {
      const { w, report } = await runWithCohortFlags(value);
      expect(report).toMatchObject({ people: 0, sent: 0 });
      expect(w.texts.textDeps.send).not.toHaveBeenCalled();
      expect(w.mem.store.save).not.toHaveBeenCalled();
    }
  );

  it('with COHORT_FLAGS on, the override reaches the person', async () => {
    const { w, report } = await runWithCohortFlags('on');
    expect(report).toMatchObject({ people: 1, sent: 1 });
    expect(w.texts.textDeps.send).toHaveBeenCalledTimes(1);
  });

  it('an override turning it off beats being a candidate', async () => {
    forgetFlagCache();
    const flags = followThroughFlags({
      env: { COHORT_FLAGS: 'on' },
      store: {
        cohortsFor: async () => [
          { id: 'ff', enabled: true, flags: { FOLLOW_THROUGH_TEXTS: 'on' } },
        ],
        overridesFor: async () => ({ FOLLOW_THROUGH_TEXTS: 'off' }),
      },
      holders: { candidatesFor: async () => ['u1'] },
    });
    expect(await flags.optedIn()).toEqual([]);
    expect(await flags.resolveFlags('u1')).toEqual({ FOLLOW_THROUGH_TEXTS: 'off' });
  });
});

describe('infra/cloud-scheduler-delivery.yaml', () => {
  it('gives every job a scheduler OIDC token for its own URL, or it would 401 forever', () => {
    const yaml = readFileSync(
      new URL('../../../../infra/cloud-scheduler-delivery.yaml', import.meta.url),
      'utf8'
    );
    const jobs = yaml.split(/\n {2}- name: /).slice(1);
    expect(jobs.map((j) => j.split('\n')[0])).toContain('follow-through');
    for (const job of jobs) {
      const uri = /\n {6}uri: (\S+)/.exec(job)?.[1];
      expect(uri, job).toBeDefined();
      expect(job).toContain(
        '      oidcToken:\n        serviceAccountEmail: scheduler-invoker@johnb-2025.iam.gserviceaccount.com\n' +
          `        audience: ${uri}\n`
      );
    }
  });
});
