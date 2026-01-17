/**
 * Leave Message Tool Tests
 *
 * Tests for the family caller leave message tool.
 *
 * Run with: pnpm vitest run src/tools/domains/family/__tests__/leave-message-tool.test.ts
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));

// Mock inbound call context
vi.mock('../../../../intelligence/context-builders/external/inbound-call-context.js', () => ({
  getInboundCallContext: vi.fn(),
}));

// Mock sponsored identity service
vi.mock('../../../../services/identity/sponsored-identity.js', () => ({
  getSponsoredIdentity: vi.fn(),
}));

// Mock family messages service
vi.mock('../../../../services/family/family-messages.js', () => ({
  createFamilyMessage: vi.fn(),
}));

import type { ToolContext } from '../../../registry/types.js';
import { getToolDefinitions } from '../leave-message-tool.js';

describe('Leave Message Tool', () => {
  let mockContext: ToolContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = {
      agentId: 'ferni',
      agentDisplayName: 'Ferni',
      userId: 'test_user',
      sessionId: 'test_session',
      services: {
        has: () => false,
        get: () => { throw new Error('Service not available'); },
        getOptional: () => undefined,
      },
    } as ToolContext;
  });

  describe('getToolDefinitions', () => {
    it('should return three tool definitions', () => {
      const definitions = getToolDefinitions();
      expect(definitions).toHaveLength(3);
      
      const ids = definitions.map(d => d.id);
      expect(ids).toContain('leaveMessageForSponsor');
      expect(ids).toContain('checkFamilyMessages');
      expect(ids).toContain('createCoordinatedReminder');
    });

    it('should have correct domain for all tools', () => {
      const definitions = getToolDefinitions();
      definitions.forEach(def => {
        expect(def.domain).toBe('family');
      });
    });
  });

  describe('leaveMessageForSponsor tool', () => {
    it('should have correct definition structure', () => {
      const definitions = getToolDefinitions();
      const leaveMessageDef = definitions.find(d => d.id === 'leaveMessageForSponsor');
      
      expect(leaveMessageDef).toBeDefined();
      expect(leaveMessageDef!.name).toBe('Leave Message for Sponsor');
      expect(leaveMessageDef!.tags).toContain('family');
      expect(leaveMessageDef!.tags).toContain('messages');
      expect(typeof leaveMessageDef!.create).toBe('function');
    });

    it('should create a tool with correct description', () => {
      const definitions = getToolDefinitions();
      const leaveMessageDef = definitions.find(d => d.id === 'leaveMessageForSponsor');
      const tool = leaveMessageDef!.create(mockContext);
      
      expect(tool.description).toContain('Leave a message for the sponsor');
      expect(tool.parameters).toBeDefined();
      expect(tool.parameters.properties).toHaveProperty('messageContent');
    });
  });

  describe('checkFamilyMessages tool', () => {
    it('should have correct definition structure', () => {
      const definitions = getToolDefinitions();
      const checkMessagesDef = definitions.find(d => d.id === 'checkFamilyMessages');
      
      expect(checkMessagesDef).toBeDefined();
      expect(checkMessagesDef!.name).toBe('Check Family Messages');
      expect(typeof checkMessagesDef!.create).toBe('function');
    });

    it('should create a tool with optional fromName parameter', () => {
      const definitions = getToolDefinitions();
      const checkMessagesDef = definitions.find(d => d.id === 'checkFamilyMessages');
      const tool = checkMessagesDef!.create(mockContext);
      
      expect(tool.parameters.properties).toHaveProperty('fromName');
      expect(tool.parameters.required).toEqual([]);
    });
  });

  describe('createCoordinatedReminder tool', () => {
    it('should have correct definition structure', () => {
      const definitions = getToolDefinitions();
      const reminderDef = definitions.find(d => d.id === 'createCoordinatedReminder');
      
      expect(reminderDef).toBeDefined();
      expect(reminderDef!.name).toBe('Create Coordinated Reminder');
      expect(reminderDef!.tags).toContain('reminders');
      expect(typeof reminderDef!.create).toBe('function');
    });

    it('should create a tool with required parameters', () => {
      const definitions = getToolDefinitions();
      const reminderDef = definitions.find(d => d.id === 'createCoordinatedReminder');
      const tool = reminderDef!.create(mockContext);
      
      expect(tool.parameters.properties).toHaveProperty('reminderMessage');
      expect(tool.parameters.properties).toHaveProperty('reminderTime');
      expect(tool.parameters.required).toContain('reminderMessage');
      expect(tool.parameters.required).toContain('reminderTime');
    });
  });
});
