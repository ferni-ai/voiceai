/**
 * Nothing assigns window.appState, so code that read it always saw undefined.
 * These reads now go to the real sources.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/utils/api-helpers.js', () => ({
  getApiHeadersAsync: vi.fn(async () => ({})),
  getUserId: vi.fn(() => 'firebase-uid-7'),
}));

const { getUserIdFromPage } = await import('../../../src/ui/team-insights.ui.js');

describe('team insights user id', () => {
  it('uses the signed-in user, not the never-assigned window.appState', () => {
    expect((window as unknown as { appState?: unknown }).appState).toBeUndefined();
    expect(getUserIdFromPage()).toBe('firebase-uid-7');
  });
});
