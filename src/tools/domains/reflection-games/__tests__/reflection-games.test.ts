/**
 * Reflection Games Domain Tools Tests
 * Run with: npx vitest run src/tools/domains/reflection-games/__tests__/reflection-games.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { getToolDefinitions } from '../index.js';

describe('Reflection Games Domain Tools', () => {
  let tools: ReturnType<typeof getToolDefinitions>;
  beforeEach(() => {
    vi.clearAllMocks();
    tools = getToolDefinitions();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Tool Loading', () => {
    it('should load tool definitions', () => {
      expect(tools).toBeDefined();
      expect(tools.startReflectionGame).toBeDefined();
    });
    it('should have tool with execute function', () => {
      expect(typeof tools.startReflectionGame.execute).toBe('function');
    });
  });

  describe('startReflectionGame Tool', () => {
    // Note: llm.tool execute takes (params, context) - we pass undefined for context in tests
    it('should execute two_truths_dream game', async () => {
      const result = await tools.startReflectionGame.execute(
        { game: 'two_truths_dream' },
        undefined as never
      );
      expect(result.success).toBe(true);
      expect(result.game).toBe('two_truths_dream');
      expect(result.prompt).toContain('Two Truths and a Dream');
    });

    it('should execute values_auction game', async () => {
      const result = await tools.startReflectionGame.execute(
        { game: 'values_auction' },
        undefined as never
      );
      expect(result.success).toBe(true);
      expect(result.game).toBe('values_auction');
      expect(result.prompt).toContain('$100');
    });

    it('should execute rose_thorn_bud game', async () => {
      const result = await tools.startReflectionGame.execute(
        { game: 'rose_thorn_bud' },
        undefined as never
      );
      expect(result.success).toBe(true);
      expect(result.game).toBe('rose_thorn_bud');
      expect(result.prompt).toContain('Rose, Thorn, Bud');
    });

    it('should include topic in prompt when provided', async () => {
      const result = await tools.startReflectionGame.execute(
        { game: 'gratitude_chain', topic: 'family' },
        undefined as never
      );
      expect(result.success).toBe(true);
      expect(result.prompt).toContain('family');
    });
  });
});
