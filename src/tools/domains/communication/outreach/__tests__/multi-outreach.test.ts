/**
 * Multi-Outreach Tool Tests
 *
 * Tests for the multiOutreach tool that handles compound requests like:
 * - "Call Mom, text Dad, email boss"
 * - "Reach out to my family"
 * - "Text Sarah now, call Mom in an hour"
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all external dependencies
vi.mock('../../../../../services/contacts/contact-relationship-service.js', () => ({
  searchContacts: vi.fn(),
}));

vi.mock('../../../../../services/contacts/contact-groups.js', () => ({
  getGroups: vi.fn(),
}));

vi.mock('../../../../../services/outreach/delivery/sms-delivery.js', () => ({
  sendSMS: vi.fn(),
}));

vi.mock('../../../../../services/outreach/delivery/email-delivery.js', () => ({
  sendEmail: vi.fn(),
}));

vi.mock('../../../../../services/voice/voice-call.js', () => ({
  callWithPersonaVoice: vi.fn(),
}));

vi.mock('../../../../../services/outreach/conversational-calls.js', () => ({
  makeConversationalCall: vi.fn(),
}));

vi.mock('../message-crafting.js', () => ({
  craftPersonalizedMessage: vi.fn().mockResolvedValue('Hey! Just checking in.'),
}));

vi.mock('../../../../../services/calendar/natural-date-parser.js', () => ({
  parseNaturalDate: vi.fn(),
}));

vi.mock('../../../../../services/outreach/scheduled-multi-outreach.js', () => ({
  scheduleOutreach: vi.fn().mockResolvedValue('sched_123'),
}));

// Import after mocking
import { createMultiOutreachTool, getMultiOutreachDefinition } from '../multi-outreach.js';
import { searchContacts } from '../../../../../services/contacts/contact-relationship-service.js';
import { getGroups } from '../../../../../services/contacts/contact-groups.js';
import { sendSMS } from '../../../../../services/outreach/delivery/sms-delivery.js';
import { sendEmail } from '../../../../../services/outreach/delivery/email-delivery.js';
import { callWithPersonaVoice } from '../../../../../services/voice/voice-call.js';
import { parseNaturalDate } from '../../../../../services/calendar/natural-date-parser.js';
import { scheduleOutreach } from '../../../../../services/outreach/scheduled-multi-outreach.js';

// Mock context
const mockContext = {
  userId: 'test-user-123',
  agentId: 'ferni',
  agentDisplayName: 'Ferni',
  services: {
    has: () => false,
    get: () => {
      throw new Error('Service not available');
    },
    getOptional: () => undefined,
  },
};

// Mock contact data (cast to satisfy ContactRelationship type)
const mockMom = {
  id: 'contact-mom',
  userId: 'test-user-123',
  contactId: 'mom',
  name: 'Mom',
  phone: '+15551234567',
  email: 'mom@example.com',
  firstInteraction: new Date(),
  lastInteraction: new Date(),
  interactionCount: 10,
  strengthScore: 90,
  topics: [{ topic: 'grandkids', firstMentioned: new Date(), lastMentioned: new Date(), mentionCount: 5 }],
  recentContext: [],
  createdAt: new Date(),
  updatedAt: new Date(),
} as const;

const mockDad = {
  id: 'contact-dad',
  userId: 'test-user-123',
  contactId: 'dad',
  name: 'Dad',
  phone: '+15559876543',
  email: 'dad@example.com',
  firstInteraction: new Date(),
  lastInteraction: new Date(),
  interactionCount: 8,
  strengthScore: 85,
  topics: [] as Array<{ topic: string; firstMentioned: Date; lastMentioned: Date; mentionCount: number }>,
  recentContext: [],
  createdAt: new Date(),
  updatedAt: new Date(),
} as const;

const mockBoss = {
  id: 'contact-boss',
  userId: 'test-user-123',
  contactId: 'boss',
  name: 'Boss',
  phone: undefined as string | undefined,
  email: 'boss@work.com',
  firstInteraction: new Date(),
  lastInteraction: new Date(),
  interactionCount: 5,
  strengthScore: 50,
  topics: [] as Array<{ topic: string; firstMentioned: Date; lastMentioned: Date; mentionCount: number }>,
  recentContext: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('Multi-Outreach Tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    vi.mocked(searchContacts).mockImplementation(async (_userId, query) => {
      const contacts: Record<string, unknown> = {
        mom: mockMom,
        dad: mockDad,
        boss: mockBoss,
      };
      const contact = contacts[query.toLowerCase()];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return contact ? [contact as any] : [];
    });

    vi.mocked(getGroups).mockResolvedValue([]);
    vi.mocked(sendSMS).mockResolvedValue({ success: true });
    vi.mocked(sendEmail).mockResolvedValue({ success: true });
    vi.mocked(callWithPersonaVoice).mockResolvedValue({ success: true, message: 'Call initiated' });
    vi.mocked(parseNaturalDate).mockReturnValue(null);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getMultiOutreachDefinition', () => {
    it('should return a valid tool definition', () => {
      const def = getMultiOutreachDefinition();

      expect(def.id).toBe('multiOutreach');
      expect(def.name).toBe('Multi-Person Outreach');
      expect(def.domain).toBe('communication');
      expect(def.tags).toContain('multi');
      expect(def.tags).toContain('outreach');
      expect(typeof def.create).toBe('function');
    });
  });

  describe('createMultiOutreachTool', () => {
    it('should create a tool with required properties', () => {
      const tool = createMultiOutreachTool(mockContext);

      expect(tool).toBeDefined();
      expect(typeof tool.execute).toBe('function');
      expect(tool.description).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should require userId', async () => {
      const tool = createMultiOutreachTool({ ...mockContext, userId: '' });

      const result = await tool.execute({
        targets: [{ contact: 'Mom' }],
      });

      expect(result).toContain('need to know who you are');
    });

    it('should require targets', async () => {
      const tool = createMultiOutreachTool(mockContext);

      const result = await tool.execute({
        targets: [],
      });

      expect(result).toContain('Who would you like me to reach out to');
    });

    it('should handle single target with text', async () => {
      const tool = createMultiOutreachTool(mockContext);

      const result = await tool.execute({
        targets: [{ contact: 'Mom', channel: 'text', purpose: 'say hi' }],
        defaultPurpose: 'check in',
      });

      expect(sendSMS).toHaveBeenCalledTimes(1);
      expect(sendSMS).toHaveBeenCalledWith(
        expect.objectContaining({
          to: mockMom.phone,
        })
      );
      expect(result).toContain('Mom');
      expect(result).toContain('texted');
    });

    it('should handle single target with email', async () => {
      const tool = createMultiOutreachTool(mockContext);

      const result = await tool.execute({
        targets: [{ contact: 'boss', channel: 'email', purpose: 'discuss meeting' }],
      });

      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: mockBoss.email,
        })
      );
      expect(result).toContain('Boss');
      expect(result).toContain('emailed');
    });

    it('should handle single target with call', async () => {
      const tool = createMultiOutreachTool(mockContext);

      const result = await tool.execute({
        targets: [{ contact: 'Mom', channel: 'call', purpose: 'check in', message: 'Hey Mom!' }],
      });

      expect(callWithPersonaVoice).toHaveBeenCalledTimes(1);
      expect(callWithPersonaVoice).toHaveBeenCalledWith(
        mockMom.phone,
        'Hey Mom!',
        'ferni',
        expect.objectContaining({ fallbackToTwilioVoice: true })
      );
      expect(result).toContain('Mom');
    });

    it('should handle multiple targets with mixed channels', async () => {
      const tool = createMultiOutreachTool(mockContext);

      const result = await tool.execute({
        targets: [
          { contact: 'Mom', channel: 'call' },
          { contact: 'Dad', channel: 'text' },
          { contact: 'boss', channel: 'email' },
        ],
        defaultPurpose: 'check in',
      });

      expect(callWithPersonaVoice).toHaveBeenCalledTimes(1);
      expect(sendSMS).toHaveBeenCalledTimes(1);
      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(result).toContain('Mom');
      expect(result).toContain('Dad');
      expect(result).toContain('Boss');
    });

    it('should handle contact not found', async () => {
      vi.mocked(searchContacts).mockResolvedValue([]);

      const tool = createMultiOutreachTool(mockContext);

      const result = await tool.execute({
        targets: [{ contact: 'Unknown Person' }],
      });

      expect(result).toContain('Could not find');
      expect(result).toContain('Unknown Person');
    });

    it('should handle partial failures gracefully', async () => {
      vi.mocked(sendSMS).mockResolvedValue({ success: false, error: 'Network error' });

      const tool = createMultiOutreachTool(mockContext);

      const result = await tool.execute({
        targets: [
          { contact: 'Mom', channel: 'text' },
          { contact: 'Dad', channel: 'call' },
        ],
      });

      // Should still call Dad even though Mom's text failed
      expect(sendSMS).toHaveBeenCalledTimes(1);
      expect(callWithPersonaVoice).toHaveBeenCalledTimes(1);
      // Result should show both outcomes
      expect(result).toContain('Mom');
      expect(result).toContain('Dad');
    });

    it('should handle scheduled outreach', async () => {
      vi.mocked(parseNaturalDate).mockReturnValue({
        date: new Date(Date.now() + 3600000), // 1 hour from now
        confidence: 'high',
        original: 'in 1 hour',
        interpretation: 'in 1 hour',
        hasTime: true,
        hasDate: false,
      });

      const tool = createMultiOutreachTool(mockContext);

      const result = await tool.execute({
        targets: [{ contact: 'Mom', channel: 'call', scheduledFor: 'in 1 hour' }],
      });

      expect(scheduleOutreach).toHaveBeenCalledTimes(1);
      expect(callWithPersonaVoice).not.toHaveBeenCalled(); // Should not call immediately
      expect(result).toContain('scheduled');
    });

    it('should handle group resolution', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(getGroups).mockResolvedValue([
        {
          id: 'group-family',
          userId: 'test-user-123',
          name: 'Family',
          description: 'Family members',
          members: ['contact-mom', 'contact-dad'],
          createdAt: new Date(),
          updatedAt: new Date(),
          occasionPreferences: {},
        },
      ] as any);

      vi.mocked(searchContacts).mockImplementation(async (_userId, query) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (query === 'contact-mom') return [mockMom as any];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (query === 'contact-dad') return [mockDad as any];
        if (query.toLowerCase() === 'family') return [];
        return [];
      });

      const tool = createMultiOutreachTool(mockContext);

      const result = await tool.execute({
        targets: [{ contact: 'Family', channel: 'text' }],
        defaultPurpose: 'holiday wishes',
      });

      // Should text both Mom and Dad (family members)
      expect(sendSMS).toHaveBeenCalledTimes(2);
      expect(result).toContain('Mom');
      expect(result).toContain('Dad');
    });

    it('should use auto channel selection when not specified', async () => {
      const tool = createMultiOutreachTool(mockContext);

      // Mom has phone, should default to text
      await tool.execute({
        targets: [{ contact: 'Mom', purpose: 'quick hello' }],
      });

      expect(sendSMS).toHaveBeenCalledTimes(1);
    });

    it('should use email when no phone available', async () => {
      const tool = createMultiOutreachTool(mockContext);

      // Boss has no phone, should fall back to email
      await tool.execute({
        targets: [{ contact: 'boss', purpose: 'meeting update' }],
      });

      expect(sendEmail).toHaveBeenCalledTimes(1);
    });

    it('should upgrade to call for check-in purposes', async () => {
      const tool = createMultiOutreachTool(mockContext);

      await tool.execute({
        targets: [{ contact: 'Mom', purpose: 'check in on her' }],
      });

      expect(callWithPersonaVoice).toHaveBeenCalledTimes(1);
    });

    it('should handle custom messages', async () => {
      const customMessage = 'Hey Mom, just wanted to say I love you!';

      const tool = createMultiOutreachTool(mockContext);

      await tool.execute({
        targets: [{ contact: 'Mom', channel: 'text', message: customMessage }],
      });

      expect(sendSMS).toHaveBeenCalledWith(
        expect.objectContaining({
          body: customMessage,
        })
      );
    });
  });
});

describe('Multi-Outreach Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(searchContacts).mockImplementation(async (_userId, query) => {
      const contacts: Record<string, unknown> = {
        mom: mockMom,
        dad: mockDad,
        boss: mockBoss,
      };
      const contact = contacts[query.toLowerCase()];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return contact ? [contact as any] : [];
    });

    vi.mocked(getGroups).mockResolvedValue([]);
    vi.mocked(sendSMS).mockResolvedValue({ success: true });
    vi.mocked(sendEmail).mockResolvedValue({ success: true });
    vi.mocked(callWithPersonaVoice).mockResolvedValue({ success: true, message: 'Call initiated' });
    vi.mocked(parseNaturalDate).mockReturnValue(null);
  });

  it('should handle real-world compound request: "Call Mom, text Dad, email boss"', async () => {
    const tool = createMultiOutreachTool(mockContext);

    const result = await tool.execute({
      targets: [
        { contact: 'Mom', channel: 'call', purpose: 'check in' },
        { contact: 'Dad', channel: 'text', purpose: 'say hi' },
        { contact: 'boss', channel: 'email', purpose: 'project update' },
      ],
      defaultPurpose: 'touch base',
    });

    // Verify all channels were used
    expect(callWithPersonaVoice).toHaveBeenCalledTimes(1);
    expect(sendSMS).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);

    // Verify result summary includes all contacts
    expect(result).toContain('Mom');
    expect(result).toContain('Dad');
    expect(result).toContain('Boss');
  });

  it('should handle mixed immediate and scheduled: "Text Sarah now, call Mom in an hour"', async () => {
    // Sarah (immediate)
    const mockSarah = { ...mockMom, id: 'contact-sarah', name: 'Sarah' };
    vi.mocked(searchContacts).mockImplementation(async (_userId, query) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (query.toLowerCase() === 'sarah') return [mockSarah as any];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (query.toLowerCase() === 'mom') return [mockMom as any];
      return [];
    });

    // "in 1 hour" should be parsed as future
    vi.mocked(parseNaturalDate).mockImplementation((input: string) => {
      if (input === 'in 1 hour') {
        return {
          date: new Date(Date.now() + 3600000),
          confidence: 'high',
          original: input,
          interpretation: 'in 1 hour',
          hasTime: true,
          hasDate: false,
        };
      }
      return null;
    });

    const tool = createMultiOutreachTool(mockContext);

    const result = await tool.execute({
      targets: [
        { contact: 'Sarah', channel: 'text' },
        { contact: 'Mom', channel: 'call', scheduledFor: 'in 1 hour' },
      ],
      defaultPurpose: 'catch up',
    });

    // Sarah should be texted immediately
    expect(sendSMS).toHaveBeenCalledTimes(1);

    // Mom's call should be scheduled, not executed
    expect(callWithPersonaVoice).not.toHaveBeenCalled();
    expect(scheduleOutreach).toHaveBeenCalledTimes(1);

    // Result should reflect both
    expect(result).toContain('Sarah');
    expect(result).toContain('Mom');
    expect(result).toContain('scheduled');
  });
});
