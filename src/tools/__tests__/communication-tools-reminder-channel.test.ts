/**
 * setReminder picks a channel it can actually reach: a text when the user's
 * phone is on file, otherwise the app. It used to default to SMS and refuse
 * ("I need your phone number") for anyone without a phone on file.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateReminder } = vi.hoisted(() => {
  process.env.CARTESIA_API_KEY = 'test-cartesia-key';
  return {
    mockCreateReminder: vi.fn(async (p: { deliveryMethod: string }) => ({
      id: 'reminder_abc123',
      ...p,
    })),
  };
});

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config: { execute: unknown }) => config),
  },
}));

vi.mock('../../services/scheduling/reminder-scheduler.js', () => ({
  createVoiceMessage: vi.fn(),
  sendVoiceMessage: vi.fn(),
  cancelReminder: vi.fn(),
  createReminder: mockCreateReminder,
  getPendingReminders: vi.fn(() => []),
  parseNaturalTime: vi.fn(() => new Date('2026-10-01T16:00:00Z')),
}));

vi.mock('../../services/communication-service.js', () => ({
  sendEmail: vi.fn(),
  sendSMS: vi.fn(),
}));

vi.mock('../../utils/safe-logger.js', () => {
  const logger = (): Record<string, unknown> => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(logger),
  });
  return { getLogger: vi.fn(logger), createLogger: vi.fn(logger) };
});

vi.mock('../validation.js', () => ({
  validatePhone: vi.fn(() => ({ valid: true, sanitized: '+15551234567' })),
  validateEmail: vi.fn(() => ({ valid: true, sanitized: 'test@example.com' })),
  sanitizeEmailForLog: vi.fn((s: string) => s),
  sanitizePhoneForLog: vi.fn((s: string) => s),
}));

vi.mock('../../personas/voice-registry.js', () => ({
  getVoiceId: vi.fn(() => 'alex-voice-id'),
}));

import { createCommunicationTools } from '../domains/communication/communication-tools.js';

type SetReminder = {
  execute: (args: Record<string, unknown>, opts: { ctx: unknown }) => Promise<string>;
};
const setReminder = () =>
  (createCommunicationTools() as unknown as { setReminder: SetReminder }).setReminder;

describe('setReminder channel choice', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reminds in the app when no phone is on file', async () => {
    const reply = await setReminder().execute(
      { message: 'call mom', when: 'tomorrow at 9am' },
      { ctx: { userData: { userId: 'u1' } } }
    );
    expect(mockCreateReminder).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', deliveryMethod: 'in_app', deliveryAddress: '' })
    );
    expect(reply).toContain('remind you here in the app');
    expect(reply).not.toMatch(/phone number/);
  });

  it("texts when the user's phone is on file", async () => {
    await setReminder().execute(
      { message: 'call mom', when: 'tomorrow at 9am' },
      {
        ctx: {
          userData: { userId: 'u1', userProfile: { contactInfo: { phone: '555-123-4567' } } },
        },
      }
    );
    expect(mockCreateReminder).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryMethod: 'sms', deliveryAddress: '+15551234567' })
    );
  });

  it('still asks for an address when the user asks for email without one', async () => {
    const reply = await setReminder().execute(
      { message: 'call mom', when: 'tomorrow at 9am', deliveryMethod: 'email' },
      { ctx: { userData: { userId: 'u1' } } }
    );
    expect(reply).toMatch(/email address/);
    expect(mockCreateReminder).not.toHaveBeenCalled();
  });
});

/**
 * "scheduleReminder" (Alex's tool set and the communication domain's
 * Schedule Reminder) used to answer "Got it! I've set a reminder ... I'll
 * remind you when we talk." without setting anything: a promise nothing kept.
 */
describe('scheduleReminder sets a real reminder', () => {
  beforeEach(() => vi.clearAllMocks());
  const legacy = () =>
    (createCommunicationTools() as unknown as { scheduleReminder: SetReminder }).scheduleReminder;

  it('in the communication tool set', async () => {
    const reply = await legacy().execute(
      { reminderText: 'call mom', when: 'tomorrow at 9am' },
      { ctx: { userData: { userId: 'u1' } } }
    );
    expect(mockCreateReminder).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', message: 'call mom', deliveryMethod: 'in_app' })
    );
    expect(reply).toContain('remind you here in the app');
  });

  it("in the communication domain's Schedule Reminder, for the caller", async () => {
    const { getSchedulingToolDefinitions } = await import('../domains/communication/index.js');
    const def = getSchedulingToolDefinitions().find((d) => d.id === 'scheduleReminder');
    const tool = def?.create({ userId: 'u1', agentId: 'alex' } as never) as unknown as {
      execute: (args: Record<string, unknown>) => Promise<string>;
    };
    await tool.execute({ type: 'reminder', title: 'call mom', when: 'tomorrow at 9am' });
    expect(mockCreateReminder).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', message: 'call mom' })
    );
  });

  it("won't promise a reminder it can't file under anyone", async () => {
    const reply = await legacy().execute(
      { reminderText: 'call mom', when: 'tomorrow at 9am' },
      { ctx: {} }
    );
    expect(mockCreateReminder).not.toHaveBeenCalled();
    expect(reply).not.toMatch(/Got it|I've set/);
  });
});
