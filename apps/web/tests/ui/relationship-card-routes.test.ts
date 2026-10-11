/**
 * Relationship-card actions call routes the server actually has.
 *
 * Gift ideas and conversation starters POSTed to /api/contacts/:id/... routes
 * that don't exist, so both ended in an error (or in mock data in dev). Google
 * import POSTed to a route with no handler. Voice packs were sold for seeds but
 * nothing applied them. The twin profile section update POSTed to a PATCH-only
 * route.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetch = vi.fn();
vi.mock('../../src/utils/api-helpers.js', () => ({ apiFetch }));
vi.mock('../../src/ui/whisper.ui.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
const apiPatch = vi.fn();
const apiPost = vi.fn();
vi.mock('../../src/utils/api.js', () => ({
  apiGet: vi.fn(),
  apiPost,
  apiPatch,
  apiDelete: vi.fn(),
}));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  // Real data only: a failed request must not be papered over with mock data.
  localStorage.setItem('ferni:use-demo-data', 'false');
  apiFetch.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/gifts/c-1/suggestions')) {
      return json({
        suggestions: [
          {
            idea: 'Pottery class for two',
            description: 'An evening at the studio.',
            priceRange: '$60-$90',
            confidence: 'high',
            reasoning: 'She keeps talking about ceramics.',
            tags: ['experience'],
          },
        ],
      });
    }
    if (url === '/api/contacts/c-1/topics') {
      return json({
        topics: [
          {
            topic: 'the new job',
            lastDiscussed: '2026-09-01T00:00:00.000Z',
            sentiment: 'negative',
            suggestion: 'Check in on the new job - they seemed stressed about it.',
          },
        ],
        contactId: 'c-1',
      });
    }
    return json({ error: 'Not found' }, 404);
  });
});

afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('gift ideas', () => {
  it('asks GET /api/gifts/:contactId/suggestions with the budget as min/max and shows the ideas', async () => {
    const { openGiftSuggestions } = await import('../../src/ui/gift-suggestions.ui.js');
    openGiftSuggestions({ contactId: 'c-1', contactName: 'Ana', budget: '50_100' });
    document.querySelector<HTMLButtonElement>('#gs-generate')?.click();
    await flush();
    await flush();

    const [url, init] = apiFetch.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/gifts/c-1/suggestions?occasion=any&minBudget=50&maxBudget=100');
    expect(init?.method ?? 'GET').toBe('GET');
    expect(document.querySelector('.gs-suggestion-name')?.textContent).toBe(
      'Pottery class for two'
    );
  });
});

describe('conversation starters', () => {
  it('builds starters from GET /api/contacts/:id/topics, with an opener addressed to the contact', async () => {
    const { openConversationStarters } = await import('../../src/ui/conversation-starters.ui.js');
    openConversationStarters({ contactId: 'c-1', contactName: 'Ana' });
    document.querySelector<HTMLButtonElement>('#cs-generate')?.click();
    await flush();
    await flush();

    expect(apiFetch).toHaveBeenCalledWith('/api/contacts/c-1/topics');
    const opener = document.querySelector('.cs-starter-opener')?.textContent ?? '';
    expect(opener).toContain('the new job');
    expect(opener).not.toContain('Check in on'); // the server's advice to the user is context, not the opener
    expect(document.querySelector('.cs-starter-context')?.textContent).toContain(
      'Check in on the new job'
    );
  });
});

describe('import contacts', () => {
  it('offers CSV and vCard but not Google, which has no server route', async () => {
    const { openImportContacts } = await import('../../src/ui/import-contacts.ui.js');
    openImportContacts();

    expect(document.querySelector('[data-source="csv"]')).not.toBeNull();
    expect(document.querySelector('[data-source="vcard"]')).not.toBeNull();
    expect(document.querySelector('[data-source="google"]')).toBeNull();
  });
});

describe('voice packs', () => {
  it('are not in the store and cannot be bought', async () => {
    const { COSMETICS_CATALOG, canPurchase, addSeeds } =
      await import('../../src/services/cosmetics.service.js');
    addSeeds(1000);

    expect(COSMETICS_CATALOG.filter((item) => item.type === 'voice-pack')).toEqual([]);
    expect(COSMETICS_CATALOG.some((item) => item.type === 'ui-theme')).toBe(true);
    expect(canPurchase('voice-warm').canBuy).toBe(false);
  });
});

describe('twin profile', () => {
  it('updates a section with PATCH, the only method the server routes', async () => {
    apiPatch.mockResolvedValue({ ok: true, status: 200, data: { success: true, profile: {} } });
    const { updateProfileSection } = await import('../../src/services/twin-profile.service.js');

    await updateProfileSection('values', {});

    expect(apiPatch).toHaveBeenCalledWith('/api/twin/profile/values', {});
    expect(apiPost).not.toHaveBeenCalled();
  });
});
