/**
 * POST /api/jobs/person-model: the real store (on an in-memory Firestore), the real
 * build and render, and the real cohort-flag lookups. Pre/post on the stored docs:
 * build then store and a rerun writes nothing; prev rotates; the server flag and the
 * person's own flag gate it; a dry run writes nothing; no scheduler token, no run;
 * erasure takes the sheet with the record; contact data never reaches what is stored.
 * Every name, number and address here is invented (555-01xx, example.com).
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasContactData } from '../../../intelligence/person-model/index.js';
import { eraseStore } from '../../../services/platform/erase-store.js';
import { ERASED_STORES } from '../../../services/platform/user-stores.js';
import {
  flagForUser,
  forgetFlagCache,
  usersWithFlag,
  type FlagLookupOptions,
} from '../../../services/platform/cohort-flags.js';
import {
  loadPersonModelInputs,
  readPersonModel,
  savePersonModel,
} from '../../../services/stores/person-model-store.js';
import { fakeFirestore } from '../../../services/stores/__tests__/fake-firestore.js';
import { JOB_PATHS, handleScheduledJobsRoutes } from '../index.js';
import {
  handlePersonModel,
  runPersonModelJob,
  type PersonModelJobDeps,
} from '../person-model-job.js';

const NOW = new Date('2026-10-30T12:00:00.000Z');
const NEXT_DAY = new Date('2026-10-31T07:15:00.000Z');
const OWNER = 'ownerUid0000000000000000000a';
const OTHER = 'otherUid0000000000000000000b';
const ON = { PERSON_MODEL: 'on' };
const at = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const current = (uid: string) => `bogle_users/${uid}/person_model/current`;
const prev = (uid: string) => `bogle_users/${uid}/person_model/prev`;

/** Two people with calls; contact data planted wherever a store can hold text. */
function world() {
  const fake = fakeFirestore({ directions: true });
  for (const uid of [OWNER, OTHER]) {
    const put = (p: string, d: Record<string, unknown>) =>
      fake.docs.set(`bogle_users/${uid}${p}`, d);
    put('', {
      timezone: 'America/New_York',
      familyMembers: [
        { name: 'Rowan', relationship: 'brother' },
        { name: 'Pat', relationship: 'aunt, cell 555-010-4411' },
        { name: 'Lee 5550104477', relationship: 'friend' },
      ],
    });
    put('/summaries/s1', {
      ...{ sessionId: 'sess-1', timestamp: at(2), duration: 600, callerProvenance: 1 },
      mainTopics: ['moving', 'rowan@example.com'],
      followUpItems: ['ask how the move went', 'call Rowan back at (555) 010-1234'],
    });
    put('/dynamic_facts/f1', {
      ...{ entityName: 'Rowan', key: 'phone', value: '555-0142', confidence: 0.9 },
      extractedAt: at(2),
    });
    put('/dynamic_facts/f2', {
      ...{ entityName: 'Rowan', key: 'email', value: 'rowan@example.com', confidence: 0.9 },
      extractedAt: at(2),
    });
    put('/relationship_network/r1', {
      ...{ name: 'Rowan', aliases: ['Ro'], lastMentioned: at(2) },
      recentMentions: [{ date: at(2), context: 'text him at 555 010 4477' }],
    });
    put('/ferni_commitments/c1', {
      commitment: 'send the recipe to sam@example.com',
      madeAt: at(2),
    });
    put('/memory_state/forgotten', { topics: [], generation: 2 });
  }
  // Each person's own: someone only OWNER knows, someone only OTHER knows.
  const mine = (uid: string, name: string, thread: string) => {
    fake.docs.set(`bogle_users/${uid}/relationship_network/own`, {
      ...{ name, lastMentioned: at(1) },
      recentMentions: [{ date: at(1), context: thread }],
    });
    fake.docs.set(`bogle_users/${uid}/summaries/s0`, {
      ...{ sessionId: `sess-${name}`, timestamp: at(1), callerProvenance: 1 },
      followUpItems: [thread],
    });
  };
  mine(OWNER, 'Wren', 'ask about the garden plot');
  mine(OTHER, 'Quill', 'ask about the pottery class');
  return fake;
}

