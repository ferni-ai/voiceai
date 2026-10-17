/**
 * The sponsor's check-in schedule for one family member: only their own
 * sponsor can see or change it, bad input is refused, and a PUT creates the
 * schedule once and updates it after that. The store is an in-memory fake.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'http';
import type { FamilyCheckinSchedule } from '../../services/family/proactive-family-checkin.js';
import type { CheckinScheduleDeps } from '../family-checkin-schedule-routes.js';

const getSponsoredIdentity = vi.fn();
vi.mock('../../services/identity/sponsored-identity.js', () => ({ getSponsoredIdentity }));
vi.mock('../../services/family/proactive-family-checkin.js', () => ({
  createCheckinSchedule: vi.fn(),
  deleteCheckinSchedule: vi.fn(),
  getCheckinSchedules: vi.fn(),
  updateCheckinSchedule: vi.fn(),
}));

const { handleCheckinScheduleRoute } = await import('../family-checkin-schedule-routes.js');

function fakeDeps() {
  const docs = new Map<string, FamilyCheckinSchedule>();
  const deps = {
    list: vi.fn(async (sponsor: string) =>
      [...docs.values()].filter((d) => d.sponsorUserId === sponsor)
    ),
    create: vi.fn(async (input: Parameters<CheckinScheduleDeps['create']>[0]) => {
      const s: FamilyCheckinSchedule = {
        ...input,
        id: `s${docs.size + 1}`,
        nextScheduledCall: 'next',
        totalCallsMade: 0,
        createdAt: 'now',
        updatedAt: 'now',
      };
      docs.set(s.id, s);
      return s;
    }),
    update: vi.fn(async (_sponsor: string, id: string, updates: Partial<FamilyCheckinSchedule>) => {
      const d = docs.get(id);
      if (d) docs.set(id, { ...d, ...updates });
    }),
    remove: vi.fn(async (_sponsor: string, id: string) => {
      docs.delete(id);
    }),
  } satisfies CheckinScheduleDeps;
  return { deps, docs };
}

function req(method: string, body?: unknown): IncomingMessage {
  const stream = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  return Object.assign(stream, { method }) as unknown as IncomingMessage;
}

async function call(method: string, userId: string, deps: CheckinScheduleDeps, body?: unknown) {
  const send = vi.fn();
  const handled = await handleCheckinScheduleRoute(
    req(method, body),
    {} as ServerResponse,
    '/mom-id/checkin-schedule',
    userId,
    send,
    deps
  );
  const [, status, payload] = send.mock.calls[0] ?? [];
  return { handled, status, body: payload };
}

const weekly = {
  frequency: 'weekly',
  dayOfWeek: 'sunday',
  preferredTime: '10:30',
  timezone: 'America/Denver',
};

beforeEach(() => {
  getSponsoredIdentity.mockReset();
  getSponsoredIdentity.mockResolvedValue({
    id: 'mom-id',
    sponsorUserId: 'seth',
    displayName: 'Mom',
    relationship: 'parent',
    phoneNumber: '+15551234567',
  });
});

describe('the family check-in schedule route', () => {
  it('has no schedule to begin with', async () => {
    const r = await call('GET', 'seth', fakeDeps().deps);
    expect(r).toEqual({ handled: true, status: 200, body: { schedule: null } });
  });

  it('hides the schedule from anyone but the sponsor', async () => {
    const { deps } = fakeDeps();
    const results = await Promise.all(
      ['GET', 'PUT', 'DELETE'].map(async (method) => call(method, 'stranger', deps, weekly))
    );
    expect(results.map((r) => r.status)).toEqual([404, 404, 404]);
    expect(deps.create).not.toHaveBeenCalled();
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it('creates the schedule from the family member', async () => {
    const { deps, docs } = fakeDeps();
    const r = await call('PUT', 'seth', deps, weekly);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      schedule: {
        frequency: 'weekly',
        dayOfWeek: 'sunday',
        preferredTime: '10:30',
        timezone: 'America/Denver',
        isActive: true,
      },
    });
    expect(deps.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sponsorUserId: 'seth',
        sponsoredIdentityId: 'mom-id',
        familyMemberName: 'Mom',
        relationship: 'parent',
        phoneNumber: '+15551234567',
        daysOfWeek: ['sunday'],
        isActive: true,
        maxDurationMinutes: 15,
        leaveVoicemailIfNoAnswer: false,
      })
    );
    expect(docs.size).toBe(1);
    expect((await call('GET', 'seth', deps)).body.schedule.preferredTime).toBe('10:30');
  });

  it('updates the same schedule instead of making a second one', async () => {
    const { deps, docs } = fakeDeps();
    await call('PUT', 'seth', deps, weekly);
    const r = await call('PUT', 'seth', deps, {
      frequency: 'daily',
      preferredTime: '18:05',
      timezone: 'Europe/London',
    });
    expect(deps.create).toHaveBeenCalledTimes(1);
    // frequency is always passed so updateCheckinSchedule recomputes the next call.
    expect(deps.update).toHaveBeenCalledWith(
      'seth',
      's1',
      expect.objectContaining({ frequency: 'daily', preferredTime: '18:05', daysOfWeek: [] })
    );
    expect(docs.size).toBe(1);
    expect(r.body.schedule).toEqual({
      frequency: 'daily',
      dayOfWeek: undefined,
      preferredTime: '18:05',
      timezone: 'Europe/London',
      isActive: true,
    });
  });

  it('removes the schedule', async () => {
    const { deps, docs } = fakeDeps();
    await call('PUT', 'seth', deps, weekly);
    const r = await call('DELETE', 'seth', deps);
    expect(r).toMatchObject({ status: 200, body: { schedule: null } });
    expect(deps.remove).toHaveBeenCalledWith('seth', 's1');
    expect(docs.size).toBe(0);
  });

  it.each([
    ['a bad time', { ...weekly, preferredTime: '25:00' }],
    ['a 12-hour time', { ...weekly, preferredTime: '9:30am' }],
    ['a missing day on a weekly check-in', { ...weekly, dayOfWeek: undefined }],
    ['a made-up day', { ...weekly, dayOfWeek: 'funday' }],
    ['a made-up time zone', { ...weekly, timezone: 'Mars/Olympus' }],
    ['an unsupported frequency', { ...weekly, frequency: 'monthly' }],
    ['no body', undefined],
  ])('refuses %s', async (_label, body) => {
    const { deps } = fakeDeps();
    const r = await call('PUT', 'seth', deps, body);
    expect(r.status).toBe(400);
    expect(deps.create).not.toHaveBeenCalled();
    expect(deps.update).not.toHaveBeenCalled();
  });

  it('says so when the store is down', async () => {
    const { deps } = fakeDeps();
    deps.create.mockRejectedValueOnce(new Error('Firestore not available'));
    expect((await call('PUT', 'seth', deps, weekly)).status).toBe(503);
  });

  it('leaves other routes alone', async () => {
    const send = vi.fn();
    const handled = await handleCheckinScheduleRoute(
      req('GET'),
      {} as ServerResponse,
      '/mom-id/call-consent',
      'seth',
      send,
      fakeDeps().deps
    );
    expect(handled).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});
