/**
 * Telephony Executor Tests
 *
 * Tests for telephony tools: reachOut, callOnBehalf, callAndConverse, makePhoneCall,
 * scheduleCallback, checkVoicemail.
 * Covers Twilio/voice integration and AI-assisted calling.
 *
 * @module agents/shared/tool-executors/__tests__/telephony-executor.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { telephonyExecutor } from '../telephony-executor.js';
import type { ToolExecutionContext } from '../types.js';

// Mock Firestore
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          add: vi.fn().mockResolvedValue({ id: 'call-123' }),
          doc: vi.fn(() => ({
            get: vi.fn().mockResolvedValue({ exists: true, data: () => ({}) }),
            update: vi.fn().mockResolvedValue(undefined),
          })),
          where: vi.fn(() => ({
            get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
          })),
          get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
        })),
        get: vi.fn().mockResolvedValue({ exists: true, data: () => ({}) }),
      })),
    })),
  })),
}));

// Mock telephony service
vi.mock('../../../../services/telephony/phone-service.js', () => ({
  initiateCall: vi.fn().mockResolvedValue({ callId: 'call-123', status: 'connecting' }),
  callOnBehalf: vi.fn().mockResolvedValue({ callId: 'call-124', status: 'connecting' }),
  callAndConverse: vi.fn().mockResolvedValue({ callId: 'call-125', status: 'in-progress' }),
  scheduleCallback: vi.fn().mockResolvedValue({ scheduled: true, callbackId: 'cb-123' }),
  checkVoicemail: vi.fn().mockResolvedValue({ messages: [], count: 0 }),
}));

describe('TelephonyExecutor', () => {
  const createContext = (overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext => ({
    userId: 'test-user-123',
    sessionId: 'test-session-456',
    personaId: 'ferni',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executor metadata', () => {
    it('should have correct domain name', () => {
      expect(telephonyExecutor.domain).toBe('telephony');
    });

    it('should handle all expected tools', () => {
      const expectedTools = [
        'reachout',
        'callonbehalf',
        'callandconverse',
        'makephonecall',
        'schedulecallback',
        'checkvoicemail',
        'requestcallback',
      ];

      for (const tool of expectedTools) {
        expect(telephonyExecutor.handles).toContain(tool);
      }
    });
  });

  describe('reachOut', () => {
    it('should initiate outreach to contact', async () => {
      const ctx = createContext();
      const result = await telephonyExecutor.execute(
        'reachOut',
        {
          contact: 'Mom',
          message: 'Just checking in!',
        },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should initiate outreach with preferred channel', async () => {
      const ctx = createContext();
      const result = await telephonyExecutor.execute(
        'reachOut',
        {
          contact: 'John',
          message: 'Can we talk?',
          channel: 'text',
        },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should prompt for contact if missing', async () => {
      const ctx = createContext();
      const result = await telephonyExecutor.execute('reachOut', { message: 'Hello' }, ctx);

      expect(result).toContain('Who');
    });

    it('should handle case-insensitive tool names', async () => {
      const ctx = createContext();

      const result1 = await telephonyExecutor.execute('REACHOUT', { contact: 'Mom' }, ctx);
      const result2 = await telephonyExecutor.execute('ReachOut', { contact: 'Mom' }, ctx);
      const result3 = await telephonyExecutor.execute('reachout', { contact: 'Mom' }, ctx);

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(result3).toBeDefined();
    });
  });

  describe('callOnBehalf', () => {
    it('should place call on user behalf', async () => {
      const ctx = createContext();
      const result = await telephonyExecutor.execute(
        'callOnBehalf',
        {
          contact: 'Restaurant',
          purpose: 'Make a reservation',
        },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should handle call with script', async () => {
      const ctx = createContext();
      const result = await telephonyExecutor.execute(
        'callOnBehalf',
        {
          contact: 'Doctor Office',
          purpose: 'Schedule appointment',
          script: 'Request earliest available appointment for annual checkup',
        },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should prompt for contact if missing', async () => {
      const ctx = createContext();
      const result = await telephonyExecutor.execute(
        'callOnBehalf',
        { purpose: 'Make reservation' },
        ctx
      );

      expect(result).toContain('Who');
    });

    it('should handle missing purpose gracefully', async () => {
      const ctx = createContext();
      const result = await telephonyExecutor.execute(
        'callOnBehalf',
        { contact: 'Restaurant' },
        ctx
      );

      // Executor proceeds or prompts for phone number if not saved
      expect(result).toBeDefined();
    });
  });

  describe('callAndConverse', () => {
    it('should initiate AI-assisted conversation call', async () => {
      const ctx = createContext();
      const result = await telephonyExecutor.execute(
        'callAndConverse',
        {
          contact: 'Bank',
          purpose: 'Check account balance',
        },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should handle call with specific instructions', async () => {
      const ctx = createContext();
      const result = await telephonyExecutor.execute(
        'callAndConverse',
        {
          contact: 'Insurance Company',
          purpose: 'File a claim',
          instructions: 'Get claim number and expected timeline',
        },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should prompt for contact if missing', async () => {
      const ctx = createContext();
      const result = await telephonyExecutor.execute(
        'callAndConverse',
        { purpose: 'Ask question' },
        ctx
      );

      expect(result).toContain('Who');
    });
  });

  describe('makePhoneCall', () => {
    it('should initiate a direct phone call', async () => {
      const ctx = createContext();
      const result = await telephonyExecutor.execute('makePhoneCall', { contact: 'John' }, ctx);

      expect(result).toBeDefined();
    });

    it('should make call to phone number', async () => {
      const ctx = createContext();
      const result = await telephonyExecutor.execute(
        'makePhoneCall',
        { phoneNumber: '555-1234' },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should prompt for contact if missing', async () => {
      const ctx = createContext();
      const result = await telephonyExecutor.execute('makePhoneCall', {}, ctx);

      expect(result).toContain('Who');
    });
  });

  describe('scheduleCallback', () => {
    it('should schedule a callback', async () => {
      const ctx = createContext();
      const result = await telephonyExecutor.execute(
        'scheduleCallback',
        {
          contact: 'Insurance Agent',
          when: 'tomorrow at 2pm',
        },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should resolve requestCallback alias', async () => {
      const ctx = createContext();
      const result = await telephonyExecutor.execute(
        'requestCallback',
        {
          contact: 'Tech Support',
          when: 'this afternoon',
        },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should schedule callback with reason', async () => {
      const ctx = createContext();
      const result = await telephonyExecutor.execute(
        'scheduleCallback',
        {
          contact: 'Financial Advisor',
          when: 'Friday morning',
          reason: 'Discuss investment portfolio',
        },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should prompt for contact if missing', async () => {
      const ctx = createContext();
      const result = await telephonyExecutor.execute('scheduleCallback', { when: 'tomorrow' }, ctx);

      expect(result).toContain('Who');
    });
  });

  describe('checkVoicemail', () => {
    it('should check voicemail', async () => {
      const ctx = createContext();
      const result = await telephonyExecutor.execute('checkVoicemail', {}, ctx);

      expect(result).toBeDefined();
    });

    it('should check voicemail with filter', async () => {
      const ctx = createContext();
      const result = await telephonyExecutor.execute('checkVoicemail', { filter: 'unread' }, ctx);

      expect(result).toBeDefined();
    });

    it('should check voicemail from specific contact', async () => {
      const ctx = createContext();
      const result = await telephonyExecutor.execute(
        'checkVoicemail',
        { from: 'Doctor Office' },
        ctx
      );

      expect(result).toBeDefined();
    });
  });

  describe('unhandled tools', () => {
    it('should return null for unhandled tools', async () => {
      const ctx = createContext();
      const result = await telephonyExecutor.execute('unknownTool', {}, ctx);

      expect(result).toBeNull();
    });

    it('should return null for tools from other domains', async () => {
      const ctx = createContext();

      const otherDomainTools = ['playMusic', 'addTask', 'setLights', 'getWeather'];

      for (const tool of otherDomainTools) {
        const result = await telephonyExecutor.execute(tool, {}, ctx);
        expect(result).toBeNull();
      }
    });
  });
});
