/**
 * The daily admin report (scheduled job and the admin "trigger report" route)
 * goes through the Workspace port, the app's only email transport, with no init
 * and no key, and fails honestly when the transport says it failed.
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
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('daily admin report through the Workspace port', () => {
  it('scheduled job: a transport failure is a 500, not a sent report', async () => {
    port.send.mockResolvedValueOnce({ ok: false, provider: 'gmail', status: 401, error: 'gmail 401' } as never); // prettier-ignore
    const { out, res } = response();
    await handleDailyAdminReport(res);
    expect(out.status).toBe(500);
    expect(port.send).toHaveBeenCalledTimes(1);
  });

  it('scheduled job: sends through the Workspace port', async () => {
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

  it('admin trigger-report: sends through the Workspace port', async () => {
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
