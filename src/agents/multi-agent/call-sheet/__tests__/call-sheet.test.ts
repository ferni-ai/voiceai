/**
 * The call sheet's decisions, through startCallSheet and take() with counting fake ports:
 * off reads nothing; a fixture member gets the block; a forgotten topic, a forget since the
 * build, a MINOR_CARE hold, crisis risk and a stale sheet each take it away; take() never
 * waits. Every "absent" row has its "present" twin with one thing changed. The caller is the
 * fictional Riley Test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPersonModel } from '../../../../intelligence/person-model/index.js';
import { registerRecentTextsOwnerCheck } from '../../recent-texts-awareness.js';
import { MAX_SHEET_CHARS, startCallSheet, STALE_DAYS } from '../index.js';
import { fakePorts, fakeState, never, storedSheet, type FakeState } from './fixtures.js';

const outbound = vi.hoisted(() => new Set<string>());
vi.mock('../../../shared/outbound-opener.js', async (original) => ({
  ...(await original<typeof import('../../../shared/outbound-opener.js')>()),
  outboundPartiesFor: (sessionId: string) => (outbound.has(sessionId) ? {} : undefined),
}));

const NOW = new Date('2026-11-10T18:00:00.000Z');
const HEADING = '## Your Notes On This Caller';
let seq = 0;

/** Starts the sheet, lets the reads settle, and takes it. */
async function sheetFor(state: FakeState, userId = 'riley-test', sessionId = `sheet-${++seq}`) {
  const pending = startCallSheet(sessionId, userId, { ports: fakePorts(state), now: () => NOW });
  await new Promise((resolve) => setTimeout(resolve, 5));
  return pending?.take() ?? null;
}

beforeEach(() => {
  vi.stubEnv('PERSON_MODEL_READ', 'on');
  registerRecentTextsOwnerCheck(() => true);
  outbound.clear();
});
afterEach(() => vi.unstubAllEnvs());

describe('call sheet: flag and who', () => {
  it('off: nothing to take, nothing read', async () => {
    vi.stubEnv('PERSON_MODEL_READ', 'off');
    const state = fakeState(storedSheet(NOW));
    expect(await sheetFor(state)).toBeNull();
    expect(state.reads).toBe(0);
  });

  it('on, a fixture member: the block, rendered now (never the stored text)', async () => {
    const out = (await sheetFor(fakeState(storedSheet(NOW)))) ?? '';
    expect(out.startsWith(`\n---\n\n${HEADING}\n\n`)).toBe(true);
    expect(out).toContain('- Mia (daughter).');
    expect(out).toContain('Open thread: recital nerves.');
    expect(out).toContain('- You said you would: send the pasta recipe');
    expect(out).not.toContain('stale stored text');
  });

  it('no sheet stored (not in the PERSON_MODEL cohort): no block, no error', async () => {
    expect(await sheetFor(fakeState(null))).toBe('');
  });

  it('an unverified or non-member id, an unproven owner, a call Ferni placed: nothing read', async () => {
    for (const id of ['anon:visitor-1', 'onbehalf:call-1', 'phone:+15555550142']) {
      const state = fakeState(storedSheet(NOW));
      expect(await sheetFor(state, id)).toBe('');
      expect(state.reads).toBe(0);
    }
    registerRecentTextsOwnerCheck(() => false);
    const unproven = fakeState(storedSheet(NOW));
    expect(await sheetFor(unproven)).toBe('');
    expect(unproven.reads).toBe(0);
    registerRecentTextsOwnerCheck(() => true);
    outbound.add('sheet-outbound');
    const placed = fakeState(storedSheet(NOW));
    expect(await sheetFor(placed, 'riley-test', 'sheet-outbound')).toBe('');
    expect(placed.reads).toBe(0);
  });
});

