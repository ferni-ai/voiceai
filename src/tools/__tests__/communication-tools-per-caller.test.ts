/**
 * PRIVACY: draft emails and scheduled calls stay with the caller who made them.
 *
 * Both lived in one process-wide map keyed only by item id, so
 * getCommunicationSummary listed every caller's draft recipients, subjects
 * and call contacts. Two members, and two callers with no id, run in one
 * process here.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@livekit/agents', () => ({
  llm: { tool: vi.fn((config: { execute: unknown }) => config) },
}));
vi.mock('../../services/scheduling/reminder-scheduler.js', () => ({
  createVoiceMessage: vi.fn(),
  sendVoiceMessage: vi.fn(),
  cancelReminder: vi.fn(),
  createReminder: vi.fn(),
  getPendingReminders: vi.fn(() => []),
  parseNaturalTime: vi.fn(() => new Date('2099-01-01T15:00:00Z')),
}));
vi.mock('../../services/communication-service.js', async (orig) => ({
  ...(await orig<typeof import('../../services/communication-service.js')>()),
  sendEmail: vi.fn(async () => 'sent'),
  sendSMS: vi.fn(),
}));

import { createCommunicationTools } from '../domains/communication/communication-tools.js';

type Execute = (args: Record<string, unknown>, opts: unknown) => Promise<string>;
const tools = createCommunicationTools() as unknown as Record<string, { execute: Execute }>;

/** LiveKit's tool options: the caller is the call's own userData.userId. */
const as = (userId?: string) => ({ ctx: { userData: userId ? { userId } : {} }, toolCallId: 't' });

const draft = (userId: string | undefined, to: string, subject: string) =>
  tools.draftEmail.execute({ to, subject, context: 'details', tone: 'friendly' }, as(userId));
const call = (userId: string | undefined, contact: string) =>
  tools.scheduleCall.execute(
    { contact, purpose: 'results', dateTime: 'tomorrow at 2pm', duration: 30 },
    as(userId)
  );
const summary = (userId: string | undefined) =>
  tools.getCommunicationSummary.execute({}, as(userId));

describe('communication drafts and calls per caller', () => {
  it("one member's summary never lists another's drafts or calls", async () => {
    await draft('uid-alice', 'oncologist@clinic.test', 'My biopsy results');
    await call('uid-alice', 'Divorce Lawyer');

    const bob = await summary('uid-bob');
    expect(bob).not.toContain('oncologist@clinic.test');
    expect(bob).not.toContain('Divorce Lawyer');

    const alice = await summary('uid-alice');
    expect(alice).toContain('oncologist@clinic.test');
    expect(alice).toContain('Divorce Lawyer');
  });

  it('two callers without an id never see each other', async () => {
    await draft(undefined, 'landlord@rent.test', 'Late rent');
    await call('unknown', 'Bail Bonds');

    for (const id of [undefined, 'unknown', 'anonymous']) {
      const other = await summary(id);
      expect(other).not.toContain('landlord@rent.test');
      expect(other).not.toContain('Bail Bonds');
    }
  });
});
