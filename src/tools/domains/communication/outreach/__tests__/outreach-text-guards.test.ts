/**
 * A text the caller asks Ferni to send to someone else goes through the
 * guards (guarded-text.ts), and when a guard holds it the tool tells the model
 * it was NOT sent and why, so Ferni never claims a text that didn't go.
 *
 * Drives the production outreach tools (confirmation off, it is tested in
 * outreach-confirm.test.ts) over the real guards and an in-memory store.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  memoryOptOut,
  resetMemoryTexts,
} from '../../../../../services/outreach/__tests__/memory-text-store.js';

vi.mock('../../../../../services/outreach/guarded-text.js', async (orig) =>
  (
    await import('../../../../../services/outreach/__tests__/memory-text-store.js')
  ).withMemoryTextStore(await orig())
);
vi.mock('../../../../../services/contacts/contact-relationship-service.js', () => ({
  searchContacts: vi.fn(async () => [{ id: 'c-mom', name: 'Mom', phone: '+15551230001' }]),
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

const ctx: ToolContext = { userId: 'user-1', agentId: 'ferni', agentDisplayName: 'Ferni' };
const TO_MOM = {
  contact: 'Mom',
  purpose: 'running late',
  preferredChannel: 'text',
  customMessage: 'Running late, love you',
};

const run = async (id: string, args: Record<string, unknown>) => {
  const def = getOutreachToolDefinitions().find((d) => d.id === id);
  if (!def) throw new Error(`no ${id}`);
  return String(await def.create(ctx).execute(args, { ctx: {}, toolCallId: 'c1' }));
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

describe('in-call texts to someone else', () => {
  it('reachOut sends when no guard holds it', async () => {
    expect(await run('reachOut', TO_MOM)).toContain('Texted Mom');
    expect(sendSMS).toHaveBeenCalledTimes(1);
  });

  it('reachOut to a number that sent STOP: nothing sent, and the model is told why', async () => {
    memoryOptOut('+15551230001');
    const out = await run('reachOut', TO_MOM);
    expect(sendSMS).not.toHaveBeenCalled();
    expect(out).toContain('The text to Mom was NOT sent');
    expect(out).toContain('replied STOP');
    expect(out).not.toContain('Texted');
  });

  it('multiOutreach holds a second text to the same number within ten minutes', async () => {
    const targets = { targets: [{ contact: 'Mom', channel: 'text', message: 'hi' }] };
    await run('multiOutreach', targets);
    const out = await run('multiOutreach', targets);
    expect(sendSMS).toHaveBeenCalledTimes(1);
    expect(out).toContain('NOT sent: I already texted that number in the last ten minutes');
  });

  it('with ON_BEHALF_TEXT_GUARD=off the old unguarded send is used', async () => {
    vi.stubEnv('ON_BEHALF_TEXT_GUARD', 'off');
    memoryOptOut('+15551230001');
    expect(await run('reachOut', TO_MOM)).toContain('Texted Mom');
    expect(sendSMS).toHaveBeenCalledWith(expect.objectContaining({ to: '+15551230001' }));
  });
});
