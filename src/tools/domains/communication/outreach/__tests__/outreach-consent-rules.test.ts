/**
 * MESSAGING_PIPELINE on, through the real reachOut tool and its ActionGate
 * confirm: a third party with unknown consent is held (calls and texts); a
 * friends-and-family owner's yes is their attestation, which lets it go, and
 * the first text then says who is writing; anyone else's yes is not enough.
 *
 * Mocked: contacts and the SMS/call transports (external I/O), cohort
 * membership, and Firestore (an in-memory one, so the real consent code runs).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMemoryTexts } from '../../../../../services/outreach/__tests__/memory-text-store.js';
import { fakeConsentDb } from '../../../../../services/messaging/__tests__/memory-consent.js';

const fake = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof fakeConsentDb> }));
vi.mock('../../../../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<typeof import('../../../../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => fake.db.db,
}));
const member = vi.hoisted(() => ({ value: false }));
vi.mock('../../../../../services/platform/cohort-membership.js', () => ({
  isCohortMember: async (cohort: string, _uid: string) =>
    cohort === 'friends-and-family' && member.value,
}));
vi.mock('../../../../../services/outreach/guarded-text.js', async (orig) => {
  const real = await orig<typeof import('../../../../../services/outreach/guarded-text.js')>();
  const mem = await import('../../../../../services/outreach/__tests__/memory-text-store.js');
  return { ...mem.withMemoryTextStore(real), isOwnVerifiedPhone: async () => false };
});
vi.mock('../../../../../services/contacts/contact-relationship-service.js', () => ({
  searchContacts: vi.fn(async () => [{ id: 'c-pat', name: 'Pat', phone: '+12025550177' }]),
  recordInteraction: vi.fn(async () => undefined),
}));
vi.mock('../../../../../services/contacts/contact-groups.js', () => ({ getGroups: vi.fn() }));
vi.mock('../../../../../services/outreach/delivery/sms-delivery.js', () => ({
  sendSMS: vi.fn(async () => ({ success: true })),
}));
vi.mock('../../../../../services/outreach/delivery/email-delivery.js', () => ({
  sendEmail: vi.fn(),
}));
vi.mock('../../../../../services/voice/voice-call.js', () => ({
  callWithPersonaVoice: vi.fn(async () => ({ success: true, message: 'ok' })),
}));
vi.mock('../../../../../services/outreach/conversational-calls.js', () => ({
  makeConversationalCall: vi.fn(),
}));
vi.mock('../message-crafting.js', () => ({
  craftPersonalizedMessage: vi.fn(async () => 'Thinking of you'),
}));

import { sendSMS } from '../../../../../services/outreach/delivery/sms-delivery.js';
import { callWithPersonaVoice } from '../../../../../services/voice/voice-call.js';
import { phoneHash } from '../../../../../services/outreach/checkin-replies.js';
import type { ToolContext } from '../../../../registry/types.js';
import { getOutreachToolDefinitions } from '../index.js';
import { outreachConfirmListeners } from '../outreach-confirm.js';
import { registerMessagingConsent } from '../../../../../services/messaging/consent.js';

const PAT = '+12025550177';
const ctx: ToolContext = { userId: 'owner-1', agentId: 'ferni', agentDisplayName: 'Ferni' };
const consentDoc = () =>
  fake.db.docs.get(`consent/${phoneHash(PAT, { LOG_HASH_SECRET: 'test-secret' })}`);

/** The model asks, the owner says yes, the model asks again: the confirmed send. */
async function confirmedReachOut(args: Record<string, unknown>): Promise<string> {
  const session = { agentState: 'listening' };
  const listeners = outreachConfirmListeners(session);
  const def = getOutreachToolDefinitions().find((d) => d.id === 'reachOut');
  const run = async (callId: string) => {
    const out = await def!.create(ctx).execute(args, { ctx: { session }, toolCallId: callId });
    listeners.onToolsExecuted({ functionCalls: [{ callId }], functionCallOutputs: [] });
    return String(out);
  };
  await run('r1');
  listeners.onTranscript({ transcript: 'yes', isFinal: true });
  return run('r2');
}

beforeEach(() => {
  fake.db = fakeConsentDb();
  member.value = false;
  registerMessagingConsent(); // as each process entry does (utils/consent-port.ts)
  resetMemoryTexts();
  vi.stubEnv('MESSAGING_PIPELINE', 'on');
  vi.stubEnv('LOG_HASH_SECRET', 'test-secret');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('third-party calls', () => {
  it('unknown consent, owner not in friends-and-family: the call is held', async () => {
    const reply = await confirmedReachOut({
      contact: 'Pat',
      purpose: 'hi',
      preferredChannel: 'call',
    });
    expect(callWithPersonaVoice).not.toHaveBeenCalled();
    expect(reply).toContain("haven't said yes to my calls");
    expect(consentDoc()).toBeUndefined();
  });

  it("a friends-and-family owner's yes attests consent, so the call goes", async () => {
    member.value = true;
    await confirmedReachOut({ contact: 'Pat', purpose: 'hi', preferredChannel: 'call' });
    expect((consentDoc()?.grants as Record<string, unknown>)['owner-1']).toMatchObject({
      call: { source: 'owner-attested' },
    });
    expect(callWithPersonaVoice).toHaveBeenCalledOnce();
  });
});

describe('third-party texts', () => {
  it('unknown consent, owner not in friends-and-family: nothing is sent', async () => {
    await confirmedReachOut({ contact: 'Pat', purpose: 'hi', preferredChannel: 'text' });
    expect(sendSMS).not.toHaveBeenCalled();
  });

  it('attested by a friends-and-family owner: the first text says who is writing and for whom', async () => {
    member.value = true;
    await confirmedReachOut({ contact: 'Pat', purpose: 'hi', preferredChannel: 'text' });
    expect(vi.mocked(sendSMS).mock.calls[0]?.[0]).toMatchObject({
      to: PAT,
      body: "Ferni here, your friend's AI friend. Your friend asked me to send this: Thinking of you",
    });
  });
});
