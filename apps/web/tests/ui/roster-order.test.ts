import { afterEach, describe, expect, it, vi } from 'vitest';
import { isRosterStable, orderRoster, type RosterSlot } from '../../src/ui/roster-order.js';

const CANONICAL = ['ferni', 'maya-santos', 'peter-john', 'alex-chen', 'jordan-taylor', 'nayan-patel'];
const TEAM = CANONICAL.slice(1);

function ids(slots: RosterSlot[]): string[] {
  return slots.map((s) => s.id);
}

function bar(visible: string[], stable: boolean): RosterSlot[] {
  const addable = TEAM.filter((id) => !visible.includes(id));
  return orderRoster({ canonical: CANONICAL, visible: ['ferni', ...visible], addable, stable });
}

describe('orderRoster', () => {
  it('stable: adding a teammate changes only their state, never the order', () => {
    const before = bar(['jordan-taylor'], true);
    const after = bar(['jordan-taylor', 'peter-john'], true);

    expect(ids(before)).toEqual(CANONICAL);
    expect(ids(after)).toEqual(ids(before));
    const changed = after.filter((slot, i) => slot.state !== before[i]?.state).map((s) => s.id);
    expect(changed).toEqual(['peter-john']);
    expect(after.find((s) => s.id === 'peter-john')?.state).toBe('member');
  });

  it('stable: the order does not depend on the order members were added in', () => {
    const a = bar(['nayan-patel', 'maya-santos', 'jordan-taylor'], true);
    const b = bar(['jordan-taylor', 'nayan-patel', 'maya-santos'], true);
    expect(a).toEqual(b);
  });

  it('legacy: members first, then addable, both in the one canonical order', () => {
    const slots = bar(['jordan-taylor', 'peter-john'], false);
    expect(slots).toEqual([
      { id: 'ferni', state: 'member' },
      { id: 'peter-john', state: 'member' },
      { id: 'jordan-taylor', state: 'member' },
      { id: 'maya-santos', state: 'addable' },
      { id: 'alex-chen', state: 'addable' },
      { id: 'nayan-patel', state: 'addable' },
    ]);
  });

  it('a member listed as addable too is shown once, as a member', () => {
    const slots = orderRoster({
      canonical: CANONICAL,
      visible: ['ferni', 'maya-santos'],
      addable: ['maya-santos', 'alex-chen'],
      stable: true,
    });
    expect(slots).toEqual([
      { id: 'ferni', state: 'member' },
      { id: 'maya-santos', state: 'member' },
      { id: 'alex-chen', state: 'addable' },
    ]);
  });

  it('ids outside the canonical list go last, in their input order', () => {
    const slots = orderRoster({
      canonical: CANONICAL,
      visible: ['custom-b', 'ferni', 'custom-a', 'alex-chen'],
      addable: [],
      stable: true,
    });
    expect(ids(slots)).toEqual(['ferni', 'alex-chen', 'custom-b', 'custom-a']);
  });
});

describe('isRosterStable', () => {
  afterEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
    vi.unstubAllEnvs();
  });

  it('is off by default', () => {
    expect(isRosterStable()).toBe(false);
  });

  it('turns on with VITE_ROSTER_STABLE=true', () => {
    vi.stubEnv('VITE_ROSTER_STABLE', 'true');
    expect(isRosterStable()).toBe(true);
  });

  it('?roster_stable=1 turns it on and is remembered; ?roster_stable=0 clears it', () => {
    window.history.replaceState(null, '', '/?roster_stable=1');
    expect(isRosterStable()).toBe(true);
    window.history.replaceState(null, '', '/');
    expect(isRosterStable()).toBe(true);
    window.history.replaceState(null, '', '/?roster_stable=0');
    expect(isRosterStable()).toBe(false);
    window.history.replaceState(null, '', '/');
    expect(isRosterStable()).toBe(false);
  });
});
