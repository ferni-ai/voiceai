/**
 * Due scheduled outreach (messages to a user's contacts at a set time) is
 * executed from Firestore by a scheduled job, whichever process scheduled it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore, type Row } from '../../scheduling/__tests__/fake-firestore.js';

let rows: Row[] = [];
const sendSMS = vi.fn(async () => ({ success: true }));
const updateOutreachStatus = vi.fn(async () => undefined);

vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fakeFirestore(rows),
}));
vi.mock('../delivery/sms-delivery.js', () => ({ sendSMS }));
vi.mock('../delivery/email-delivery.js', () => ({ sendEmail: vi.fn() }));
vi.mock('../../voice/voice-call.js', () => ({ callWithPersonaVoice: vi.fn() }));
vi.mock('../conversational-calls.js', () => ({ makeConversationalCall: vi.fn() }));
vi.mock('../scheduled-multi-outreach.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../scheduled-multi-outreach.js')>()),
  updateOutreachStatus,
}));

const { executeDueScheduledOutreach } = await import('../scheduled-outreach-executor.js');

const NOW = new Date('2026-09-30T16:00:00.000Z');
const outreach = (id: string, minutesAgo: number): Row => ({
  id,
  userId: 'u1',
  collection: 'scheduled_outreach',
  data: {
    userId: 'u1',
    personaId: 'ferni',
    status: 'pending',
    scheduledFor: new Date(NOW.getTime() - minutesAgo * 60_000),
    createdAt: new Date(NOW.getTime() - 86_400_000),
    updatedAt: new Date(NOW.getTime() - 86_400_000),
    target: {
      contact: 'mom',
      purpose: 'wish her happy birthday',
      channel: 'text',
      message: 'Happy birthday, Mom!',
      resolvedContactId: 'c1',
      resolvedContactName: 'Mom',
      resolvedPhone: '+18015550123',
    },
  },
});

beforeEach(() => {
  rows = [];
  vi.clearAllMocks();
});

describe('executeDueScheduledOutreach', () => {
  it('sends outreach that is due and records the result', async () => {
    rows = [outreach('o1', 1)];
    const result = await executeDueScheduledOutreach({ now: NOW });

    expect(result).toMatchObject({ due: 1, executed: 1, missed: 0 });
    expect(sendSMS).toHaveBeenCalledWith(
      expect.objectContaining({ to: '+18015550123', body: 'Happy birthday, Mom!', userId: 'u1' })
    );
    expect(updateOutreachStatus).toHaveBeenLastCalledWith(
      'u1',
      'o1',
      'completed',
      expect.objectContaining({ success: true, channel: 'text' })
    );
  });

  it('marks outreach found hours late as missed, without sending', async () => {
    rows = [outreach('o1', 5 * 60)];
    const result = await executeDueScheduledOutreach({ now: NOW });

    expect(result).toMatchObject({ missed: 1, executed: 0 });
    expect(sendSMS).not.toHaveBeenCalled();
    expect(rows[0].data.status).toBe('missed');
  });

  it('dry run sends nothing', async () => {
    rows = [outreach('o1', 1)];
    const result = await executeDueScheduledOutreach({ now: NOW, dryRun: true });
    expect(result).toMatchObject({ due: 1, executed: 0, dryRun: true });
    expect(sendSMS).not.toHaveBeenCalled();
    expect(rows[0].data.status).toBe('pending');
  });
});
