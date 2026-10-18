/** The every-minute reminder job also releases texts a guard held (held-texts.ts). */
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const releaseHeldTexts = vi.hoisted(() => vi.fn(async () => ({ sent: 1, dropped: 0, waiting: 0 })));
vi.mock('../../../services/outreach/held-texts.js', () => ({ releaseHeldTexts }));
vi.mock('../../../services/scheduling/reminder-delivery-job.js', () => ({
  deliverDueReminders: async () => ({ delivered: 0 }),
}));
vi.mock('../../../services/outreach/reminder-texts.js', () => ({ installReminderTexts: vi.fn() }));

const { handleDeliverReminders } = await import('../reminder-jobs.js');

function run(url: string) {
  const res = { writeHead: vi.fn(), setHeader: vi.fn(), end: vi.fn(), statusCode: 0 };
  return handleDeliverReminders({ url } as IncomingMessage, res as unknown as ServerResponse).then(
    () => String(res.end.mock.calls[0]?.[0] ?? '')
  );
}

describe('deliver-reminders job', () => {
  beforeEach(() => releaseHeldTexts.mockClear());

  it('releases held texts on a real run and reports them', async () => {
    expect(await run('/api/jobs/deliver-reminders')).toContain('"heldTexts":{"sent":1');
    expect(releaseHeldTexts).toHaveBeenCalledTimes(1);
  });

  it('a dry run sends nothing', async () => {
    await run('/api/jobs/deliver-reminders?dryRun=true');
    expect(releaseHeldTexts).not.toHaveBeenCalled();
  });
});
