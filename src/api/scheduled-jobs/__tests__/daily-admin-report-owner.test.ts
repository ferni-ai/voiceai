/**
 * The daily admin report goes to OWNER_EMAIL (a secret; the repo is public).
 * Unset, the job skips the email instead of sending it anywhere else.
 */
import type { ServerResponse } from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { sendEmail } = vi.hoisted(() => ({
  sendEmail: vi.fn(async (_msg: { to: string }) => ({ success: true, messageId: 'm-1' })),
}));
vi.mock('../../../services/outreach/delivery/email-delivery.js', () => ({
  sendEmail,
  isEmailDeliveryAvailable: () => true,
  initializeEmailDelivery: () => {},
}));
vi.mock('../../../services/admin/daily-report.js', () => ({
  generateDailyReport: async () => ({
    date: '2026-10-18',
    visitors: { unique: 1, totalSessions: 2 },
    callers: { total: 3 },
  }),
}));
vi.mock('../../../services/admin/daily-report-template.js', () => ({
  generateDailyReportHTML: () => '<p>report</p>',
  generateDailyReportPlainText: () => 'report',
}));

const { handleDailyAdminReport } = await import('../maintenance-jobs.js');

async function run(): Promise<{ status: number; body: Record<string, unknown> }> {
  let status = 0;
  let body = '';
  const res = {
    writeHead: (s: number) => void (status = s),
    setHeader: () => {},
    end: (b: string) => void (body = b),
  };
  await handleDailyAdminReport(res as unknown as ServerResponse);
  return { status, body: JSON.parse(body) };
}

describe('daily admin report recipient', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    sendEmail.mockClear();
  });

  it('sends to OWNER_EMAIL and does not echo the address back', async () => {
    vi.stubEnv('OWNER_EMAIL', 'pat.example@gmail.com'); // made up
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ to: 'pat.example@gmail.com' });
    expect(JSON.stringify(body)).not.toContain('pat.example');
  });

  it('skips the email while OWNER_EMAIL is unset', async () => {
    vi.stubEnv('OWNER_EMAIL', '');
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ skipped: 'OWNER_EMAIL unset' });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
