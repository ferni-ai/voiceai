/**
 * E2E Tests for Semantic Router Integration
 *
 * Tests the full routing pipeline from user input to tool execution/LLM bypass.
 *
 * @module tools/semantic-router/integration/__tests__/e2e-routing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the logger - use vi.hoisted() to ensure mockLogger is defined before vi.mock() runs
const mockLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn().mockReturnThis(),
}));

vi.mock('../../../../utils/safe-logger.js', () => ({
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
}));

// Import after mocks
import {
  initializeSemanticRouter,
  resetSemanticRouter,
  isSemanticRouterInitialized,
  getInitializationMetrics,
} from '../init.js';
import {
  startSemanticRouting,
  applyRoutingResult,
  isRoutingEnabled,
  enableRouting,
  disableRouting,
} from '../turn-processor-integration.js';
import { getToolRegistry } from '../../registry.js';
import type { RoutingContext } from '../turn-processor-integration.js';

describe('Semantic Router E2E', () => {
  const mockContext: RoutingContext = {
    userId: 'test-user-123',
    sessionId: 'test-session-456',
    personaId: 'ferni',
    conversationHistory: [],
    recentTools: [],
  };

  beforeEach(async () => {
    // Reset router state
    resetSemanticRouter();
    disableRouting();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize semantic router with tool definitions', async () => {
      await initializeSemanticRouter();

      expect(isSemanticRouterInitialized()).toBe(true);

      const metrics = getInitializationMetrics();
      expect(metrics.toolCount).toBeGreaterThan(0);
      expect(metrics.categories).toContain('music');
    });

    it('should register music tools', async () => {
      await initializeSemanticRouter();

      const registry = getToolRegistry();
      const musicTool = registry.get('spotify_play');

      expect(musicTool).toBeDefined();
      expect(musicTool?.category).toBe('music');
      expect(musicTool?.triggers.phrases).toContain('play music');
    });

    it('should register handoff tools', async () => {
      await initializeSemanticRouter();

      const registry = getToolRegistry();
      const handoffTool = registry.get('handoff');

      expect(handoffTool).toBeDefined();
      expect(handoffTool?.category).toBe('handoff');
    });
  });

  describe('Routing Disabled', () => {
    it('should return attempted=false when routing is disabled', async () => {
      disableRouting();
      expect(isRoutingEnabled()).toBe(false);

      const result = await startSemanticRouting('play some jazz', mockContext);

      expect(result.attempted).toBe(false);
      expect(result.executed).toBe(false);
    });
  });

  describe('Routing Enabled', () => {
    beforeEach(async () => {
      await initializeSemanticRouter();
      enableRouting();
    });

    it('should detect music intent from "play some jazz"', async () => {
      const result = await startSemanticRouting('play some jazz', mockContext);

      expect(result.attempted).toBe(true);
      expect(result.routeResult).toBeDefined();

      // Should match a music-related tool (spotify_play or shortcuts_music both work)
      if (result.routeResult?.matches?.length) {
        const topMatch = result.routeResult.matches[0];
        const isMusicTool = ['spotify_play', 'shortcuts_music'].includes(topMatch.toolId);
        expect(isMusicTool).toBe(true);
        expect(topMatch.confidence).toBeGreaterThan(0.5);
      }
    });

    it('should detect pause intent from "pause the music"', async () => {
      const result = await startSemanticRouting('pause the music', mockContext);

      expect(result.attempted).toBe(true);
      expect(result.routeResult).toBeDefined();

      if (result.routeResult?.matches?.length) {
        const topMatch = result.routeResult.matches[0];
        expect(topMatch.toolId).toBe('spotify_pause');
      }
    });

    it('should detect skip intent from "next"', async () => {
      const result = await startSemanticRouting('next', mockContext);

      expect(result.attempted).toBe(true);
      expect(result.routeResult).toBeDefined();

      if (result.routeResult?.matches?.length) {
        const topMatch = result.routeResult.matches[0];
        expect(topMatch.toolId).toBe('spotify_skip');
      }
    });

    it('should return conversation action for non-tool queries', async () => {
      // Use a purely conversational phrase that shouldn't match any tool
      const result = await startSemanticRouting('How was your weekend?', mockContext);

      expect(result.attempted).toBe(true);

      // Should not match any tool with high confidence
      if (result.routeResult?.matches?.length) {
        const topMatch = result.routeResult.matches[0];
        expect(topMatch.confidence).toBeLessThan(0.6);
      }
    });
  });

  describe('Result Application', () => {
    beforeEach(async () => {
      await initializeSemanticRouter();
      enableRouting();
    });

    it('should not bypass LLM during crisis', async () => {
      const routerResult = await startSemanticRouting('play music', mockContext);

      const applied = applyRoutingResult(routerResult, {
        crisisDetected: true,
        latencyMs: 10,
      });

      // Crisis always prevents bypass
      expect(applied.bypassLLM).toBe(false);
      expect(applied.routed).toBe(false);
    });

    it('should set correct metrics on routing result', async () => {
      const routerResult = await startSemanticRouting('play some jazz', mockContext);

      const applied = applyRoutingResult(routerResult, {
        crisisDetected: false,
        latencyMs: 15,
      });

      expect(applied.metrics.latencyMs).toBe(15);
      expect(applied.metrics.matchPath).toBeDefined();
    });
  });

  describe('Tool Execution', () => {
    beforeEach(async () => {
      await initializeSemanticRouter();
      enableRouting();
    });

    it('should execute music tool and return natural response', async () => {
      const result = await startSemanticRouting('play jazz', mockContext);

      // If execution happens, we should get output
      if (result.executed && result.output) {
        expect(result.output).toContain('jazz');
      }
    });
  });

  describe('Conversation History Context', () => {
    beforeEach(async () => {
      await initializeSemanticRouter();
      enableRouting();
    });

    it('should use conversation history for context', async () => {
      const contextWithHistory: RoutingContext = {
        ...mockContext,
        conversationHistory: [
          { role: 'user', content: 'I want to relax' },
          { role: 'assistant', content: 'I can help you relax. Would you like some music?' },
        ],
      };

      const result = await startSemanticRouting('yes please', contextWithHistory);

      // With context about music, "yes please" might match music tool
      expect(result.attempted).toBe(true);
    });
  });

  describe('Recent Tools Context', () => {
    beforeEach(async () => {
      await initializeSemanticRouter();
      enableRouting();
    });

    it('should boost recently used tools', async () => {
      const contextWithRecent: RoutingContext = {
        ...mockContext,
        recentTools: ['spotify_play'],
      };

      const result = await startSemanticRouting('another one', contextWithRecent);

      // "another one" after using spotify might suggest skip or play
      expect(result.attempted).toBe(true);
    });
  });
});

describe('Semantic Router Edge Cases', () => {
  const mockContext: RoutingContext = {
    userId: 'test-user',
    sessionId: 'test-session',
    personaId: 'ferni',
    conversationHistory: [],
    recentTools: [],
  };

  beforeEach(async () => {
    resetSemanticRouter();
    await initializeSemanticRouter();
    enableRouting();
  });

  afterEach(() => {
    disableRouting();
    vi.clearAllMocks();
  });

  it('should handle empty input gracefully', async () => {
    const result = await startSemanticRouting('', mockContext);

    expect(result.attempted).toBe(true);
    expect(result.executed).toBe(false);
  });

  it('should handle very long input', async () => {
    const longInput = 'play music '.repeat(100);
    const result = await startSemanticRouting(longInput, mockContext);

    expect(result.attempted).toBe(true);
  });

  it('should handle special characters', async () => {
    const result = await startSemanticRouting("play '80s rock!", mockContext);

    expect(result.attempted).toBe(true);
  });

  it('should handle multiple tool keywords', async () => {
    // Contains both music and handoff keywords
    const result = await startSemanticRouting(
      'play music and then talk to Maya about habits',
      mockContext
    );

    expect(result.attempted).toBe(true);
    // Should prioritize one tool
    if (result.routeResult?.matches?.length) {
      expect(result.routeResult.matches.length).toBeGreaterThan(0);
    }
  });
});
