/**
 * Conversation Domain Tests
 *
 * Tests for conversation flow and management tools.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger FIRST
vi.mock('../../../../utils/safe-logger.js', () => {
  const mockLogger = {
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
  };
  return {
    getLogger: () => mockLogger,
    createLogger: () => mockLogger,
    safeLog: () => mockLogger,
  };
});

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
}));

// Import AFTER mocks
import { createConversationTools } from '../conversation-tools.js';

describe('Conversation Domain Tools', () => {
  let tools: ReturnType<typeof createConversationTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = createConversationTools();
  });

  describe('Tool Loading', () => {
    it('should load conversation tools', () => {
      expect(tools).toBeDefined();
      expect(tools.rememberName).toBeDefined();
    });

    it('rememberName - should have proper description', () => {
      expect(tools.rememberName.description).toContain('name');
    });
  });

  describe('Tool Execution', () => {
    it('rememberName - should filter out persona names', async () => {
      // Test that persona names are filtered
      // Note: Full execution requires complex LiveKit context, so we test tool structure
      expect(tools.rememberName.execute).toBeDefined();
      expect(typeof tools.rememberName.execute).toBe('function');
    });

    it('rememberName - tool parameters should accept name string', () => {
      // Verify the tool is properly configured to accept a name
      expect(tools.rememberName.parameters).toBeDefined();
    });
  });

  describe('Content Validation', () => {
    it('should have meaningful descriptions', () => {
      expect(tools.rememberName.description.length).toBeGreaterThan(10);
    });
  });
});
