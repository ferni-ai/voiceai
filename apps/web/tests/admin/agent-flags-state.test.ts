/**
 * The agent flags section's pure state: what is staged for the next apply, and whether the
 * restarted dev agent has reported the applied values yet.
 */

import { describe, expect, it } from 'vitest';
import {
  confirmState,
  nowOnServerClock,
  runningForStage,
  settle,
  stage,
  trackUnconfirmed,
  unconfirm,
  type AgentFlagsBody,
  type FlagSnapshot,
  type Staged,
} from '../../src/admin/sections/agent-flags-state.js';
import { initialSectionId } from '../../src/admin/section-registry.js';

const EMPTY: Staged = { set: {}, reset: [] };
const FOUR_MINUTES = 4 * 60_000;
const APPLIED_AT = '2026-11-17T10:00:00.000Z';

function snapshot(
  startedAt: string,
  flags: Record<string, { raw: string | null; resolved: string }>
): FlagSnapshot {
  return { startedAt, buildSha: 'abc123', flags };
}

const at = (iso: string): Date => new Date(iso);

describe('stage', () => {
  it('leaves Staged empty when the staged value is the running one', () => {
    expect(stage(EMPTY, 'SOUND_CONDUCTOR', 'on', 'on', 'off')).toEqual(EMPTY);
  });

  it('sets a value that differs from the running one', () => {
    expect(stage(EMPTY, 'SOUND_CONDUCTOR', 'shadow', 'off', 'off')).toEqual({
      set: { SOUND_CONDUCTOR: 'shadow' },
      reset: [],
    });
  });

  it("puts the name in reset for 'default'", () => {
    expect(stage(EMPTY, 'SOUND_CONDUCTOR', 'default', 'on', 'off')).toEqual({
      set: {},
      reset: ['SOUND_CONDUCTOR'],
    });
  });

  it("stages nothing for 'default' when the agent already runs the default", () => {
    expect(stage(EMPTY, 'SOUND_CONDUCTOR', 'default', 'off', 'off')).toEqual(EMPTY);
  });

  it('removes a staged entry when the running value is chosen again', () => {
    const staged = stage(EMPTY, 'SOUND_CONDUCTOR', 'on', 'off', 'off');
    expect(stage(staged, 'SOUND_CONDUCTOR', 'off', 'off', 'off')).toEqual(EMPTY);
    const reset = stage(EMPTY, 'SOUND_CONDUCTOR', 'default', 'on', 'off');
    expect(stage(reset, 'SOUND_CONDUCTOR', 'on', 'on', 'off')).toEqual(EMPTY);
  });

  it('moves a name between set and reset, never both', () => {
    const set = stage(EMPTY, 'SOUND_CONDUCTOR', 'shadow', 'on', 'off');
    expect(stage(set, 'SOUND_CONDUCTOR', 'default', 'on', 'off')).toEqual({
      set: {},
      reset: ['SOUND_CONDUCTOR'],
    });
    const reset = stage(EMPTY, 'SOUND_CONDUCTOR', 'default', 'on', 'off');
    expect(stage(reset, 'SOUND_CONDUCTOR', 'shadow', 'on', 'off')).toEqual({
      set: { SOUND_CONDUCTOR: 'shadow' },
      reset: [],
    });
  });

  it('keeps other staged flags and does not change its input', () => {
    const before: Staged = { set: { ATTUNE_LEDGER: 'on' }, reset: ['CALL_TELEMETRY'] };
    const after = stage(before, 'SOUND_CONDUCTOR', 'on', 'off', 'off');
    expect(after).toEqual({
      set: { ATTUNE_LEDGER: 'on', SOUND_CONDUCTOR: 'on' },
      reset: ['CALL_TELEMETRY'],
    });
    expect(before).toEqual({ set: { ATTUNE_LEDGER: 'on' }, reset: ['CALL_TELEMETRY'] });
  });
});

