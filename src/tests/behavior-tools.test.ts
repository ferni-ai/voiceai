/**
 * Behavior Tools Tests
 *
 * Tests the LLM-callable behavior tools that enable the bidirectional
 * behavior loop where the LLM can:
 * - Shift into different presence modes
 * - Control pacing and pauses
 * - Show visible processing
 * - Hold intentional silence
 * - Express non-verbal presence
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
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
      // Wrap execute to provide mock context as second parameter
      execute: async (params: Record<string, unknown>) => {
        const mockToolCtx = { ctx: { userData: {} } };
        return config.execute(params, mockToolCtx);
      },
    })),
  },
}));

vi.mock('../agents/realtime/behavior-event-dispatcher.js', () => ({
  createModeShiftSignal: vi.fn((mode, reason) => ({
    type: 'mode_shift',
    mode,
    reason,
    timestamp: Date.now(),
  })),
  createPacingChangeSignal: vi.fn((pacing, reason) => ({
    type: 'pacing_change',
    pacing,
    reason,
    timestamp: Date.now(),
  })),
  createHoldSpaceSignal: vi.fn((duration, reason) => ({
    type: 'hold_space',
    duration,
    reason,
    timestamp: Date.now(),
  })),
  createProcessingSignal: vi.fn((isStart, expression) => ({
    type: isStart ? 'processing_start' : 'processing_end',
    expression,
    timestamp: Date.now(),
  })),
  emitBehaviorSignal: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../intelligence/processing-intelligence.js', () => ({
  composeProcessingExpression: vi.fn(() => ({
    phrase: 'Let me think about that...',
    prePause: 200,
    postPause: 300,
  })),
  formatProcessingAsSSML: vi.fn(
    () => '<break time="200ms"/>Let me think about that...<break time="300ms"/>'
  ),
}));

// Import after mocks
import type { ToolContext, ToolDefinition } from '../tools/registry/types.js';
import { getToolDefinitions, behaviorToolDefinitions } from '../tools/domains/behavior/index.js';

describe('Behavior Tools', () => {
  let mockContext: ToolContext;
  let tools: ToolDefinition[];

  beforeEach(async () => {
    vi.clearAllMocks();

    mockContext = {
      userId: 'test-user-123',
      agentId: 'ferni',
      agentDisplayName: 'Ferni',
      services: {
        has: () => false,
        get: () => {
          throw new Error('Not available');
        },
        getOptional: () => undefined,
      },
    };

    tools = await getToolDefinitions();
  });

  describe('Tool Loading', () => {
    it('should load all behavior tools', async () => {
      expect(tools.length).toBe(5);
    });

    it('should have shiftMode tool', () => {
      const tool = tools.find((t) => t.id === 'shiftMode');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('behavior');
    });

    it('should have adjustPacing tool', () => {
      const tool = tools.find((t) => t.id === 'adjustPacing');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('behavior');
    });

    it('should have processing tool', () => {
      const tool = tools.find((t) => t.id === 'processing');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('behavior');
    });

    it('should have holdSpace tool', () => {
      const tool = tools.find((t) => t.id === 'holdSpace');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('behavior');
    });

    it('should have expressPresence tool', () => {
      const tool = tools.find((t) => t.id === 'expressPresence');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('behavior');
    });

    it('should all be in core category', () => {
      for (const tool of tools) {
        expect(tool.category).toBe('core');
      }
    });
  });

  describe('Tool Creation', () => {
    it('should create shiftMode tool instance', () => {
      const toolDef = tools.find((t) => t.id === 'shiftMode')!;
      const tool = toolDef.create(mockContext);

      expect(tool).toBeDefined();
      expect(tool.description).toBeDefined();
    });

    it('should create adjustPacing tool instance', () => {
      const toolDef = tools.find((t) => t.id === 'adjustPacing')!;
      const tool = toolDef.create(mockContext);

      expect(tool).toBeDefined();
      expect(tool.description).toBeDefined();
    });

    it('should create processing tool instance', () => {
      const toolDef = tools.find((t) => t.id === 'processing')!;
      const tool = toolDef.create(mockContext);

      expect(tool).toBeDefined();
      expect(tool.description).toBeDefined();
    });

    it('should create holdSpace tool instance', () => {
      const toolDef = tools.find((t) => t.id === 'holdSpace')!;
      const tool = toolDef.create(mockContext);

      expect(tool).toBeDefined();
      expect(tool.description).toBeDefined();
    });

    it('should create expressPresence tool instance', () => {
      const toolDef = tools.find((t) => t.id === 'expressPresence')!;
      const tool = toolDef.create(mockContext);

      expect(tool).toBeDefined();
      expect(tool.description).toBeDefined();
    });
  });

  describe('shiftMode execution', () => {
    it('should execute successfully with valid mode', async () => {
      const toolDef = tools.find((t) => t.id === 'shiftMode')!;
      const tool = toolDef.create(mockContext);

      const result = await tool.execute({ mode: 'presence', reason: 'Test' });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.mode).toBe('presence');
    });

    it('should return SSML for mode', async () => {
      const toolDef = tools.find((t) => t.id === 'shiftMode')!;
      const tool = toolDef.create(mockContext);

      const result = await tool.execute({ mode: 'deep_listening' });

      expect(result.ssml).toBeDefined();
      expect(result.ssml).toContain('<');
    });
  });

  describe('adjustPacing execution', () => {
    it('should execute successfully with speed', async () => {
      const toolDef = tools.find((t) => t.id === 'adjustPacing')!;
      const tool = toolDef.create(mockContext);

      const result = await tool.execute({ speed: 'slower' });

      expect(result.success).toBe(true);
      expect(result.speed).toBe('slower');
    });

    it('should handle pauses parameter', async () => {
      const toolDef = tools.find((t) => t.id === 'adjustPacing')!;
      const tool = toolDef.create(mockContext);

      const result = await tool.execute({ speed: 'normal', pauses: 'longer' });

      expect(result.pauses).toBe('longer');
    });
  });

  describe('processing execution', () => {
    it('should execute successfully with type', async () => {
      const toolDef = tools.find((t) => t.id === 'processing')!;
      const tool = toolDef.create(mockContext);

      const result = await tool.execute({ type: 'thinking' });

      expect(result.success).toBe(true);
      expect(result.phrase).toBeDefined();
      expect(result.ssml).toBeDefined();
    });

    it('should return pause values', async () => {
      const toolDef = tools.find((t) => t.id === 'processing')!;
      const tool = toolDef.create(mockContext);

      const result = await tool.execute({ type: 'emotional', weight: 'heavy' });

      expect(result.prePause).toBeGreaterThanOrEqual(0);
      expect(result.postPause).toBeGreaterThanOrEqual(0);
    });
  });

  describe('holdSpace execution', () => {
    it('should execute successfully with duration', async () => {
      const toolDef = tools.find((t) => t.id === 'holdSpace')!;
      const tool = toolDef.create(mockContext);

      const result = await tool.execute({ duration: 'medium' });

      expect(result.success).toBe(true);
      expect(result.duration).toBe(5000); // Returns milliseconds
      expect(result.signal).toBeDefined();
    });

    it('should return SSML with break tag', async () => {
      const toolDef = tools.find((t) => t.id === 'holdSpace')!;
      const tool = toolDef.create(mockContext);

      const result = await tool.execute({ duration: 'brief' });

      expect(result.ssml).toContain('<break');
      expect(result.ssml).toContain('3000ms');
    });
  });

  describe('expressPresence execution', () => {
    it('should execute successfully with type', async () => {
      const toolDef = tools.find((t) => t.id === 'expressPresence')!;
      const tool = toolDef.create(mockContext);

      const result = await tool.execute({ type: 'breath' });

      expect(result.success).toBe(true);
      expect(result.type).toBe('breath');
    });

    it('should return SSML for presence type', async () => {
      const toolDef = tools.find((t) => t.id === 'expressPresence')!;
      const tool = toolDef.create(mockContext);

      const result = await tool.execute({ type: 'hum' });

      expect(result.ssml).toBeDefined();
    });
  });

  describe('Legacy exports', () => {
    it('should export behaviorToolDefinitions for backwards compatibility', () => {
      expect(behaviorToolDefinitions).toBeDefined();
      expect(behaviorToolDefinitions.shiftMode).toBeDefined();
      expect(behaviorToolDefinitions.adjustPacing).toBeDefined();
      expect(behaviorToolDefinitions.processing).toBeDefined();
      expect(behaviorToolDefinitions.holdSpace).toBeDefined();
      expect(behaviorToolDefinitions.expressPresence).toBeDefined();
    });
  });
});
