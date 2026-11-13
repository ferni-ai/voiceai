/**
 * Better-Than-Human Wrap-Up & Disconnection E2E Tests
 *
 * Checks the wrap-up tools (wrapUp, endConversation, gracefulExit) and
 * the conversation state that suggests wrapping up.
 *
 * @module wrap-up-e2e
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

// Mock logger - createLogger can be called with or without options
vi.mock('../utils/safe-logger.js', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  // child returns a new mock logger
  mockLogger.child.mockReturnValue(mockLogger);
  return {
    getLogger: () => mockLogger,
    createLogger: () => mockLogger,
  };
});

// Mock frontend signal
const mockSendFrontendSignal = vi.fn(async () => true);
vi.mock('../services/frontend-signal.js', () => ({
  sendFrontendSignal: mockSendFrontendSignal,
  isFrontendSignalReady: () => true,
}));

// Mock LiveKit
vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config: { execute: unknown }) => ({
      ...config,
      execute: config.execute,
    })),
  },
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock DJ Controller (replaced dj-integration)
vi.mock('../audio/dj-controller.js', () => ({
  getDJController: () => ({
    getState: () => ({ state: 'idle', currentTrack: null }),
    isMusicActive: () => false,
    dispatch: () => {},
    on: () => {},
  }),
  resetDJController: () => {},
}));

// ============================================================================
// IMPORTS (after mocks)
// ============================================================================

import { createConversationTools } from '../tools/domains/conversation/conversation-tools.js';
import {
  ConversationStateManager,
  getConversationState,
  endConversation,
} from '../services/conversation-state.js';

// ============================================================================
// TEST SUITES
// ============================================================================

describe('Better-Than-Human Wrap-Up E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up any test sessions
    try {
      endConversation('test-session');
    } catch {
      // Ignore cleanup errors
    }
  });

  // ==========================================================================
  // PHASE 4: CONVERSATION TOOLS
  // ==========================================================================

  describe('Phase 4: Conversation Tools', () => {
    describe('wrapUp tool', () => {
      it('should send wrap_up signal to frontend', async () => {
        const tools = createConversationTools();
        const mockContext = {
          ctx: {
            userData: { name: 'TestUser', services: { sessionId: 'session-1' } },
          },
        };

        await tools.wrapUp.execute(
          { sentiment: 'warm' },
          // @ts-expect-error - Partial context for testing
          mockContext
        );

        expect(mockSendFrontendSignal).toHaveBeenCalledWith(
          'wrap_up',
          expect.objectContaining({
            sentiment: 'warm',
          }),
          'session-1'
        );
      });

      it('should return warm message for warm sentiment', async () => {
        const tools = createConversationTools();
        const result = await tools.wrapUp.execute(
          { sentiment: 'warm' },
          // @ts-expect-error - Partial context for testing
          { ctx: { userData: { services: { sessionId: 'session-1' } } } }
        );

        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      });

      it('should return encouraging message for encouraging sentiment', async () => {
        const tools = createConversationTools();
        const result = await tools.wrapUp.execute(
          { sentiment: 'encouraging' },
          // @ts-expect-error - Partial context for testing
          { ctx: { userData: { services: { sessionId: 'session-1' } } } }
        );

        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      });
    });

    describe('endConversation tool', () => {
      it('should send conversation_end signal to frontend', async () => {
        const tools = createConversationTools();

        await tools.endConversation.execute(
          { reason: 'goodbye_complete' },
          // @ts-expect-error - Partial context for testing
          { ctx: { userData: { services: { sessionId: 'session-1' } } } }
        );

        expect(mockSendFrontendSignal).toHaveBeenCalledWith(
          'conversation_end',
          expect.objectContaining({
            reason: 'goodbye_complete',
            disconnectDelay: expect.any(Number),
          }),
          'session-1'
        );
      });

      it('should handle natural_end reason', async () => {
        const tools = createConversationTools();

        await tools.endConversation.execute(
          { reason: 'natural_end' },
          // @ts-expect-error - Partial context for testing
          { ctx: { userData: { services: { sessionId: 'session-1' } } } }
        );

        // natural_end gets converted to goodbye_complete for frontend
        expect(mockSendFrontendSignal).toHaveBeenCalledWith(
          'conversation_end',
          expect.objectContaining({
            reason: 'goodbye_complete',
          }),
          'session-1'
        );
      });
    });

    describe('gracefulExit tool', () => {
      it('should send agent_exit reason for harassment', async () => {
        const tools = createConversationTools();

        await tools.gracefulExit.execute(
          { reason: 'harassment' },
          // @ts-expect-error - Partial context for testing
          { ctx: { userData: { services: { sessionId: 'session-1' } } } }
        );

        expect(mockSendFrontendSignal).toHaveBeenCalledWith(
          'conversation_end',
          expect.objectContaining({
            reason: 'agent_exit',
            exitType: 'harassment',
          }),
          'session-1'
        );
      });
    });
  });

  // ==========================================================================
  // PHASE 5: CONVERSATION STATE TRACKING
  // ==========================================================================

  describe('Phase 5: Conversation State Tracking', () => {
    let stateManager: ConversationStateManager;

    beforeEach(() => {
      stateManager = new ConversationStateManager('test-session', 'test-user', 'ferni');
    });

    it('should track userWantsToLeave state', () => {
      stateManager.markUserWantsToLeave();

      const flow = stateManager.getFlowContext();
      expect(flow.userWantsToLeave).toBe(true);
    });

    it('should suggest wrap-up when user wants to leave', () => {
      stateManager.markUserWantsToLeave();

      const result = stateManager.shouldWrapUp();
      expect(result.should).toBe(true);
      expect(result.reasons).toContain('User indicated they need to go');
    });

    it('should suggest wrap-up after many turns (50+)', () => {
      for (let i = 0; i < 51; i++) {
        stateManager.incrementTurn();
      }

      const result = stateManager.shouldWrapUp();
      expect(result.should).toBe(true);
      expect(result.reasons).toContain('Many turns (50+)');
    });

    it('should include wrap-up suggestion in LLM summary', () => {
      stateManager.markUserWantsToLeave();

      const summary = stateManager.getSummaryForLLM();
      expect(summary).toContain('Consider wrapping up');
    });
  });
});
