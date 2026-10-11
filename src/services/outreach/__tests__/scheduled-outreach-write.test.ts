/**
 * Outreach written by scheduleOutreach() must be found by the
 * execute-scheduled-outreach job, which queries scheduledFor <= now as a
 * timestamp. Firestore never matches a string against a timestamp, so the
 * write must keep scheduledFor (and updatedAt) as Dates, not ISO strings.
 * Real write, real job, one fake Firestore behind both clients.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore, type Row } from '../../scheduling/__tests__/fake-firestore.js';

let rows: Row[] = [];
const sendSMS = vi.fn(async () => ({ success: true }));

vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    constructor() {
      return fakeFirestore(rows);
    }
  },
}));
vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fakeFirestore(rows),
}));
vi.mock('../delivery/sms-delivery.js', () => ({ sendSMS }));
vi.mock('../delivery/email-delivery.js', () => ({ sendEmail: vi.fn() }));
vi.mock('../../voice/voice-call.js', () => ({ callWithPersonaVoice: vi.fn() }));
vi.mock('../conversational-calls.js', () => ({ makeConversationalCall: vi.fn() }));

const { scheduleOutreach } = await import('../scheduled-multi-outreach.js');
const { executeDueScheduledOutreach } = await import('../scheduled-outreach-executor.js');

const NOW = new Date('2026-10-10T16:00:00.000Z');

beforeEach(() => {
  rows = [];
  vi.clearAllMocks();
});

describe('scheduleOutreach write shape', () => {
  it('stores scheduledFor as a Date, and the job finds and sends it when due', async () => {
    const id = await scheduleOutreach(
      'u1',
      'ferni',
      {
        contact: 'mom',
        purpose: 'wish her happy birthday',
        channel: 'text',
        message: 'Happy birthday, Mom!',
        resolvedContactId: 'c1',
        resolvedContactName: 'Mom',
        resolvedPhone: '+18015550123',
      },
      new Date(NOW.getTime() - 60_000)
    );

    const [row] = rows.filter((r) => r.collection === 'scheduled_outreach');
    expect(row).toMatchObject({ id, userId: 'u1' });
    expect(row.data.scheduledFor).toBeInstanceOf(Date);
    expect(row.data.updatedAt).toBeInstanceOf(Date);

    const run = await executeDueScheduledOutreach({ now: NOW });

    expect(run).toMatchObject({ due: 1, executed: 1 });
    expect(sendSMS).toHaveBeenCalledWith(
      expect.objectContaining({ to: '+18015550123', body: 'Happy birthday, Mom!', userId: 'u1' })
    );
  });

  it('does not run outreach scheduled for later', async () => {
    await scheduleOutreach(
      'u1',
      'ferni',
      {
        contact: 'mom',
        purpose: 'later',
        channel: 'text',
        message: 'later',
        resolvedContactId: 'c1',
        resolvedContactName: 'Mom',
        resolvedPhone: '+18015550123',
      },
      new Date(NOW.getTime() + 60 * 60_000)
    );
    expect(await executeDueScheduledOutreach({ now: NOW })).toMatchObject({ due: 0, executed: 0 });
    expect(sendSMS).not.toHaveBeenCalled();
  });
});
