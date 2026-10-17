/**
 * Outreach written by scheduleOutreach() must be found by the
 * execute-scheduled-outreach job, which queries scheduledFor <= now as a
 * timestamp. Firestore never matches a string against a timestamp, so the
 * write must keep scheduledFor (and updatedAt) as Dates, not ISO strings.
 * Real write, real job, one fake Firestore behind both clients.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMemoryTexts } from './memory-text-store.js';
import { fakeFirestore, type Row } from '../../scheduling/__tests__/fake-firestore.js';

const rows: Row[] = [];
const sendSMS = vi.hoisted(() => vi.fn(async () => ({ success: true })));

// The real text guards over an in-memory store (no Firestore).
vi.mock('../guarded-text.js', async (orig) =>
  (await import('./memory-text-store.js')).withMemoryTextStore(await orig())
);
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

const { scheduleOutreach, claimPendingOutreach } = await import('../scheduled-multi-outreach.js');
const { executeDueScheduledOutreach } = await import('../scheduled-outreach-executor.js');

const NOW = new Date('2026-10-10T16:00:00.000Z');

beforeEach(() => {
  rows.length = 0; // the module keeps its first Firestore client, so keep the same array
  vi.clearAllMocks();
});

beforeEach(() => resetMemoryTexts());

afterEach(() => vi.unstubAllEnvs());
describe('scheduleOutreach write shape', () => {
  // Sends to a contact later need the founder's opt-in.
  beforeEach(() => vi.stubEnv('SCHEDULED_OUTREACH_THIRD_PARTY', 'on'));

  it('refuses while later sends to other people are paused, and writes nothing', async () => {
    vi.stubEnv('SCHEDULED_OUTREACH_THIRD_PARTY', 'off');
    const target = {
      contact: 'mom',
      purpose: 'p',
      channel: 'text' as const,
      resolvedContactId: 'c1',
      resolvedContactName: 'Mom',
      resolvedPhone: '+18015550123',
    };
    await expect(scheduleOutreach('u1', 'ferni', target, NOW)).rejects.toThrow(
      'messages to other people at a later time are paused for now'
    );
    expect(rows).toEqual([]);
  });

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

  it('the in-process poller claims pending → executing once; a second claim gets nothing', async () => {
    const id = await scheduleOutreach(
      'u1',
      'ferni',
      {
        contact: 'mom',
        purpose: 'p',
        channel: 'text',
        resolvedContactId: 'c1',
        resolvedContactName: 'Mom',
        resolvedPhone: '+18015550123',
      },
      new Date(NOW.getTime() - 60_000)
    );
    expect(await claimPendingOutreach('u1', id)).toBe(true);
    expect(await claimPendingOutreach('u1', id)).toBe(false);
    expect(rows.find((r) => r.id === id)?.data).toMatchObject({
      status: 'executing',
      claimedAt: expect.any(Date),
    });
    // The job claims the same way (due-items.ts), so it skips an item the poller took.
    expect(await executeDueScheduledOutreach({ now: NOW })).toMatchObject({ executed: 0 });
  });
});