describe('confirmState', () => {
  const applied: Staged = { set: { SOUND_CONDUCTOR: 'on' }, reset: ['ATTUNE_LEDGER'] };
  const matching = {
    SOUND_CONDUCTOR: { raw: 'on', resolved: 'on' },
    ATTUNE_LEDGER: { raw: null, resolved: 'off' },
  };
  const soon = at('2026-11-17T10:01:00.000Z');

  it('waits while the snapshot is from a worker started before the apply', () => {
    const old = snapshot('2026-11-17T09:00:00.000Z', matching);
    expect(confirmState(old, applied, APPLIED_AT, soon, FOUR_MINUTES)).toBe('waiting');
    const same = snapshot(APPLIED_AT, matching);
    expect(confirmState(same, applied, APPLIED_AT, soon, FOUR_MINUTES)).toBe('waiting');
  });

  it('waits while there is no snapshot', () => {
    expect(confirmState(null, applied, APPLIED_AT, soon, FOUR_MINUTES)).toBe('waiting');
  });

  it('is live once a newer snapshot shows every staged value and every reset unset', () => {
    const fresh = snapshot('2026-11-17T10:00:30.000Z', matching);
    expect(confirmState(fresh, applied, APPLIED_AT, soon, FOUR_MINUTES)).toBe('live');
  });

  it('keeps waiting when a newer snapshot misses a set value', () => {
    const fresh = snapshot('2026-11-17T10:00:30.000Z', {
      ...matching,
      SOUND_CONDUCTOR: { raw: 'off', resolved: 'off' },
    });
    expect(confirmState(fresh, applied, APPLIED_AT, soon, FOUR_MINUTES)).toBe('waiting');
  });

  it('keeps waiting when a reset flag is still set in a newer snapshot', () => {
    const fresh = snapshot('2026-11-17T10:00:30.000Z', {
      ...matching,
      ATTUNE_LEDGER: { raw: 'off', resolved: 'off' },
    });
    expect(confirmState(fresh, applied, APPLIED_AT, soon, FOUR_MINUTES)).toBe('waiting');
  });

  it('keeps waiting when a newer snapshot does not list a staged flag', () => {
    const fresh = snapshot('2026-11-17T10:00:30.000Z', {
      ATTUNE_LEDGER: { raw: null, resolved: 'off' },
    });
    expect(confirmState(fresh, applied, APPLIED_AT, soon, FOUR_MINUTES)).toBe('waiting');
  });

  it('times out after timeoutMs with no matching snapshot', () => {
    const old = snapshot('2026-11-17T09:00:00.000Z', matching);
    const justBefore = at('2026-11-17T10:03:59.999Z');
    expect(confirmState(old, applied, APPLIED_AT, justBefore, FOUR_MINUTES)).toBe('waiting');
    const late = at('2026-11-17T10:04:00.000Z');
    expect(confirmState(old, applied, APPLIED_AT, late, FOUR_MINUTES)).toBe('timeout');
  });

  it('is live after the timeout if the matching snapshot is there', () => {
    const fresh = snapshot('2026-11-17T10:00:30.000Z', matching);
    const late = at('2026-11-17T10:10:00.000Z');
    expect(confirmState(fresh, applied, APPLIED_AT, late, FOUR_MINUTES)).toBe('live');
  });

  it('times out rather than waiting forever when appliedAt does not parse', () => {
    expect(confirmState(null, applied, 'not a time', soon, FOUR_MINUTES)).toBe('timeout');
  });
});

describe('initialSectionId', () => {
  it('opens the section named in ?section= when it exists', () => {
    expect(initialSectionId('?section=agent-flags', 'dashboard')).toBe('agent-flags');
  });

  it('falls back for a missing or unknown section', () => {
    expect(initialSectionId('', 'dashboard')).toBe('dashboard');
    expect(initialSectionId('?section=nope', 'dashboard')).toBe('dashboard');
  });

  it('lists the agent flags section right after Feature Flags', async () => {
    const { ADMIN_SECTIONS } = await import('../../src/admin/section-registry.js');
    const ids = ADMIN_SECTIONS.map((s) => s.id);
    expect(ids[ids.indexOf('flags') + 1]).toBe('agent-flags');
    expect(ADMIN_SECTIONS.find((s) => s.id === 'agent-flags')?.name).toBe('Agent flags (dev)');
  });
});

