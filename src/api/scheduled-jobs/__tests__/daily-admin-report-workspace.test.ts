/**
 * The daily admin report (scheduled job and the admin "trigger report" route)
 * used to throw 'SENDGRID_API_KEY not configured' before sending. With
 * EMAIL_PROVIDER=gmail it goes through the Workspace port with no SendGrid key.
 */
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutgoingEmail } from '../../../types/email-sender.js';

const port = vi.hoisted(() => ({
  send: vi.fn(async (_email: OutgoingEmail) => ({
    ok: true,
    provider: 'gmail' as const,
    messageId: 'gm-daily',
  })),
  isConfigured: vi.fn(() => true),
}));
vi.mock('../../../services/email-transport/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/email-transport/index.js')>()),
  getEmailSender: () => ({ provider: 'gmail', ...port }),
}));
vi.mock('../../../services/admin/daily-report.js', () => ({
  generateDailyReport: async () => ({
    date: '2026-10-25',
    visitors: { unique: 1, totalSessions: 2 },
    callers: { total: 3 },
  }),
}));
vi.mock('../../../services/admin/daily-report-template.js', () => ({
  generateDailyReportHTML: () => '<p>report</p>',
  generateDailyReportPlainText: () => 'report',
}));
vi.mock('../../auth-middleware.js', () => ({ requireAdmin: async () => ({ uid: 'admin' }) }));

const { handleDailyAdminReport } = await import('../maintenance-jobs.js');
const { handleAdminRoutes } = await import('../../admin-routes.js');

function response() {
  const out = { status: 0, body: {} as Record<string, unknown> };
  const res = {
    writeHead: (s: number) => void (out.status = s),
    setHeader: () => {},
    end: (b: string) => void (out.body = JSON.parse(b)),
  };
  return { out, res: res as unknown as ServerResponse };
}

const fetchMock = vi.fn(async () => new Response('', { status: 401 }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('OWNER_EMAIL', 'pat.example@gmail.com'); // made up
  vi.stubEnv('SENDGRID_API_KEY', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('daily admin report without a SendGrid key', () => {
  it('scheduled job: fails on the missing key when EMAIL_PROVIDER is unset', async () => {
    vi.stubEnv('EMAIL_PROVIDER', '');
    const { out, res } = response();
    await handleDailyAdminReport(res);
    expect(out.status).toBe(500);
    expect(port.send).not.toHaveBeenCalled();
  });

  it('scheduled job: sends through the Workspace port with EMAIL_PROVIDER=gmail', async () => {
    vi.stubEnv('EMAIL_PROVIDER', 'gmail');
    const { out, res } = response();
    await handleDailyAdminReport(res);
    expect(out.status).toBe(200);
    expect(port.send).toHaveBeenCalledTimes(1);
    expect(port.send.mock.calls[0][0]).toMatchObject({
      to: 'pat.example@gmail.com',
      subject: 'Ferni Daily Report - 2026-10-25',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('admin trigger-report: sends through the Workspace port with EMAIL_PROVIDER=gmail', async () => {
    vi.stubEnv('EMAIL_PROVIDER', 'gmail');
    const req = new EventEmitter() as IncomingMessage;
    req.method = 'POST';
    req.url = '/api/admin/trigger-report';
    req.headers = {};
    const { out, res } = response();
    await handleAdminRoutes(req, res, '/api/admin/trigger-report');
    expect(out.status).toBe(200);
    expect(port.send).toHaveBeenCalledTimes(1);
    expect(port.send.mock.calls[0][0].subject).toContain('(Manual Trigger)');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
