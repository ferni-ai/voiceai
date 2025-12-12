/**
 * Communication Tools - Voice message integration test
 *
 * Ensures the voice message tool passes userId into the voice message pipeline
 * (Cartesia → storage → Twilio) via reminder-scheduler service.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateVoiceMessage, mockSendVoiceMessage } = vi.hoisted(() => {
  // Must be set before importing the module under test (it reads env at module load)
  process.env.CARTESIA_API_KEY = 'test-cartesia-key';
  return {
    mockCreateVoiceMessage: vi.fn(async (_params: unknown) => ({ id: 'vm_123' })),
    mockSendVoiceMessage: vi.fn(async () => 'sent'),
  };
});

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config: { execute: unknown }) => config),
  },
}));

vi.mock('../../services/reminder-scheduler.js', () => ({
  createVoiceMessage: mockCreateVoiceMessage,
  sendVoiceMessage: mockSendVoiceMessage,
  // Unused by this suite but imported by module
  cancelReminder: vi.fn(),
  createReminder: vi.fn(),
  getPendingReminders: vi.fn(() => []),
  parseNaturalTime: vi.fn(() => null),
}));

vi.mock('../../services/communication-service.js', () => ({
  sendEmail: vi.fn(),
  sendSMS: vi.fn(),
}));

vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('../validation.js', () => ({
  validatePhone: vi.fn(() => ({ valid: true, sanitized: '+15551234567' })),
  validateEmail: vi.fn(() => ({ valid: true, sanitized: 'test@example.com' })),
  sanitizeEmailForLog: vi.fn((s: string) => s),
  sanitizePhoneForLog: vi.fn((s: string) => s),
}));

vi.mock('../../personas/voice-registry.js', () => ({
  getVoiceId: vi.fn(() => 'alex-voice-id'),
}));

import { createCommunicationTools } from '../communication-tools.js';

describe('communication-tools voice message', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should pass ctx.userData.userId into createVoiceMessage', async () => {
    const tools = createCommunicationTools();

    const result = await tools.sendVoiceMessage.execute(
      { phoneNumber: '555-123-4567', message: 'Hello there' },
      // @ts-expect-error - Partial context for testing
      { ctx: { userData: { userId: 'user-abc' } } }
    );

    expect(mockCreateVoiceMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-abc',
        message: 'Hello there',
        voiceId: 'alex-voice-id',
      })
    );
    expect(mockSendVoiceMessage).toHaveBeenCalledWith('vm_123', '+15551234567');
    expect(result).toBe('sent');
  });
});
