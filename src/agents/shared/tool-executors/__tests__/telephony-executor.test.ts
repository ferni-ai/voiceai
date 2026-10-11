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

const callTool = vi.hoisted(() => ({
  ctx: undefined as Record<string, unknown> | undefined,
  execute: vi.fn(async () => 'Calling now'),
}));
vi.mock('../../../../tools/domains/telephony/call-on-behalf.js', () => ({
  createCallOnBehalfTool: (ctx: Record<string, unknown>) => {
    callTool.ctx = ctx;
    return { execute: callTool.execute };
  },
}));
vi.mock('../../../../services/outreach/on-behalf-call-orchestrator.js', () => ({
  getOnBehalfCallOrchestrator: () => ({}),
}));

// NOTE: the phone-service mock was removed - telephony-executor.ts imports
// contact-relationship-service, voice-call and sms-delivery instead.
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
      // NOTE: callandconverse and makephonecall are handled by scheduling-executor
      const expectedTools = [
        'reachout',
        'multioutreach',
        'callonbehalf',
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
    it("hands the chat model's contact/objective to the tool as contactQuery/purpose", async () => {
      const result = await telephonyExecutor.execute(
        'callOnBehalf',
        { contact: 'Restaurant', objective: 'Make a reservation for two at 7' },
        createContext()
      );

      expect(result).toBe('Calling now');
      expect(callTool.execute).toHaveBeenCalledWith({
        contactQuery: 'Restaurant',
        phoneNumber: undefined,
        purpose: 'Make a reservation for two at 7',
        additionalContext: undefined,
      });
    });

    it('accepts the tool schema names directly, and carries the tone and number', async () => {
      await telephonyExecutor.execute(
        'callOnBehalf',
        { contactQuery: 'my mom', phoneNumber: '8015550100', purpose: 'Check in', tone: 'warm' },
        createContext()
      );
      expect(callTool.execute).toHaveBeenCalledWith({
        contactQuery: 'my mom',
        phoneNumber: '8015550100',
        purpose: 'Check in',
        additionalContext: 'Tone: warm',
      });
    });

    it('reports back into the requesting session, not the persona id', async () => {
      await telephonyExecutor.execute(
        'callOnBehalf',
        { contact: 'Mom', purpose: 'Check in' },
        createContext()
      );
      expect(callTool.ctx).toMatchObject({
        userId: 'test-user-123',
        sessionId: 'test-session-456',
      });
    });

    it('defaults the purpose instead of failing when none is given', async () => {
      await telephonyExecutor.execute('callOnBehalf', { contact: 'Mom' }, createContext());
      expect(callTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ contactQuery: 'Mom', purpose: 'Check in with Mom' })
      );
    });

    it('asks who to call when there is no contact or number', async () => {
      const result = await telephonyExecutor.execute(
        'callOnBehalf',
        { purpose: 'Make reservation' },
        createContext()
      );
      expect(result).toContain('Who should I call');
      expect(callTool.execute).not.toHaveBeenCalled();
    });
  });

  // NOTE: callAndConverse and makePhoneCall tests removed
  // These tools are handled by scheduling-executor, not telephony-executor

  describe('scheduleCallback', () => {
    it('says nothing is booked, since nothing stores a callback request', async () => {
      const ctx = createContext();
      const result = await telephonyExecutor.execute(
        'scheduleCallback',
        {
          contact: 'Insurance Agent',
          when: 'tomorrow at 2pm',
        },
        ctx
      );

      expect(result).toMatch(/nothing is booked/);
      expect(result).not.toMatch(/I've noted|I'll remind you/);
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
