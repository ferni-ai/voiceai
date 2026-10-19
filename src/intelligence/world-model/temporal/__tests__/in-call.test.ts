/**
 * The read path for world facts: what a call is told of the caller's life now.
 * Facts are written through the real after-call sink (recordWorldObservations)
 * into the in-memory store, then read through the real loader and renderer.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));

import { BUDGET_TOKENS, MAX_LINES, WORLD_FACTS_RULE, worldFactLines } from '../in-call.js';
import { forgetForCaller } from '../../../../memory/recall/forget.js';
import { loadWorldFactsForCall, worldFactLinesFor, worldFactsNoteFor } from '../in-call-load.js';
import { recordWorldObservations } from '../ingest.js';
import type { WorldFactStore } from '../store.js';
import type { WorldObservation } from '../types.js';
import { createMemoryWorldFactStore } from './memory-store.js';

const ON = { WORLD_MODEL_TEMPORAL: 'on', WORLD_FACTS_IN_CALL: 'on' };
const NOW = Date.parse('2026-10-11T18:00:00.000Z'); // Sun Oct 11, noon in Denver
const TZ = 'America/Denver';
const noTopics = async () => [];

function obs(
  subject: string,
  attribute: string,
  value: string,
  observedAt: string,
  extra: Partial<WorldObservation> = {}
): WorldObservation {
  return {
    subject,
    subjectKind: subject === 'self' ? 'self' : 'person',
    attribute,
    value,
    observedAt,
    confidence: 0.9,
    source: { kind: 'summary', sessionId: 's' },
    ...extra,
  };
}

/** Two calls through the real sink: a job on Oct 1, then a new job and some dates on Oct 9. */
async function seeded(userId = 'u1'): Promise<ReturnType<typeof createMemoryWorldFactStore>> {
  const store = createMemoryWorldFactStore();
  let n = 0;
  // Ingest fails closed on unreadable forgotten topics, so the seed says there are none.
  const deps = {
    store,
    env: ON,
    judge: async () => [],
    newId: () => `wf${++n}`,
    forgotten: noTopics,
  };
  await recordWorldObservations(
    userId,
    'call-1',
    [
      obs('self', 'job', 'works at Acme', '2026-10-01T18:00:00.000Z'),
      // As the extractor wrote it on 2026-10-11: the old job's manager, left open.
      obs('manager', 'status', 'brutal', '2026-10-01T18:00:00.000Z', {
        relation: 'manager at Acme',
      }),
    ],
    deps
  );
  const oct9 = '2026-10-09T18:00:00.000Z';
  await recordWorldObservations(
    userId,
    'call-2',
    [
      obs('self', 'job', 'started at Beta', oct9, { since: '2026-10-05' }),
      obs('self', 'event', 'interview at Stripe', oct9, { eventDate: '2026-10-15' }),
      obs('Mindy', 'event', 'knee surgery', oct9, { relation: 'sister', eventDate: '2026-10-09' }),
      obs('self', 'event', 'dentist', oct9, { eventDate: '2026-10-30' }), // too far ahead
      obs('self', 'event', 'concert', oct9, { eventDate: '2026-09-30' }), // too long ago
      obs('self', 'goal', 'run a half marathon', oct9, { confidence: 0.3 }), // a guess
      obs('self', 'event', 'going to Napa', oct9), // no date: Ferni once took it as over
      obs('self', 'commitment', 'send a playlist', oct9, { by: 'ferni' }), // Ferni's own
    ],
    deps
  );
  return store;
}

const opts = (extra = {}) => ({ now: NOW, timeZone: TZ, userName: 'Sam', ...extra });

beforeEach(() => vi.stubEnv('WORLD_FACTS_IN_CALL', 'on'));
afterEach(() => vi.unstubAllEnvs());

describe('worldFactLines', () => {
  it('states the new job, dated and labelled, and never the one it replaced', async () => {
    const store = await seeded();
    expect(store.all('u1').find((f) => f.value === 'works at Acme')?.validTo).not.toBeNull();
    const lines = worldFactLines(await store.listOpen('u1'), opts());
    const job = lines.find((l) => l.includes('started at Beta'));
    expect(job).toBe('(you said on Oct 9) Sam job: started at Beta, since Mon Oct 5');
    expect(lines.join(' ')).not.toMatch(/Acme/);
  });

  it("leaves out what names the old state, like the old job's manager", async () => {
    const store = await seeded();
    const manager = store.all('u1').find((f) => f.subject === 'manager');
    expect(manager?.validTo).toBeNull(); // still open in the store
    const lines = worldFactLines(await store.listOpen('u1'), opts());
    expect(lines.join(' ')).not.toMatch(/manager|brutal/);
  });

  it('says the old job is over only when they just named it', async () => {
    const open = await (await seeded()).listOpen('u1');
    const named = worldFactLines(open, opts({ words: 'Ugh, Acme called me today' }));
    expect(named[0]).toContain('started at Beta, since Mon Oct 5; no longer: works at Acme');
    // "work" names the slot, not the old job.
    const slot = worldFactLines(open, opts({ words: 'work was so long today' }));
    expect(slot.join(' ')).not.toMatch(/Acme/);
  });

  it('gives a near upcoming date, and asks after a recent past one', async () => {
    const lines = worldFactLines(await (await seeded()).listOpen('u1'), opts());
    expect(lines).toContain('(you said on Oct 9) Sam event: interview at Stripe, Thu Oct 15');
    expect(lines).toContain(
      '(you said on Oct 9) Mindy (their sister) event: knee surgery, was Fri Oct 9 (no word yet on how it went)'
    );
    const all = lines.join(' ');
    for (const left of ['dentist', 'concert', 'half marathon', 'playlist', 'Napa']) {
      expect(all).not.toContain(left);
    }
  });

  it("uses the caller's own calendar day", async () => {
    const open = await (await seeded()).listOpen('u1');
    // 03:00 UTC on Oct 15 is still Oct 14 in Denver: the interview is tomorrow.
    const lines = worldFactLines(open, opts({ now: Date.parse('2026-10-15T03:00:00.000Z') }));
    expect(lines.join(' ')).toContain('interview at Stripe, tomorrow, Thu Oct 15');
  });

  it('leaves out forgotten topics and what they asked not to bring up', async () => {
    const store = await seeded();
    await recordWorldObservations(
      'u1',
      'call-3',
      [obs('Mindy', 'thread', 'avoid: the knee surgery', '2026-10-10T18:00:00.000Z')],
      { store, env: ON, judge: async () => [], forgotten: noTopics }
    );
    const lines = worldFactLines(await store.listOpen('u1'), opts({ forgotten: ['stripe'] }));
    const all = lines.join(' ');
    expect(all).toContain('started at Beta');
    expect(all).not.toMatch(/Stripe|knee|avoid/i);
  });

  it('stays within its budget and line cap', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      ...obs(
        `Friend${i}`,
        'status',
        `doing something fairly long and specific number ${i}`,
        '2026-10-09T18:00:00.000Z'
      ),
      id: `f${i}`,
      subjectKey: `person:friend${i}`,
      validFrom: '2026-10-09T18:00:00.000Z',
      validTo: null,
    }));
    const lines = worldFactLines(many, opts());
    expect(lines.length).toBe(MAX_LINES);
    const chars = WORLD_FACTS_RULE.length + lines.join(' ').length;
    expect(Math.ceil(chars / 4)).toBeLessThanOrEqual(BUDGET_TOKENS);
  });
});