describe('unconfirmed changes', () => {
  const applied: Staged = { set: { ATTUNE_LEDGER: 'on' }, reset: ['SOUND_CONDUCTOR'] };
  const timedOut = unconfirm({}, applied, APPLIED_AT);
  const NEWER = '2026-11-17T10:06:00.000Z';

  it('records every applied set and reset name', () => {
    expect(timedOut).toEqual({
      ATTUNE_LEDGER: { value: 'on', appliedAt: APPLIED_AT },
      SOUND_CONDUCTOR: { value: null, appliedAt: APPLIED_AT },
    });
  });

  it('does not let an earlier apply replace a later one', () => {
    const later = unconfirm({}, { set: { ATTUNE_LEDGER: 'off' }, reset: [] }, NEWER);
    expect(unconfirm(later, applied, APPLIED_AT).ATTUNE_LEDGER).toEqual({
      value: 'off',
      appliedAt: NEWER,
    });
    expect(unconfirm(timedOut, { set: { ATTUNE_LEDGER: 'off' }, reset: [] }, NEWER)).toEqual({
      ATTUNE_LEDGER: { value: 'off', appliedAt: NEWER },
      SOUND_CONDUCTOR: { value: null, appliedAt: APPLIED_AT },
    });
  });

  it("stages 'off' and 'default' for an unconfirmed name although the old worker runs them", () => {
    const old = { raw: null, resolved: 'off' };
    const off = runningForStage('ATTUNE_LEDGER', 'off', 'off', old, [], timedOut);
    expect(stage(EMPTY, 'ATTUNE_LEDGER', 'off', off, 'off')).toEqual({
      set: { ATTUNE_LEDGER: 'off' },
      reset: [],
    });
    const def = runningForStage('ATTUNE_LEDGER', 'default', 'off', old, [], timedOut);
    expect(stage(EMPTY, 'ATTUNE_LEDGER', 'default', def, 'off')).toEqual({
      set: {},
      reset: ['ATTUNE_LEDGER'],
    });
  });

  it('stages nothing when an unconfirmed name is picked at the value it was applied with', () => {
    const old = { raw: null, resolved: 'off' };
    const on = runningForStage('ATTUNE_LEDGER', 'on', 'off', old, [], timedOut);
    expect(stage(EMPTY, 'ATTUNE_LEDGER', 'on', on, 'off')).toEqual(EMPTY);
    // A reset was applied: picking 'default' again is no change either.
    const was = { raw: 'on', resolved: 'on' };
    const def = runningForStage('SOUND_CONDUCTOR', 'default', 'off', was, [], timedOut);
    expect(stage(EMPTY, 'SOUND_CONDUCTOR', 'default', def, 'off')).toEqual(EMPTY);
  });

  it('stages any choice for a name waiting for a restart', () => {
    const old = { raw: null, resolved: 'off' };
    const off = runningForStage('ATTUNE_LEDGER', 'off', 'off', old, ['ATTUNE_LEDGER'], {});
    expect(stage(EMPTY, 'ATTUNE_LEDGER', 'off', off, 'off')).toEqual({
      set: { ATTUNE_LEDGER: 'off' },
      reset: [],
    });
    const def = runningForStage('ATTUNE_LEDGER', 'default', 'off', old, ['ATTUNE_LEDGER'], {});
    expect(stage(EMPTY, 'ATTUNE_LEDGER', 'default', def, 'off')).toEqual({
      set: {},
      reset: ['ATTUNE_LEDGER'],
    });
  });

  it('uses the running value for a settled name', () => {
    const running = { raw: 'on', resolved: 'on' };
    expect(runningForStage('CALL_TELEMETRY', 'off', 'off', running, [], timedOut)).toBe('on');
    expect(runningForStage('CALL_TELEMETRY', 'off', 'off', undefined, [], timedOut)).toBe('');
  });

  it("stages a reset for 'default' when the secret pins the default's value", () => {
    const pinned = { raw: 'off', resolved: 'off' };
    const running = runningForStage('CALL_TELEMETRY', 'default', 'off', pinned, [], {});
    expect(stage(EMPTY, 'CALL_TELEMETRY', 'default', running, 'off')).toEqual({
      set: {},
      reset: ['CALL_TELEMETRY'],
    });
    const unset = { raw: null, resolved: 'off' };
    const same = runningForStage('CALL_TELEMETRY', 'default', 'off', unset, [], {});
    expect(stage(EMPTY, 'CALL_TELEMETRY', 'default', same, 'off')).toEqual(EMPTY);
  });

  it('keeps names an older snapshot, or none, does not confirm', () => {
    const old = snapshot('2026-11-17T09:00:00.000Z', {
      ATTUNE_LEDGER: { raw: 'on', resolved: 'on' },
      SOUND_CONDUCTOR: { raw: null, resolved: 'off' },
    });
    expect(settle(timedOut, old, [])).toEqual({ unconfirmed: timedOut, superseded: {} });
    expect(settle(timedOut, null, [])).toEqual({ unconfirmed: timedOut, superseded: {} });
  });

  // Changed with the fix for review finding r1-1: SOUND_CONDUCTOR used to stay unconfirmed
  // forever here. A worker started after the apply is authoritative, so it settles as
  // superseded instead, and the page reports it once.
  it('drops a name a newer snapshot confirms, and supersedes one it reports otherwise', () => {
    const partly = snapshot(NEWER, {
      ATTUNE_LEDGER: { raw: 'on', resolved: 'on' },
      SOUND_CONDUCTOR: { raw: 'on', resolved: 'on' },
    });
    expect(settle(timedOut, partly, [])).toEqual({
      unconfirmed: {},
      superseded: { SOUND_CONDUCTOR: { value: null, appliedAt: APPLIED_AT } },
    });
    const all = snapshot(NEWER, {
      ATTUNE_LEDGER: { raw: 'on', resolved: 'on' },
      SOUND_CONDUCTOR: { raw: null, resolved: 'off' },
    });
    expect(settle(timedOut, all, [])).toEqual({ unconfirmed: {}, superseded: {} });
  });

  it('keeps a name the newer worker reports otherwise while it waits for a restart', () => {
    const newer = snapshot(NEWER, {
      ATTUNE_LEDGER: { raw: 'off', resolved: 'off' },
      SOUND_CONDUCTOR: { raw: null, resolved: 'off' },
    });
    expect(settle(timedOut, newer, ['ATTUNE_LEDGER'])).toEqual({
      unconfirmed: { ATTUNE_LEDGER: { value: 'on', appliedAt: APPLIED_AT } },
      superseded: {},
    });
  });
});

