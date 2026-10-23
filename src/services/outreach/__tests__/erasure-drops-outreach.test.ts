/**
 * Account erasure drops the user's outreach data from this process (and refuses their outreach
 * writes from then on) before AND after the record sweep: before, so a live session's pending
 * write can't land after the sweep; after, so anything a session loaded during the sweep goes too.
 * session-end-keeps-outreach.test.ts shows the refusal itself on the real store.
 *
 * Runs the REAL deleteAllData. Mocked: the record sweep, the Google revokes and the outreach drop
 * (a spy around the real module), so the test reads the order they ran in.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const order = vi.hoisted(() => [] as string[]);
vi.mock('../../platform/erase-user-record.js', () => ({
  eraseUserRecord: vi.fn(async (uid: string) => void order.push(`sweep ${uid}`)),
}));
vi.mock('../../identity/gmail-send-as-user.js', () => ({ forgetGmailSendGrant: async () => {} }));
vi.mock('../../identity/google-calendar-disconnect.js', () => ({
  disconnectGoogleCalendar: async () => {},
}));
vi.mock('../outreach-intelligence.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  eraseUserOutreachData: (uid: string) => void order.push(`drop outreach ${uid}`),
}));

const { getDataExportService } = await import('../../platform/data-export.js');

beforeEach(() => {
  order.length = 0;
});

describe('account erasure and outreach data held in memory', () => {
  it('drops it before and after the record sweep', async () => {
    await getDataExportService().deleteAllData('user-erased');
    expect(order).toEqual([
      'drop outreach user-erased',
      'sweep user-erased',
      'drop outreach user-erased',
    ]);
  });
});
