/**
 * The name callOnBehalf dispatches for the opener: the preferred name when one
 * is set, else the profile name. With OPENER_FIRST_NAME_PERSONAL on (the
 * default) a personal call to someone saved by name takes a blank preferred
 * name as unset, so the callee hears "Sam's AI friend", never an empty name. A
 * call to Mom, a business and the flag off dispatch main's pick.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OnBehalfCallRequest } from '../types.js';

const placed: OnBehalfCallRequest[] = [];
const profile = vi.hoisted(() => {
  const value: Record<string, unknown> = {};
  return { value };
});
const CONTACTS = vi.hoisted(() => ({
  Mom: { id: 'c-mom', name: 'Mom', phone: '(303) 555-0100', relationship: 'mother' },
  Alex: { id: 'c-alex', name: 'Alex', phone: '(303) 555-0101', relationship: 'friend' },
  'Rosa Cafe': {
    id: 'c-cafe',
    name: 'Rosa Cafe',
    phone: '(303) 555-0102',
    relationship: 'restaurant',
  },
}));
vi.mock('../../../../services/outreach/deferred-calls.js', () => ({
  placeOrHold: vi.fn(async (request: OnBehalfCallRequest) => {
    placed.push(request);
    return { callId: 'call-1' };
  }),
  alreadySetReply: vi.fn(),
  pendingCallTo: vi.fn(async () => null),
}));
vi.mock('../../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => null,
}));
vi.mock('../../../../memory/entity-store/integration.js', () => ({
  isEntityStoreReady: () => false,
  findContactForTelephony: vi.fn(),
}));
vi.mock('../../../../services/contacts/contact-relationship-service.js', () => ({
  searchContacts: vi.fn(async (_userId: string, query: keyof typeof CONTACTS) => [CONTACTS[query]]),
  upsertContact: vi.fn(async () => undefined),
}));
vi.mock('../../../../services/global-services.js', () => ({
  getGlobalServicesSync: () => ({ store: { getProfile: async () => profile.value } }),
}));

const { getTelephonyToolDefinitions } = await import('../index.js');
const { outboundOpener, partiesOf } = await import('../../../../services/outreach/opening-line.js');

const CTX = {
  userId: 'uid-owner',
  agentId: 'ferni',
  agentDisplayName: 'Ferni',
  services: { has: () => false, get: () => undefined, getOptional: () => undefined },
};

async function dispatched(
  p: Record<string, unknown>,
  contactQuery: keyof typeof CONTACTS = 'Mom'
): Promise<OnBehalfCallRequest> {
  profile.value = p;
  placed.length = 0;
  const def = getTelephonyToolDefinitions().find((d) => d.id === 'callOnBehalf');
  if (!def) throw new Error('callOnBehalf is not registered');
  await def
    .create(CTX as never)
    .execute(
      { contactQuery, purpose: 'check in', recordingConsent: true },
      { ctx: { session: {} }, toolCallId: 't1' }
    );
  const [request] = placed;
  if (!request || placed.length !== 1) throw new Error(`expected one call, got ${placed.length}`);
  return request;
}

beforeEach(() => {
  placed.length = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const opener = (request: OnBehalfCallRequest) =>
  outboundOpener(partiesOf({ ...request, recipientName: request.resolvedContact?.name }));

describe('callOnBehalf dispatches the name the opener says', () => {
  it('Mom and Alex are dispatched as personal, the cafe as business', async () => {
    expect((await dispatched({ name: 'Sam Rivera' })).callType).toBe('personal');
    expect((await dispatched({ name: 'Sam Rivera' }, 'Alex')).callType).toBe('personal');
    expect((await dispatched({ name: 'Sam Rivera' }, 'Rosa Cafe')).callType).toBe('business');
  });

  it.each(['   ', ''])(
    'flag on: a personal call to Alex takes a blank preferred name %j as unset',
    async (preferredName) => {
      const request = await dispatched({ preferredName, name: 'Sam Rivera' }, 'Alex');

      expect(request.userName).toBe('Sam Rivera');
      expect(opener(request)).toBe(
        "Hi Alex, it's Ferni, Sam's AI friend. Sam asked me to check in on you. Is now an okay time?"
      );
    }
  );

  it.each([
    ['Mom', '   ', '   '],
    ['Mom', '', 'Sam Rivera'],
    ['Rosa Cafe', '   ', '   '],
    ['Rosa Cafe', '', 'Sam Rivera'],
  ] as const)(
    "flag on: a call to %s dispatches main's pick for preferred name %j",
    async (contact, preferredName, userName) => {
      const on = await dispatched({ preferredName, name: 'Sam Rivera' }, contact);
      vi.stubEnv('OPENER_FIRST_NAME_PERSONAL', 'off');
      const off = await dispatched({ preferredName, name: 'Sam Rivera' }, contact);

      expect(on.userName).toBe(userName);
      expect(opener(on)).toBe(opener(off));
    }
  );

  it("a blank preferred name to Mom: main's opener, no name", async () => {
    expect(opener(await dispatched({ preferredName: '   ', name: 'Sam Rivera' }))).toBe(
      "Hi, it's Ferni, an AI friend, calling to check in on you. Is now an okay time?"
    );
  });

  it('flag on: a set preferred name is the one dispatched, trimmed only to Alex', async () => {
    const pick = async (contact: keyof typeof CONTACTS) =>
      (await dispatched({ preferredName: ' Sammy ', name: 'Sam Rivera' }, contact)).userName;

    expect(await pick('Alex')).toBe('Sammy');
    expect(await pick('Mom')).toBe(' Sammy ');
  });

  it("flag off: main's pick, byte for byte", async () => {
    vi.stubEnv('OPENER_FIRST_NAME_PERSONAL', 'off');

    expect((await dispatched({ preferredName: '   ', name: 'Sam Rivera' }, 'Alex')).userName).toBe(
      '   '
    );
    expect((await dispatched({ preferredName: ' Sammy ', name: 'Sam Rivera' })).userName).toBe(
      ' Sammy '
    );
  });
});
