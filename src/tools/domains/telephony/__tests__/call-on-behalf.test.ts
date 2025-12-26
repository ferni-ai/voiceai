/**
 * Call On Behalf Tool Tests
 * Run with: npx vitest run src/tools/domains/telephony/__tests__/call-on-behalf.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before imports
vi.mock('../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
  safeLog: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock contact resolution service - use hoisted mock for dynamic behavior
const mockSearchContacts = vi.hoisted(() => vi.fn());
vi.mock('../../../../services/contacts/contact-relationship-service.js', () => ({
  searchContacts: mockSearchContacts,
}));

// Mock global services
vi.mock('../../../../services/global-services.js', () => ({
  getGlobalServicesSync: vi.fn(() => ({
    store: {
      getProfile: vi.fn().mockResolvedValue({
        preferredName: 'Test User',
        contactInfo: { timezone: 'America/New_York' },
      }),
    },
  })),
}));

// Mock compliance - partial mock to allow testing individual functions
vi.mock('../compliance.js', async () => {
  const actual = await vi.importActual('../compliance.js');
  return {
    ...actual,
    checkCallCompliance: vi.fn(() => ({
      passed: true,
      issues: [],
      requiredDisclosures: [],
      warnings: [],
    })),
  };
});

// Mock orchestrator
vi.mock('../../../../services/outreach/on-behalf-call-orchestrator.js', () => ({
  getOnBehalfCallOrchestrator: vi.fn(() => ({
    initiateCall: vi.fn().mockResolvedValue('test-call-id-123'),
  })),
}));

import type { ToolContext } from '../../../registry/types.js';
import {
  inferCallType,
  inferObjective,
  callOnBehalfSchema,
  createCallOnBehalfTool,
} from '../call-on-behalf.js';

function createMockContext(): ToolContext {
  return {
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
}

describe('Call On Behalf Tool', () => {
  let mockContext: ToolContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('inferCallType', () => {
    it('should identify emergency calls', () => {
      const contact = { name: 'Hospital', phone: '555-1234' };
      expect(inferCallType(contact, 'emergency situation')).toBe('emergency');
      expect(inferCallType(contact, 'urgent help needed')).toBe('emergency');
    });

    it('should identify personal calls from relationship', () => {
      const mom = { name: 'Mom', phone: '555-1234', relationship: 'mother' };
      const dad = { name: 'Dad', phone: '555-1234', relationship: 'father' };
      const friend = { name: 'John', phone: '555-1234', relationship: 'friend' };

      expect(inferCallType(mom, 'check in')).toBe('personal');
      expect(inferCallType(dad, 'say hello')).toBe('personal');
      expect(inferCallType(friend, 'catch up')).toBe('personal');
    });

    it('should identify business calls from relationship', () => {
      const doctor = { name: 'Dr. Smith', phone: '555-1234', relationship: 'doctor' };
      const dentist = { name: 'Dr. Jones', phone: '555-1234', relationship: 'dentist' };
      const restaurant = { name: 'Olive Garden', phone: '555-1234', relationship: 'restaurant' };

      expect(inferCallType(doctor, 'reschedule appointment')).toBe('business');
      expect(inferCallType(dentist, 'book cleaning')).toBe('business');
      expect(inferCallType(restaurant, 'make reservation')).toBe('business');
    });

    it('should default to business for contacts with company', () => {
      const contact = { name: 'Support', phone: '555-1234', company: 'Acme Inc' };
      expect(inferCallType(contact, 'inquiry')).toBe('business');
    });

    it('should default to personal for unknown contacts', () => {
      const contact = { name: 'Unknown Person', phone: '555-1234' };
      expect(inferCallType(contact, 'call them')).toBe('personal');
    });
  });

  describe('inferObjective', () => {
    it('should identify reschedule objective', () => {
      expect(inferObjective('reschedule my appointment')).toBe('reschedule');
      expect(inferObjective('I need to reschedule')).toBe('reschedule');
    });

    it('should identify cancel objective', () => {
      expect(inferObjective('cancel my appointment')).toBe('cancel');
      expect(inferObjective('I need to cancel')).toBe('cancel');
    });

    it('should identify new appointment objective', () => {
      expect(inferObjective('schedule a new appointment')).toBe('new_appointment');
      expect(inferObjective('book an appointment for next week')).toBe('new_appointment');
    });

    it('should identify reservation objective', () => {
      expect(inferObjective('make a reservation')).toBe('reservation');
      expect(inferObjective('book a table')).toBe('reservation');
    });

    it('should identify check-in objective', () => {
      expect(inferObjective('check on my mom')).toBe('check_in');
    });

    it('should identify message delivery objective', () => {
      expect(inferObjective('tell them I will be late')).toBe('deliver_message');
      expect(inferObjective('send a message')).toBe('deliver_message');
    });

    it('should identify inquiry objective', () => {
      expect(inferObjective('ask about the hours')).toBe('inquiry');
      expect(inferObjective('I have a question')).toBe('inquiry');
    });

    it('should default to general objective', () => {
      expect(inferObjective('call them for me')).toBe('general');
      expect(inferObjective('just call')).toBe('general');
    });
  });

  describe('callOnBehalfSchema', () => {
    it('should validate required fields', () => {
      const validInput = {
        contactQuery: 'my doctor',
        purpose: 'reschedule my appointment',
      };
      const result = callOnBehalfSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should accept optional fields', () => {
      const inputWithOptionals = {
        contactQuery: 'my doctor',
        purpose: 'reschedule my appointment',
        additionalContext: 'Prefer morning appointments',
        preferredTimes: ['morning', 'after 2pm'],
        recordingConsent: true,
      };
      const result = callOnBehalfSchema.safeParse(inputWithOptionals);
      expect(result.success).toBe(true);
    });

    it('should default recordingConsent to true', () => {
      const input = {
        contactQuery: 'my doctor',
        purpose: 'reschedule my appointment',
      };
      const result = callOnBehalfSchema.parse(input);
      expect(result.recordingConsent).toBe(true);
    });

    it('should reject missing required fields', () => {
      const missingContact = { purpose: 'reschedule' };
      const missingPurpose = { contactQuery: 'my doctor' };

      expect(callOnBehalfSchema.safeParse(missingContact).success).toBe(false);
      expect(callOnBehalfSchema.safeParse(missingPurpose).success).toBe(false);
    });
  });

  describe('createCallOnBehalfTool', () => {
    it('should create a tool with correct description', () => {
      const tool = createCallOnBehalfTool(mockContext);
      expect(tool.description).toContain('Call a third party');
      expect(tool.description).toContain('on behalf of the user');
    });

    it('should return helpful message when contact not found', async () => {
      mockSearchContacts.mockResolvedValue([]);

      const tool = createCallOnBehalfTool(mockContext);
      const result = await tool.execute({
        contactQuery: 'unknown person',
        purpose: 'call them',
      });

      expect(result).toContain("couldn't find");
      expect(result).toContain('unknown person');
    });

    it('should return not found message when contact has no phone', async () => {
      // NOTE: When a contact is found but has no phone number, resolveContact
      // returns null (not the partial contact), so the tool shows "couldn't find"
      // rather than "found but no phone". This is current implementation behavior.
      mockSearchContacts.mockResolvedValue([
        { id: '1', name: 'John Doe', relationship: 'friend', phone: undefined },
      ]);

      const tool = createCallOnBehalfTool(mockContext);
      const result = await tool.execute({
        contactQuery: 'John',
        purpose: 'call them',
      });

      // Current behavior: returns "couldn't find" because resolveContact returns null
      expect(result).toContain("couldn't find");
      expect(result).toContain('John');
    });

    it('should initiate call when contact is found with phone', async () => {
      mockSearchContacts.mockResolvedValue([
        { id: '1', name: 'Dr. Smith', phone: '555-123-4567', relationship: 'doctor' },
      ]);

      const tool = createCallOnBehalfTool(mockContext);
      const result = await tool.execute({
        contactQuery: 'my doctor',
        purpose: 'reschedule my appointment to next week',
      });

      expect(result).toContain('calling');
      expect(result).toContain('Dr. Smith');
      expect(result).toContain('reschedule');
    });
  });
});

describe('Compliance Module', () => {
  // Test compliance separately
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should be importable', async () => {
    const compliance = await import('../compliance.js');
    expect(compliance.checkCallCompliance).toBeDefined();
    expect(compliance.generateComplianceScript).toBeDefined();
    expect(compliance.requiresTwoPartyConsent).toBeDefined();
    expect(compliance.getCallTypeRequirements).toBeDefined();
  });
});

describe('Call Scripts Module', () => {
  it('should be importable', async () => {
    const scripts = await import('../scripts/index.js');
    expect(scripts.selectScript).toBeDefined();
    expect(scripts.buildCallScript).toBeDefined();
    expect(scripts.healthcareScript).toBeDefined();
    expect(scripts.restaurantScript).toBeDefined();
    expect(scripts.businessScript).toBeDefined();
    expect(scripts.personalScript).toBeDefined();
  });
});
