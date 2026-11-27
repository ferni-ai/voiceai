/**
 * The outreach tool reads what it may say about the caller's past with a contact through
 * rememberedContactContext (FORGET_EVERY_READER), never contact.topics directly: the pin for
 * gatherOutreachContext in unified-outreach.ts, which is not exported. Drives the production
 * reachOut tool (confirmation off) with an in-memory text store. Fictional contact.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMemoryTexts } from '../../../../../services/outreach/__tests__/memory-text-store.js';

const MOM = {
  id: 'c-mom',
  name: 'Mom',
  phone: '+15550100001',
  topics: [{ topic: 'Biscuit the dog is sick' }, { topic: 'the garden' }],
};

vi.mock('../remembered-contact-context.js', async (orig) => {
  const real = await orig<typeof import('../remembered-contact-context.js')>();
  return { ...real, rememberedContactContext: vi.fn(real.rememberedContactContext) };
});
vi.mock('../../../../../services/outreach/guarded-text.js', async (orig) =>
  (
    await import('../../../../../services/outreach/__tests__/memory-text-store.js')
  ).withMemoryTextStore(await orig())
);
vi.mock('../../../../../services/contacts/contact-relationship-service.js', () => ({
  searchContacts: vi.fn(async () => [MOM]),
  getContactContext: vi.fn(async () => null),
  getInteractionHistory: vi.fn(async () => []),
  getTopicsToDiscuss: vi.fn(async () => []),
  recordInteraction: vi.fn(async () => undefined),
}));
vi.mock('../../../../../services/contacts/contact-groups.js', () => ({
  getGroups: vi.fn(async () => []),
}));
vi.mock('../../../../../services/outreach/delivery/sms-delivery.js', () => ({ sendSMS: vi.fn() }));
vi.mock('../../../../../services/outreach/delivery/email-delivery.js', () => ({
  sendEmail: vi.fn(),
}));
vi.mock('../../../../../services/voice/voice-call.js', () => ({ callWithPersonaVoice: vi.fn() }));
vi.mock('../../../../../services/outreach/conversational-calls.js', () => ({
  makeConversationalCall: vi.fn(),
}));
vi.mock('../../../../../services/calendar/natural-date-parser.js', () => ({
  parseNaturalDate: vi.fn(() => null),
}));

import { sendSMS } from '../../../../../services/outreach/delivery/sms-delivery.js';
import type { ToolContext } from '../../../../registry/types.js';
import { getOutreachToolDefinitions } from '../index.js';
import { rememberedContactContext } from '../remembered-contact-context.js';

const ctx: ToolContext = {
  userId: 'member-outreach-pin',
  agentId: 'ferni',
  agentDisplayName: 'Ferni',
};

beforeEach(() => {
  resetMemoryTexts();
  vi.stubEnv('OUTBOUND_CONFIRM', 'off');
  vi.mocked(sendSMS).mockResolvedValue({ success: true });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('reachOut and the caller past with a contact', () => {
  it("reads the contact's topics through rememberedContactContext", async () => {
    const def = getOutreachToolDefinitions().find((d) => d.id === 'reachOut');
    if (!def) throw new Error('no reachOut');
    const args = { contact: 'Mom', purpose: 'running late', preferredChannel: 'text', customMessage: 'Running late' }; // prettier-ignore
    await def.create(ctx).execute(args, { ctx: {}, toolCallId: 'c1' });
    expect(rememberedContactContext).toHaveBeenCalledWith(
      'member-outreach-pin',
      expect.objectContaining({ id: 'c-mom', topics: MOM.topics })
    );
  });
});
