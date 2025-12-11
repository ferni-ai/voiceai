/**
 * Grief Domain Tools Tests
 *
 * Tests for grief processing, loss acknowledgment, transitions, and support tools.
 *
 * Run with: npx vitest run src/tools/domains/grief/__tests__/grief.test.ts
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
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ============================================================================
// IMPORTS
// ============================================================================

import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import { getToolDefinitions } from '../index.js';

// ============================================================================
// TEST UTILITIES
// ============================================================================

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

// ============================================================================
// TESTS
// ============================================================================

describe('Grief Domain Tools', () => {
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
    it('should load all grief tool definitions', async () => {
      expect(toolDefinitions).toBeDefined();
      expect(Array.isArray(toolDefinitions)).toBe(true);
      expect(toolDefinitions.length).toBeGreaterThan(0);
    });

    it('should have processGrief tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'processGrief');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('grief');
    });

    it('should have navigateGriefWave tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'navigateGriefWave');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('grief');
    });

    it('should have anniversarySupport tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'anniversarySupport');
      expect(tool).toBeDefined();
    });

    it('should have acknowledgeLoss tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'acknowledgeLoss');
      expect(tool).toBeDefined();
    });

    it('should have validateGrief tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'validateGrief');
      expect(tool).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Grief Processing
  // --------------------------------------------------------------------------

  describe('processGrief', () => {
    it('should process fresh grief with compassion', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'processGrief');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        lossType: 'death',
        whatWasLost: 'my grandmother',
        whereTheyAre: 'fresh',
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).toContain('grandmother');
      expect(result.length).toBeGreaterThan(100);
    });

    it('should handle wave grief appropriately', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'processGrief');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        lossType: 'relationship',
        whatWasLost: 'my marriage',
        whereTheyAre: 'waves',
      });

      expect(result).toContain('wave');
    });

    it('should address anticipatory grief', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'processGrief');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        lossType: 'health',
        whatWasLost: 'my health',
        whereTheyAre: 'anticipatory',
      });

      // Check for keywords in anticipatory grief response (case-insensitive)
      const resultLower = (result as string).toLowerCase();
      const hasAnticipatory =
        resultLower.includes('anticipatory') || resultLower.includes("hasn't fully happened");
      expect(hasAnticipatory).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Grief Wave Navigation
  // --------------------------------------------------------------------------

  describe('navigateGriefWave', () => {
    it('should provide support for overwhelming waves', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'navigateGriefWave');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        intensity: 'overwhelming',
        trigger: 'a song on the radio',
      });

      expect(result).toBeDefined();
      expect(result).toContain('wave');
      expect(result.length).toBeGreaterThan(50);
    });

    it('should handle heavy grief', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'navigateGriefWave');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        intensity: 'heavy',
      });

      expect(result).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Anniversary Support
  // --------------------------------------------------------------------------

  describe('anniversarySupport', () => {
    it('should support approaching anniversaries', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'anniversarySupport');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        occasion: "my father's passing",
        approaching: true,
        howLongAgo: '2 years',
      });

      expect(result).toContain('anniversary');
      expect(result).toContain('father');
    });

    it('should support actual anniversary day', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'anniversarySupport');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        occasion: "my mother's death",
        approaching: false,
        howLongAgo: '5 years',
      });

      expect(result).toContain('Today');
    });
  });

  // --------------------------------------------------------------------------
  // Loss Acknowledgment
  // --------------------------------------------------------------------------

  describe('acknowledgeLoss', () => {
    it('should acknowledge disenfranchised grief', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'acknowledgeLoss');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        loss: 'my pet',
        whyItMayNotBeRecognized: "people say 'it was just a dog'",
      });

      expect(result).toContain('real');
      expect(result).toContain('valid');
    });
  });

  // --------------------------------------------------------------------------
  // Remember Loved One
  // --------------------------------------------------------------------------

  describe('rememberLoved', () => {
    it('should help remember essence of loved one', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'rememberLoved');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        personName: 'John',
        relationship: 'father',
        whatToRemember: 'their-essence',
      });

      expect(result).toContain('John');
    });

    it('should prompt for specific memories', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'rememberLoved');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        personName: 'Sarah',
        relationship: 'sister',
        whatToRemember: 'specific-memory',
      });

      expect(result).toContain('memory');
    });
  });

  // --------------------------------------------------------------------------
  // Transitions
  // --------------------------------------------------------------------------

  describe('navigateTransition', () => {
    it('should support divorce transition', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'navigateTransition');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        transition: 'divorce',
        stage: 'beginning',
      });

      expect(result).toBeDefined();
      expect(result).toContain('transition');
    });

    it('should address middle stage of transition', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'navigateTransition');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        transition: 'retirement',
        stage: 'middle',
      });

      expect(result).toContain('neutral zone');
    });
  });

  // --------------------------------------------------------------------------
  // Validation
  // --------------------------------------------------------------------------

  describe('validateGrief', () => {
    it('should validate against "be strong" message', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'validateGrief');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        dismissiveMessage: 'be-strong',
      });

      expect(result).toContain('strong');
      // Response validates the grief without using the word "valid"
      expect(result).toContain('weakness');
    });

    it('should validate against "time heals" message', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'validateGrief');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        dismissiveMessage: 'time-heals',
      });

      expect(result).toContain('Time');
    });
  });

  // --------------------------------------------------------------------------
  // Companionship
  // --------------------------------------------------------------------------

  describe('companionInGrief', () => {
    it('should offer to talk', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'companionInGrief');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        whatTheyNeed: 'talk',
      });

      expect(result).toContain('listen');
    });

    it('should offer silence', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'companionInGrief');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        whatTheyNeed: 'silence',
      });

      expect(result).toContain('quiet');
    });
  });

  // --------------------------------------------------------------------------
  // Content Validation
  // --------------------------------------------------------------------------

  describe('Content Validation', () => {
    it('should not contain placeholder text', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'processGrief');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        lossType: 'death',
        whatWasLost: 'my friend',
        whereTheyAre: 'fresh',
      });

      expect(result).not.toContain('TODO');
      expect(result).not.toContain('placeholder');
      expect(result).not.toContain('undefined');
    });

    it('should be compassionate and supportive', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'navigateGriefWave');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        intensity: 'overwhelming',
      });

      // Should contain supportive language
      const hasSupport =
        result.includes("I'm here") || result.includes('here') || result.includes('pass');
      expect(hasSupport).toBe(true);
    });
  });
});
