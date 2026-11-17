/**
 * The admin portal opens the section ?section= names on load: the Dev Panel's
 * "Agent flags (dev)" link (/admin?section=agent-flags) relies on it. No request leaves the
 * test: the agent flags routes answer 404, as they do off the dev server.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/admin/admin-fetch.js', () => ({
  adminFetch: async () => new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }),
}));

const PORTAL_URL = '/admin?section=agent-flags';

describe('admin portal ?section=', () => {
  it('opens the agent flags section from /admin?section=agent-flags', async () => {
    window.history.replaceState({}, '', PORTAL_URL);
    document.body.innerHTML = '<div id="app"></div>';
    const { initAdminPortal } = await import('../../src/admin/index.js');
    await initAdminPortal();

    expect(document.getElementById('adminSectionTitle')?.textContent).toBe('Agent flags (dev)');
    await vi.waitFor(() =>
      expect(document.getElementById('adminContent')?.textContent).toContain(
        'Agent flags can only be changed on the dev admin server.'
      )
    );
  });
});
