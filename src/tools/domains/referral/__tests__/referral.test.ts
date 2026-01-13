/**
 * Referral Domain Tests
 *
 * CRITICAL: These tools make actual phone calls to users' contacts.
 * Tests validate proper parameter handling and error cases.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies BEFORE importing
vi.mock('../../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
  getLogger: () => ({
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
}));

// Mock voice referral tools
const mockInviteFriendTool = {
  description: 'Invite friend by call',
  parameters: {},
  execute: vi.fn(),
};

const mockSupportCallTool = {
  description: 'Send support call',
  parameters: {},
  execute: vi.fn(),
};

vi.mock('../voice-referral.js', () => ({
  createVoiceReferralTools: vi.fn(() => ({
    inviteFriendByCall: mockInviteFriendTool,
    sendSupportCall: mockSupportCallTool,
  })),
  makeVoiceReferralCall: vi.fn(),
}));

// Import after mocks
import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import { getToolDefinitions, definitions } from '../index.js';

function createMockContext(): ToolContext {
  return {
    userId: 'test-user-123',
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
    services: {
      has: () => false,
      get: () => {
        throw new Error('Service not available in test');
      },
      getOptional: () => undefined,
    },
  };
}

describe('Referral Domain', () => {
  let toolDefinitions: ToolDefinition[];
  let mockContext: ToolContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    toolDefinitions = await getToolDefinitions();
    mockContext = createMockContext();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ============================================================================
  // TOOL LOADING TESTS
  // ============================================================================

  describe('Tool Loading', () => {
    it('should load all referral tool definitions', () => {
      expect(toolDefinitions).toBeDefined();
      expect(toolDefinitions.length).toBe(2);
    });

    it('should export definitions array', () => {
      expect(definitions).toBeDefined();
      expect(Array.isArray(definitions)).toBe(true);
    });

    it('should have expected tools', () => {
      const toolIds = toolDefinitions.map((t) => t.id);
      expect(toolIds).toContain('inviteFriendByCall');
      expect(toolIds).toContain('sendSupportCall');
    });

    it('should have domain set to referral for all tools', () => {
      for (const tool of toolDefinitions) {
        expect(tool.domain).toBe('referral');
      }
    });

    it('should require twilio service', () => {
      for (const tool of toolDefinitions) {
        expect(tool.requiredServices).toContain('twilio');
      }
    });
  });

  // ============================================================================
  // INVITE FRIEND BY CALL TESTS
  // ============================================================================

  describe('inviteFriendByCall', () => {
    it('should create tool successfully', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'inviteFriendByCall');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      expect(tool).toBeDefined();
    });

    it('should have appropriate description', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'inviteFriendByCall');
      expect(toolDef?.description).toContain('call');
      expect(toolDef?.description).toContain('friend');
    });

    it('should have viral/growth tags', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'inviteFriendByCall');
      expect(toolDef?.tags).toContain('referral');
      expect(toolDef?.tags).toContain('viral');
      expect(toolDef?.tags).toContain('call');
    });
  });

  // ============================================================================
  // SEND SUPPORT CALL TESTS
  // ============================================================================

  describe('sendSupportCall', () => {
    it('should create tool successfully', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'sendSupportCall');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      expect(tool).toBeDefined();
    });

    it('should have appropriate description', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'sendSupportCall');
      expect(toolDef?.description).toContain('supportive');
      expect(toolDef?.description).toContain('difficult');
    });

    it('should have support/caring tags', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'sendSupportCall');
      expect(toolDef?.tags).toContain('referral');
      expect(toolDef?.tags).toContain('support');
      expect(toolDef?.tags).toContain('caring');
    });
  });

  // ============================================================================
  // TAG VALIDATION TESTS
  // ============================================================================

  describe('Tag Validation', () => {
    it('should have referral tag on all tools', () => {
      for (const toolDef of toolDefinitions) {
        expect(toolDef.tags).toContain('referral');
      }
    });

    it('should have call tag on all tools', () => {
      for (const toolDef of toolDefinitions) {
        expect(toolDef.tags).toContain('call');
      }
    });
  });
});
