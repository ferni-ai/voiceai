/**
 * A message Ferni sends for a member goes out once, only after they approve
 * it, and only through the guarded text sender.
 *
 * executeApprovedMessage used to send whatever was stored under any pending
 * id, approved or not, as often as it was called, through raw Twilio; and
 * sendMessageOnBehalf sent with no approval once trust reached 'trusted'.
 * The guarded sender is a spy passed in as production callers must pass
 * sendOnBehalfText. The real trust-level system runs on an in-memory Firestore whose reads
 * yield, so code that reads and then writes outside a transaction interleaves
 * the way it can in production.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { sendOnBehalfText as guardedSender } from '../../outreach/guarded-text.js';
import type { OnBehalfTextSender } from '../send-on-behalf.js';

const { docs, db, sendOnBehalfText, sendSMS } = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const tick = (): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  const ref = (path: string) => ({
    path,
    collection: (name: string) => ({ doc: (id: string) => ref(`${path}/${name}/${id}`) }),
    get: async () => {
      await tick();
      const data = docs.get(path);
      return { exists: data !== undefined, data: () => data };
    },
    set: async (data: Record<string, unknown>) => {
      await tick();
      docs.set(path, { ...data });
    },
    update: async (data: Record<string, unknown>) => {
      await tick();
      docs.set(path, { ...docs.get(path), ...data });
    },
  });
  // Transactions run one at a time, as Firestore serializes conflicting ones
  let queue: Promise<unknown> = Promise.resolve();
  const db = {
    collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    runTransaction: <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const run = queue.then(() =>
        fn({
          get: (r: ReturnType<typeof ref>) => r.get(),
          update: (r: ReturnType<typeof ref>, data: Record<string, unknown>) => {
            docs.set(r.path, { ...docs.get(r.path), ...data });
          },
        })
      );
      queue = run.catch(() => undefined);
      return run;
    },
  };
  return {
    docs,
    db,
    sendOnBehalfText: vi.fn(async () => ({ sent: true as const })),
    sendSMS: vi.fn(async () => 'raw-sid'),
  };
});
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => db }));
vi.mock('../../twilio-sms.js', () => ({ sendSMS }));

const { sendMessageOnBehalf, executeApprovedMessage } = await import('../send-on-behalf.js');

// Compile-time: the real guarded sender is what a caller passes in.
export const guardedSenderFits: OnBehalfTextSender = null as unknown as typeof guardedSender;

const USER = 'uid-member';
const pendingPath = (id: string) => `bogle_users/${USER}/pending_actions/${id}`;
const sms = {
  userId: USER,
  channel: 'sms' as const,
  recipient: { name: 'Sam', phone: '+15555550123' },
  message: 'Running ten minutes late',
};

async function requestText(): Promise<string> {
  const result = await sendMessageOnBehalf(sms);
  expect(result.requiresApproval).toBe(true);
  return result.pendingActionId ?? '';
}
function approve(id: string): void {
  docs.set(pendingPath(id), { ...docs.get(pendingPath(id)), status: 'approved' });
}

describe('send on behalf needs one approval per message', () => {
  beforeEach(() => {
    docs.clear();
    vi.clearAllMocks();
  });

  it('never sends on request, even when the member trusts Ferni with texts', async () => {
    docs.set(`bogle_users/${USER}/action_trust/send_sms`, {
      actionType: 'send_sms',
      trustLevel: 'trusted',
    });
    const result = await sendMessageOnBehalf(sms);
    expect(result).toMatchObject({ success: true, requiresApproval: true });
    expect(sendOnBehalfText).not.toHaveBeenCalled();
    expect(sendSMS).not.toHaveBeenCalled();
  });

  it('refuses to send a message that was never approved', async () => {
    const id = await requestText();
    const result = await executeApprovedMessage(USER, id, sendOnBehalfText);
    expect(result.success).toBe(false);
    expect(sendOnBehalfText).not.toHaveBeenCalled();
  });

  it('refuses a rejected message', async () => {
    const id = await requestText();
    docs.set(pendingPath(id), { ...docs.get(pendingPath(id)), status: 'rejected' });
    expect((await executeApprovedMessage(USER, id, sendOnBehalfText)).success).toBe(false);
    expect(sendOnBehalfText).not.toHaveBeenCalled();
  });

  it('sends an approved text once, through the guarded sender, never raw Twilio', async () => {
    const id = await requestText();
    approve(id);
    expect((await executeApprovedMessage(USER, id, sendOnBehalfText)).success).toBe(true);
    expect(sendOnBehalfText).toHaveBeenCalledTimes(1);
    expect(sendOnBehalfText).toHaveBeenCalledWith(
      expect.objectContaining({ senderUserId: USER, toPhone: '+15555550123', refId: id })
    );
    expect(sendSMS).not.toHaveBeenCalled();
    expect(docs.get(pendingPath(id))).toMatchObject({ status: 'executed' });
  });

  it('refuses a replay of an approved message', async () => {
    const id = await requestText();
    approve(id);
    await executeApprovedMessage(USER, id, sendOnBehalfText);
    expect((await executeApprovedMessage(USER, id, sendOnBehalfText)).success).toBe(false);
    expect(sendOnBehalfText).toHaveBeenCalledTimes(1);
  });

  it('sends once when the same approval is executed twice at the same time', async () => {
    const id = await requestText();
    approve(id);
    const results = await Promise.all([
      executeApprovedMessage(USER, id, sendOnBehalfText),
      executeApprovedMessage(USER, id, sendOnBehalfText),
    ]);
    expect(results.map((r) => r.success).sort()).toEqual([false, true]);
    expect(sendOnBehalfText).toHaveBeenCalledTimes(1);
  });

  it('refuses an approval for something other than a message', async () => {
    const id = 'pending_booking_1';
    docs.set(pendingPath(id), { id, actionType: 'book_restaurant', status: 'approved' });
    docs.set(`bogle_users/${USER}/pending_messages/${id}`, { ...sms });
    expect((await executeApprovedMessage(USER, id, sendOnBehalfText)).success).toBe(false);
    expect(sendOnBehalfText).not.toHaveBeenCalled();
  });

  it('reports a text the guarded sender refused as not sent', async () => {
    sendOnBehalfText.mockResolvedValueOnce({ sent: false, reason: 'opted-out' } as never);
    const id = await requestText();
    approve(id);
    const result = await executeApprovedMessage(USER, id, sendOnBehalfText);
    expect(result).toMatchObject({ success: false });
    expect(result.error).toContain('opted-out');
  });
});
