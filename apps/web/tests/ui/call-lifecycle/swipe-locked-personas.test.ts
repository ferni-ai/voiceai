/**
 * Swiping between personas must use the same unlock check as the team picker
 * (isTeamMemberUnlocked) and never land on a locked persona.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const unlocked = new Set<string>(['ferni']);
vi.mock('../../../src/services/team-unlock.service.js', () => ({
  isTeamMemberUnlocked: (id: string) => unlocked.has(id),
}));

const { gesturesUI } = await import('../../../src/ui/gestures.ui.js');

beforeEach(() => {
  unlocked.clear();
  unlocked.add('ferni');
  gesturesUI.setCurrentPersona('ferni');
});

describe('persona swipe', () => {
  it('goes nowhere when every other persona is locked', () => {
    expect(gesturesUI.getNextPersona()).toBeNull();
    expect(gesturesUI.getPreviousPersona()).toBeNull();
  });

  it('skips locked personas in both directions', () => {
    // Order: ferni, nayan-patel, peter-john, alex-chen, maya-santos, jordan-taylor
    unlocked.add('alex-chen');

    expect(gesturesUI.getNextPersona()).toBe('alex-chen');
    expect(gesturesUI.getPreviousPersona()).toBe('alex-chen');
  });

  it('picks the nearest unlocked persona each way', () => {
    unlocked.add('peter-john');
    unlocked.add('maya-santos');
    gesturesUI.setCurrentPersona('peter-john');

    expect(gesturesUI.getNextPersona()).toBe('maya-santos');
    expect(gesturesUI.getPreviousPersona()).toBe('ferni');
  });
});
