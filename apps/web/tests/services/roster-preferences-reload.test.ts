/**
 * A reload must bring back the teammates the user added.
 *
 * Each test imports a fresh copy of the service, which is what a page reload
 * does: module state is gone and only localStorage remains.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'ferni_roster_prefs';

async function freshService(): Promise<
  typeof import('../../src/services/roster-preferences.service.js')
> {
  vi.resetModules();
  return import('../../src/services/roster-preferences.service.js');
}

function saved(): string[] {
  return (
    (JSON.parse(localStorage.getItem(KEY) ?? '{}') as { addedMembers?: string[] }).addedMembers ??
    []
  );
}

describe('roster preferences across a reload', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      KEY,
      JSON.stringify({ addedMembers: ['nayan-patel', 'maya-santos'], isFirstVisit: false })
    );
  });
  afterEach(() => localStorage.clear());

  it('initRosterPreferences restores the saved members in their saved order', async () => {
    const svc = await freshService();
    svc.initRosterPreferences();
    expect(svc.getVisibleMembers()).toEqual(['ferni', 'nayan-patel', 'maya-santos']);
    expect(svc.isFirstVisit()).toBe(false);
  });

  it('reads the saved roster even when a caller runs before init', async () => {
    const svc = await freshService();
    expect(svc.getVisibleMembers()).toEqual(['ferni', 'nayan-patel', 'maya-santos']);
    expect(svc.isMemberVisible('maya-santos')).toBe(true);
  });

  it('adding a teammate after a reload keeps the ones saved before it', async () => {
    const svc = await freshService();
    svc.addMemberToRoster('jordan-taylor');
    expect(saved()).toEqual(['nayan-patel', 'maya-santos', 'jordan-taylor']);

    const reloaded = await freshService();
    reloaded.initRosterPreferences();
    expect(reloaded.getVisibleMembers()).toEqual([
      'ferni',
      'nayan-patel',
      'maya-santos',
      'jordan-taylor',
    ]);
  });

  it('a damaged saved value starts from Ferni only instead of breaking the bar', async () => {
    localStorage.setItem(KEY, JSON.stringify({ addedMembers: 'maya-santos', isFirstVisit: false }));
    const svc = await freshService();
    expect(svc.getVisibleMembers()).toEqual(['ferni']);
  });
});
