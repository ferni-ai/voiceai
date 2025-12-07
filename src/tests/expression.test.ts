/**
 * Expression Tool Tests
 *
 * Tests for visual emoji expression functionality:
 * - PERSONA_EXPRESSIONS configuration
 * - setExpressionAgent function
 * - Expression tool validation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../utils/safe-logger.js', () => ({
  getLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock @livekit/agents
vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      ...config,
      execute: config.execute,
    })),
  },
  log: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import {
  PERSONA_EXPRESSIONS,
  setExpressionAgent,
  createExpressionTool,
  expressionTools,
} from '../tools/expression.js';

describe('Expression Tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default agent
    setExpressionAgent('jack-b');
  });

  describe('PERSONA_EXPRESSIONS', () => {
    it('should have jack-b persona defined', () => {
      expect(PERSONA_EXPRESSIONS['jack-b']).toBeDefined();
      expect(PERSONA_EXPRESSIONS['jack-b'].signature).toBe('☕');
    });

    it('should have nayan-patel persona defined', () => {
      expect(PERSONA_EXPRESSIONS['nayan-patel']).toBeDefined();
      expect(PERSONA_EXPRESSIONS['nayan-patel'].signature).toBe('📈');
    });

    it('should have peter-john persona defined', () => {
      expect(PERSONA_EXPRESSIONS['peter-john']).toBeDefined();
      expect(PERSONA_EXPRESSIONS['peter-john'].signature).toBe('🔥');
    });

    it('should have comm-specialist persona defined', () => {
      expect(PERSONA_EXPRESSIONS['comm-specialist']).toBeDefined();
      expect(PERSONA_EXPRESSIONS['comm-specialist'].signature).toBe('📧');
    });

    it('should have spend-save persona defined', () => {
      expect(PERSONA_EXPRESSIONS['spend-save']).toBeDefined();
      expect(PERSONA_EXPRESSIONS['spend-save'].signature).toBe('💰');
    });

    it('should have event-planner persona defined', () => {
      expect(PERSONA_EXPRESSIONS['event-planner']).toBeDefined();
      expect(PERSONA_EXPRESSIONS['event-planner'].signature).toBe('🎉');
    });

    it('should have available emojis array for each persona', () => {
      Object.values(PERSONA_EXPRESSIONS).forEach((persona) => {
        expect(Array.isArray(persona.available)).toBe(true);
        expect(persona.available.length).toBeGreaterThan(0);
      });
    });

    it('should have descriptions for available emojis', () => {
      Object.values(PERSONA_EXPRESSIONS).forEach((persona) => {
        expect(typeof persona.descriptions).toBe('object');
        // Each available emoji should have a description
        persona.available.forEach((emoji) => {
          expect(persona.descriptions[emoji as keyof typeof persona.descriptions]).toBeDefined();
        });
      });
    });

    it('should include signature emoji in available list', () => {
      Object.values(PERSONA_EXPRESSIONS).forEach((persona) => {
        expect(persona.available).toContain(persona.signature);
      });
    });
  });

  describe('setExpressionAgent', () => {
    it('should set valid agent', () => {
      // setExpressionAgent modifies internal state
      // We can verify by checking that createExpressionTool uses the right persona
      setExpressionAgent('peter-john');

      const tools = createExpressionTool();
      // Can't directly test internal state, but function shouldn't throw
      expect(tools).toBeDefined();
    });

    it('should ignore invalid agent silently', () => {
      // Should not throw for invalid agent
      expect(() => setExpressionAgent('invalid-agent')).not.toThrow();
    });

    it('should work with all valid persona IDs', () => {
      const validIds = [
        'jack-b',
        'nayan-patel',
        'peter-john',
        'comm-specialist',
        'spend-save',
        'event-planner',
      ];

      validIds.forEach((id) => {
        expect(() => setExpressionAgent(id)).not.toThrow();
      });
    });
  });

  describe('createExpressionTool', () => {
    it('should return express and expressSignature tools', () => {
      const tools = createExpressionTool();

      expect(tools.express).toBeDefined();
      expect(tools.expressSignature).toBeDefined();
    });

    it('should have execute functions on tools', () => {
      const tools = createExpressionTool();

      expect(typeof tools.express.execute).toBe('function');
      expect(typeof tools.expressSignature.execute).toBe('function');
    });
  });

  describe('express tool execution', () => {
    it('should return expressed emoji when valid', async () => {
      setExpressionAgent('jack-b');
      const tools = createExpressionTool();

      const result = await tools.express.execute({ emoji: '💡', meaning: 'Great idea' });

      expect(result.expressed).toBe('💡');
      expect(result.meaning).toBe('Great idea');
    });

    it('should include _sendToFrontend data', async () => {
      setExpressionAgent('jack-b');
      const tools = createExpressionTool();

      const result = await tools.express.execute({ emoji: '💡', meaning: 'insight' });

      expect(result._sendToFrontend).toBeDefined();
      expect(result._sendToFrontend.type).toBe('expression');
      expect(result._sendToFrontend.emoji).toBe('💡');
      expect(result._sendToFrontend.timestamp).toBeDefined();
    });

    it('should fall back to signature emoji for invalid emoji', async () => {
      setExpressionAgent('jack-b');
      const tools = createExpressionTool();

      const result = await tools.express.execute({ emoji: '🤖', meaning: 'robot' });

      // jack-b signature is ☕
      expect(result.expressed).toBe('☕');
    });

    it('should use description when meaning not provided', async () => {
      setExpressionAgent('jack-b');
      const tools = createExpressionTool();

      const result = await tools.express.execute({ emoji: '💡' });

      expect(result.meaning).toBe('Great idea, insight');
    });
  });

  describe('expressSignature tool execution', () => {
    it('should return persona signature emoji', async () => {
      setExpressionAgent('jack-b');
      const tools = createExpressionTool();

      const result = await tools.expressSignature.execute({});

      expect(result.expressed).toBe('☕');
    });

    it('should use custom meaning when provided', async () => {
      setExpressionAgent('peter-john');
      const tools = createExpressionTool();

      const result = await tools.expressSignature.execute({ meaning: 'Hello!' });

      expect(result.expressed).toBe('🔥');
      expect(result.meaning).toBe('Hello!');
    });

    it('should include _sendToFrontend data', async () => {
      setExpressionAgent('nayan-patel');
      const tools = createExpressionTool();

      const result = await tools.expressSignature.execute({});

      expect(result._sendToFrontend).toBeDefined();
      expect(result._sendToFrontend.type).toBe('expression');
      expect(result._sendToFrontend.emoji).toBe('📈');
    });
  });

  describe('expressionTools export', () => {
    it('should export setAgent function', () => {
      expect(expressionTools.setAgent).toBe(setExpressionAgent);
    });

    it('should export createTools function', () => {
      expect(expressionTools.createTools).toBe(createExpressionTool);
    });

    it('should export PERSONA_EXPRESSIONS', () => {
      expect(expressionTools.PERSONA_EXPRESSIONS).toBe(PERSONA_EXPRESSIONS);
    });
  });
});