describe('trackUnconfirmed', () => {
  const STARTED = '2026-11-17T09:00:00.000Z';
  const body = (changes: AgentFlagsBody['changes'], startedAt: string | null): AgentFlagsBody => ({
    flags: [],
    snapshot: startedAt
      ? snapshot(startedAt, {
          ATTUNE_LEDGER: { raw: null, resolved: 'off' },
          SOUND_CONDUCTOR: { raw: 'on', resolved: 'on' },
        })
      : null,
    stale: false,
    pendingRestart: [],
    changes,
  });
  const change = (at: string, set: Record<string, string>, reset: string[], result = 'applied') =>
    ({ at, actor: 'admin@example.test', set, reset, result }) as AgentFlagsBody['changes'][number];

  it('marks every name applied after the worker started, resets included, newest apply winning', () => {
    // Newest first, as the server sends them.
    const changes = [
      change('2026-11-17T09:30:00.000Z', { ATTUNE_LEDGER: 'off' }, []),
      change('2026-11-17T09:20:00.000Z', { ATTUNE_LEDGER: 'on' }, ['SOUND_CONDUCTOR']),
    ];
    expect(trackUnconfirmed({}, body(changes, STARTED)).unconfirmed).toEqual({
      ATTUNE_LEDGER: { value: 'off', appliedAt: '2026-11-17T09:30:00.000Z' },
      SOUND_CONDUCTOR: { value: null, appliedAt: '2026-11-17T09:20:00.000Z' },
    });
  });

  it('ignores refused and failed changes, and applies before the worker started', () => {
    const changes = [
      change('2026-11-17T09:30:00.000Z', { ATTUNE_LEDGER: 'on' }, [], 'refused'),
      change('2026-11-17T09:20:00.000Z', { ATTUNE_LEDGER: 'on' }, [], 'failed'),
      change('2026-11-17T08:00:00.000Z', { ATTUNE_LEDGER: 'on' }, []),
    ];
    // Not superseded either: an apply the running worker already started with is history.
    expect(trackUnconfirmed({}, body(changes, STARTED))).toEqual({
      unconfirmed: {},
      superseded: {},
    });
  });

  it('marks nothing from the trail when there is no snapshot, but keeps what it had', () => {
    const changes = [change('2026-11-17T09:30:00.000Z', { ATTUNE_LEDGER: 'on' }, [])];
    const had = unconfirm({}, { set: {}, reset: ['SOUND_CONDUCTOR'] }, APPLIED_AT);
    expect(trackUnconfirmed(had, body(changes, null)).unconfirmed).toEqual(had);
  });
});

describe('nowOnServerClock', () => {
  const applied: Staged = { set: { SOUND_CONDUCTOR: 'on' }, reset: [] };
  // The 200 arrived when the browser clock read 10:10, ten minutes ahead of appliedAt.
  const received = Date.parse('2026-11-17T10:10:00.000Z');

  it('keeps waiting on the first poll although the browser clock is 10 minutes ahead', () => {
    const now = nowOnServerClock(APPLIED_AT, received, received + 5_000);
    expect(now.toISOString()).toBe('2026-11-17T10:00:05.000Z');
    expect(confirmState(null, applied, APPLIED_AT, now, FOUR_MINUTES)).toBe('waiting');
  });

  it('times out only after 4 minutes of browser time', () => {
    const before = nowOnServerClock(APPLIED_AT, received, received + FOUR_MINUTES - 1);
    expect(confirmState(null, applied, APPLIED_AT, before, FOUR_MINUTES)).toBe('waiting');
    const after = nowOnServerClock(APPLIED_AT, received, received + FOUR_MINUTES);
    expect(confirmState(null, applied, APPLIED_AT, after, FOUR_MINUTES)).toBe('timeout');
  });
});
