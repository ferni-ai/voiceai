/**
 * #4331 slice 2: free text outside the tool layer. A goal's or milestone's title, a tracked
 * date's label ("Riley's first day sober"), a calendar item's title, a follow-up's recipient,
 * and the caller's own phone and email are logged as a length (`[N chars]`, via replyForLog),
 * never the words. Each row drives the real writer with invented text, captures every log
 * call, and asserts that no captured line holds the text and that the field is a length.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cap = vi.hoisted(() => {
  interface Call {
    level: string;
    fields: Record<string, unknown>;
    msg: unknown;
  }
  const calls: Call[] = [];
  const make = (bindings: Record<string, unknown>): Record<string, unknown> => {
    const logger: Record<string, unknown> = {};
    for (const level of ['info', 'warn', 'error', 'debug', 'trace', 'fatal']) {
      // pino's (fields, msg), and the (msg) some lines use.
      logger[level] = (a: unknown, b?: unknown) => {
        const [own, msg] = typeof a === 'string' ? [b, a] : [a, b];
        const fields = typeof own === 'object' && own !== null ? own : {};
        calls.push({ level, fields: { ...bindings, ...fields }, msg });
      };
    }
    logger.child = (more: Record<string, unknown>) => make({ ...bindings, ...more });
    return logger;
  };
  /** An in-memory Firestore: documents by path, enough for get() and set(). */
  const docs = new Map<string, unknown>();
  const ref = (path: string): Record<string, unknown> => ({
    path,
    collection: (name: string) => ({ doc: (id: string) => ref(`${path}/${name}/${id}`) }),
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
    set: async (data: unknown) => void docs.set(path, data),
  });
  return {
    calls,
    logger: make({}),
    docs,
    db: { collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }) },
    /** What the email service does: a row sets it. */
    email: { available: true, send: async (): Promise<unknown> => ({ success: true }) },
    /** What the calendar service's createEvent does: a row sets it. */
    createEvent: async (): Promise<unknown> => ({ id: 'event-1' }),
  };
});

vi.mock('../../utils/safe-logger.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getLogger: () => cap.logger,
  safeLog: () => cap.logger,
  createLogger: () => cap.logger,
}));
vi.mock('../superhuman/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getFirestoreDb: () => cap.db,
}));
vi.mock('../outreach/delivery/email-delivery.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isEmailDeliveryAvailable: () => cap.email.available,
  sendEmail: async () => cap.email.send(),
}));
vi.mock('../background-agents/unified-result-capture.js', () => ({
  captureBackgroundResult: async () => undefined,
}));
vi.mock('../calendar/calendar-service.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createEvent: async () => cap.createEvent(),
}));

const goals = (await import('../coaching/goal-tracking.js')).default;
const milestones = await import('../superhuman/proactive-milestone-detector.js');
const { executeFollowup, queueFollowup } =
  await import('../background-agents/executors/followup-executor.js');
const { createCalendarSyncedItem } = await import('../calendar/calendar-bridge.js');
const { notifyRequestComplete } = await import('../concierge/notification/result-notifier.js');

/** Invented words. "oatfield" is in every one, so one check covers them all. */
const WORD = 'oatfield';
const TITLE = 'run the oatfield half marathon with Riley';
const LABEL = "Riley's first oatfield morning sober";
const RECIPIENT = 'Riley Oatfield';
const PHONE = '+1555oatfield01';
const EMAIL = 'riley.oatfield@example.invalid';
const lengthOf = (text: string): string => `[${text.length} chars]`;

/** The one captured line with this message; fails the row when the writer never logged it. */
function line(msg: string): Record<string, unknown> {
  const found = cap.calls.find((c) => c.msg === msg);
  expect(found, `no log line "${msg}"`).toBeDefined();
  return found?.fields ?? {};
}

/** No captured line holds the invented words (any case). */
function nothingSaid(): void {
  expect(cap.calls.length).toBeGreaterThan(0);
  expect(JSON.stringify(cap.calls).toLowerCase()).not.toContain(WORD);
}

beforeEach(() => {
  cap.calls.length = 0;
  cap.docs.clear();
  cap.email.available = true;
  cap.email.send = async () => ({ success: true, messageId: 'm-1' });
  cap.createEvent = async () => ({ id: 'event-1' });
});

