/**
 * A teammate the server hasn't unlocked shows as locked, with the server's reason as its
 * tooltip and accessible description; one it has unlocked shows as in the team. Dev
 * 2026-10-11: the team bar offered Nayan and Jordan as if open, and taps did nothing visible.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
global.fetch = fetchMock;

import {
  _resetForTesting,
  resyncWithBackend,
  TEAM_MEMBERS,
} from '../../src/services/team-unlock.service.js';
import { applyLockState } from '../../src/ui/team-lock-state.js';

const REASON = 'There is someone I deeply respect... a sage.';

beforeEach(async () => {
  _resetForTesting();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        tier: 'free',
        unlockedMembers: ['ferni', 'maya-santos'],
        bypassMode: null,
        members: TEAM_MEMBERS.map((m) => ({
          id: m.id,
          unlocked: ['ferni', 'maya-santos'].includes(m.id),
          teaserMessage: m.id === 'nayan-patel' ? REASON : null,
        })),
      }),
  });
  await resyncWithBackend('test-user');
});

describe('applyLockState', () => {
  it('a locked teammate carries the server reason as tooltip and description', () => {
    const el = document.createElement('div');
    applyLockState(el, 'nayan-patel', true);
    expect(el.classList.contains('team-member--locked')).toBe(true);
    expect(el.classList.contains('team-member--in-team')).toBe(false);
    expect(el.getAttribute('title')).toBe(REASON);
    const describedBy = el.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(el.querySelector(`#${describedBy}`)?.textContent).toBe(REASON);
  });

  it('unlocking clears the reason and marks it in the team', () => {
    const el = document.createElement('div');
    applyLockState(el, 'nayan-patel', true);
    applyLockState(el, 'nayan-patel', false);
    expect(el.classList.contains('team-member--in-team')).toBe(true);
    expect(el.classList.contains('team-member--locked')).toBe(false);
    expect(el.hasAttribute('title')).toBe(false);
    expect(el.hasAttribute('aria-describedby')).toBe(false);
    expect(el.querySelector('.sr-only')).toBeNull();
  });
});