describe('call sheet: forget', () => {
  it('a forgotten topic leaves its words out; the rest stays', async () => {
    const before = fakeState(storedSheet(NOW));
    expect(await sheetFor(before)).toContain('recital');
    const after = fakeState(storedSheet(NOW));
    after.topics = ['recital'];
    const out = (await sheetFor(after)) ?? '';
    expect(out).not.toContain('recital');
    expect(out).toContain('- Sam (brother).');
  });

  it('a forget since the build (stored generation ahead): no sheet at all', async () => {
    const state = fakeState(storedSheet(NOW, 0.2, 2));
    expect(await sheetFor(state)).toContain(HEADING);
    state.generation = 3;
    expect(await sheetFor(state)).toBe('');
  });

  it('a forget this process wrote after the load started: no sheet at take', async () => {
    const state = fakeState(storedSheet(NOW, 0.2, 2));
    const pending = startCallSheet(`sheet-${++seq}`, 'riley-test', {
      ports: fakePorts(state),
      now: () => NOW,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    state.seen = 3;
    expect(pending?.take()).toBe('');
  });

  it('forgotten topics unreadable: no sheet', async () => {
    const state = fakeState(storedSheet(NOW));
    state.topics = null;
    expect(await sheetFor(state)).toBe('');
  });
});

describe('call sheet: holds', () => {
  it('an account MINOR_CARE hold, or an unreadable one: no sheet', async () => {
    const held = fakeState(storedSheet(NOW));
    held.minorCare = true;
    expect(await sheetFor(held)).toBe('');
    const unreadable = fakeState(storedSheet(NOW));
    unreadable.minorCare = new Error('hold store down');
    expect(await sheetFor(unreadable)).toBe('');
  });

  it('a hold on this call at start (crisis risk or MINOR_CARE): no sheet, nothing read', async () => {
    const state = fakeState(storedSheet(NOW));
    state.heldNow = true;
    expect(await sheetFor(state)).toBe('');
    expect(state.reads).toBe(0);
  });

  it('a hold on this call that starts after the load: no sheet at take', async () => {
    const state = fakeState(storedSheet(NOW));
    const pending = startCallSheet(`sheet-${++seq}`, 'riley-test', {
      ports: fakePorts(state),
      now: () => NOW,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    state.heldNow = true;
    expect(pending?.take()).toBe('');
  });

  it('a crisis signal in the last 14 days: no sheet', async () => {
    const state = fakeState(storedSheet(NOW));
    state.recentCrisis = true;
    expect(await sheetFor(state)).toBe('');
  });
});

describe('call sheet: stale and capped', () => {
  it(`a sheet ${STALE_DAYS} days old or more is skipped, though its sections would still render`, async () => {
    const old = storedSheet(NOW, STALE_DAYS + 1);
    // Not called since and under a week: the render alone would keep every section.
    expect(renderPersonModel(old, { now: NOW, forgottenTopics: [] })).toContain('Mia');
    expect(await sheetFor(fakeState(old))).toBe('');
    expect(await sheetFor(fakeState(storedSheet(NOW, STALE_DAYS - 1)))).toContain('Mia');
  });

  it('a long sheet is cut to the in-call cap, whole sections from the bottom', async () => {
    const big = storedSheet(NOW);
    big.unfinished.value.openLoops = Array.from({ length: 30 }, (_, i) => ({
      text: `open item ${String.fromCharCode(97 + (i % 26))} ${'word '.repeat(12)}end`,
      ageDays: 1,
      kind: 'thread' as const,
      dueAt: null,
    }));
    const out = (await sheetFor(fakeState(big))) ?? '';
    const body = out.split(`${HEADING}\n\n`)[1]?.trimEnd() ?? '';
    expect(body.length).toBeGreaterThan(500);
    expect(body.length).toBeLessThanOrEqual(MAX_SHEET_CHARS);
    expect(out).not.toContain('Tone:');
  });
});

describe('call sheet: take() never waits', () => {
  it('a read that never answers: take() returns the empty string at once', () => {
    const state = fakeState(storedSheet(NOW));
    state.gate = never();
    const pending = startCallSheet(`sheet-${++seq}`, 'riley-test', {
      ports: fakePorts(state),
      now: () => NOW,
    });
    const out = pending?.take();
    expect(typeof out).toBe('string');
    expect(out).toBe('');
  });

  it('the same sheet, once its read answers, is there', async () => {
    const state = fakeState(storedSheet(NOW));
    let open = (): void => undefined;
    state.gate = new Promise<void>((resolve) => (open = resolve));
    const pending = startCallSheet(`sheet-${++seq}`, 'riley-test', {
      ports: fakePorts(state),
      now: () => NOW,
    });
    expect(pending?.take()).toBe('');
    open();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(pending?.take()).toContain(HEADING);
  });
});
