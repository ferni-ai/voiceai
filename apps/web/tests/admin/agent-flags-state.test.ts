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
  unconfirm,
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

  it('records every applied set and reset name', () => {
    expect(timedOut).toEqual({
      ATTUNE_LEDGER: { value: 'on', appliedAt: APPLIED_AT },
      SOUND_CONDUCTOR: { value: null, appliedAt: APPLIED_AT },
    });
  });

  it("stages 'off' and 'default' for an unconfirmed name although the old worker runs them", () => {
    const running = runningForStage('ATTUNE_LEDGER', 'off', [], timedOut);
    expect(stage(EMPTY, 'ATTUNE_LEDGER', 'off', running, 'off')).toEqual({
      set: { ATTUNE_LEDGER: 'off' },
      reset: [],
    });
    expect(stage(EMPTY, 'ATTUNE_LEDGER', 'default', running, 'off')).toEqual({
      set: {},
      reset: ['ATTUNE_LEDGER'],
    });
  });

  it('stages any choice for a name waiting for a restart', () => {
    const running = runningForStage('ATTUNE_LEDGER', 'off', ['ATTUNE_LEDGER'], {});
    expect(stage(EMPTY, 'ATTUNE_LEDGER', 'off', running, 'off')).toEqual({
      set: { ATTUNE_LEDGER: 'off' },
      reset: [],
    });
    expect(stage(EMPTY, 'ATTUNE_LEDGER', 'default', running, 'off')).toEqual({
      set: {},
      reset: ['ATTUNE_LEDGER'],
    });
  });

  it('uses the running value for a settled name', () => {
    expect(runningForStage('CALL_TELEMETRY', 'off', [], timedOut)).toBe('off');
    expect(runningForStage('CALL_TELEMETRY', null, [], timedOut)).toBe('');
  });

  it('keeps names an older or non-matching snapshot does not confirm', () => {
    const old = snapshot('2026-11-17T09:00:00.000Z', {
      ATTUNE_LEDGER: { raw: 'on', resolved: 'on' },
      SOUND_CONDUCTOR: { raw: null, resolved: 'off' },
    });
    expect(settle(timedOut, old)).toEqual(timedOut);
    expect(settle(timedOut, null)).toEqual(timedOut);
  });

  it('drops each name a newer snapshot confirms, one by one', () => {
    const partly = snapshot('2026-11-17T10:06:00.000Z', {
      ATTUNE_LEDGER: { raw: 'on', resolved: 'on' },
      SOUND_CONDUCTOR: { raw: 'on', resolved: 'on' },
    });
    expect(settle(timedOut, partly)).toEqual({
      SOUND_CONDUCTOR: { value: null, appliedAt: APPLIED_AT },
    });
    const all = snapshot('2026-11-17T10:06:00.000Z', {
      ATTUNE_LEDGER: { raw: 'on', resolved: 'on' },
      SOUND_CONDUCTOR: { raw: null, resolved: 'off' },
    });
    expect(settle(timedOut, all)).toEqual({});
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
