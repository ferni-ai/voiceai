/**
 * Prod 2026-10-24 (phone-calls audit, row 12): callOnBehalf was built by the
 * tool orchestrator with no sessionId, so the request stored
 * originalSessionId = ctx.agentId ("ferni") and the result never found the
 * owner's call. These run the registered telephony definition (the one every
 * tool path builds from) and capture the request it places: it carries the
 * real id of the call the tool ran in, read from LiveKit's run context, and
 * never an agent id.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OnBehalfCallRequest } from '../types.js';

const placed: OnBehalfCallRequest[] = [];
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
vi.mock('../../../../services/global-services.js', () => ({ getGlobalServicesSync: () => null }));

const { getTelephonyToolDefinitions } = await import('../index.js');
const { noteLiveSession } = await import('../../../registry/live-session.js');

/** The ctx the orchestrator builds in prod: an agent id, no session id. */
const ORCHESTRATOR_CTX = {
  userId: 'uid-owner',
  agentId: 'ferni',
  agentDisplayName: 'Ferni',
  services: { has: () => false, get: () => undefined, getOptional: () => undefined },
};

function callOnBehalf() {
  const def = getTelephonyToolDefinitions().find((d) => d.id === 'callOnBehalf');
  if (!def) throw new Error('callOnBehalf is not registered');
  return def.create(ORCHESTRATOR_CTX as never);
}

const ARGS = { contactQuery: 'Mom', purpose: 'check in', recordingConsent: true };

beforeEach(() => {
  placed.length = 0;
});

describe('the on-behalf request names the call that asked for it', () => {
  it('carries the live call session id, not the agent id', async () => {
    const session = {};
    const release = noteLiveSession(session, 'session-AJ_test-1');
    expect(ORCHESTRATOR_CTX).not.toHaveProperty('sessionId'); // pre: the prod build had none

    await callOnBehalf().execute(ARGS, { ctx: { session }, toolCallId: 't1' });
    release();

    expect(placed).toHaveLength(1);
    expect(placed[0].originalSessionId).toBe('session-AJ_test-1');
  });

  it('with no live call known, it carries no id rather than "ferni"', async () => {
    await callOnBehalf().execute(ARGS, { ctx: { session: {} }, toolCallId: 't2' });

    expect(placed).toHaveLength(1);
    expect(placed[0].originalSessionId).toBe('');
  });
});
