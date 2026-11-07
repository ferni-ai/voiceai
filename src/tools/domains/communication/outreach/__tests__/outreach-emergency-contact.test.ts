/**
 * reachOut's confirm never offers to call an emergency or N11 number: a saved
 * contact whose number is "+1911" or "1-988" gets no read-back, so no yes can
 * ring it. The model is told plainly to have the caller dial it themselves; an
 * emergency number also keeps the safety kernel's in-danger words, a service number
 * (311, 711) gets none.
 * An ordinary contact is still read back and called (utils/dialable-number.ts).
 *
 * Through the real reachOut tool and its confirm. Mocked: contacts, the call
 * and SMS transports, cohort membership (a friends-and-family owner, whose yes
 * attests consent, so consent is not what stops the call) and Firestore.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMemoryTexts } from '../../../../../services/outreach/__tests__/memory-text-store.js';
import { fakeConsentDb } from '../../../../../services/messaging/__tests__/memory-consent.js';
import {
  LOOK_ALIKES,
  saysDialItYourself,
} from '../../../../../utils/__tests__/dial-refusal-words.js';

const fake = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof fakeConsentDb> }));
vi.mock('../../../../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<typeof import('../../../../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => fake.db.db,
}));
vi.mock('../../../../../services/platform/cohort-membership.js', () => ({
  isCohortMember: async (cohort: string) => cohort === 'friends-and-family',
}));
vi.mock('../../../../../services/outreach/guarded-text.js', async (orig) => {
  const real = await orig<typeof import('../../../../../services/outreach/guarded-text.js')>();
  const mem = await import('../../../../../services/outreach/__tests__/memory-text-store.js');
  return { ...mem.withMemoryTextStore(real), isOwnVerifiedPhone: async () => false };
});
const saved = vi.hoisted(() => ({ phone: '' }));
vi.mock('../../../../../services/contacts/contact-relationship-service.js', () => ({
  searchContacts: vi.fn(async () => [{ id: 'c-pat', name: 'Pat', phone: saved.phone }]),
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

import { callWithPersonaVoice } from '../../../../../services/voice/voice-call.js';
import type { ToolContext } from '../../../../registry/types.js';
import { getOutreachToolDefinitions } from '../index.js';
import { outreachConfirmListeners } from '../outreach-confirm.js';
import { registerMessagingConsent } from '../../../../../services/messaging/consent.js';

const ctx: ToolContext = { userId: 'owner-1', agentId: 'ferni', agentDisplayName: 'Ferni' };

/** The model asks, the owner says yes, the model asks again: what the first ask returned. */
async function askThenYes(args: Record<string, unknown>): Promise<string> {
  const session = { agentState: 'listening' };
  const listeners = outreachConfirmListeners(session);
  const def = getOutreachToolDefinitions().find((d) => d.id === 'reachOut');
  const run = async (callId: string) => {
    const out = await def!.create(ctx).execute(args, { ctx: { session }, toolCallId: callId });
    listeners.onToolsExecuted({ functionCalls: [{ callId }], functionCallOutputs: [] });
    return String(out);
  };
  const first = await run('r1');
  listeners.onTranscript({ transcript: 'yes', isFinal: true });
  await run('r2');
  return first;
}

beforeEach(() => {
  fake.db = fakeConsentDb();
  registerMessagingConsent(); // as each process entry does (utils/consent-port.ts)
  resetMemoryTexts();
  vi.stubEnv('MESSAGING_PIPELINE', 'on');
  vi.stubEnv('LOG_HASH_SECRET', 'test-secret');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('reachOut confirm: a contact saved with an emergency number', () => {
  it.each([
    ['+1911', '911'],
    ['9-1-1', '911'],
    ['1-988', '988'],
    ['+1 (988)', '988'],
    ['+44 999', '999'],
    ['411', '411'],
    ['311', '311'],
    ['+1 711', '711'],
  ])('%s: no read-back, no call, and the caller is told to dial %s', async (phone, number) => {
    saved.phone = phone;
    const first = await askThenYes({ contact: 'Pat', purpose: 'hi', preferredChannel: 'call' });
    expect(first).toMatch(/^Nothing was dialed: /);
    expect(first).toMatch(/[^.]\.$/); // one full stop
    saysDialItYourself(first, number);
    expect(first).not.toContain('a call to Pat');
    expect(callWithPersonaVoice).not.toHaveBeenCalled();
  });

  it.each(['+12025550177', ...LOOK_ALIKES])('%s is read back and called on the yes', async (n) => {
    saved.phone = n;
    const first = await askThenYes({ contact: 'Pat', purpose: 'hi', preferredChannel: 'call' });
    expect(first).toContain(`a call to Pat at ${n}`);
    expect(callWithPersonaVoice).toHaveBeenCalledOnce();
    expect(vi.mocked(callWithPersonaVoice).mock.calls[0]?.[0]).toBe(n);
  });
});
