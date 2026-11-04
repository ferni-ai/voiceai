/**
 * "Pending outreach" in What's Ahead used to query a top-level `outreach`
 * collection that nothing writes, so it was always empty (and in prod the query
 * failed for want of an index). The proactive scheduler keeps the outreach it
 * plans under bogle_users/{uid}/scheduled_outreach; the practice view must read
 * it from there.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore, type Row } from '../../../services/scheduling/__tests__/fake-firestore.js';

const rows: Row[] = [];
vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => fakeFirestore(rows),
}));
vi.mock('../../../services/calendar/index.js', () => ({ getEvents: vi.fn(async () => []) }));
vi.mock('../../../services/superhuman/predictive-coaching.js', () => ({
  generatePredictions: vi.fn(async () => []),
}));

const { handleGetPracticeView } = await import('../practice-view.js');

const USER = 'test-user-outreach';
const HOUR = 60 * 60 * 1000;

/** A doc as proactive-scheduler's persistOutreach writes it. */
function scheduled(id: string, status: string, message: string): Row {
  const scheduledFor = new Date(Date.now() + 24 * HOUR).toISOString();
  return {
    id,
    userId: USER,
    collection: 'scheduled_outreach',
    data: {
      id,
      userId: USER,
      type: 'follow_up',
      message,
      scheduledFor,
      context: { trigger: 'test' },
      priority: 'medium',
      status,
      createdAt: new Date().toISOString(),
      source: 'proactive-scheduler',
    },
  };
}

async function getView(): Promise<Record<string, any>> {
  let raw = '';
  const res = {
    writeHead: vi.fn(),
    setHeader: vi.fn(),
    end: vi.fn((data?: string) => {
      raw = data ?? '';
    }),
  } as unknown as ServerResponse;
  const req = {
    headers: { 'x-firebase-uid': USER },
    method: 'GET',
  } as unknown as IncomingMessage;
  await handleGetPracticeView(req, res, new URL('http://localhost/api/practice-view'));
  return JSON.parse(raw) as Record<string, any>;
}

beforeEach(() => {
  rows.length = 0;
});

describe('GET /api/practice-view pending outreach', () => {
  it("lists the scheduler's pending outreach for the user, not sent or other people's", async () => {
    const pending = scheduled('outreach-pending', 'pending', 'How did the interview go?');
    rows.push(
      pending,
      scheduled('outreach-sent', 'sent', 'Thinking of you'),
      // A call Ferni places to a contact (call-retry's shape): Timestamp-typed, no source.
      {
        id: 'retry-call',
        userId: USER,
        collection: 'scheduled_outreach',
        data: { id: 'retry-call', userId: USER, status: 'pending', scheduledFor: new Date() },
      },
      { ...scheduled('someone-else', 'pending', 'Not yours'), userId: 'test-user-other' }
    );

    const body = await getView();

    expect(body.success).toBe(true);
    expect(body.pendingOutreach).toEqual([
      {
        id: 'outreach-pending',
        type: 'follow_up',
        message: 'How did the interview go?',
        scheduledFor: pending.data.scheduledFor,
        persona: 'ferni',
      },
    ]);
  });
});
