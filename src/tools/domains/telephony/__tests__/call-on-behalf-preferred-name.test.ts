/**
 * The name callOnBehalf dispatches for the opener: the preferred name when one
 * is set, else the profile name. With OPENER_FIRST_NAME_PERSONAL on (the
 * default) a blank preferred name falls to the profile name, so the callee
 * hears "Sam's AI friend", never an empty name; off keeps main's pick.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OnBehalfCallRequest } from '../types.js';

const placed: OnBehalfCallRequest[] = [];
const profile = vi.hoisted(() => {
  const value: Record<string, unknown> = {};
  return { value };
});
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
  searchContacts: vi.fn(async () => [
    { id: 'c-mom', name: 'Mom', phone: '(303) 555-0100', relationship: 'mother' },
  ]),
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

async function dispatched(p: Record<string, unknown>): Promise<OnBehalfCallRequest> {
  profile.value = p;
  const def = getTelephonyToolDefinitions().find((d) => d.id === 'callOnBehalf');
  if (!def) throw new Error('callOnBehalf is not registered');
  await def
    .create(CTX as never)
    .execute(
      { contactQuery: 'Mom', purpose: 'check in', recordingConsent: true },
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

describe('callOnBehalf dispatches the name the opener says', () => {
  it('a call to Mom is dispatched as personal', async () => {
    expect((await dispatched({ name: 'Sam Rivera' })).callType).toBe('personal');
  });

  it.each(['   ', ''])(
    'flag on: a blank preferred name %j falls to the profile name, said by first name',
    async (preferredName) => {
      const request = await dispatched({ preferredName, name: 'Sam Rivera' });

      expect(request.userName).toBe('Sam Rivera');
      expect(outboundOpener(partiesOf({ ...request, recipientName: 'Mom' }))).toContain(
        "It's Ferni, Sam's AI friend."
      );
    }
  );

  it('flag on: a set preferred name is the one dispatched', async () => {
    expect((await dispatched({ preferredName: ' Sammy ', name: 'Sam Rivera' })).userName).toBe(
      'Sammy'
    );
  });

  it("flag off: main's pick, byte for byte", async () => {
    vi.stubEnv('OPENER_FIRST_NAME_PERSONAL', 'off');

    expect((await dispatched({ preferredName: '   ', name: 'Sam Rivera' })).userName).toBe('   ');
    placed.length = 0;
    expect((await dispatched({ preferredName: ' Sammy ', name: 'Sam Rivera' })).userName).toBe(
      ' Sammy '
    );
  });
});
