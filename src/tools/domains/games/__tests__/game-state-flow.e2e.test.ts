/**
 * E2E Test: Game State Broadcasting Flow
 *
 * Tests the complete flow from game tools → FrontendPublisher → game board UI events.
 * Verifies that game state changes are properly broadcast to the frontend.
 *
 * Run with: npx vitest run src/tools/domains/games/__tests__/game-state-flow.e2e.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Track FrontendPublisher calls
const mockPublisherCalls: {
  method: string;
  args: unknown[];
}[] = [];

// Mock FrontendPublisher
const mockPublisher = {
  isConnected: vi.fn(() => true),
  sendGameStarted: vi.fn(async (...args: unknown[]) => {
    mockPublisherCalls.push({ method: 'sendGameStarted', args });
  }),
  sendGameState: vi.fn(async (...args: unknown[]) => {
    mockPublisherCalls.push({ method: 'sendGameState', args });
  }),
  sendGameEnded: vi.fn(async (...args: unknown[]) => {
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
    userId: 'test-user-e2e',
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
    sessionId: sessionId || 'test-session-e2e',
    services: {
      has: () => false,
      get: () => {
        throw new Error('Service not available');
      },
      getOptional: () => undefined,
    },
  };
}

describe('Game State Broadcasting Flow (E2E)', () => {
  let toolDefinitions: ToolDefinition[];
  let mockContext: ToolContext;
  let startGameTool: Tool;
  let makeMoveTool: Tool;
  let endGameTool: Tool;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPublisherCalls.length = 0;

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

  describe('Tic-Tac-Toe Game Flow', () => {
    it('should broadcast game started when starting tic-tac-toe', async () => {
      await startGameTool.execute({ gameType: 'tic-tac-toe' });

      // Verify sendGameStarted was called
      const startedCalls = mockPublisherCalls.filter((c) => c.method === 'sendGameStarted');
      expect(startedCalls.length).toBeGreaterThan(0);

      const startCall = startedCalls[0];
      expect(startCall.args[1]).toBe('tic-tac-toe'); // gameType
      expect(startCall.args[2]).toBe('Tic-Tac-Toe'); // gameName
    });

    it('should broadcast game state with board when starting tic-tac-toe', async () => {
      await startGameTool.execute({ gameType: 'tic-tac-toe' });

      // Verify sendGameState was called
      const stateCalls = mockPublisherCalls.filter((c) => c.method === 'sendGameState');
      expect(stateCalls.length).toBeGreaterThan(0);

      const stateCall = stateCalls[0];
      expect(stateCall.args[0]).toBe('tic-tac-toe'); // gameType
      expect(stateCall.args[1]).toBe('active'); // status
      expect(stateCall.args[2]).toBeDefined(); // gameData
    });

    it('should broadcast updated state after a move', async () => {
      // Start the game
      await startGameTool.execute({ gameType: 'tic-tac-toe' });
      mockPublisherCalls.length = 0; // Clear initial calls

      // Make a move
      await makeMoveTool.execute({ move: '5' }); // Center square

      // Verify state update was broadcast
      const stateCalls = mockPublisherCalls.filter((c) => c.method === 'sendGameState');
      expect(stateCalls.length).toBeGreaterThan(0);
    });

    it('should broadcast game ended when game is quit', async () => {
      // Start the game
      await startGameTool.execute({ gameType: 'tic-tac-toe' });
      mockPublisherCalls.length = 0; // Clear initial calls

      // End the game
      await endGameTool.execute({});

      // Verify sendGameEnded was called
      const endedCalls = mockPublisherCalls.filter((c) => c.method === 'sendGameEnded');
      expect(endedCalls.length).toBeGreaterThan(0);

      const endCall = endedCalls[0];
      expect(endCall.args[0]).toBe('tic-tac-toe'); // gameType
    });
  });

  describe('Word Association Game Flow', () => {
    it('should broadcast game started for word association', async () => {
      await startGameTool.execute({ gameType: 'word-association' });

      const startedCalls = mockPublisherCalls.filter((c) => c.method === 'sendGameStarted');
      expect(startedCalls.length).toBeGreaterThan(0);

      const startCall = startedCalls[0];
      expect(startCall.args[1]).toBe('word-association');
      expect(startCall.args[2]).toBe('Word Association');
    });
  });

  describe('20 Questions Game Flow', () => {
    it('should broadcast game started for 20 questions', async () => {
      await startGameTool.execute({ gameType: '20-questions' });

      const startedCalls = mockPublisherCalls.filter((c) => c.method === 'sendGameStarted');
      expect(startedCalls.length).toBeGreaterThan(0);

      const startCall = startedCalls[0];
      expect(startCall.args[1]).toBe('20-questions');
      expect(startCall.args[2]).toBe('20 Questions');
    });
  });

  describe('Publisher Disconnection Handling', () => {
    it('should gracefully handle disconnected publisher', async () => {
      // Make publisher appear disconnected
      mockPublisher.isConnected.mockReturnValueOnce(false);

      // Start game should still work, just not broadcast
      const result = await startGameTool.execute({ gameType: 'tic-tac-toe' });

      // Game should still start successfully
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');

      // But no broadcasts should have been made
      expect(mockPublisherCalls.length).toBe(0);
    });
  });

  describe('State Transformation for Frontend Compatibility', () => {
    it('should transform story-builder storyParts to chapters', async () => {
      await startGameTool.execute({ gameType: 'story-builder' });

      const stateCalls = mockPublisherCalls.filter((c) => c.method === 'sendGameState');
      expect(stateCalls.length).toBeGreaterThan(0);

      const stateCall = stateCalls[0];
      const gameData = stateCall.args[2] as Record<string, unknown>;

      // Frontend expects 'chapters', not 'storyParts'
      expect(gameData).toHaveProperty('chapters');
      expect(gameData).toHaveProperty('currentChapter');
      expect(gameData).toHaveProperty('isUserTurn');
    });

    it('should transform would-you-rather currentDilemma to currentQuestion', async () => {
      await startGameTool.execute({ gameType: 'would-you-rather' });

      const stateCalls = mockPublisherCalls.filter((c) => c.method === 'sendGameState');
      expect(stateCalls.length).toBeGreaterThan(0);

      const stateCall = stateCalls[0];
      const gameData = stateCall.args[2] as Record<string, unknown>;

      // Frontend expects 'currentQuestion' and 'roundNumber', not 'currentDilemma' and 'questionsAnswered'
      expect(gameData).toHaveProperty('currentQuestion');
      expect(gameData).toHaveProperty('roundNumber');
      expect(gameData).toHaveProperty('userChoices');
      expect(gameData).toHaveProperty('aiChoices');
    });

    it('should add maxQuestions to 20-questions state', async () => {
      await startGameTool.execute({ gameType: '20-questions' });

      const stateCalls = mockPublisherCalls.filter((c) => c.method === 'sendGameState');
      expect(stateCalls.length).toBeGreaterThan(0);

      const stateCall = stateCalls[0];
      const gameData = stateCall.args[2] as Record<string, unknown>;

      // Frontend expects optional maxQuestions
      expect(gameData).toHaveProperty('maxQuestions');
      expect(gameData.maxQuestions).toBe(20);
    });
  });

  describe('Session Isolation', () => {
    it('should use session-scoped game engine', async () => {
      const session1Context = createMockContext('session-1');
      const session2Context = createMockContext('session-2');

      const session1StartTool = toolDefinitions
        .find((t) => t.id === 'startTextGame')!
        .create(session1Context);
      const session2StartTool = toolDefinitions
        .find((t) => t.id === 'startTextGame')!
        .create(session2Context);

      // Start game in session 1
      await session1StartTool.execute({ gameType: 'tic-tac-toe' });

      // Start different game in session 2
      await session2StartTool.execute({ gameType: 'word-association' });

      // Both games should have started (separate broadcasts)
      const startedCalls = mockPublisherCalls.filter((c) => c.method === 'sendGameStarted');
      expect(startedCalls.length).toBe(2);

      // Verify different game types
      const gameTypes = startedCalls.map((c) => c.args[1]);
      expect(gameTypes).toContain('tic-tac-toe');
      expect(gameTypes).toContain('word-association');
    });
  });
});
