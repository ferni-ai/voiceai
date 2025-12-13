/**
 * Cameo Domain Tools Tests
 *
 * Tests for team member "pop-in" cameo interactions.
 *
 * Run with: npx vitest run src/tools/domains/cameo/__tests__/cameo.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

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
}));

// Mock cameo service
vi.mock('../../../../services/cameo/index.js', () => ({
  executeCameo: vi.fn().mockResolvedValue({
    success: true,
    greetingSpoken: true,
    instructionsUpdated: true,
    insight: 'Test insight',
    handback: 'Back to you, Ferni!',
  }),
  endCameo: vi.fn().mockResolvedValue({
    success: true,
    duration: 5000,
  }),
  isInCameo: vi.fn().mockReturnValue(false),
  getCurrentCameoPersona: vi.fn().mockReturnValue(null),
  getCooldownStatus: vi.fn().mockReturnValue({
    isOnCooldown: false,
    remainingMs: 0,
  }),
}));

vi.mock('../../shared/persistence.js', () => ({
  persistTrackedItem: vi.fn(),
  persistKeyMoment: vi.fn(),
}));

vi.mock('../../shared/index.js', () => ({
  trackToolUsage: vi.fn(() => ({
    success: vi.fn(),
    error: vi.fn(),
  })),
  isLifeCoachAnalyticsEnabled: vi.fn(() => false),
}));

// ============================================================================
// IMPORTS (after mocks)
// ============================================================================

import {
  executeCameo,
  endCameo,
  isInCameo,
  getCooldownStatus,
  getCurrentCameoPersona,
} from '../../../../services/cameo/index.js';
import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import { getToolDefinitions } from '../index.js';

// ============================================================================
// TEST CONTEXT
// ============================================================================

function createMockContext(): ToolContext {
  return {
    userId: 'test-user-123',
    sessionId: 'test-session-123',
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

// ============================================================================
// TESTS
// ============================================================================

describe('Cameo Domain Tools', () => {
  let toolDefinitions: ToolDefinition[];
  let mockContext: ToolContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    toolDefinitions = await getToolDefinitions();
    mockContext = createMockContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Tool Loading
  // --------------------------------------------------------------------------

  describe('Tool Loading', () => {
    it('should load all cameo tool definitions', async () => {
      expect(toolDefinitions.length).toBeGreaterThan(0);
      expect(toolDefinitions.length).toBe(3); // inviteCameo, completeCameo, checkCameoOpportunity
    });

    it('should have correct domain for all tools', () => {
      for (const def of toolDefinitions) {
        expect(def.domain).toBe('cameo');
      }
    });

    it('should include all expected tools', () => {
      const toolIds = toolDefinitions.map((t) => t.id);
      expect(toolIds).toContain('inviteCameo');
      expect(toolIds).toContain('completeCameo');
      expect(toolIds).toContain('checkCameoOpportunity');
    });
  });

  // --------------------------------------------------------------------------
  // inviteCameo Tool
  // --------------------------------------------------------------------------

  describe('inviteCameo', () => {
    it('should successfully invite a team member for cameo', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'inviteCameo');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute(
        {
          personaId: 'peter-john',
          context: 'User mentioned stock analysis',
        },
        { ctx: { userData: { services: { sessionId: 'test-session' } } } }
      );

      expect(result.success).toBe(true);
      expect(result.personaId).toBe('peter-john');
      expect(result.personaName).toBe('Peter');
      expect(executeCameo).toHaveBeenCalled();
    });

    it('should handle invalid persona', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'inviteCameo');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute(
        {
          personaId: 'invalid-persona',
          context: 'Test context',
        },
        { ctx: { userData: { services: { sessionId: 'test-session' } } } }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown persona');
    });

    it('should block when already in cameo', async () => {
      vi.mocked(isInCameo).mockReturnValue(true);

      const toolDef = toolDefinitions.find((t) => t.id === 'inviteCameo');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute(
        {
          personaId: 'maya-santos',
          context: 'Test context',
        },
        { ctx: { userData: { services: { sessionId: 'test-session' } } } }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('already in progress');
    });

    it('should block when on cooldown', async () => {
      // Ensure not already in cameo first
      vi.mocked(isInCameo).mockReturnValue(false);
      vi.mocked(getCooldownStatus).mockReturnValue({
        isOnCooldown: true,
        remainingMs: 30000,
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'inviteCameo');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute(
        {
          personaId: 'jordan-taylor',
          context: 'Test context',
        },
        { ctx: { userData: { services: { sessionId: 'test-session' } } } }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('cooldown');
    });

    it('should auto-detect trigger type based on persona', async () => {
      vi.mocked(isInCameo).mockReturnValue(false);
      vi.mocked(getCooldownStatus).mockReturnValue({
        isOnCooldown: false,
        remainingMs: 0,
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'inviteCameo');
      const tool = toolDef!.create(mockContext);

      await tool.execute(
        {
          personaId: 'nayan-patel',
          context: 'User needs perspective',
        },
        { ctx: { userData: { services: { sessionId: 'test-session' } } } }
      );

      expect(executeCameo).toHaveBeenCalledWith(
        expect.objectContaining({
          personaId: 'nayan-patel',
          triggerType: 'wisdom',
        }),
        expect.any(Object)
      );
    });
  });

  // --------------------------------------------------------------------------
  // completeCameo Tool
  // --------------------------------------------------------------------------

  describe('completeCameo', () => {
    it('should complete an active cameo', async () => {
      vi.mocked(isInCameo).mockReturnValue(true);
      vi.mocked(getCurrentCameoPersona).mockReturnValue('peter-john');

      const toolDef = toolDefinitions.find((t) => t.id === 'completeCameo');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute(
        { finalThought: 'Great insights shared!' },
        { ctx: { userData: { services: { sessionId: 'test-session' } } } }
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('Ferni is back');
      expect(endCameo).toHaveBeenCalled();
    });

    it('should fail when no cameo in progress', async () => {
      vi.mocked(isInCameo).mockReturnValue(false);

      const toolDef = toolDefinitions.find((t) => t.id === 'completeCameo');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute(
        {},
        { ctx: { userData: { services: { sessionId: 'test-session' } } } }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No cameo in progress');
    });
  });

  // --------------------------------------------------------------------------
  // checkCameoOpportunity Tool
  // --------------------------------------------------------------------------

  describe('checkCameoOpportunity', () => {
    it('should suggest cameo for matching topic', async () => {
      vi.mocked(getCooldownStatus).mockReturnValue({
        isOnCooldown: false,
        remainingMs: 0,
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'checkCameoOpportunity');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute(
        {
          topic: 'I want to track my investing portfolio',
        },
        { ctx: { userData: { services: { sessionId: 'test-session' } } } }
      );

      expect(result.shouldCameo).toBe(true);
      expect(result.suggestedPersona).toBe('peter-john');
      expect(result.personaName).toBe('Peter');
    });

    it('should not suggest cameo for distressed user', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'checkCameoOpportunity');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute(
        {
          topic: 'Need to talk about stocks',
          userState: 'stressed',
        },
        { ctx: { userData: { services: { sessionId: 'test-session' } } } }
      );

      expect(result.shouldCameo).toBe(false);
      expect(result.reason).toContain('staying with you');
    });

    it('should not suggest during cooldown', async () => {
      vi.mocked(getCooldownStatus).mockReturnValue({
        isOnCooldown: true,
        remainingMs: 15000,
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'checkCameoOpportunity');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute(
        { topic: 'scheduling help' },
        { ctx: { userData: { services: { sessionId: 'test-session' } } } }
      );

      expect(result.shouldCameo).toBe(false);
      expect(result.reason).toContain('Cooldown');
    });

    it('should not suggest for unmatched topics', async () => {
      vi.mocked(getCooldownStatus).mockReturnValue({
        isOnCooldown: false,
        remainingMs: 0,
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'checkCameoOpportunity');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute(
        { topic: 'random unrelated topic xyz' },
        { ctx: { userData: { services: { sessionId: 'test-session' } } } }
      );

      expect(result.shouldCameo).toBe(false);
      expect(result.reason).toContain('No strong match');
    });
  });
});

