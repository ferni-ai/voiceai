/**
 * Owner-triggered family check-ins (`ferni family checkin mom`) through the
 * real route; schedules, auth and the SIP caller are faked.
 */
import { Readable } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ userId: 'alice' as string | null }));
vi.mock('../auth-middleware.js', async (orig) => ({
  ...(await orig<typeof import('../auth-middleware.js')>()),
  requireAuth: vi.fn(async (_req: IncomingMessage, res: ServerResponse) => {
    if (auth.userId) return { userId: auth.userId, isAdmin: false };
    res.writeHead(401);
    res.end('{}');
    return null;
  }),
}));
const schedules = [
  { id: 's1', sponsorUserId: 'alice', familyMemberName: 'Linda', relationship: 'mom', phoneNumber: '+15551234567', isActive: true, totalCallsMade: 4, lastSuccessfulCall: '2026-09-20T15:00:00Z', frequency: 'weekly' },
];
vi.mock('../../services/family/proactive-family-checkin.js', () => ({
  getCheckinSchedules: vi.fn(async (uid: string) => (uid === 'alice' ? schedules : [])),
}));
const initiate = vi.hoisted(() => vi.fn(async () => ({ success: true, callId: 'fc_1', status: 'ringing' })));
vi.mock('../../services/family/family-checkin-caller.js', () => ({ initiateCheckinCall: initiate }));

const { handleFamilyCheckinControl } = await import('../routes/family-checkin-control.js');

async function hit(method: string, path: string, body?: unknown) {
  const req = Object.assign(Readable.from([Buffer.from(body ? JSON.stringify(body) : '')]), {
    method, url: path, headers: { 'content-type': 'application/json' },
  }) as unknown as IncomingMessage;
  let status = 200;
  let out = '';
  const res = {
    setHeader: vi.fn(),
    writeHead(code: number) { status = code; return this; },
    end(d?: string) { out = d ?? ''; },
  } as unknown as ServerResponse;
  const handled = await handleFamilyCheckinControl(req, res, path);
  return { handled, status, body: out ? JSON.parse(out) : undefined };
}

describe('family check-in control', () => {
  beforeEach(() => { initiate.mockClear(); auth.userId = 'alice'; });

  it('ignores unrelated /api/family routes (approvals router handles them)', async () => {
    expect((await hit('GET', '/api/family/pending')).handled).toBe(false);
  });

  it('lists members with masked numbers', async () => {
    const r = await hit('GET', '/api/family/members');
    expect(r.body.members[0]).toMatchObject({ name: 'Linda', relationship: 'mom', phone: '•••4567' });
  });

  it('calls the named member (by name or relationship)', async () => {
    const r = await hit('POST', '/api/family/checkin', { member: 'Mom' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, callId: 'fc_1' });
    expect(initiate).toHaveBeenCalledWith(schedules[0]);
  });

  it('404s for someone without a schedule and 401s without auth', async () => {
    expect((await hit('POST', '/api/family/checkin', { member: 'Bob' })).status).toBe(404);
    auth.userId = null;
    expect((await hit('GET', '/api/family/status')).status).toBe(401);
    expect(initiate).not.toHaveBeenCalled();
  });

  it('rate-limits manual check-in calls', async () => {
    auth.userId = 'alice-rl';
    schedules.push({ ...schedules[0], id: 's2', sponsorUserId: 'alice-rl' });
    const { getCheckinSchedules } = await import('../../services/family/proactive-family-checkin.js');
    vi.mocked(getCheckinSchedules).mockImplementation(async () => schedules);
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await hit('POST', '/api/family/checkin', { member: 'Linda' })).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
  });
});
