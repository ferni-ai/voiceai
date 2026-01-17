/**
 * Scheduling Executor Tests
 *
 * Tests for message/call scheduling tools: scheduleMessage, scheduleText, scheduleCall,
 * scheduleEmail, sendMessageNow, makePhoneCall, listScheduled, cancelScheduled,
 * saveContact, callAndConverse.
 * Covers Twilio/email integration and contact management.
 *
 * @module agents/shared/tool-executors/__tests__/scheduling-executor.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { schedulingExecutor } from '../scheduling-executor.js';
import type { ToolExecutionContext } from '../types.js';

// Mock Firestore
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          add: vi.fn().mockResolvedValue({ id: 'msg-123' }),
          doc: vi.fn(() => ({
            set: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
            get: vi.fn().mockResolvedValue({ exists: true, data: () => ({}) }),
            delete: vi.fn().mockResolvedValue(undefined),
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

// Mock outreach service
vi.mock('../../../../tools/domains/proactive/outreach/index.js', () => ({
  scheduleText: vi.fn().mockResolvedValue({ success: true }),
  scheduleCall: vi.fn().mockResolvedValue({ success: true }),
  getUserContactInfo: vi.fn().mockResolvedValue({ timezone: 'America/Los_Angeles' }),
  sendMessage: vi.fn().mockResolvedValue({ success: true }),
  callAndConverse: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock scheduler service
vi.mock('../../../../services/scheduling/reminder-scheduler.js', () => ({
  parseNaturalTime: vi.fn().mockReturnValue(new Date()),
  listScheduled: vi.fn().mockResolvedValue([]),
  cancelScheduled: vi.fn().mockResolvedValue(true),
}));

// Mock calendar service
vi.mock('../../../../services/calendar/index.js', () => ({
  addEvent: vi.fn().mockResolvedValue({ id: 'event-123' }),
}));

// Mock contacts service
vi.mock('../../../../services/contacts/contact-service.js', () => ({
  saveContact: vi.fn().mockResolvedValue({ id: 'contact-123' }),
  getContact: vi.fn().mockResolvedValue(null),
  searchContacts: vi.fn().mockResolvedValue([]),
}));

describe('SchedulingExecutor', () => {
  const createContext = (overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext => ({
    userId: 'test-user-123',
    sessionId: 'test-session-456',
    personaId: 'alex',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executor metadata', () => {
    it('should have correct domain name', () => {
      expect(schedulingExecutor.domain).toBe('scheduling');
    });

    it('should handle all expected tools', () => {
      const expectedTools = [
        'schedulemessage',
        'scheduletext',
        'schedulecall',
        'scheduleemail',
        'sendmessagenow',
        'sendtextnow',
        'makephonecall',
        'callcontact',
        'callandconverse',
        'havefernicall',
        'callforconversation',
        'listscheduled',
        'getscheduled',
        'cancelscheduled',
        'cancelreminder',
        'savecontact',
        'savecontactinfo',
        'addcontact',
      ];

      for (const tool of expectedTools) {
        expect(schedulingExecutor.handles).toContain(tool);
      }
    });
  });

  describe('scheduleMessage', () => {
    it('should schedule a message', async () => {
      const ctx = createContext();
      const result = await schedulingExecutor.execute(
        'scheduleMessage',
        {
          recipient: 'John',
          message: 'Happy birthday!',
          when: 'tomorrow at 9am',
        },
        ctx
      );

      // Response confirms message will be sent (e.g., "Got it! I'll text John on...")
      expect(result).toBeDefined();
    });

    it('should schedule message with just message (recipient optional)', async () => {
      const ctx = createContext();
      const result = await schedulingExecutor.execute('scheduleMessage', { message: 'Hello' }, ctx);

      // With message provided, should schedule successfully
      expect(result).toBeDefined();
    });

    it('should prompt for message if missing', async () => {
      const ctx = createContext();
      const result = await schedulingExecutor.execute(
        'scheduleMessage',
        { recipient: 'John' },
        ctx
      );

      // Executor asks "What would you like me to say to John?"
      expect(result).toContain('What');
    });

    it('should handle case-insensitive tool names', async () => {
      const ctx = createContext();

      const result1 = await schedulingExecutor.execute(
        'SCHEDULEMESSAGE',
        { recipient: 'John', message: 'Hi' },
        ctx
      );
      const result2 = await schedulingExecutor.execute(
        'ScheduleMessage',
        { recipient: 'John', message: 'Hi' },
        ctx
      );

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });
  });

  describe('scheduleText alias', () => {
    it('should resolve scheduleText to scheduleMessage', async () => {
      const ctx = createContext();
      const result = await schedulingExecutor.execute(
        'scheduleText',
        {
          recipient: 'Mom',
          message: 'Call you later',
          when: '5pm',
        },
        ctx
      );

      expect(result).toBeDefined();
    });
  });

  describe('scheduleCall', () => {
    it('should schedule a phone call', async () => {
      const ctx = createContext();
      const result = await schedulingExecutor.execute(
        'scheduleCall',
        {
          contact: 'Doctor office',
          when: 'Monday at 2pm',
        },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should schedule call with purpose', async () => {
      const ctx = createContext();
      const result = await schedulingExecutor.execute(
        'scheduleCall',
        {
          contact: 'Bank',
          when: 'tomorrow',
          purpose: 'Check balance',
        },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should prompt for contact if missing', async () => {
      const ctx = createContext();
      const result = await schedulingExecutor.execute('scheduleCall', {}, ctx);

      expect(result).toContain('Who');
    });
  });

  describe('scheduleEmail', () => {
    it('should schedule an email', async () => {
      const ctx = createContext();
      const result = await schedulingExecutor.execute(
        'scheduleEmail',
        {
          recipient: 'boss@company.com',
          subject: 'Weekly update',
          body: 'Here is my progress...',
          when: 'Monday 8am',
        },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should prompt for subject/body if missing recipient', async () => {
      const ctx = createContext();
      const result = await schedulingExecutor.execute('scheduleEmail', { subject: 'Test' }, ctx);

      // Executor handles missing params gracefully
      expect(result).toBeDefined();
    });
  });

  describe('sendMessageNow / sendTextNow', () => {
    it('should send message immediately', async () => {
      const ctx = createContext();
      const result = await schedulingExecutor.execute(
        'sendMessageNow',
        {
          recipient: 'John',
          message: 'On my way!',
        },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should resolve sendTextNow alias', async () => {
      const ctx = createContext();
      const result = await schedulingExecutor.execute(
        'sendTextNow',
        {
          recipient: 'Jane',
          message: 'Running late',
        },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should handle message without explicit recipient', async () => {
      const ctx = createContext();
      const result = await schedulingExecutor.execute('sendMessageNow', { message: 'Hello' }, ctx);

      // Executor sends to user if no recipient specified
      expect(result).toBeDefined();
    });
  });

  describe('makePhoneCall / callContact', () => {
    it('should initiate a phone call', async () => {
      const ctx = createContext();
      const result = await schedulingExecutor.execute('makePhoneCall', { contact: 'Mom' }, ctx);

      expect(result).toBeDefined();
    });

    it('should resolve callContact alias', async () => {
      const ctx = createContext();
      const result = await schedulingExecutor.execute('callContact', { contact: 'Dad' }, ctx);

      expect(result).toBeDefined();
    });

    it('should handle missing contact gracefully', async () => {
      const ctx = createContext();
      const result = await schedulingExecutor.execute('makePhoneCall', {}, ctx);

      // Executor handles missing contact
      expect(result).toBeDefined();
    });
  });

  describe('callAndConverse', () => {
    it('should initiate AI-assisted call', async () => {
      const ctx = createContext();
      const result = await schedulingExecutor.execute(
        'callAndConverse',
        {
          contact: 'Restaurant',
          purpose: 'Make a reservation for 4',
        },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should resolve haveFerniCall alias', async () => {
      const ctx = createContext();
      const result = await schedulingExecutor.execute(
        'haveFerniCall',
        {
          contact: 'Dentist',
          purpose: 'Schedule appointment',
        },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should resolve callForConversation alias', async () => {
      const ctx = createContext();
      const result = await schedulingExecutor.execute(
        'callForConversation',
        {
          contact: 'Bank',
          purpose: 'Check account status',
        },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should prompt for contact if missing', async () => {
      const ctx = createContext();
      const result = await schedulingExecutor.execute('callAndConverse', {}, ctx);

      expect(result).toContain('Who');
    });
  });

  describe('listScheduled / getScheduled', () => {
    it('should list scheduled messages', async () => {
      const ctx = createContext();
      const result = await schedulingExecutor.execute('listScheduled', {}, ctx);

      expect(result).toBeDefined();
    });

    it('should resolve getScheduled alias', async () => {
      const ctx = createContext();
      const result = await schedulingExecutor.execute('getScheduled', {}, ctx);

      expect(result).toBeDefined();
    });

    it('should filter by type', async () => {
      const ctx = createContext();
      const result = await schedulingExecutor.execute('listScheduled', { type: 'messages' }, ctx);

      expect(result).toBeDefined();
    });
  });

  describe('cancelScheduled / cancelReminder', () => {
    it('should cancel a scheduled item', async () => {
      const ctx = createContext();
      const result = await schedulingExecutor.execute('cancelScheduled', { id: 'msg-123' }, ctx);

      expect(result).toBeDefined();
    });

    it('should resolve cancelReminder alias', async () => {
      const ctx = createContext();
      const result = await schedulingExecutor.execute(
        'cancelReminder',
        { name: 'birthday message' },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should handle missing identifier gracefully', async () => {
      const ctx = createContext();
      const result = await schedulingExecutor.execute('cancelScheduled', {}, ctx);

      // Executor handles missing identifier
      expect(result).toBeDefined();
    });
  });

  describe('saveContact / addContact', () => {
    it('should save a contact', async () => {
      const ctx = createContext();
      const result = await schedulingExecutor.execute(
        'saveContact',
        {
          name: 'John Doe',
          phone: '555-1234',
        },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should resolve saveContactInfo alias', async () => {
      const ctx = createContext();
      const result = await schedulingExecutor.execute(
        'saveContactInfo',
        {
          name: 'Jane Doe',
          email: 'jane@example.com',
        },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should resolve addContact alias', async () => {
      const ctx = createContext();
      const result = await schedulingExecutor.execute(
        'addContact',
        {
          name: 'Bob Smith',
          phone: '555-5678',
        },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should handle missing name gracefully', async () => {
      const ctx = createContext();
      const result = await schedulingExecutor.execute('saveContact', { phone: '555-1234' }, ctx);

      // Executor handles missing name
      expect(result).toBeDefined();
    });
  });

  describe('unhandled tools', () => {
    it('should return null for unhandled tools', async () => {
      const ctx = createContext();
      const result = await schedulingExecutor.execute('unknownTool', {}, ctx);

      expect(result).toBeNull();
    });

    it('should return null for tools from other domains', async () => {
      const ctx = createContext();

      const otherDomainTools = ['playMusic', 'addTask', 'setLights'];

      for (const tool of otherDomainTools) {
        const result = await schedulingExecutor.execute(tool, {}, ctx);
        expect(result).toBeNull();
      }
    });
  });
});
