/**
 * MESSAGING_PIPELINE on: the executor-path raw senders refuse outright (not
 * only behind OUTBOUND_CONFIRM), and a sponsor-typed number isn't the
 * account's own until the holder verified it. Off: both as today.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  Object.assign(process.env, {
    TWILIO_ACCOUNT_SID: 'AC_test',
    TWILIO_AUTH_TOKEN: 'token',
    TWILIO_PHONE_NUMBER: '+12025550100',
  });
});
vi.mock('../../contacts/contact-relationship-service.js', () => ({
  searchContacts: vi.fn(async () => [{ id: 'c-mom', name: 'Mom', phone: '+12025550177' }]),
}));
const sponsoredDoc = { phoneNumber: '+12025550144' };
const fakeDb = vi.hoisted(() => ({
  collection: () => ({
    doc: () => ({
      get: async () => ({ exists: true, data: () => ({ phoneNumber: '+12025550144' }) }),
    }),
  }),
}));
vi.mock('../../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<typeof import('../../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => fakeDb,
}));
vi.mock('../../superhuman/firestore-utils.js', async (orig) => ({
  ...(await orig<typeof import('../../superhuman/firestore-utils.js')>()),
  getFirestoreDb: () => fakeDb,
}));
const fetchSpy = vi.fn(
  async (_u: string | URL, _i?: unknown) => new Response('{}', { status: 201 })
);
vi.stubGlobal('fetch', fetchSpy);
import { rawSendRetired } from '../consent-reach.js';
import { accountPhoneSources, sponsoredPhoneOf } from '../../outreach/user-reach.js';
import { firestoreTextStore } from '../../outreach/guarded-text-store.js';
import { communicationExecutor } from '../../../agents/shared/tool-executors/communication-executor.js';
import { executeLegacyFallback } from '../../../agents/shared/tool-executors/legacy-fallback-executor.js';

const twilio = () => fetchSpy.mock.calls.filter(([u]) => String(u).includes('twilio.com')).length;
const ctx = { userId: 'u1', personaId: 'ferni' } as never;

afterEach(() => vi.unstubAllEnvs());

describe('rawSendRetired (communication- and legacy-fallback-executor)', () => {
  it('refuses with the flag on, says nothing with it off', () => {
    expect(rawSendRetired({ MESSAGING_PIPELINE: 'on' })).toContain('Nothing was sent');
    expect(rawSendRetired({})).toBeNull();
  });
});

describe('the executor raw text paths', () => {
  it('flag on: communication-executor and legacy-fallback send nothing; off: as today', async () => {
    vi.stubEnv('MESSAGING_PIPELINE', 'on');
    const args = { contact: 'Mom', message: 'hi' };
    expect(String(await communicationExecutor.execute('sendText', args, ctx))).toContain(
      'Nothing was sent'
    );
    expect(String(await executeLegacyFallback('sendText', args, ctx))).toContain(
      'Nothing was sent'
    );
    expect(twilio()).toBe(0);
    vi.stubEnv('MESSAGING_PIPELINE', 'off');
    await communicationExecutor.execute('sendText', args, ctx);
    expect(twilio()).toBe(1);
  });
});

describe('sponsoredPhoneOf', () => {
  const typed = { phoneNumber: '+12025550144' };
  it("flag on: a sponsor-typed number isn't the account's until the holder verified it", () => {
    vi.stubEnv('MESSAGING_PIPELINE', 'on');
    expect(sponsoredPhoneOf(typed)).toBeUndefined();
    expect(sponsoredPhoneOf({ ...typed, phoneVerifiedAt: '2026-10-18T16:00:00Z' })).toBe(
      '+12025550144'
    );
  });
  it('flag off: as today', () => {
    vi.stubEnv('MESSAGING_PIPELINE', 'off');
    expect(sponsoredPhoneOf(typed)).toBe('+12025550144');
  });
});

describe('both sponsored-phone readers use the rule', () => {
  it('flag on: neither the text store nor user-reach hands out a sponsor-typed number', async () => {
    vi.stubEnv('MESSAGING_PIPELINE', 'on');
    expect(await firestoreTextStore.sponsoredPhone('sponsored_x')).toBeUndefined();
    expect(await accountPhoneSources.sponsoredPhone('sponsored_x')).toBeUndefined();
    vi.stubEnv('MESSAGING_PIPELINE', 'off');
    expect(await firestoreTextStore.sponsoredPhone('sponsored_x')).toBe(sponsoredDoc.phoneNumber);
    expect(await accountPhoneSources.sponsoredPhone('sponsored_x')).toBe(sponsoredDoc.phoneNumber);
  });
});
