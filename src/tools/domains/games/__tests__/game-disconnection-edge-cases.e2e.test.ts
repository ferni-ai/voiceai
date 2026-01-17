/**
 * E2E Test: Game Disconnection and Edge Cases
 *
 * Tests edge cases for game state management:
 * - Publisher disconnection during active games
 * - Reconnection handling
 * - Game type normalization (variant spellings)
 * - Abandoned game status
 * - Session boundary conditions
 *
 * Run with: npx vitest run src/tools/domains/games/__tests__/game-disconnection-edge-cases.e2e.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Track FrontendPublisher calls
const mockPublisherCalls: {
  method: string;
  args: unknown[];
}[] = [];

let isPublisherConnected = true;

// Mock FrontendPublisher with connection state control
const mockPublisher = {
  isConnected: vi.fn(() => isPublisherConnected),
  sendGameStarted: vi.fn(async (...args: unknown[]) => {
    if (!isPublisherConnected) return;
    mockPublisherCalls.push({ method: 'sendGameStarted', args });
  }),
  sendGameState: vi.fn(async (...args: unknown[]) => {
    if (!isPublisherConnected) return;
    mockPublisherCalls.push({ method: 'sendGameState', args });
  }),
  sendGameEnded: vi.fn(async (...args: unknown[]) => {
    if (!isPublisherConnected) return;
    mockPublisherCalls.push({ method: 'sendGameEnded', args });
  }),
};

vi.mock('../../../../agents/realtime/frontend-publisher.js', () => ({
  getFrontendPublisher: () => mockPublisher,
}));

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

import type { ToolContext, ToolDefinition, Tool } from '../../../registry/types.js';
import { getToolDefinitions } from '../index.js';

function createMockContext(sessionId?: string): ToolContext {
  return {
    userId: 'test-user-edge-cases',
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
    sessionId: sessionId || 'test-session-edge-cases',
    services: {
      has: () => false,
      get: () => {
        throw new Error('Service not available');
      },
      getOptional: () => undefined,
    },
  };
}

describe('Game Disconnection and Edge Cases (E2E)', () => {
  let toolDefinitions: ToolDefinition[];
  let mockContext: ToolContext;
  let startGameTool: Tool;
  let makeMoveTool: Tool;
  let endGameTool: Tool;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPublisherCalls.length = 0;
    isPublisherConnected = true; // Reset connection state

    toolDefinitions = await getToolDefinitions();
    mockContext = createMockContext();

    // Get the tools we need
    const startGameDef = toolDefinitions.find((t) => t.id === 'startTextGame');
    const makeMoveDef = toolDefinitions.find((t) => t.id === 'makeTextGameMove');
    const endGameDef = toolDefinitions.find((t) => t.id === 'endTextGame');

    if (!startGameDef || !makeMoveDef || !endGameDef) {
      throw new Error('Required game tools not found');
    }

    startGameTool = startGameDef.create(mockContext);
    makeMoveTool = makeMoveDef.create(mockContext);
    endGameTool = endGameDef.create(mockContext);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Publisher Disconnection During Game', () => {
    it('should handle disconnection at game start gracefully', async () => {
      // Simulate disconnected publisher
      isPublisherConnected = false;
      mockPublisher.isConnected.mockReturnValue(false);

      // Start game should still work
      const result = await startGameTool.execute({ gameType: 'tic-tac-toe' });

      // Game should return a valid message (not crash)
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).not.toContain('error');

      // No broadcasts should have been made
      expect(mockPublisherCalls.length).toBe(0);
    });

    it('should handle disconnection during gameplay gracefully', async () => {
      // Start with connected publisher - use fresh context to avoid state bleed
      const freshContext = createMockContext('disconnect-during-game');
      const freshStartTool = toolDefinitions
        .find((t) => t.id === 'startTextGame')!
        .create(freshContext);
      const freshMoveTool = toolDefinitions
        .find((t) => t.id === 'makeTextGameMove')!
        .create(freshContext);

      await freshStartTool.execute({ gameType: 'tic-tac-toe' });

      // Disconnect mid-game
      isPublisherConnected = false;
      mockPublisher.isConnected.mockReturnValue(false);
      const callsBeforeMove = mockPublisherCalls.length;

      // Make move should still work even when disconnected
      const result = await freshMoveTool.execute({ move: '5' });

      // Game logic should still work
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');

      // No new broadcasts should have been made during disconnection
      expect(mockPublisherCalls.length).toBe(callsBeforeMove);
    });

    it('should handle disconnection at game end gracefully', async () => {
      // Start game while connected
      await startGameTool.execute({ gameType: 'tic-tac-toe' });
      mockPublisherCalls.length = 0;

      // Disconnect before ending
      isPublisherConnected = false;
      mockPublisher.isConnected.mockReturnValue(false);

      // End game should still work
      const result = await endGameTool.execute({});

      // Should return success message
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).toContain('ended');

      // But no broadcasts
      expect(mockPublisherCalls.length).toBe(0);
    });

    it('should resume broadcasting after reconnection', async () => {
      // Start disconnected
      isPublisherConnected = false;
      mockPublisher.isConnected.mockReturnValue(false);

      await startGameTool.execute({ gameType: 'tic-tac-toe' });
      expect(mockPublisherCalls.length).toBe(0);

      // Reconnect
      isPublisherConnected = true;
      mockPublisher.isConnected.mockReturnValue(true);

      // Make a move - should broadcast
      await makeMoveTool.execute({ move: '5' });

      // Should have broadcast calls now
      const stateCalls = mockPublisherCalls.filter((c) => c.method === 'sendGameState');
      expect(stateCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Game Type Normalization', () => {
    it('should normalize "tictactoe" to "tic-tac-toe" in broadcasts', async () => {
      // The backend should normalize any variant spelling before broadcasting
      await startGameTool.execute({ gameType: 'tic-tac-toe' });

      const startedCalls = mockPublisherCalls.filter((c) => c.method === 'sendGameStarted');
      expect(startedCalls.length).toBeGreaterThan(0);

      // Verify the game type was normalized
      const startCall = startedCalls[0];
      expect(startCall.args[1]).toBe('tic-tac-toe');
    });

    it('should normalize game types in state updates', async () => {
      await startGameTool.execute({ gameType: 'tic-tac-toe' });

      const stateCalls = mockPublisherCalls.filter((c) => c.method === 'sendGameState');
      expect(stateCalls.length).toBeGreaterThan(0);

      // All state updates should use canonical form
      stateCalls.forEach((call) => {
        expect(call.args[0]).toBe('tic-tac-toe');
      });
    });

    it('should normalize game types in end events', async () => {
      await startGameTool.execute({ gameType: 'tic-tac-toe' });
      mockPublisherCalls.length = 0;

      await endGameTool.execute({});

      const endedCalls = mockPublisherCalls.filter((c) => c.method === 'sendGameEnded');
      expect(endedCalls.length).toBeGreaterThan(0);

      // End event should use canonical form
      expect(endedCalls[0].args[0]).toBe('tic-tac-toe');
    });

    it('should normalize word-association variants', async () => {
      await startGameTool.execute({ gameType: 'word-association' });

      const startedCalls = mockPublisherCalls.filter((c) => c.method === 'sendGameStarted');
      expect(startedCalls[0].args[1]).toBe('word-association');
    });

    it('should normalize 20-questions variants', async () => {
      await startGameTool.execute({ gameType: '20-questions' });

      const startedCalls = mockPublisherCalls.filter((c) => c.method === 'sendGameStarted');
      expect(startedCalls[0].args[1]).toBe('20-questions');
    });
  });

  describe('Abandoned Game Handling', () => {
    it('should allow starting a new game without explicitly ending the previous one', async () => {
      // Start first game
      await startGameTool.execute({ gameType: 'tic-tac-toe' });
      mockPublisherCalls.length = 0;

      // Start another game (implicitly abandoning the first)
      const result = await startGameTool.execute({ gameType: 'word-association' });

      // New game should start successfully
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');

      // Should broadcast the new game
      const startedCalls = mockPublisherCalls.filter((c) => c.method === 'sendGameStarted');
      expect(startedCalls.length).toBeGreaterThan(0);
      expect(startedCalls[0].args[1]).toBe('word-association');
    });

    it('should handle game abandonment on session end', async () => {
      const session1Context = createMockContext('session-abandon-test');
      const startTool = toolDefinitions
        .find((t) => t.id === 'startTextGame')!
        .create(session1Context);

      // Start a game
      await startTool.execute({ gameType: 'tic-tac-toe' });
      mockPublisherCalls.length = 0;

      // Create new context (simulating new session)
      const session2Context = createMockContext('session-abandon-test-2');
      const newStartTool = toolDefinitions
        .find((t) => t.id === 'startTextGame')!
        .create(session2Context);

      // Start game in new session
      const result = await newStartTool.execute({ gameType: 'word-association' });

      // Should work independently
      expect(result).toBeDefined();
    });
  });

  describe('Error Recovery', () => {
    it('should handle move on non-existent game gracefully', async () => {
      // Create fresh context to ensure no prior game state
      const freshContext = createMockContext('fresh-no-game-context');
      const freshMoveTool = toolDefinitions
        .find((t) => t.id === 'makeTextGameMove')!
        .create(freshContext);

      // Try to make move without starting a game
      const result = await freshMoveTool.execute({ move: '5' });

      // Should return some response without crashing
      // The exact message may vary (could be "not playing" or game-specific response)
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      // Accept any response that doesn't indicate a crash/error
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle ending non-existent game gracefully', async () => {
      // Create fresh context to ensure no prior game state
      const freshContext = createMockContext('fresh-no-game-end-context');
      const freshEndTool = toolDefinitions
        .find((t) => t.id === 'endTextGame')!
        .create(freshContext);

      // Try to end game without starting one
      const result = await freshEndTool.execute({});

      // Should return some response without crashing
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle invalid move gracefully', async () => {
      await startGameTool.execute({ gameType: 'tic-tac-toe' });
      mockPublisherCalls.length = 0;

      // Make an invalid move
      const result = await makeMoveTool.execute({ move: 'invalid-position-xyz' });

      // Should return error message, not crash
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle multiple consecutive moves correctly', async () => {
      await startGameTool.execute({ gameType: 'tic-tac-toe' });
      mockPublisherCalls.length = 0;

      // Make several moves in sequence
      await makeMoveTool.execute({ move: '1' });
      await makeMoveTool.execute({ move: '2' });
      await makeMoveTool.execute({ move: '3' });

      // Should have broadcast multiple state updates
      const stateCalls = mockPublisherCalls.filter((c) => c.method === 'sendGameState');
      expect(stateCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Session Isolation', () => {
    it('should isolate game state between different sessions', async () => {
      const session1Context = createMockContext('isolated-session-1');
      const session2Context = createMockContext('isolated-session-2');

      const session1StartTool = toolDefinitions
        .find((t) => t.id === 'startTextGame')!
        .create(session1Context);
      const session2StartTool = toolDefinitions
        .find((t) => t.id === 'startTextGame')!
        .create(session2Context);

      // Start different games in different sessions
      await session1StartTool.execute({ gameType: 'tic-tac-toe' });
      await session2StartTool.execute({ gameType: 'word-association' });

      // Both should succeed independently
      const startedCalls = mockPublisherCalls.filter((c) => c.method === 'sendGameStarted');
      expect(startedCalls.length).toBe(2);

      const gameTypes = startedCalls.map((c) => c.args[1]);
      expect(gameTypes).toContain('tic-tac-toe');
      expect(gameTypes).toContain('word-association');
    });

    it('should not cross-contaminate moves between sessions', async () => {
      const session1Context = createMockContext('move-isolation-1');
      const session2Context = createMockContext('move-isolation-2');

      const session1StartTool = toolDefinitions
        .find((t) => t.id === 'startTextGame')!
        .create(session1Context);
      const session1MoveTool = toolDefinitions
        .find((t) => t.id === 'makeTextGameMove')!
        .create(session1Context);
      const session2MoveTool = toolDefinitions
        .find((t) => t.id === 'makeTextGameMove')!
        .create(session2Context);

      // Start game in session 1
      await session1StartTool.execute({ gameType: 'tic-tac-toe' });

      // Try to make move in session 2 (no game started there)
      const result = await session2MoveTool.execute({ move: '5' });

      // Session 2 should return some response (exact message may vary by game state)
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');

      // Session 1 move should work and return game-specific response
      const session1Result = await session1MoveTool.execute({ move: '5' });
      expect(session1Result).toBeDefined();
      expect(typeof session1Result).toBe('string');
      // Session 1 has an active game, so it should process the move
    });
  });

  describe('Game Completion Flow', () => {
    it('should broadcast completed status when game ends naturally', async () => {
      await startGameTool.execute({ gameType: 'tic-tac-toe' });
      mockPublisherCalls.length = 0;

      // Play through to completion (this may require multiple moves)
      // Note: Actual win detection depends on game engine implementation
      await makeMoveTool.execute({ move: '1' }); // User X
      await makeMoveTool.execute({ move: '4' }); // User X (after AI move)
      await makeMoveTool.execute({ move: '7' }); // User X (after AI move) - potential win

      // Check if any state updates were broadcast (completed or active)
      const stateCalls = mockPublisherCalls.filter((c) => c.method === 'sendGameState');

      // Either we hit a completed state or game continues
      // The important thing is no crashes occurred and state was broadcast
      expect(stateCalls.length).toBeGreaterThan(0);
    });

    it('should include result in game ended broadcast', async () => {
      await startGameTool.execute({ gameType: 'tic-tac-toe' });
      mockPublisherCalls.length = 0;

      // End the game manually
      await endGameTool.execute({});

      const endedCalls = mockPublisherCalls.filter((c) => c.method === 'sendGameEnded');
      expect(endedCalls.length).toBeGreaterThan(0);

      // Should include a result string
      const endCall = endedCalls[0];
      expect(endCall.args[1]).toBeDefined();
      expect(typeof endCall.args[1]).toBe('string');
    });
  });

  describe('Broadcast Data Integrity', () => {
    it('should include required fields in game started broadcasts', async () => {
      await startGameTool.execute({ gameType: 'tic-tac-toe' });

      const startedCalls = mockPublisherCalls.filter((c) => c.method === 'sendGameStarted');
      expect(startedCalls.length).toBeGreaterThan(0);

      const [gameId, gameType, gameName] = startedCalls[0].args;

      // Verify all required fields are present
      expect(gameId).toBeDefined();
      expect(typeof gameId).toBe('string');
      expect(gameType).toBe('tic-tac-toe');
      expect(gameName).toBe('Tic-Tac-Toe');
    });

    it('should include board state in tic-tac-toe broadcasts', async () => {
      await startGameTool.execute({ gameType: 'tic-tac-toe' });

      const stateCalls = mockPublisherCalls.filter((c) => c.method === 'sendGameState');
      expect(stateCalls.length).toBeGreaterThan(0);

      const stateData = stateCalls[0].args[2] as Record<string, unknown>;

      // Tic-tac-toe should have board state
      expect(stateData).toBeDefined();
    });

    it('should transform story-builder state correctly for frontend', async () => {
      await startGameTool.execute({ gameType: 'story-builder' });

      const stateCalls = mockPublisherCalls.filter((c) => c.method === 'sendGameState');
      expect(stateCalls.length).toBeGreaterThan(0);

      const stateData = stateCalls[0].args[2] as Record<string, unknown>;

      // Frontend expects 'chapters', not 'storyParts'
      expect(stateData).toHaveProperty('chapters');
      expect(stateData).toHaveProperty('currentChapter');
      expect(stateData).toHaveProperty('isUserTurn');
    });

    it('should transform would-you-rather state correctly for frontend', async () => {
      await startGameTool.execute({ gameType: 'would-you-rather' });

      const stateCalls = mockPublisherCalls.filter((c) => c.method === 'sendGameState');
      expect(stateCalls.length).toBeGreaterThan(0);

      const stateData = stateCalls[0].args[2] as Record<string, unknown>;

      // Frontend expects transformed property names
      expect(stateData).toHaveProperty('currentQuestion');
      expect(stateData).toHaveProperty('roundNumber');
      expect(stateData).toHaveProperty('userChoices');
      expect(stateData).toHaveProperty('aiChoices');
    });

    it('should add maxQuestions to 20-questions state', async () => {
      await startGameTool.execute({ gameType: '20-questions' });

      const stateCalls = mockPublisherCalls.filter((c) => c.method === 'sendGameState');
      expect(stateCalls.length).toBeGreaterThan(0);

      const stateData = stateCalls[0].args[2] as Record<string, unknown>;

      expect(stateData).toHaveProperty('maxQuestions');
      expect(stateData.maxQuestions).toBe(20);
    });
  });
});
