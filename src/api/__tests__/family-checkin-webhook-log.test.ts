/**
 * The family check-in /response webhook logs that a call raised an urgent
 * concern, never what the concern said: the concern text is written from the
 * family member's words (an unverified caller). It used to log the whole
 * composed sponsor alert. Fictional people and lines only.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { PassThrough, Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => ({ calls: [] as unknown[][] }));
const CONCERN = 'Rosa said the pharmacy on Maple Street has not called her back';
const ACTION = 'Ask Rosa about the refill at Maple Street';

vi.mock('../../utils/safe-logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/safe-logger.js')>();
  const record =
    (level: string) =>
    (...args: unknown[]) => {
      logged.calls.push([level, ...args]);
    };
  const logger: Record<string, unknown> = {
    child: () => logger,
    trace: record('trace'),
    fatal: record('fatal'),
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
    debug: record('debug'),
  };
  return { ...actual, createLogger: () => logger, getLogger: () => logger };
});
vi.mock('../../services/family/proactive-family-checkin.js', () => ({
  getCallRecordById: vi.fn(async () => ({
    id: 'call-1',
    scheduleId: 'schedule-1',
    sponsorUserId: 'sponsor-1',
    sponsoredIdentityId: 'identity-1',
    familyMemberName: 'Rosa',
    status: 'in_progress',
    callStartedAt: '2026-01-05T15:00:00.000Z',
    sponsorBriefed: false,
  })),
  completeCallRecord: vi.fn(async () => undefined),
}));
vi.mock('../../services/family/family-checkin-summary.js', () => ({
  analyzeCheckinCall: vi.fn(async () => ({
    mood: 'worried',
    moodConfidence: 0.8,
    summary: 'A short call.',
    topics: [],
    positives: [],
    concerns: [
      { description: CONCERN, urgency: 'urgent', category: 'health', recommendedAction: ACTION },
    ],
  })),
}));

import { handleFamilyCheckinWebhookRoutes } from '../family-checkin-webhook-routes.js';

async function respond(speech: string): Promise<number> {
  const body = new URLSearchParams({ CallSid: 'CA1', SpeechResult: speech }).toString();
  const req = Object.assign(Readable.from([body]), {
    method: 'POST',
    url: '/api/family-checkin/response/call-1',
    headers: { host: 'localhost', 'content-type': 'application/x-www-form-urlencoded' },
  }) as unknown as IncomingMessage;
  let status = 0;
  const res = Object.assign(new PassThrough(), {
    headersSent: false,
    writeHead(code: number) {
      status = code;
      return res;
    },
    setHeader: () => res,
  });
  res.resume();
  const done = new Promise<void>((resolve) => {
    res.on('finish', () => resolve());
  });
  await handleFamilyCheckinWebhookRoutes(
    req,
    res as unknown as ServerResponse,
    '/api/family-checkin/response/call-1'
  );
  await done;
  return status;
}

afterEach(() => {
  vi.unstubAllEnvs();
  logged.calls.length = 0;
});

describe('family check-in /response: urgent concern logs', () => {
  it('logs the urgent count, and none of the concern or its suggestion', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('TWILIO_AUTH_TOKEN', '');
    expect(await respond('my refill is late again')).toBe(200);

    const urgentLog = logged.calls.find((c) => c.includes('🚨 Urgent concerns detected'));
    expect(urgentLog?.[1]).toEqual({ callId: 'call-1', concerns: 1, urgent: 1 });
    const all = JSON.stringify(logged.calls);
    expect(all).not.toContain('Maple Street');
    expect(all).not.toContain('pharmacy');
  });
});
