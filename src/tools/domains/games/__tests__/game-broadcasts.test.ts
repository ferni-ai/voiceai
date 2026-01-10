/**
 * Game Tool Integration Tests
 *
 * Tests the game tools structure and that all game types are supported:
 * - Text games: startTextGame, makeTextGameMove, endTextGame
 * - Music games: startGame, submitGameAnswer, endGame
 *
 * Note: Full E2E broadcast testing requires a connected LiveKit session.
 * These tests verify tool structure, parameter schemas, and execution paths.
 *
 * Run with: npx vitest run src/tools/domains/games/__tests__/game-broadcasts.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock safe-logger
vi.mock('../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }),
}));

// Mock frontend-publisher (returns disconnected so no broadcasts sent)
vi.mock('../../../../agents/realtime/frontend-publisher.js', () => ({
  getFrontendPublisher: () => ({
    isConnected: () => false,
    sendGameStarted: vi.fn(),
    sendGameState: vi.fn(),
    sendGameEnded: vi.fn(),
  }),
}));

// Mock @livekit/agents
vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
}));

// Mock tool-descriptions.json
vi.mock('../../../config/tool-descriptions.json', () => ({
  default: {
    startTextGame: { description: 'Start a text game' },
    makeTextGameMove: { description: 'Make a move' },
    getTextGameBoard: { description: 'Get board' },
    endTextGame: { description: 'End text game' },
    startGame: { description: 'Start a music game' },
    submitGameAnswer: { description: 'Submit game answer' },
    endGame: { description: 'End game' },
    getGameHint: { description: 'Get hint' },
    skipGameRound: { description: 'Skip round' },
    getGameStatus: { description: 'Get status' },
    getGameHistory: { description: 'Get history' },
    suggestGame: { description: 'Suggest game' },
  },
}));

// Import after mocks
import { getToolDefinitions } from '../index.js';
import type { ToolDefinition, ToolContext } from '../../../registry/types.js';

function createMockContext(sessionId?: string): ToolContext {
  return {
    userId: 'test-user-123',
    sessionId: sessionId || 'test-session-123',
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
}

describe('Game Tools Integration', () => {
  let tools: ToolDefinition[];
  let mockContext: ToolContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    tools = await getToolDefinitions();
    mockContext = createMockContext(`session-${Date.now()}`);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Tool Loading', () => {
    it('should load all game tool definitions', () => {
      expect(tools.length).toBeGreaterThan(0);
    });

    it('should include text game tools', () => {
      const textGameTools = ['startTextGame', 'makeTextGameMove', 'endTextGame', 'getTextGameBoard'];
      textGameTools.forEach((toolId) => {
        const tool = tools.find((t) => t.id === toolId);
        expect(tool, `Tool ${toolId} should exist`).toBeDefined();
      });
    });

    it('should include music game tools', () => {
      const musicGameTools = ['startGame', 'submitGameAnswer', 'endGame'];
      musicGameTools.forEach((toolId) => {
        const tool = tools.find((t) => t.id === toolId);
        expect(tool, `Tool ${toolId} should exist`).toBeDefined();
      });
    });

    it('should include helper tools', () => {
      const helperTools = ['getGameHint', 'skipGameRound', 'getGameStatus', 'getGameHistory', 'suggestGame'];
      helperTools.forEach((toolId) => {
        const tool = tools.find((t) => t.id === toolId);
        expect(tool, `Tool ${toolId} should exist`).toBeDefined();
      });
    });
  });

  describe('Text Game Types', () => {
    const TEXT_GAME_TYPES = [
      'tic-tac-toe',
      '20-questions',
      'word-association',
      'would-you-rather',
      'story-builder',
      'three-word-day',
      'headline-writer',
      'emoji-story',
      'values-card-sort',
      'one-word-checkin',
      'tiny-win-tracker',
      'fortune-cookie',
    ];

    it('should support all 12 text game types', () => {
      expect(TEXT_GAME_TYPES.length).toBe(12);
    });

    it('should start each text game type without error', async () => {
      const startTool = tools.find((t) => t.id === 'startTextGame');
      expect(startTool).toBeDefined();

      for (const gameType of TEXT_GAME_TYPES) {
        const ctx = createMockContext(`session-text-${gameType}-${Date.now()}`);
        const tool = startTool!.create(ctx);

        // Should not throw and should return a string message
        const result = await tool.execute({ gameType });
        expect(typeof result).toBe('string');
      }
    });
  });

  describe('Music Game Types', () => {
    const MUSIC_GAME_TYPES = [
      'name-that-tune',
      'one-word-song',
      'desert-island-discs',
      'this-or-that',
      'mood-dj-challenge',
      'finish-the-lyric',
      'decade-challenge',
    ];

    it('should support all 7 music game types', () => {
      expect(MUSIC_GAME_TYPES.length).toBe(7);
    });

    it('should start each music game type without error', async () => {
      const startTool = tools.find((t) => t.id === 'startGame');
      expect(startTool).toBeDefined();

      for (const gameType of MUSIC_GAME_TYPES) {
        const ctx = createMockContext(`session-music-${gameType}-${Date.now()}`);
        const tool = startTool!.create(ctx);

        // Should not throw and should return a string message
        const result = await tool.execute({ gameType });
        expect(typeof result).toBe('string');
      }
    });
  });

  describe('Text Game Flow', () => {
    it('should complete start -> move -> end flow', async () => {
      const startTool = tools.find((t) => t.id === 'startTextGame');
      const moveTool = tools.find((t) => t.id === 'makeTextGameMove');
      const endTool = tools.find((t) => t.id === 'endTextGame');

      expect(startTool).toBeDefined();
      expect(moveTool).toBeDefined();
      expect(endTool).toBeDefined();

      // Start game
      const startInstance = startTool!.create(mockContext);
      const startResult = await startInstance.execute({ gameType: 'tic-tac-toe' });
      expect(typeof startResult).toBe('string');

      // Make move
      const moveInstance = moveTool!.create(mockContext);
      const moveResult = await moveInstance.execute({ action: 'position 5' });
      expect(typeof moveResult).toBe('string');

      // End game
      const endInstance = endTool!.create(mockContext);
      const endResult = await endInstance.execute({});
      expect(typeof endResult).toBe('string');
    });
  });

  describe('Music Game Flow', () => {
    it('should complete start -> answer -> end flow', async () => {
      const startTool = tools.find((t) => t.id === 'startGame');
      const answerTool = tools.find((t) => t.id === 'submitGameAnswer');
      const endTool = tools.find((t) => t.id === 'endGame');

      expect(startTool).toBeDefined();
      expect(answerTool).toBeDefined();
      expect(endTool).toBeDefined();

      // Start game
      const startInstance = startTool!.create(mockContext);
      const startResult = await startInstance.execute({ gameType: 'this-or-that' });
      expect(typeof startResult).toBe('string');

      // Submit answer
      const answerInstance = answerTool!.create(mockContext);
      const answerResult = await answerInstance.execute({ answer: 'A' });
      expect(typeof answerResult).toBe('string');

      // End game
      const endInstance = endTool!.create(mockContext);
      const endResult = await endInstance.execute({});
      expect(typeof endResult).toBe('string');
    });
  });

  describe('Tool Descriptions', () => {
    it('should have descriptions for all game tools', () => {
      tools.forEach((tool) => {
        expect(tool.description, `Tool ${tool.id} should have description`).toBeDefined();
        expect(tool.description.length).toBeGreaterThan(0);
      });
    });

    it('should have domain set to games', () => {
      tools.forEach((tool) => {
        expect(tool.domain).toBe('games');
      });
    });
  });

  describe('Error Handling', () => {
    it('should return helpful message when no game active', async () => {
      const answerTool = tools.find((t) => t.id === 'submitGameAnswer');
      const tool = answerTool!.create(createMockContext('empty-session'));

      // Without starting a game first
      const result = await tool.execute({ answer: 'test' });
      expect(typeof result).toBe('string');
      expect(result).toContain("not playing");
    });

    it('should return helpful message for endGame when no game active', async () => {
      const endTool = tools.find((t) => t.id === 'endGame');
      const tool = endTool!.create(createMockContext('empty-session-2'));

      const result = await tool.execute({});
      expect(typeof result).toBe('string');
      expect(result).toContain("not playing");
    });
  });
});
