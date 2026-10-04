/**
 * Your People must render the nudges the server actually returns:
 * GET /api/contacts/nudges answers { nudges: [{ contactName, reason, ... }], summary, ... }.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const apiFetch = vi.hoisted(() => vi.fn());

vi.mock('../../src/utils/api-helpers.js', () => ({ apiFetch }));
vi.mock('../../src/utils/environment.js', () => ({ shouldUseDemoData: () => false }));
vi.mock('../../src/i18n/index.js', () => ({ t: (_k: string, fallback?: string) => fallback ?? _k }));

import { openYourPeople, closeYourPeople } from '../../src/ui/your-people.ui.js';

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe('Your People nudges', () => {
  beforeEach(() => {
    closeYourPeople();
    document.body.innerHTML = '';
    apiFetch.mockImplementation(async (url: string) => {
      if (url === '/api/contacts') return json({ contacts: [] });
      if (url === '/api/contacts/nudges') {
        return json({
          nudges: [
            {
              id: 'n1',
              type: 'needs_attention',
              priority: 'high',
              contactId: 'c1',
              contactName: 'Marcus',
              relationship: 'friend',
              reason: "You haven't connected with Marcus in 45 days",
            },
          ],
          summary: '1 nudge',
          upcomingDates: [],
          upcomingHolidays: [],
        });
      }
      return json({});
    });
  });

  it('shows the server nudge and its reason', async () => {
    await openYourPeople();
    await vi.waitFor(() => expect(document.querySelector('.yp-nudge')).not.toBeNull());

    expect(document.querySelector('.yp-nudge-name')?.textContent).toBe('Marcus');
    expect(document.querySelector('.yp-nudge-reason')?.textContent).toBe(
      "You haven't connected with Marcus in 45 days"
    );
  });
});