/** The real per-person lookups: OWNER's cohort turns PERSON_MODEL on, OTHER has none. */
const flagOpts = (): FlagLookupOptions => ({
  env: { COHORT_FLAGS: 'on' },
  store: {
    cohortsFor: async (u) =>
      u === OWNER ? [{ id: 'owner', enabled: true, flags: { PERSON_MODEL: 'on' } }] : [],
    overridesFor: async () => ({}),
  },
  holders: { candidatesFor: async () => [OWNER, OTHER] },
});

function depsFor(fake: ReturnType<typeof world>, over: Partial<PersonModelJobDeps> = {}) {
  const deps: PersonModelJobDeps = {
    holders: vi.fn(async () => usersWithFlag('PERSON_MODEL', flagOpts())),
    ownFlag: vi.fn(async (uid: string) => flagForUser(uid, 'PERSON_MODEL', flagOpts())),
    read: (uid) => readPersonModel(fake.db, uid),
    load: vi.fn((uid: string) => loadPersonModelInputs(fake.db, uid)),
    save: vi.fn((uid: string, m, h: string) => savePersonModel(fake.db, uid, m, h)),
    ...over,
  };
  return deps;
}

afterEach(() => forgetFlagCache());

describe('person-model job', () => {
  it('builds and stores the owner, and a rerun the same day writes nothing', async () => {
    const fake = world();
    const deps = depsFor(fake);
    expect(fake.docs.has(current(OWNER))).toBe(false);

    const first = await runPersonModelJob(async () => deps, { env: ON, now: NOW });
    expect(first).toMatchObject({ status: 'ran', candidates: 1, built: 1, written: 1 });
    expect(first.users).toEqual([
      expect.objectContaining({ user: OWNER.slice(0, 8), outcome: 'built', reason: 'written' }),
    ]);
    const stored = fake.docs.get(current(OWNER));
    expect(stored).toMatchObject({
      userId: OWNER,
      throughSessionId: 'sess-Wren',
      forgetGeneration: 2,
    });
    expect(String(stored?.rendered)).toContain('ask how the move went');

    const writes = fake.stats.writes;
    const again = await runPersonModelJob(async () => deps, { env: ON, now: NOW });
    expect(again).toMatchObject({ built: 0, written: 0, skipped: { unchanged: 1 } });
    expect(fake.stats.writes).toBe(writes);
    expect(deps.save).toHaveBeenCalledTimes(1);
  });

  it('rotates prev: the next day rebuilds, and the old sheet becomes prev', async () => {
    const fake = world();
    const deps = depsFor(fake);
    await runPersonModelJob(async () => deps, { env: ON, now: NOW });
    const first = fake.docs.get(current(OWNER));
    expect(fake.docs.has(prev(OWNER))).toBe(false);

    const next = await runPersonModelJob(async () => deps, { env: ON, now: NEXT_DAY });
    expect(next).toMatchObject({ written: 1 });
    expect(fake.docs.get(prev(OWNER))).toEqual(first);
    expect(fake.docs.get(current(OWNER))).toMatchObject({ builtAt: NEXT_DAY.toISOString() });
  });

  it('with PERSON_MODEL off on the server it reads and writes nothing', async () => {
    const fake = world();
    const getDeps = vi.fn(async () => depsFor(fake));
    const result = await runPersonModelJob(getDeps, { env: {}, now: NOW });
    expect(result).toMatchObject({ status: 'off', candidates: 0, built: 0, written: 0 });
    expect(getDeps).not.toHaveBeenCalled();
    expect(fake.stats.writes).toBe(0);
  });

  it('skips a person whose own flag is not on, even when listed as a holder', async () => {
    const fake = world();
    const deps = depsFor(fake, { holders: async () => [OWNER, OTHER] });
    const result = await runPersonModelJob(async () => deps, { env: ON, now: NOW });
    expect(result).toMatchObject({ candidates: 2, written: 1, skipped: { 'flag-off': 1 } });
    expect(fake.docs.has(current(OWNER))).toBe(true);
    expect(fake.docs.has(current(OTHER))).toBe(false);
    expect(deps.load).not.toHaveBeenCalledWith(OTHER);
  });

  it('a person past their time is skipped, and their late build never writes', async () => {
    const fake = world();
    const slow = async (uid: string) => {
      await new Promise((r) => {
        setTimeout(r, 40);
      });
      return loadPersonModelInputs(fake.db, uid);
    };
    const deps = depsFor(fake, { load: slow });
    const result = await runPersonModelJob(async () => deps, {
      ...{ env: ON, now: NOW, perUserTimeoutMs: 5 },
    });
    expect(result).toMatchObject({ written: 0, skipped: { timeout: 1 } });
    await new Promise((r) => {
      setTimeout(r, 80);
    }); // the abandoned build finishes
    expect(deps.save).not.toHaveBeenCalled();
    expect(fake.docs.has(current(OWNER))).toBe(false);
  });

  it('a dry run reports built with counts and writes nothing', async () => {
    const fake = world();
    const deps = depsFor(fake);
    const result = await runPersonModelJob(async () => deps, { env: ON, now: NOW, dryRun: true });
    expect(result).toMatchObject({ dryRun: true, built: 1, written: 0 });
    expect(result.users[0]).toMatchObject({ outcome: 'built', reason: 'dry-run' });
    expect(result.users[0]?.counts?.chars).toBeGreaterThan(0);
    expect(fake.stats.writes).toBe(0);
    expect(deps.save).not.toHaveBeenCalled();
  });

  it('answers the dry run over HTTP with ids and counts, never a line of the sheet', async () => {
    vi.stubEnv('PERSON_MODEL', 'on');
    const fake = world();
    const end = vi.fn();
    const res = { writeHead: vi.fn(), setHeader: vi.fn(), end } as unknown as ServerResponse;
    const req = { url: '/api/jobs/person-model?dryRun=true' } as IncomingMessage;
    await handlePersonModel(req, res, async () => depsFor(fake));
    vi.unstubAllEnvs();
    const body = String(end.mock.calls[0]?.[0]);
    expect(JSON.parse(body)).toMatchObject({ success: true, dryRun: true, built: 1, written: 0 });
    expect(body).not.toContain('Rowan');
    expect(body).not.toContain(OWNER);
    expect(fake.stats.writes).toBe(0);
  });

  it('caps a run and defers the rest, stalest sheet first', async () => {
    const fake = world();
    const many = Array.from({ length: 27 }, (_, n) => `bulk${String(n).padStart(24, '0')}`);
    const deps = depsFor(fake, { holders: async () => many, ownFlag: async () => 'off' });
    const result = await runPersonModelJob(async () => deps, { env: ON, now: NOW });
    expect(result.skipped).toEqual({ 'flag-off': 25, deferred: 2 });
  });

  it('is a scheduler job path and refuses a POST without the OIDC token (401)', async () => {
    vi.stubEnv('PERSON_MODEL', 'on');
    expect(JOB_PATHS.has('/api/jobs/person-model')).toBe(true);
    const writeHead = vi.fn();
    const res = { writeHead, setHeader: vi.fn(), end: vi.fn() } as unknown as ServerResponse;
    const req = { method: 'POST', headers: {} } as unknown as IncomingMessage;
    expect(await handleScheduledJobsRoutes(req, res, '/api/jobs/person-model')).toBe(true);
    expect(writeHead.mock.calls[0]?.[0]).toBe(401);
    vi.unstubAllEnvs();
  });

  it('account erasure removes the sheet and its prev with the record', async () => {
    const fake = world();
    const deps = depsFor(fake);
    await runPersonModelJob(async () => deps, { env: ON, now: NOW });
    await runPersonModelJob(async () => deps, { env: ON, now: NEXT_DAY });
    expect(fake.docs.has(current(OWNER)) && fake.docs.has(prev(OWNER))).toBe(true);
    for (const store of ERASED_STORES.filter((s) => s.collection === 'bogle_users'))
      await eraseStore(fake.db as never, store, OWNER);
    expect([...fake.docs.keys()].filter((p) => p.includes(`${OWNER}/person_model`))).toEqual([]);
  });

  it('privacy: no contact data from any store reaches what is stored', async () => {
    const fake = world();
    await runPersonModelJob(async () => depsFor(fake), { env: ON, now: NOW });
    const stored = fake.docs.get(current(OWNER)) as Record<string, { value: unknown }> & {
      rendered: string;
    };
    // Non-vacuous: the people and the clean thread are there.
    expect(stored.rendered).toContain('Rowan');
    expect(stored.rendered).toContain('ask how the move went');
    const runs = /\d(?:[\s().-]*\d){6,}/;
    expect(stored.rendered).not.toMatch(runs);
    expect(stored.rendered).not.toContain('@');
    expect(hasContactData(stored.rendered)).toBe(false);
    // The structured sections hold no contact data either (ISO times aside).
    const texts: string[] = [];
    const walk = (v: unknown): void => {
      if (typeof v === 'string') texts.push(v);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    for (const k of ['people', 'unfinished', 'topics', 'changed', 'followThrough'])
      walk(stored[k]?.value);
    const words = texts.filter((t) => !/^\d{4}-\d\d-\d\dT/.test(t));
    expect(words.length).toBeGreaterThan(0);
    expect(words.filter((t) => runs.test(t) || t.includes('@'))).toEqual([]);
  });

  it('each person is built only from their own stores, and stored only under their own record', async () => {
    const fake = world();
    const deps = depsFor(fake, { holders: async () => [OWNER, OTHER], ownFlag: async () => 'on' });
    const result = await runPersonModelJob(async () => deps, { env: ON, now: NOW });
    expect(result).toMatchObject({ candidates: 2, written: 2 });
    const mine = fake.docs.get(current(OWNER)) as { userId: string; rendered: string };
    const theirs = fake.docs.get(current(OTHER)) as { userId: string; rendered: string };
    expect(mine.userId).toBe(OWNER);
    expect(theirs.userId).toBe(OTHER);
    // Non-vacuous: each sheet carries its own person and thread.
    expect(mine.rendered).toContain('Wren');
    expect(mine.rendered).toContain('garden plot');
    expect(theirs.rendered).toContain('Quill');
    expect(theirs.rendered).toContain('pottery class');
    expect(mine.rendered).not.toMatch(/Quill|pottery/);
    expect(theirs.rendered).not.toMatch(/Wren|garden plot/);
    const sheets = [...fake.docs.keys()].filter((p) => p.includes('/person_model/'));
    expect(sheets.sort()).toEqual([current(OTHER), current(OWNER)].sort());
  });

  it('persona canon is never stored as one of their people; a teammate name they relate to is', async () => {
    const fake = world();
    const put = (p: string, d: Record<string, unknown>) =>
      fake.docs.set(`bogle_users/${OWNER}${p}`, d);
    // What Ferni and Maya said about themselves, stored by an extractor as the caller's.
    put('/relationship_network/p1', { name: 'Ferni', lastMentioned: at(1) });
    put('/relationship_network/p2', { name: 'Maya', lastMentioned: at(1) });
    put('/dynamic_facts/p3', {
      ...{ entityName: 'Ferni', key: 'home', value: 'Maplewood', confidence: 0.9 },
      extractedAt: at(1),
    });
    // A friend of theirs who shares a teammate's first name, with the relation stated.
    const root = fake.docs.get(`bogle_users/${OWNER}`) as { familyMembers: unknown[] };
    root.familyMembers.push({ name: 'Jordan', relationship: 'friend' });
    await runPersonModelJob(async () => depsFor(fake), { env: ON, now: NOW });
    const stored = fake.docs.get(current(OWNER)) as {
      people: { value: Array<{ name: string; relation: string | null }> };
      rendered: string;
    };
    const names = stored.people.value.map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['Rowan', 'Jordan']));
    expect(names).not.toContain('Ferni');
    expect(names).not.toContain('Maya');
    expect(stored.rendered).not.toMatch(/\bMaya\b|Maplewood/);
  });

  it('a friend named Maya and a coach named Jordan, stored with a relationship, are kept', async () => {
    const fake = world();
    fake.docs.set(`bogle_users/${OWNER}/relationship_network/m`, {
      ...{ name: 'Maya', type: 'friend', lastMentioned: at(1) },
    });
    fake.docs.set(`bogle_users/${OWNER}/relationship_network/j`, {
      ...{ name: 'Jordan', type: 'coach', lastMentioned: at(1) },
    });
    await runPersonModelJob(async () => depsFor(fake), { env: ON, now: NOW });
    const stored = fake.docs.get(current(OWNER)) as { people: { value: Array<{ name: string }> } };
    expect(stored.people.value.map((p) => p.name)).toEqual(
      expect.arrayContaining(['Maya', 'Jordan', 'Rowan'])
    );
  });

  it('a record an erasure has marked is never built or written', async () => {
    const fake = world();
    const root = fake.docs.get(`bogle_users/${OWNER}`) as Record<string, unknown>;
    root.erasing = true;
    const deps = depsFor(fake);
    const result = await runPersonModelJob(async () => deps, { env: ON, now: NOW });
    expect(result).toMatchObject({ written: 0, skipped: { 'no-record': 1 } });
    expect(fake.docs.has(current(OWNER))).toBe(false);
    expect(fake.stats.writes).toBe(0);
  });

  it.each([
    ['deleted', (fake: ReturnType<typeof world>) => fake.docs.delete(`bogle_users/${OWNER}`)],
    [
      'marked erasing',
      (fake: ReturnType<typeof world>) => {
        Object.assign(fake.docs.get(`bogle_users/${OWNER}`) ?? {}, { erasing: true });
      },
    ],
  ])('a record %s between the load and the save gets no sheet', async (_, erase) => {
    const fake = world();
    const load = async (uid: string) => {
      const inputs = await loadPersonModelInputs(fake.db, uid);
      erase(fake);
      return inputs;
    };
    const deps = depsFor(fake, { load });
    const result = await runPersonModelJob(async () => deps, { env: ON, now: NOW });
    expect(deps.save).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ written: 0, skipped: { erased: 1 } });
    expect([...fake.docs.keys()].filter((p) => p.includes('/person_model/'))).toEqual([]);
  });

  it('an empty sheet never replaces a good one: no calls left, or forgotten topics unreadable', async () => {
    for (const breakIt of [
      (fake: ReturnType<typeof world>) => {
        for (const p of [...fake.docs.keys()])
          if (p.startsWith(`bogle_users/${OWNER}/summaries/`)) fake.docs.delete(p);
      },
      (fake: ReturnType<typeof world>) =>
        fake.docs.set(`bogle_users/${OWNER}/memory_state/forgotten`, { topics: 42 }),
    ]) {
      const fake = world();
      const deps = depsFor(fake);
      await runPersonModelJob(async () => deps, { env: ON, now: NOW });
      const good = fake.docs.get(current(OWNER));
      expect((good as { people: { value: unknown[] } }).people.value.length).toBeGreaterThan(0);
      breakIt(fake);
      const next = await runPersonModelJob(async () => deps, { env: ON, now: NEXT_DAY });
      expect(next.written).toBe(0);
      expect(Object.keys(next.skipped)).toEqual([
        expect.stringMatching(/^(no-calls|forgotten-unreadable)$/),
      ]);
      expect(fake.docs.get(current(OWNER))).toBe(good);
      expect(fake.docs.has(prev(OWNER))).toBe(false);
    }
  });
});
