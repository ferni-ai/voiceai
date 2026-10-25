/** With SMS_OPT_IN_CONFIRM on, the every-minute reminder job also releases texts a guard held (held-texts.ts). */
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const releaseHeldTexts = vi.hoisted(() => vi.fn(async () => ({ sent: 1, dropped: 0, waiting: 0 })));
vi.mock('../../../services/outreach/held-texts.js', () => ({ releaseHeldTexts }));
vi.mock('../../../services/scheduling/reminder-delivery-job.js', () => ({
  deliverDueReminders: async () => ({ delivered: 0 }),
}));
vi.mock('../../../services/outreach/reminder-texts.js', () => ({ installReminderTexts: vi.fn() }));
const usersWithFlag = vi.hoisted(() => vi.fn(async (): Promise<string[]> => []));
vi.mock('../../../services/platform/cohort-flags.js', () => ({ usersWithFlag }));

const { handleDeliverReminders } = await import('../reminder-jobs.js');

function run(url: string) {
  const res = { writeHead: vi.fn(), setHeader: vi.fn(), end: vi.fn(), statusCode: 0 };
  return handleDeliverReminders({ url } as IncomingMessage, res as unknown as ServerResponse).then(
    () => String(res.end.mock.calls[0]?.[0] ?? '')
  );
}

describe('deliver-reminders job, SMS_OPT_IN_CONFIRM off (default)', () => {
  beforeEach(() => releaseHeldTexts.mockClear());
  afterEach(() => vi.unstubAllEnvs());

  it('does not release held texts when the flag is unset or off', async () => {
    vi.stubEnv('SMS_OPT_IN_CONFIRM', undefined);
    const body = await run('/api/jobs/deliver-reminders');
    expect(body).toContain('"success":true');
    expect(body).not.toContain('heldTexts');
    vi.stubEnv('SMS_OPT_IN_CONFIRM', 'off');
    await run('/api/jobs/deliver-reminders');
    expect(releaseHeldTexts).not.toHaveBeenCalled();
  });
});

describe('deliver-reminders job, SMS_OPT_IN_CONFIRM on', () => {
  beforeEach(() => {
    releaseHeldTexts.mockClear();
    vi.stubEnv('SMS_OPT_IN_CONFIRM', 'on');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('releases held texts on a real run and reports them', async () => {
    expect(await run('/api/jobs/deliver-reminders')).toContain('"heldTexts":{"sent":1');
    expect(releaseHeldTexts).toHaveBeenCalledTimes(1);
  });

  it('a dry run sends nothing', async () => {
    await run('/api/jobs/deliver-reminders?dryRun=true');
    expect(releaseHeldTexts).not.toHaveBeenCalled();
  });
});

describe('deliver-reminders job, FOCUS_HOLD (independent of SMS_OPT_IN_CONFIRM)', () => {
  beforeEach(() => {
    releaseHeldTexts.mockClear();
    usersWithFlag.mockClear();
    vi.stubEnv('SMS_OPT_IN_CONFIRM', 'off');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('FOCUS_HOLD on, SMS_OPT_IN_CONFIRM off: held texts are released', async () => {
    vi.stubEnv('FOCUS_HOLD', 'on');
    expect(await run('/api/jobs/deliver-reminders')).toContain('"heldTexts":{"sent":1');
    expect(releaseHeldTexts).toHaveBeenCalledTimes(1);
  });

  it('FOCUS_HOLD on for a cohort only (env off): held texts are released', async () => {
    vi.stubEnv('FOCUS_HOLD', 'off');
    usersWithFlag.mockResolvedValueOnce(['u-1']);
    await run('/api/jobs/deliver-reminders');
    expect(usersWithFlag).toHaveBeenCalledWith('FOCUS_HOLD');
    expect(releaseHeldTexts).toHaveBeenCalledTimes(1);
  });

  it('FOCUS_HOLD off everywhere: nothing released, as before', async () => {
    vi.stubEnv('FOCUS_HOLD', 'off');
    await run('/api/jobs/deliver-reminders');
    expect(releaseHeldTexts).not.toHaveBeenCalled();
  });

  it('a dry run still sends nothing', async () => {
    vi.stubEnv('FOCUS_HOLD', 'on');
    await run('/api/jobs/deliver-reminders?dryRun=true');
    expect(releaseHeldTexts).not.toHaveBeenCalled();
  });
});
