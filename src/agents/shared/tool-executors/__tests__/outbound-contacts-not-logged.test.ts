/**
 * #4326: the scheduled text, call and email writers and the journal log whether a recipient was
 * named, never who, and the length of the subject, the time phrase and the mood, never the words.
 * Each row drives a real writer with an invented contact and line, captures every log call, and
 * asserts that no captured field holds either and that the writer's own line carries the shape.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolExecutionContext } from '../types.js';

const cap = vi.hoisted(() => {
  const calls: Array<{ level: string; fields: unknown; msg: unknown }> = [];
  const logger: Record<string, unknown> = {};
  for (const level of ['info', 'warn', 'error', 'debug', 'trace', 'fatal']) {
    logger[level] = (fields: unknown, msg?: unknown) => calls.push({ level, fields, msg });
  }
  logger.child = () => logger;
  return { calls, logger };
});

vi.mock('../../../../utils/safe-logger.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getLogger: () => cap.logger,
  safeLog: () => cap.logger,
  createLogger: () => cap.logger,
}));
const ok = { success: true, reminderId: 'reminder-1' };
vi.mock('../../../../tools/domains/proactive/outreach/index.js', () => ({
  scheduleText: vi.fn(async () => ok),
  scheduleCall: vi.fn(async () => ok),
  scheduleEmail: vi.fn(async () => ok),
  textUser: vi.fn(async () => ({ success: true })),
}));
vi.mock('../../../../services/scheduling/reminder-scheduler.js', () => ({
  parseNaturalTime: () => new Date('2030-01-02T15:00:00Z'),
}));
vi.mock('../../../../services/superhuman/semantic-intelligence/promise-keeper.js', () => ({
  recordScheduledPromise: vi.fn(async () => undefined),
}));
vi.mock('../../../../services/calendar/unified-calendar-store.js', () => ({
  createEvent: vi.fn(async () => ({ id: 'event-1' })),
}));
vi.mock('../../../../services/messaging/consent-reach.js', () => ({
  ownerRefusal: vi.fn(async () => null),
  notCalling: () => 'not calling',
}));
vi.mock('../../../../services/communication-service.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  directSendHeld: vi.fn(async () => false),
  sendEmail: vi.fn(async () => 'Email sent'),
}));

const { schedulingExecutor } = await import('../scheduling-executor.js');
const { productivityExecutor } = await import('../productivity-executor.js');
const { emailUser } = await import('../../../../tools/domains/proactive/outreach/service.js');
const { setCallUserPort } =
  await import('../../../../tools/domains/proactive/outreach/call-user-port.js');
const { outboundFields } = await import('../../../../utils/reply-for-log.js');

/** An invented third party: if any log field holds this, a contact reached the logger. */
const CONTACT = 'Riley Test Neighbour 555-0199';
/** Invented caller words, for the subject, the time phrase and the mood. */
const WORDS = 'riley test after the oat milk run';
const ctx: ToolExecutionContext = { userId: 'riley-test-1' };

beforeEach(() => {
  cap.calls.length = 0;
});
const savedEnv = { ...process.env };
afterEach(() => {
  process.env = { ...savedEnv };
  vi.unstubAllGlobals();
  setCallUserPort(undefined);
});

/** No captured call holds the contact or the words; line `msg` has every field in `shape`. */
function nothingNamed(msg: string, shape: Record<string, unknown>, ...secrets: string[]): void {
  for (const c of cap.calls) {
    const text = JSON.stringify(c.fields) ?? '';
    for (const s of [CONTACT, WORDS, ...secrets]) expect(text).not.toContain(s);
  }
  const line = cap.calls.find((c) => c.msg === msg);
  expect(line, `no "${msg}" line`).toBeDefined();
  expect(line?.fields).toMatchObject(shape);
}

const run = (fn: string, args: Record<string, unknown>) =>
  schedulingExecutor.execute(fn, args, ctx);

describe('scheduled messages log no contact and no caller words (#4326)', () => {
  it('a scheduled text, and its calendar entry, say only that a recipient was named', async () => {
    const reply = await run('scheduleText', { recipient: CONTACT, message: 'hi', when: WORDS });
    expect(reply).toContain('Got it');
    nothingNamed('📱 Scheduling text message', { hasRecipient: true, whenLength: WORDS.length });
    nothingNamed('📅 Added to calendar', { hasRecipient: true, type: 'text' });
  });

  it('a scheduled call logs the recipient as a boolean and the time as a length', async () => {
    await run('scheduleCall', { recipient: CONTACT, reason: 'hi', when: WORDS });
    nothingNamed('📞 Scheduling phone call', { hasRecipient: true, whenLength: WORDS.length });
  });

  it('a scheduled email logs the subject and the time as lengths', async () => {
    const reply = await run('scheduleEmail', {
      recipient: CONTACT,
      subject: WORDS,
      body: 'hi',
      when: WORDS,
    });
    expect(reply).not.toContain('trouble');
    nothingNamed('📧 Scheduling email', {
      hasRecipient: true,
      subjectLength: WORDS.length,
      whenLength: WORDS.length,
    });
  });

  it('a text sent now logs only that a recipient was named', async () => {
    await run('sendTextNow', { recipient: CONTACT, message: 'hi' });
    nothingNamed('📱 Sending text now', { hasRecipient: true });
  });

  it('a conversational call logs only that a contact was named', async () => {
    await run('callAndConverse', { contact: CONTACT });
    nothingNamed('🗣️ Initiating conversational call', { hasContactName: true });
  });

  it("a failed call logs Twilio's status, never its body, which names the number", async () => {
    process.env.TWILIO_ACCOUNT_SID = 'AC-test';
    process.env.TWILIO_AUTH_TOKEN = 'token-test';
    process.env.TWILIO_PHONE_NUMBER = '+15555550100';
    const number = '+15555550123';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 400,
        text: async () => `The 'To' number ${number} is not a valid phone number.`,
      }))
    );
    const reply = await run('makePhoneCall', { phoneNumber: number, message: 'hi' });
    expect(reply).toContain('trouble making that call');
    nothingNamed('Twilio call error', { status: 400 }, '5555550123');
  });

  it('an email to the user logs no subject and no address', async () => {
    setCallUserPort({
      verifiedPhone: async () => undefined,
      verifiedEmail: async () => 'riley.test@example.test',
      call: async () => ({ success: false }),
    });
    const result = await emailUser('riley-test-1', WORDS, 'hi');
    expect(result.success).toBe(true);
    nothingNamed('📧 Email sent to user', { userId: 'riley-test-1' }, 'riley.test@example.test');
  });
});

describe('the journal logs the mood as a length (#4326)', () => {
  it('a journal entry with a mood in words', async () => {
    await productivityExecutor.execute('addJournal', { entry: 'a day', mood: WORDS }, ctx);
    nothingNamed('📔 Journal entry', { moodLength: WORDS.length });
  });
});

describe('outboundFields', () => {
  it('says whether a recipient was named and gives every other string as a length', () => {
    expect(outboundFields({ recipient: CONTACT, subject: 'abc', when: 12 })).toEqual({
      hasRecipient: true,
      subjectLength: 3,
    });
    expect(outboundFields({ recipient: '', when: 'now' })).toEqual({
      hasRecipient: false,
      whenLength: 3,
    });
    expect(outboundFields({})).toEqual({ hasRecipient: false });
  });
});
