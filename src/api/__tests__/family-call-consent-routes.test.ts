/**
 * The sponsor's "they're happy to hear from Ferni" switch: only the identity's
 * own sponsor can read or change it, a confirm counts as consent, and a
 * withdraw ends it. The store is an in-memory fake of the FamilyConsentStore port.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';
import type {
  FamilyCallConsent,
  FamilyConsentStore,
} from '../../services/family/family-call-consent.js';

const getSponsoredIdentity = vi.fn();
vi.mock('../../services/identity/sponsored-identity.js', () => ({ getSponsoredIdentity }));
vi.mock('../../services/stores/family-call-consent-store.js', () => ({
  createFamilyConsentStore: vi.fn(),
}));

const { handleCallConsentRoute } = await import('../family-call-consent-routes.js');

function fakeStore(): FamilyConsentStore {
  const docs = new Map<string, FamilyCallConsent>();
  return {
    get: async (id) => docs.get(id) ?? null,
    record: async (id, source, now) => {
      docs.set(id, { sponsoredIdentityId: id, consentedAt: now.toISOString(), source });
      return true;
    },
    withdraw: async (id, now) => {
      const d = docs.get(id);
      if (d) docs.set(id, { ...d, withdrawnAt: now.toISOString() });
      return true;
    },
  };
}

const req = (method: string) => ({ method }) as IncomingMessage;
const res = {} as ServerResponse;

async function call(method: string, userId: string, store: FamilyConsentStore) {
  const send = vi.fn();
  const handled = await handleCallConsentRoute(
    req(method),
    res,
    '/mom-id/call-consent',
    userId,
    send,
    store
  );
  const [, status, body] = send.mock.calls[0] ?? [];
  return { handled, status, body };
}

beforeEach(() => {
  getSponsoredIdentity.mockReset();
  getSponsoredIdentity.mockResolvedValue({ id: 'mom-id', sponsorUserId: 'seth' });
});

describe('the call-consent switch', () => {
  it('starts off', async () => {
    const r = await call('GET', 'seth', fakeStore());
    expect(r).toMatchObject({ handled: true, status: 200, body: { agreed: false } });
  });

  it('turns on when the sponsor confirms, and off when withdrawn', async () => {
    const store = fakeStore();
    expect((await call('POST', 'seth', store)).body).toMatchObject({
      agreed: true,
      source: 'sponsor_confirmed',
    });
    expect((await call('GET', 'seth', store)).body).toMatchObject({ agreed: true });
    expect((await call('DELETE', 'seth', store)).body).toMatchObject({ agreed: false });
  });

  it('refuses someone who is not the sponsor, and changes nothing', async () => {
    const store = fakeStore();
    expect((await call('POST', 'stranger', store)).status).toBe(404);
    expect((await call('GET', 'seth', store)).body).toMatchObject({ agreed: false });
  });

  it('says so when the save fails', async () => {
    const store = { ...fakeStore(), record: async () => false };
    expect((await call('POST', 'seth', store)).status).toBe(503);
  });

  it('leaves other routes alone', async () => {
    const send = vi.fn();
    const handled = await handleCallConsentRoute(req('GET'), res, '/mom-id', 'seth', send);
    expect(handled).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});