describe('loadWorldFactsForCall', () => {
  it('flag off: nothing loaded and the note is empty', async () => {
    const call = {};
    const store = await seeded();
    await loadWorldFactsForCall(call, 'u1', { store, forgotten: noTopics, env: {} });
    expect(worldFactsNoteFor(call, opts())).toBe('');
    // And a call loaded while on says nothing once the flag is off.
    await loadWorldFactsForCall(call, 'u1', { store, forgotten: noTopics, env: ON });
    vi.stubEnv('WORLD_FACTS_IN_CALL', 'off');
    expect(worldFactsNoteFor(call, opts())).toBe('');
    expect(worldFactLinesFor(call, opts())).toEqual([]);
  });

  it('flag on: the note carries the dated facts and the rule', async () => {
    const call = {};
    expect(worldFactsNoteFor(call, opts())).toBe(''); // before the load
    await loadWorldFactsForCall(call, 'u1', {
      store: await seeded(),
      forgotten: noTopics,
      env: ON,
    });
    const note = worldFactsNoteFor(call, opts());
    expect(note.startsWith(`[Their life right now. ${WORLD_FACTS_RULE}]`)).toBe(true);
    expect(note).toContain('(you said on Oct 9) Sam job: started at Beta');
  });

  it('honours topics forgotten before the call and during it', async () => {
    const call = {};
    const store = await seeded();
    await loadWorldFactsForCall(call, 'u1', { store, forgotten: async () => ['beta'], env: ON });
    expect(worldFactsNoteFor(call, opts())).not.toContain('Beta');
    expect(worldFactsNoteFor(call, opts())).toContain('Stripe');
    expect((await forgetForCaller('u1', 'the Stripe interview')).kind).toBe('forgotten');
    expect(worldFactsNoteFor(call, opts())).not.toContain('Stripe');
  });

  it('forgetMemory drops the topic from the call when the stored forget went through', async () => {
    const call = {};
    await loadWorldFactsForCall(call, 'u3', {
      store: await seeded('u3'),
      forgotten: noTopics,
      env: ON,
    });
    expect(worldFactsNoteFor(call, opts())).toContain('Stripe');
    // No caller account: nothing was forgotten, so nothing changes on the call either.
    expect((await forgetForCaller('anonymous', 'Stripe')).kind).toBe('not-saved');
    expect(worldFactsNoteFor(call, opts())).toContain('Stripe');
    // Another caller's forget never reaches this call.
    expect((await forgetForCaller('u2', 'the Stripe interview')).kind).toBe('forgotten');
    expect(worldFactsNoteFor(call, opts())).toContain('Stripe');
    expect((await forgetForCaller('u3', 'the Stripe interview')).kind).toBe('forgotten');
    expect(worldFactsNoteFor(call, opts())).not.toContain('Stripe');
  });

  it('a failed or slow store means no block, never an error', async () => {
    const broken: WorldFactStore = {
      listOpen: async () => {
        throw new Error('firestore down');
      },
      apply: async () => undefined,
    };
    const failed = {};
    await expect(
      loadWorldFactsForCall(failed, 'u1', { store: broken, forgotten: noTopics, env: ON })
    ).resolves.toBeUndefined();
    expect(worldFactsNoteFor(failed, opts())).toBe('');

    const slow: WorldFactStore = {
      listOpen: () =>
        new Promise((resolve) => {
          setTimeout(() => resolve([]), 1_000); // well past the 10 ms allowed
        }),
      apply: async () => undefined,
    };
    const late = {};
    await loadWorldFactsForCall(late, 'u1', {
      store: slow,
      forgotten: noTopics,
      env: ON,
      timeoutMs: 10,
    });
    expect(worldFactsNoteFor(late, opts())).toBe('');
  });

  it('never reads for an anonymous caller', async () => {
    const listOpen = vi.fn(async () => []);
    await loadWorldFactsForCall({}, 'anonymous', {
      store: { listOpen, apply: async () => undefined },
      env: ON,
    });
    expect(listOpen).not.toHaveBeenCalled();
  });
});
