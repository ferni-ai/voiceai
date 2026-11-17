/**
 * The admin portal opens the section ?section= names on load: the Dev Panel's
 * "Agent flags (dev)" link (/admin?section=agent-flags) relies on it. Then the section's
 * controls must work inside the real portal, which inserts the section's HTML only after its
 * fade (later than the registry calls setupEvents). No request leaves the test.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
vi.mock('../../src/admin/admin-fetch.js', () => ({
  adminFetch: (url: string, init?: RequestInit) => fetchMock(url, init),
}));

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

const PORTAL_URL = '/admin?section=agent-flags';
const APPLY = '/api/v1/admin/agent-flags/apply';

const FLAGS_BODY = {
  flags: [
    {
      name: 'SOUND_CONDUCTOR',
      kind: 'experiment',
      owner: 'voice',
      default: 'off',
      switchable: true,
      modes: ['off', 'on'],
    },
  ],
  snapshot: {
    startedAt: '2026-11-17T09:00:00.000Z',
    buildSha: null,
    flags: { SOUND_CONDUCTOR: { raw: null, resolved: 'off' } },
  },
  stale: false,
  pendingRestart: [],
  changes: [],
};

async function openPortal(): Promise<void> {
  window.history.replaceState({}, '', PORTAL_URL);
  document.body.innerHTML = '<div id="app"></div>';
  const { initAdminPortal } = await import('../../src/admin/index.js');
  await initAdminPortal();
}

const content = (): string => document.getElementById('adminContent')?.textContent ?? '';

function choose(value: string): void {
  const select = document.querySelector<HTMLSelectElement>('select[data-flag="SOUND_CONDUCTOR"]');
  if (!select) throw new Error('no SOUND_CONDUCTOR control');
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

const click = (selector: string): void => {
  document
    .querySelector<HTMLElement>(selector)
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};

describe('admin portal ?section=', () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
  });

  it('opens the agent flags section from /admin?section=agent-flags', async () => {
    fetchMock.mockImplementation(async () => json({ error: 'Not found' }, 404));
    await openPortal();

    expect(document.getElementById('adminSectionTitle')?.textContent).toBe('Agent flags (dev)');
    await vi.waitFor(() =>
      expect(content()).toContain('Agent flags can only be changed on the dev admin server.')
    );
  });

  it('binds the section controls once it is in the page, once per render', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url === APPLY) return json({ appliedAt: '2026-11-17T10:00:00.000Z' });
      if (url.endsWith('/rooms')) return json({ rooms: [] });
      return json(FLAGS_BODY);
    });
    await openPortal();
    await vi.waitFor(() => expect(content()).toContain('0 changes staged'));

    choose('on');
    expect(content()).toContain('1 change staged');
    click('[data-af="discard"]');
    expect(content()).toContain('0 changes staged');

    // A second render (the header Refresh) must not leave the first render's listeners live.
    const first = document.getElementById('agentFlagsRoot');
    click('[data-action="refresh"]');
    await vi.waitFor(() => {
      const root = document.getElementById('agentFlagsRoot');
      expect(root).not.toBeNull();
      expect(root).not.toBe(first);
    });
    await new Promise((resolve) => setTimeout(resolve, 150)); // past the registry's bind delay
    // "Check again" is the one action that is not idempotent: doubled listeners fetch twice.
    const roomFetches = (): number =>
      fetchMock.mock.calls.filter(([url]) => url.endsWith('/rooms')).length;
    const before = roomFetches();
    click('[data-af="rooms"]');
    await vi.waitFor(() => expect(roomFetches()).toBeGreaterThan(before));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(roomFetches()).toBe(before + 1);
    choose('on');
    expect(content()).toContain('1 change staged');
    click('[data-af="apply"]');
    await vi.waitFor(() => expect(content()).toContain('Restarting dev agent…'));
    expect(fetchMock.mock.calls.filter(([url]) => url === APPLY)).toHaveLength(1);
  });
});
