/**
 * reachOut's conversation call runs its checks as the owner, not as the contact.
 *
 * Before: the call context named only `user: { id: contact.id }`, so
 * makeConversationalCall fell back to the contact's id. The held-sender check, the
 * owner's own call refusals and the calling-hours hold all ran against the
 * contact's record. A hold or pause the owner set would not have applied.
 *
 * Through the raw reachOut tool (the confirm, which turns live calls away today,
 * is not under test) and the real makeConversationalCall and scheduleProactiveCall.
 * Mocked: contacts, message crafting, the consent check (not under test), Firestore,
 * the Twilio REST call and the three checks, as spies that record whose id they get.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeConsentDb } from '../../../../../services/messaging/__tests__/memory-consent.js';

vi.hoisted(() => {
  Object.assign(process.env, {
    TWILIO_ACCOUNT_SID: 'AC_test',
    TWILIO_AUTH_TOKEN: 'token',
    TWILIO_PHONE_NUMBER: '+12025550100',
    TWILIO_STREAM_WEBHOOK_URL: 'wss://stream.example.test',
  });
});
const fake = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof fakeConsentDb> }));
vi.mock('../../../../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<typeof import('../../../../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => fake.db.db,
}));
vi.mock('../../../../../utils/consent-port.js', async (orig) => ({
  ...(await orig<typeof import('../../../../../utils/consent-port.js')>()),
  thirdPartyRefusal: async () => null,
}));
const checks = vi.hoisted(() => ({
  held: vi.fn(async (_userId: string, _phone: string) => false),
  refusal: vi.fn(async (_userId: string, _phone: string, _channel: string) => null),
  hours: vi.fn(async (_userId: string, ..._rest: unknown[]) => ({ id: 'held' })),
}));
vi.mock('../../../../../services/outreach/checkin-replies.js', async (orig) => ({
  ...(await orig<typeof import('../../../../../services/outreach/checkin-replies.js')>()),
  heldSender: checks.held,
}));
vi.mock('../../../../../services/messaging/consent-reach.js', async (orig) => ({
  ...(await orig<typeof import('../../../../../services/messaging/consent-reach.js')>()),
  ownerRefusal: checks.refusal,
}));
vi.mock('../../../../../services/outreach/deferred-calls.js', () => ({
  holdForCallHours: checks.hours,
}));
vi.mock('../../../../../services/contacts/contact-relationship-service.js', () => ({
  searchContacts: vi.fn(async () => [{ id: 'c-pat', name: 'Pat', phone: '+12025550177' }]),
  recordInteraction: vi.fn(async () => undefined),
}));
vi.mock('../../../../../services/contacts/contact-groups.js', () => ({ getGroups: vi.fn() }));
vi.mock('../message-crafting.js', () => ({
  craftPersonalizedMessage: vi.fn(async () => 'Thinking of you'),
}));
const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ sid: 'CA1' }), { status: 201 }));
vi.stubGlobal('fetch', fetchSpy);

import { createUnifiedOutreachTool } from '../unified-outreach.js';
import { registerMessagingConsent } from '../../../../../services/messaging/consent.js';

registerMessagingConsent(); // as each process entry does (utils/consent-port.ts)

beforeEach(() => {
  fake.db = fakeConsentDb();
  vi.stubEnv('LOG_HASH_SECRET', 'test-secret');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('reachOut conversation call: whose checks run', () => {
  it('the held, refusal and calling-hours checks get the owner id, never the contact id', async () => {
    const tool = createUnifiedOutreachTool({
      userId: 'owner-1',
      agentId: 'ferni',
      agentDisplayName: 'Ferni',
    });
    await tool.execute(
      { contact: 'Pat', purpose: 'hi', preferredChannel: 'conversation' },
      { toolCallId: 'r1' }
    );
    // Each check ran, and every run was as the owner, on the number being called.
    const runs = (spy: { mock: { calls: unknown[][] } }) =>
      new Set(spy.mock.calls.map((c) => c.slice(0, 2).join(' ')));
    expect(runs(checks.held)).toEqual(new Set(['owner-1 +12025550177']));
    expect(runs(checks.refusal)).toEqual(new Set(['owner-1 +12025550177']));
    expect(checks.hours).toHaveBeenCalledOnce();
    expect(checks.hours.mock.calls[0]?.[0]).toBe('owner-1');
    // ...but the hours are Pat's: by Pat's number, the owner only as the fallback zone.
    expect(checks.hours.mock.calls[0]?.[2]).toEqual({
      recipientPhone: '+12025550177',
      sponsorUserId: 'owner-1',
    });
    const ids = [checks.held, checks.refusal, checks.hours].flatMap((s) => s.mock.calls.flat());
    expect(ids).not.toContain('c-pat');
  });
});