describe('goal tracking logs titles as lengths', () => {
  it('a completed goal and a completed milestone', () => {
    const goal = goals.createGoal('user-1', { title: TITLE, domain: 'health' });
    const step = goals.addMilestone('user-1', goal.id, { title: `${TITLE}, first 5k` });
    goals.completeMilestone('user-1', goal.id, step?.id ?? '');
    goals.updateProgress('user-1', goal.id, 100);
    nothingSaid();
    expect(line('Milestone done').title).toBe(lengthOf(`${TITLE}, first 5k`));
    expect(line('🎉 Goal completed!').title).toBe(lengthOf(TITLE));
    expect(line('🎯 Goal created')).not.toHaveProperty('title');
  });
});

describe('the milestone detector logs labels as lengths', () => {
  it('a tracked date, a quiet win, its reset and an acknowledged milestone', async () => {
    await milestones.trackDate('user-1', LABEL, '2026-01-02', 'anniversary');
    await milestones.trackQuietWin('user-1', LABEL, '2026-01-02');
    await milestones.resetQuietWin('user-1', LABEL);
    await milestones.acknowledgeMilestone('user-1', LABEL, '2026-01-02');
    nothingSaid();
    expect(line('Tracking a milestone date').label).toBe(lengthOf(LABEL));
    expect(line('Tracking quiet win').label).toBe(lengthOf(LABEL));
    expect(line('Reset quiet win streak').label).toBe(lengthOf(LABEL));
    expect(line('Acknowledged milestone').label).toBe(lengthOf(LABEL));
  });
});

describe('follow-ups log the recipient as a length', () => {
  const request = {
    userId: 'user-1',
    recipientName: RECIPIENT,
    recipientEmail: EMAIL,
    subject: 'Following up',
    message: 'Hello again',
    channel: 'email' as const,
  };

  it('a sent follow-up', async () => {
    await executeFollowup(request);
    nothingSaid();
    expect(line('Executing follow-up').recipient).toBe(lengthOf(RECIPIENT));
    expect(line('Follow-up completed').recipient).toBe(lengthOf(RECIPIENT));
  });

  it('a queued follow-up', async () => {
    await queueFollowup(request);
    await vi.waitFor(() => line('Follow-up completed'));
    nothingSaid();
    expect(line('Queueing follow-up').recipient).toBe(lengthOf(RECIPIENT));
  });
});

describe('the calendar bridge logs titles as lengths', () => {
  const item = {
    userId: 'user-1',
    type: 'reminder' as const,
    title: TITLE,
    scheduledFor: new Date('2026-12-01T09:00:00Z'),
    checkConflicts: false,
  };

  it('a synced item, a create that fails and a create that throws', async () => {
    await createCalendarSyncedItem(item);
    expect(line('🌉 Calendar bridge: creating synced item').title).toBe(lengthOf(TITLE));
    cap.createEvent = async () => null;
    await createCalendarSyncedItem(item);
    expect(line('❌ Calendar bridge: create failed').title).toBe(lengthOf(TITLE));
    cap.createEvent = async () => {
      throw new Error('calendar down');
    };
    await createCalendarSyncedItem(item);
    expect(line('Calendar sync failed').title).toBe(lengthOf(TITLE));
    nothingSaid();
  });
});

describe("the concierge notifier logs the caller's phone and email as lengths", () => {
  const request = {
    id: 'request-1',
    userId: 'user-1',
    domain: 'restaurant',
    results: [],
  } as unknown as Parameters<typeof notifyRequestComplete>[0];
  const prefs = (preferredChannel: string) =>
    cap.docs.set('bogle_users/user-1', {
      phone: PHONE,
      email: EMAIL,
      notificationPrefs: { preferredChannel },
    });

  it('a text, with and without Twilio', async () => {
    prefs('sms');
    await notifyRequestComplete(request);
    expect(line('Would send SMS').phone).toBe(lengthOf(PHONE));
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC-test');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'test');
    vi.stubEnv('TWILIO_PHONE_NUMBER', '+15550100100');
    try {
      await notifyRequestComplete(request);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(line('SMS would be sent via Twilio').phone).toBe(lengthOf(PHONE));
    nothingSaid();
  });

  it('an email: sent, failed, not set up and throwing', async () => {
    prefs('email');
    await notifyRequestComplete(request);
    expect(line('📧 Concierge result email sent').email).toBe(lengthOf(EMAIL));
    cap.email.send = async () => ({ success: false, error: 'rejected' });
    await notifyRequestComplete(request);
    expect(line('Email delivery failed').email).toBe(lengthOf(EMAIL));
    cap.email.send = async () => {
      throw new Error('smtp down');
    };
    await notifyRequestComplete(request);
    expect(line('Failed to send email').email).toBe(lengthOf(EMAIL));
    cap.email.available = false;
    await notifyRequestComplete(request);
    expect(line('Email delivery not available, skipping').email).toBe(lengthOf(EMAIL));
    nothingSaid();
  });
});
